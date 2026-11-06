import {effectiveGoals} from './governance.mjs';
import {action,addWorkdays,average,choices,create,dateValue,evidenceScore,field,get,heads,isRole,isoDay,journal,list,manages,need,nextStatus,noFields,note,notify,num,option,own,perspectives,pick,ratingFor,round,scoreValue,trackAScore,yes} from './model.mjs';
import {finalisationPreview} from '../shared/domain.mjs';
const cycle=(ctx,r)=>get(ctx.s,r.cycleId,'cycle');
const policy=(ctx,r)=>cycle(ctx,r).policy;
const manager=(ctx,r)=>manages(ctx.s,ctx.actor,r);
const hod=(ctx,r)=>heads(ctx.s,ctx.actor,r);
const pm=ctx=>ctx.actor.role==='pm';
const employee=(ctx,r)=>own(ctx.actor,r);
const atStage=(stage,allowed)=>(ctx,r)=>r.status===stage&&allowed(ctx,r);
const updated=(r,fields)=>Object.assign(r,fields);
const reason=()=>[note('reason','Reason'),field('evidence','Evidence reference')];
function qa(r,p) {
  need(r.goals.length,'Add KPIs before submission.');
  need(round(r.goals.reduce((sum,g)=>sum+g.weight,0))===100,'KPI weights must total 100%.');
  perspectives.forEach((key,i)=>need(round(r.goals.filter(g=>g.perspective===key).reduce((sum,g)=>sum+g.weight,0))===p.weights[i],key+' KPIs must total '+p.weights[i]+'%.'));
  if(r.snapshot.peopleManager)need(r.goals.some(g=>g.leadership==='Yes'),'Include a leadership and performance governance KPI.');
}
const goalFields=ctx=>[
  field('title','KPI name'),pick('objective','Linked individual objective',choices(list(ctx.s,'strategy').filter(o=>o.level==='Individual'&&o.status==='Approved'))),
  pick('perspective','BSC perspective',perspectives),note('outcome','Expected outcome'),num('weight','Weight within BSC (%)',0.01,100),
  num('baseline','Baseline',-1e12,1e12),num('target','Target',-1e12,1e12),field('unit','Unit of measure'),
  pick('direction','Scoring approach',['Higher is better','Lower is better','Approved milestone scale']),
  field('thresholds','Anchors for ratings 2, 3, 4 and 5','text',{optional:true,hint:'For lower-is-better or milestones, enter four ordered numeric thresholds, separated by commas.'}),
  field('source','Authoritative data source'),field('evidence','Evidence required'),yes('leadership','People leadership KPI'),
  num('gateCap','Maximum rating if critical gate fails',1,5,{integer:true,default:5}),field('gate','Critical gate definition','text',{optional:true})
];
const goalsEditable=(ctx,r)=>r.status==='Goal setting'&&(manager(ctx,r)||employee(ctx,r));
export const reviewActions=[
  action('review.goal','Add KPI',goalsEditable,goalFields,(ctx,r,v)=>{
    need(Number.isInteger(Number((v.weight*100).toFixed(6))),'Weights support up to two decimal places.');
    need(!r.goals.some(g=>g.title.toLowerCase()===v.title.toLowerCase()),'KPI name already exists on this scorecard.');
    const goal={...v,id:crypto.randomUUID(),anchors:[]};
    if(v.direction==='Higher is better')need(v.target>0,'Higher-is-better target must be positive.');
    else{
      const raw=v.thresholds.split(',').map(x=>x.trim());const anchors=raw.map(Number);
      need(raw.length===4&&raw.every(Boolean)&&anchors.every(Number.isFinite),'Enter four numeric rating thresholds.');
      need(anchors.every((n,i)=>i===0||(v.direction==='Lower is better'?n<anchors[i-1]:n>anchors[i-1])),'Rating anchors must be strictly ordered.');
      goal.anchors=anchors;
    }
    if(v.gateCap<5)need(v.gate,'Describe the critical gate.');
    r.goals.push(goal);return r;
  }),
  action('review.removeGoal','Remove KPI',goalsEditable,(ctx,r)=>[pick('goal','KPI',choices(r.goals))],(ctx,r,v)=>{r.goals=r.goals.filter(g=>g.id!==v.goal);return r;}),
  action('review.submitGoals','Submit scorecard',goalsEditable,noFields,(ctx,r)=>{qa(r,policy(ctx,r));r.status='Manager goal approval';return r;}),
  action('review.managerApprove','Approve team scorecard',atStage('Manager goal approval',manager),noFields,(ctx,r)=>{r.managerApproval=ctx.actor.id;r.status='PM quality review';return r;}),
  action('review.returnGoals','Return goals for revision',(ctx,r)=>r.status==='PM quality review'&&pm(ctx)||r.status==='HOD baseline approval'&&hod(ctx,r)||r.status==='Manager goal approval'&&manager(ctx,r),()=>[note('reason','Corrections required')],(ctx,r,v)=>{r.goalFeedback=v.reason;r.status='Goal setting';return r;}),
  action('review.qa','Pass KPI quality review',atStage('PM quality review',pm),()=>[note('qa','Quality review findings')],(ctx,r,v)=>{need(ctx.actor.id!==r.managerApproval,'An independent PM reviewer is required.');qa(r,policy(ctx,r));r.qualityReview={by:ctx.actor.id,note:v.qa};r.status='HOD baseline approval';return r;}),
  action('review.baseline','Lock approved baseline',atStage('HOD baseline approval',hod),()=>[field('reference','Baseline approval reference')],(ctx,r,v)=>{
    need(![r.managerApproval,r.qualityReview?.by].includes(ctx.actor.id),'Baseline approval requires an independent HOD.');qa(r,policy(ctx,r));r.baseline={goals:structuredClone(r.goals),approvedBy:ctx.actor.id,at:ctx.at,reference:v.reference,policyId:r.policyId};r.status='In progress';return r;
  }),
  action('review.checkin','Record check-in',(ctx,r)=>['In progress','Self-review','Manager assessment'].includes(r.status)&&manager(ctx,r),()=>[
    pick('kind','Check-in',['Monthly 1:1','Mid-quarter checkpoint']),pick('risk','Progress',['On track','At risk','Behind']),
    note('progress','Progress and evidence'),note('support','Support and agreed action'),field('due','Follow-up date','date')
  ],(ctx,r,v)=>{r.checkIns.push({...v,by:ctx.actor.id,at:ctx.at});return r;}),
  action('review.openSelf','Open self-review',atStage('In progress',(ctx,r)=>pm(ctx)||manager(ctx,r)),noFields,(ctx,r)=>{if(ctx.s.liveCalendar)need(isoDay(ctx.at)>=addWorkdays(cycle(ctx,r).end,-4,policy(ctx,r).holidays),'The self-review window has not opened.');r.status='Self-review';return r;}),
  action('review.self','Submit self-assessment',atStage('Self-review',employee),(ctx,r)=>[
    ...r.goals.flatMap(g=>[num('score_'+g.id,g.title+' · self-rating',1,5),note('note_'+g.id,g.title+' · evidence and achievements')]),note('development','Development priorities')
  ],(ctx,r,v)=>{if(ctx.s.liveCalendar)need(isoDay(ctx.at)<=cycle(ctx,r).selfDue,'The self-review deadline has passed.');r.selfReview={...v,at:ctx.at};r.status='Manager assessment';notify(ctx,r,r.snapshot.managerId,'Complete supervisor assessment',cycle(ctx,r).managerDue);return r;}),
  action('review.bypass','Advance overdue self-review',atStage('Self-review',(ctx,r)=>pm(ctx)&&isoDay(ctx.at)>cycle(ctx,r).selfDue),noFields,(ctx,r)=>{r.selfBypass=ctx.at;r.status='Manager assessment';return r;}),
  action('review.observation','Record behavioural observation',(ctx,r)=>manager(ctx,r)&&['In progress','Self-review','Manager assessment'].includes(r.status)&&cycle(ctx,r).behaviourMode==='Documented observations',()=>[
    num('score','Behaviour score',1,5),field('observed','Observation date','date'),note('example','Observed behaviour and context'),field('evidence','Evidence reference')
  ],(ctx,r,v)=>{
    const c=cycle(ctx,r);need(v.observed>=c.start&&v.observed<=c.end&&v.observed<=isoDay(ctx.at),'Use an observation from this review period.');
    r.observation={...v,by:ctx.actor.id};return r;
  }),
  action('review.nominate','Nominate 360 observer',(ctx,r)=>manager(ctx,r)&&['In progress','Self-review','Manager assessment'].includes(r.status)&&cycle(ctx,r).behaviourMode==='Full 360',(ctx,r)=>[
    pick('rater','Observer',ctx.s.users.filter(u=>u.active!==false&&u.employeeId!==r.employeeId).map(u=>option(u.id,u.name))),
    pick('category','Relationship',r.snapshot.peopleManager?['Manager','Peer','Direct report','Stakeholder']:['Manager','Peer','Stakeholder']),note('exposure','Relevant working exposure')
  ],(ctx,r,v)=>{
    need(!list(ctx.s,'response').some(x=>x.reviewId===r.id&&x.rater===v.rater),'This observer already has a nomination.');
    if(v.category==='Manager')need(v.rater===r.snapshot.managerId,'Select the assigned manager for this category.');
    if(v.rater===r.snapshot.managerId)need(v.category==='Manager','The assigned manager belongs to the Manager category.');
    const item=create(ctx,'response',r.title+' · '+v.category,'Nomination',{reviewId:r.id,employeeId:r.employeeId,cycleId:r.cycleId,rater:v.rater,category:v.category,exposure:v.exposure});
    journal(ctx,item,'response.nominate');return r;
  }),
  action('review.assess','Submit supervisor assessment',atStage('Manager assessment',manager),(ctx,r)=>[
    ...r.goals.flatMap(g=>[num('actual_'+g.id,g.title+' · actual result',-1e12,1e12),field('evidence_'+g.id,g.title+' · verified evidence'),yes('stretch_'+g.id,g.title+' · stretch and quality confirmed'),...(g.gate?[yes('pass_'+g.id,g.title+' · critical gate passed')]:[])]),
    note('summary','Supervisor evidence and summary')
  ],(ctx,r,v)=>{
    need(r.baseline,'Scorecard baseline is missing.');
    need(r.checkIns.some(c=>c.kind==='Mid-quarter checkpoint'),'Record the mandatory mid-quarter checkpoint.');
    need(!r.pendingAmendment,'Resolve the outstanding amendment before scoring.');
    const items=effectiveGoals(r,cycle(ctx,r).end).map(g=>{
      const raw=evidenceScore(v['actual_'+g.id],g,v['stretch_'+g.id]==='Yes');
      const achieved=g.gate&&v['pass_'+g.id]!=='Yes'?Math.min(raw,g.gateCap):raw;
      return {goalId:g.id,title:g.title,actual:v['actual_'+g.id],weight:g.weight,raw,rating:achieved,evidence:v['evidence_'+g.id],target:g.target,achievement:g.direction==='Higher is better'?round(100*v['actual_'+g.id]/g.target):null};
    });
    const bsc=round(items.reduce((sum,g)=>sum+g.rating*g.weight,0)/100);
    const behaviour=behaviourResult(ctx,r);
    r.assessment={items,bsc,behaviour,summary:v.summary,by:ctx.actor.id,at:ctx.at};
    r.supervisorScore=trackAScore(bsc,behaviour.score);r.status='Calibration';return r;
  }),
  action('review.calibrate','Record calibration decision',atStage('Calibration',(ctx,r)=>r.panel?.chair===ctx.actor.id&&!own(ctx.actor,r)),()=>[
    num('score','Calibrated score',1,5),note('reason','Panel rationale'),field('evidence','Evidence reference'),field('members','Panel participants'),yes('consequential','Recognition, promotion, dispute or other consequential decision')
  ],(ctx,r,v)=>{
    scoreValue(v.score);r.calibrations.push({...v,original:r.supervisorScore,panel:structuredClone(r.panel),by:ctx.actor.id,at:ctx.at});
    r.calibratedScore=v.score;
    r.status=[1,2,5].includes(ratingFor(v.score))||[1,2,5].includes(ratingFor(r.supervisorScore))||v.consequential==='Yes'?'Enterprise moderation':'Finalisation';return r;
  }),
  action('review.moderate','Approve enterprise moderation',atStage('Enterprise moderation',(ctx,r)=>isRole(ctx.actor,'executive')&&!own(ctx.actor,r)),reason,(ctx,r,v)=>{r.moderation={...v,by:ctx.actor.id,at:ctx.at};r.status='Finalisation';return r;}),
  action('review.lock','Lock final score',atStage('Finalisation',(ctx,r)=>pm(ctx)&&!own(ctx.actor,r)),(ctx,r)=>[
    ...(policy(ctx,r).allowDeduction==='Yes'?[num('deduction','Deduction points',0,policy(ctx,r).deductionCap,{default:0})]:[]),
    note('reason','Adjustment comment',{optional:true}),field('evidence','Evidence reference','text',{optional:true})
  ],(ctx,r,v)=>lockReview(ctx,r,v)),
  action('review.reopen','Reopen final score',(ctx,r)=>pm(ctx)&&!own(ctx.actor,r)&&['Locked','Released','Conversation recorded','Acknowledged','Closed'].includes(r.status),()=>[note('reason','Reason for correction'),field('approval','Authorisation reference')],(ctx,r,v)=>{
    const c=cycle(ctx,r);if(c.status==='Closed'){c.status='Open';journal(ctx,c,'cycle.reopen',{reason:v.reason});}r.reopen={...v,by:ctx.actor.id,at:ctx.at};r.status='Calibration';r.panel=null;r.releasedAt=null;r.ack=null;r.conversation=null;return r;
  }),
  action('review.release','Release result to employee',atStage('Locked',pm),noFields,(ctx,r)=>{r.status='Released';r.releasedAt=ctx.at;
    const rating=r.revisions.at(-1).finalRating;
    if(rating<=2){r.followup={kind:rating===1?'Formal capability assessment':'Documented coaching',owner:r.snapshot.managerId,due:addWorkdays(isoDay(ctx.at),10,policy(ctx,r).holidays)};notify(ctx,r,r.snapshot.managerId,'Review performance support and context',r.followup.due);}
    notify(ctx,r,ctx.s.users.find(u=>u.employeeId===r.employeeId)?.id,'Your appraisal result is available');return r;}),
  action('review.conversation','Record performance conversation',atStage('Released',manager),()=>[note('discussion','Discussion and development priorities'),field('owner','Development action owner'),field('due','Action due date','date')],(ctx,r,v)=>{r.conversation={...v,at:ctx.at};r.status='Conversation recorded';return r;}),
  action('review.ack','Acknowledge receipt',atStage('Conversation recorded',employee),()=>[note('comment','Employee response',{optional:true,hint:'Acknowledgement records receipt. You may still appeal.'})],(ctx,r,v)=>{r.ack={by:ctx.actor.id,at:ctx.at,comment:v.comment};r.status='Acknowledged';return r;}),
  action('review.close','Close appraisal',atStage('Acknowledged',pm),()=>[note('development','Development action and follow-up arrangements')],(ctx,r,v)=>{
    need(!list(ctx.s,'appeal').some(x=>x.reviewId===r.id&&x.status!=='Closed'),'Resolve the open appeal first.');
    r.development=v.development;r.status='Closed';return r;
  })
];
export function lockReview(ctx,r,v){
  need(r.status==='Finalisation','Only records ready for finalisation may be locked.');need(pm(ctx)&&!own(ctx.actor,r),'PM finalisation authority is required.');
  const p=policy(ctx,r), adjustment={mode:p.allowDeduction==='Yes'?'controlled':'disabled',approvalReference:p.approval?.reference,approvedBy:p.approval?.by,tracks:['A'],maxPoints:p.deductionCap,floor:p.deductionFloor,evidenceRequired:true};
  const result=finalisationPreview({track:'A',status:'ready',supervisorScore:r.supervisorScore,calibratedScore:r.calibratedScore,calibrationComplete:true,version:r.version},{expectedVersion:r.version,deductionPoints:v.deduction||0,reason:v.reason,evidence:v.evidence,basis:p.deductionBasis},adjustment);
  r.revisions.push({...result,supervisor:r.supervisorScore,calibrated:r.calibratedScore,reason:v.reason,evidence:v.evidence,revision:r.revisions.length+1,by:ctx.actor.id,at:ctx.at,policyId:p.id});r.status='Locked';return r;
}
export const responseActions=[
  action('response.invite','Approve and invite',atStage('Nomination',pm),noFields,(ctx,r)=>{r.status='Invited';r.validatedBy=ctx.actor.id;notify(ctx,r,r.rater,'Complete confidential feedback');return r;}),
  action('response.submit','Submit confidential feedback',atStage('Invited',(ctx,r)=>ctx.actor.id===r.rater),()=>[
    ...['integrity','collaboration','accountability','customerFocus','problemSolving','improvement'].map(k=>num(k,k.replace(/([A-Z])/g,' $1')+' (1–5)',1,5,{integer:true})),
    note('example','Observed example (visible to moderation only)')
  ],(ctx,r,v)=>{r.score=average(Object.values(v).filter(x=>typeof x==='number'));r.answers=v;r.status='Submitted';return r;}),
  action('response.moderate','Validate response',atStage('Submitted',pm),()=>[pick('decision','Response quality',['Valid','Exclude']),note('reason','Moderation note')],(ctx,r,v)=>{r.moderation=v.reason;r.status=v.decision==='Valid'?'Validated':'Excluded';return r;})
];
export function behaviourResult(ctx,r) {
  const c=cycle(ctx,r),p=c.policy;
  if(c.behaviourMode==='Documented observations'){
    need(r.observation,'Record a dated behavioural observation first.');
    const age=(dateValue(c.end)-dateValue(r.observation.observed))/86400000;
    need(age<=p.freshness,'Behavioural observation is outside the approved freshness window.');
    return {source:'Documented observation',score:r.observation.score};
  }
  const responses=list(ctx.s,'response').filter(x=>x.reviewId===r.id&&x.status==='Validated');
  const weights=r.snapshot.peopleManager?{'Manager':40,'Peer':20,'Direct report':30,'Stakeholder':10}:{Manager:50,Peer:30,Stakeholder:20};
  const groups=[];let total=0,weighted=0;
  for(const [category,weight] of Object.entries(weights)){
    const entries=responses.filter(e=>e.category===category);
    const valid=entries.length>=(['Peer','Direct report'].includes(category)?3:1);
    if(!valid){need(category!=='Manager'&&p.fallback==='Redistribute across valid observer categories','More valid responses are required before scoring.');continue;}
    const score=average(entries.map(e=>e.score));total+=weight;weighted+=score*weight;groups.push({category,score});
  }
  need(total>0,'Valid observer evidence is required.');
  return {source:'360 feedback',score:round(weighted/total),groups};
}

