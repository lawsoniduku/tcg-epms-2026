import {action,average,field,get,isoDay,isRole,list,manages,need,noFields,note,notify,num,own,pick} from './model.mjs';

const clusters = [
  ['improvement', 'Continuous improvement and innovation'],
  ['execution', 'Efficiency and execution'],
  ['customerFocus', 'Customer and stakeholder focus'],
  ['integrity', 'Ethics and integrity'],
  ['teamwork', 'Problem solving and teamwork']
];

export function competencyBank(peopleManager){
  return peopleManager
    ? [...clusters, ['leadership', 'People leadership — direction, development, delegation and fair decisions']]
    : clusters.map(item=>[...item]);
}

export function questionnaire(ctx, response) {
  const review = get(ctx.s, response.reviewId);
  const questions=review.campaign?.questions || competencyBank(review.snapshot.peopleManager);
  return [...questions.map(([key, label]) => pick(key, label, ['1','2','3','4','5','NOT_OBSERVED'],{hint:'1 Not demonstrated · 2 Inconsistent · 3 Meets · 4 Often exceeds · 5 Role model'})),
    note('example', 'Describe an observed behaviour. Only the moderation team can read your comment.',{optional:true})];
}

export function dueDate(ctx, response) {
  const cycle = response.feedbackDeadline ? {feedbackDue:response.feedbackDeadline} : get(ctx.s, response.cycleId, 'cycle');
  return cycle.feedbackDue || cycle.managerDue;
}

export function outstanding(response) {
  return ['Nomination','HR validation','Invited','In progress'].includes(response.status);
}

function open(ctx, response) {
  const review = get(ctx.s, response.reviewId);
  const today=isoDay(ctx.at);
  const start=review.campaign?.start;
  return !review.assessment && (!ctx.s.liveCalendar || ((!start || today>=start) && today<=dueDate(ctx,response)));

}

const assigned = (ctx, r) => r.rater === ctx.actor.id && !own(ctx.actor,r) &&
  ['Invited','In progress'].includes(r.status) && open(ctx,r);

export const feedbackActions = [
  action('response.inspect','Inspect restricted response',(ctx,r)=>isRole(ctx.actor,'pm') && (r.feedbackAdmins || []).includes(ctx.actor.id)&&['Submitted','Validated'].includes(r.status)&&!own(ctx.actor,r),
    ()=>[note('reason','Reason for accessing restricted feedback')],(ctx,r,v)=>{
      r.inspection={actor:ctx.actor.id,at:ctx.at,reason:v.reason};return r;
    }),
  action('response.decline','Decline or declare conflict',assigned,()=>[note('reason','Reason for declining')],(ctx,r,v)=>{
    r.declineReason=v.reason;r.status='Declined';
    notify(ctx,get(ctx.s,r.reviewId),get(ctx.s,r.reviewId).snapshot.managerId,'A replacement nomination is needed');return r;
  }),
  action('response.endorse','Review employee nomination',
    (ctx,r) => r.status === 'Nomination' && manages(ctx.s,ctx.actor,get(ctx.s,r.reviewId)) && open(ctx,r),
    () => [pick('decision','Manager decision',['Endorse','Decline']),note('reason','Working exposure, relationship and conflict check')],
    (ctx,r,v) => {
      r.endorsement = {...v,by:ctx.actor.id,at:ctx.at};
      r.status = v.decision === 'Endorse' ? 'HR validation' : 'Excluded';
      return r;
    }),
  action('response.invite','Validate and invite observer',
    (ctx,r) => r.status === 'HR validation' && isRole(ctx.actor,'pm') &&
      r.endorsement?.by !== ctx.actor.id && r.rater !== ctx.actor.id && open(ctx,r),
    () => [note('validation','HR exposure, relationship and conflict check')],
    (ctx,r,v) => {
      r.validation = {...v,by:ctx.actor.id,at:ctx.at};
      r.status = 'Invited';
      notify(ctx,r,r.rater,'Complete confidential feedback',dueDate(ctx,r));
      return r;
    }),
  action('response.start','Start questionnaire',(ctx,r) => assigned(ctx,r) && r.status === 'Invited',
    noFields,(ctx,r) => {r.status='In progress';return r;}),
  action('response.submit','Submit confidential feedback',assigned,questionnaire,
    (ctx,r,v) => {
      const observed=Object.entries(v).filter(([key,value])=>key!=='example'&&value!=='NOT_OBSERVED').map(([,value])=>Number(value));
      need(observed.length >= (r.minimumObserved || (r.cycleId && get(ctx.s,r.cycleId).policy.minimumObserved) || 1),'Insufficient observed competencies.');
      r.score=observed.reduce((sum,value)=>sum+value,0)/observed.length;
      r.submittedAt=ctx.at;
      r.answers = v;
      r.status = 'Submitted';
      return r;
    }),
  action('response.moderate','Validate response',
    (ctx,r) => r.status === 'Submitted' && isRole(ctx.actor,'pm') &&
      r.rater !== ctx.actor.id && !get(ctx.s,r.reviewId).assessment,
    () => [pick('decision','Response quality',['Valid','Exclude']),note('reason','Moderation note')],
    (ctx,r,v) => {
      r.moderation = v.reason;
      r.status = v.decision === 'Valid' ? 'Validated' : 'Excluded';
      return r;
    })
];

export const redactThemes = action('review.feedbackThemes','Review feedback for release',
  (ctx,r) => isRole(ctx.actor,'pm') && !own(ctx.actor,r) &&
    r.assessment?.behaviour.source === '360 feedback' && ['Calibration','Enterprise moderation','Finalisation','Locked'].includes(r.status),
  (ctx,r) => [
    note('strengths','Reviewed strengths',{optional:true}),note('development','Reviewed development themes',{optional:true}),
    field('check','Confirm that names, identifiers and distinctive incidents have been removed', 'select',
      {choices:['Reviewed and safe to release']})
  ],
  (ctx,r,v) => {
    r.feedbackThemes={strengths:v.strengths,development:v.development};
    r.feedbackReviewed = {by:ctx.actor.id,at:ctx.at};
    return r;
  });

export function campaignProgress(ctx,cycle) {
  const assignments=list(ctx.s,'response').filter(r => r.cycleId===cycle.id && ctx.scope(r));
  const counts={};
  for(const assignment of assignments) counts[assignment.status]=(counts[assignment.status] || 0)+1;
  return counts;
}
