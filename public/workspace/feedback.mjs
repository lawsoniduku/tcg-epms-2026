import {action,average,field,get,isoDay,isRole,list,manages,need,noFields,note,notify,num,own,pick} from './model.mjs';

const clusters = [
  ['improvement', 'Continuous improvement and innovation'],
  ['execution', 'Efficiency and execution'],
  ['customerFocus', 'Customer and stakeholder focus'],
  ['integrity', 'Ethics and integrity'],
  ['teamwork', 'Problem solving and teamwork']
];

export function questionnaire(ctx, response) {
  const review = get(ctx.s, response.reviewId, 'review');
  const questions = review.snapshot.peopleManager
    ? [...clusters, ['leadership', 'People leadership — direction, development, delegation and fair decisions']]
    : clusters;
  return [...questions.map(([key, label]) => num(key, label, 1, 5, {integer:true})),
    note('example', 'Describe an observed behaviour. Only the moderation team can read your comment.')];
}

export function dueDate(ctx, response) {
  const cycle = get(ctx.s, response.cycleId, 'cycle');
  return cycle.feedbackDue || cycle.managerDue;
}

export function outstanding(response) {
  return ['Nomination','HR validation','Invited','In progress'].includes(response.status);
}

function open(ctx, response) {
  const review = get(ctx.s, response.reviewId, 'review');
  return !review.assessment && (!ctx.s.liveCalendar || isoDay(ctx.at) <= dueDate(ctx, response));
}

const assigned = (ctx, r) => r.rater === ctx.actor.id && !own(ctx.actor,r) &&
  ['Invited','In progress'].includes(r.status) && open(ctx,r);

export const feedbackActions = [
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
      r.score = average(Object.values(v).filter(value => typeof value === 'number'));
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
    ...r.assessment.behaviour.groups.map(({category}) => note(category,'Anonymous summary for '+category,{optional:true})),
    field('check','Confirm that names, identifiers and distinctive incidents have been removed', 'select',
      {choices:['Reviewed and safe to release']})
  ],
  (ctx,r,v) => {
    r.feedbackThemes = Object.fromEntries(r.assessment.behaviour.groups
      .map(({category}) => [category,v[category]]).filter(([,theme]) => theme));
    r.feedbackReviewed = {by:ctx.actor.id,at:ctx.at};
    return r;
  });

export function campaignProgress(ctx,cycle) {
  const assignments=list(ctx.s,'response').filter(r => r.cycleId===cycle.id && ctx.scope(r));
  const counts={};
  for(const assignment of assignments) counts[assignment.status]=(counts[assignment.status] || 0)+1;
  return counts;
}
