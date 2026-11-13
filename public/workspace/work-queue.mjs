// @ts-check
import {addWorkdays,isoDay,list} from './model.mjs';
const reviewStages={
 'Goal setting':['submitGoals','goalDue'],'Manager goal approval':['managerApprove','goalDue'],'PM quality review':['qa','qaDue'],'HOD baseline approval':['baseline','baselineDue'],
 'Self-review':['self','selfDue'],'Manager assessment':['assess','managerDue'],'Calibration':['calibrate','calibrationDue'],'Enterprise moderation':['moderate','calibrationDue'],
 Finalisation:['lock','closeDue'],Locked:['release','closeDue'],Released:['conversation','closeDue'],'Conversation recorded':['ack','closeDue'],Acknowledged:['close','closeDue']
};
const required=new Set(('policy.publish strategy.approve template.approve cadence.activate track.hod track.publish appeal.assign appeal.resolve appeal.communicate recognition.authorise commercial.approve commercial.freeze commercial.validate commercial.review commercial.ack response.endorse response.invite response.start response.submit response.moderate merit.submit merit.equity merit.authorise merit.export merit.ack meritException.decide exception.decide talent.submit talent.decide mapping.approve migration.sign sourceBatch.apply batch.apply capability.plan capability.activate capability.hodActivate capability.evaluate capability.hear capability.decide').split(' '));
const milestones=[
 ['Plan approval','Approve plan','Head of function','approve'],['Month 1 checkpoint','Month 1 check-in','Line manager','m1'],['Month 3 checkpoint','Month 3 check-in','Line manager','m3'],['Month 5 checkpoint','Month 5 check-in','Line manager','m5'],['Final assessment','Final recommendation','Line manager','assess'],['HR and ER review','Fairness review','Employee Relations','er'],['Decision approval','Authorised decision','Executive approver','decide']
];
/** @param {any} record */
export function confirmationStep(record){
 const step=milestones.find(s=>s[0]===record.status)??(record.status==='Extension review'?['Extension review','Extension recommendation','Line manager','assess']:['Closed','Decision recorded','','']);
 const idx=milestones.indexOf(step);
 const due=idx>=1&&idx<=3?record.dates?.[idx-1]:['Final assessment','Extension review','Decision approval'].includes(record.status)?record.finalDue:null;
 return {label:step[1],owner:step[2],action:step[3]?'probation.'+step[3]:null,due};
}
/** @param {any} ctx @param {any} r @param {any[]} actions @param {any} cycle */
export function nextTask(ctx,r,actions,cycle){
 let action,due,reason='';
 if(r.type==='review'){
  let [verb,dateKey]=reviewStages[r.status]??[];
  if(r.status==='Calibration'&&!r.panel)verb='panel';
  if(r.status==='Locked'&&r.assessment?.behaviour?.source==='360 feedback'&&!r.feedbackReviewed)verb='feedbackThemes';
  if(r.status==='In progress'&&(!ctx.s.liveCalendar||ctx.at.slice(0,10)>=addWorkdays(cycle.end,-4,cycle.policy.holidays)))verb='openSelf';
  if(r.status==='Manager assessment')reason=r.selfReview?'Self-review submitted':'Self-review window closed';
  if(!actions.some(a=>a.id==='review.'+verb)&&r.pendingAmendment)verb=actions.some(a=>a.id==='review.amendQA')?'amendQA':'amendApprove';
  action=actions.find(a=>a.id==='review.'+verb);due=cycle?.[dateKey];
 }else if(r.type==='probation'){
  const step=confirmationStep(r);action=actions.find(a=>a.id===step.action);due=step.due;
 }else{
  action=actions.find(a=>required.has(a.id)||a.id.startsWith('cutover.'));
  if(r.type==='response')due=r.feedbackDeadline??cycle?.feedbackDue;
 }
 return action?{action:action.id,label:action.label,due:due??null,reason}:null;
}

/** @param {any} ctx @param {any} r @param {any[]} actions @param {any} cycle */
export function nominationTask(ctx,r,actions,cycle){
 const action=actions.find(a=>a.id===r.type+'.nominate');
 if(!action)return null;
 const config=r.feedbackConfig??cycle;
 const due=config.feedbackDue??config.managerDue,today=isoDay(ctx.at);
 if(ctx.s.liveCalendar&&(today<config.start||today>due))return null;
 const active=list(ctx.s,'response').filter(a=>a.reviewId===r.id&&!['Expired','Excluded','Declined'].includes(a.status));
 const covered=new Set(active.filter(a=>a.category!=='Manager').map(a=>a.rater)).size;
 if(covered>=(config.policy.minimumAnonymous||3)||config.policy.nominationCap&&active.length>=config.policy.nominationCap)return null;
 return {action:action.id,label:action.label,due,reason:'Nominate observers for this review'};
}
