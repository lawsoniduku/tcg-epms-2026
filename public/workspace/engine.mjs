import {createCutover,cutoverActions,importCommercial,sourceBatchActions,commercialCorrections,amendments,panel,responseExtra,caseResponse,trackRequest,trackActions,reconcile,migrationActions,createScenario} from './governance.mjs';
import {createEmployee,importRoster,createPolicy,createStrategy,createCycle,employeeActions,policyActions,strategyActions,cycleActions} from './organisation.mjs';
import {reviewActions,responseActions} from './quarterly.mjs';
import {createCommercial,commercialActions,createProbation,probationActions} from './pathways.mjs';
import {createAppeal,appealActions,createCapability,capabilityActions,createTalent,talentActions,createException,exceptionActions} from './outcomes.mjs';
import {payrollBasis,newMeritException,meritExceptionActions,createMerit,meritActions,previewDeductions,batchActions} from './rewards.mjs';
import {action,addWorkdays,choices,create,field,get,isoDay,isRole,journal,list,need,note,notify,own,pick,readFields,requireThat,roles,scope,sections,signed,titleCase} from './model.mjs';
const newRecognition=action('recognition.new','Nominate for recognition',ctx=>isRole(ctx.actor,'manager','hod','pm'),ctx=>[
  pick('reviewId','Closed appraisal',choices(list(ctx.s,'review').filter(a=>a.status==='Closed'&&ctx.scope(a)&&a.revisions.at(-1).finalRating>=3))),
  field('title','Recognition'),note('impact','Evidence of contribution'),field('owner','Recognition owner')
],(ctx,r,v)=>{const a=get(ctx.s,v.reviewId);return create(ctx,'recognition',v.title,'Approval',{...v,employeeId:a.employeeId,cycleId:a.cycleId});});
export const catalogue={
  employee:{new:[createEmployee,importRoster],actions:employeeActions},policy:{new:[createPolicy],actions:policyActions},
  strategy:{new:[createStrategy],actions:strategyActions},cycle:{new:[createCycle],actions:cycleActions},
  review:{actions:[...reviewActions,...amendments,panel]},response:{actions:[...responseActions,...responseExtra]},commercial:{new:[createCommercial,importCommercial],actions:[...commercialActions,...commercialCorrections]},sourceBatch:{actions:sourceBatchActions},
  probation:{new:[createProbation],actions:probationActions},appeal:{new:[createAppeal],actions:appealActions},
  capability:{new:[createCapability],actions:[...capabilityActions,caseResponse]},talent:{new:[createTalent],actions:talentActions},
  exception:{new:[createException],actions:exceptionActions},merit:{new:[createMerit],actions:meritActions},
  payBasis:{new:[payrollBasis],actions:[]},meritException:{new:[newMeritException],actions:meritExceptionActions},cutover:{new:[createCutover],actions:cutoverActions},track:{new:[trackRequest],actions:trackActions},migration:{new:[reconcile],actions:migrationActions},scenario:{new:[createScenario],actions:[]},
  batch:{new:[previewDeductions],actions:batchActions},recognition:{new:[newRecognition],actions:[
    action('recognition.authorise','Decide recognition',(ctx,r)=>ctx.actor.role==='executive'&&r.status==='Approval'&&!own(ctx.actor,r),()=>[pick('decision','Decision',['Approve','Decline']),note('reason','Decision and budget authority')],(ctx,r,v)=>Object.assign(r,{decision:v,status:v.decision==='Approve'?'Approved':'Declined'}))
  ]}
};
Object.assign(sections,{recognition:'Recognition',track:'Track assignments',migration:'Migration reconciliation',scenario:'Salary scenarios',sourceBatch:'Commercial imports',cutover:'Rollout approval',payBasis:'Payroll snapshots',meritException:'Merit exceptions'});
export function context(s,actor,at=new Date().toISOString()) {
  requireThat(signed(actor),'Sign in with an active account.',401);
  return {s,actor,at,scope:r=>scope(s,actor,r)};
}
const allowed=(ctx,r,definition)=>(!r||ctx.scope(r))&&definition.allowed(ctx,r);
function scopedFields(ctx,r,d){
  return d.fields(ctx,r).map(f=>{
    if(f.type!=='select')return {...f,type:typeof f.type==='string'?f.type:'text'};
    return {...f,choices:f.choices.filter(c=>{
      const id=c.value??c;
      const record=ctx.s.records.find(item=>item.id===id);
      const user=ctx.s.users.find(item=>item.id===id);
      return (!record||ctx.scope(record))&&(!user||!ctx.actor.company||!user.company||user.company===ctx.actor.company);
    })};
  });
}
function form(ctx,r,d){return {id:d.id,label:d.label,fields:scopedFields(ctx,r,d)};}
export function execute(s,actor,command,at){
  const ctx=context(s,actor,at);const {type,id,action:actionId,values={},version}=command;
  need(Object.hasOwn(catalogue,type),'Unknown record type.');
  const r=id?get(s,id,type):null;
  const definitions=r?catalogue[type].actions:catalogue[type].new;
  const d=definitions?.find(a=>a.id===actionId);
  requireThat(d&&allowed(ctx,r,d),'Your role or this record’s current stage does not allow that action.',403);
  if(r)requireThat(version===r.version,'Another user changed this record. Reload it before resubmitting.',409);
  const input=readFields(scopedFields(ctx,r,d),values);
  const oldStatus=r?.status??'New';
  const result=d.apply(ctx,r,input);
  need(result?.id,'A workflow operation must return its record.');
  journal(ctx,result,d.id,{from:oldStatus,to:result.status});
  s.revision++;
  return {id:result.id,type:result.type,status:result.status,version:result.version};
}
const hidden=new Set(['id','type','title','version','createdBy','createdAt','updatedAt','status','employeeId','company','snapshot','history','author','policy','rater','answers']);
function displayRecord(ctx,r){
  if(r.type==='response'){
    const safe={category:r.category,cycleId:r.cycleId};
    if(ctx.actor.id===r.rater){safe.subject=get(ctx.s,r.employeeId).title;safe.submissionStatus=r.status;}
    if(isRole(ctx.actor,'pm')&&r.status==='Nomination'){safe.nominee=ctx.s.users.find(u=>u.id===r.rater)?.name;safe.exposure=r.exposure;}
    if(isRole(ctx.actor,'pm')&&r.status==='Submitted'){safe.example=r.answers.example;safe.score=r.score;}
    return safe;
  }
  if(r.type==='review'&&own(ctx.actor,r)){
    const data={cycleId:r.cycleId,goals:r.goals,checkIns:r.checkIns,selfReview:r.selfReview,goalFeedback:r.goalFeedback};
    if(r.releasedAt)Object.assign(data,{finalScore:r.revisions.at(-1).finalScore,rating:r.revisions.at(-1).finalRating,conversation:r.conversation,development:r.development,receipt:r.ack});
    return data;
  }
  if(r.type==='employee')return {staffId:r.staffId,name:r.title,company:r.company,department:r.department,jobTitle:r.jobTitle,manager:r.managerId,confirmed:r.confirmed,commercial:r.commercial,joinedAt:r.joinedAt,track:r.track,email:r.email};
  if(r.type==='cycle')return {start:r.start,end:r.end,behaviourMode:r.behaviourMode,policyId:r.policyId,selfDue:r.selfDue,managerDue:r.managerDue,calibrationDue:r.calibrationDue,closeDue:r.closeDue,eligible:r.membership.length};
  if(r.type==='merit'&&ctx.actor.role==='pm')return {cadence:r.frequency,pool:r.pool,proposedCostNGN:(r.costKobo??0)/100,lines:r.lines.map(l=>({name:l.name,rating:l.rating,nominal:l.nominal,eligibility:l.eligibility})),equity:r.equity};
  if(r.type==='commercial'&&own(ctx.actor,r)&&!['Released','Acknowledged'].includes(r.status))return {month:r.month,target:r.target,unit:r.unit,coaching:r.coaching};
  if(r.type==='probation'&&own(ctx.actor,r)&&r.status!=='Closed')return {deliverables:r.deliverables,support:r.support,dates:r.dates,finalDue:r.finalDue,checkpoints:r.checkpoints};
  if(r.type==='capability'&&own(ctx.actor,r))return {kind:r.kind,gap:r.gap,standard:r.standard,coaching:r.coaching,plan:r.plan,checkpoints:r.checkpoints,decision:r.status==='Closed'?r.decision:undefined};
  return Object.fromEntries(Object.entries(r).filter(([k,v])=>!hidden.has(k)&&v!=null&&v!==''));
}
function permittedRecords(ctx,type){return list(ctx.s,type).filter(r=>ctx.scope(r));}
export function view(s,actor,selection={}) {
  const ctx=context(s,actor);
  const available={};const rows={};
  for(const [type,defs] of Object.entries(catalogue)){
    const allowedCreates=(defs.new??[]).filter(d=>allowed(ctx,null,d)).map(d=>form(ctx,null,d));
    const visible=permittedRecords(ctx,type);
    rows[type]=visible.map(r=>({id:r.id,title:r.title,status:r.status,version:r.version,employee:personName(s,r),...(r.type==='talent'?{potential:r.potential,performance:r.performance}:{}),department:r.snapshot?.department??r.department??'',cycle:r.cycleId?s.records.find(x=>x.id===r.cycleId)?.title:'',manager:r.snapshot?.managerId??r.managerId??'',updatedAt:r.updatedAt??r.createdAt,actionCount:defs.actions.filter(d=>allowed(ctx,r,d)).length}));
    available[type]=allowedCreates;
  }
  let detail=null;
  if(selection.id){
    const r=s.records.find(r=>r.id===selection.id);
    requireThat(r&&ctx.scope(r),'Record unavailable in your scope.',404);
    detail={id:r.id,type:r.type,title:r.title,status:r.status,version:r.version,data:displayRecord(ctx,r),actions:catalogue[r.type].actions.filter(d=>allowed(ctx,r,d)).map(d=>form(ctx,r,d))};
    detail.related=r.type==='employee'?Object.entries(rows).flatMap(([kind,entries])=>entries.filter(entry=>s.records.find(x=>x.id===entry.id)?.employeeId===r.id).map(entry=>({...entry,type:kind}))):[];
    detail.history=s.events.filter(e=>e.record===r.id&&r.type!=='response'&&(!own(actor,r)||r.type!=='review'||!['review.calibrate','review.moderate','review.lock','review.assess'].includes(e.action))).slice(-40).reverse().map(e=>({action:e.action,at:e.at,actor:e.actorName,from:e.from,to:e.to}));
  }
  if(detail?.type==='review'&&detail.data.selfReview){
    const r=get(s,detail.id);const submitted=r.selfReview;
    detail.data.selfReview={items:r.goals.map(g=>({title:g.title,rating:submitted['score_'+g.id],evidence:submitted['note_'+g.id]})),development:submitted.development,at:submitted.at};
  }
  const audit=isRole(actor,'pm','auditor','executive')?s.events.filter(e=>s.records.some(r=>r.id===e.record&&ctx.scope(r))&&e.type!=='response'&&(!['merit','capability'].includes(e.type)||isRole(actor,'executive'))).slice(-300).reverse().map(e=>({at:e.at,action:e.action,actor:e.actorName,from:e.from,to:e.to})):null;
  const notices=s.outbox.filter(n=>n.recipient===actor.id).slice(-50).reverse();
  const labels=Object.fromEntries(Object.entries(sections).filter(([k])=>Object.hasOwn(catalogue,k)));
  const aggregates={ratingBands:[0,0,0,0,0],outstanding:{},development:0};
  for(const r of permittedRecords(ctx,'review')){
    if(r.status==='Closed'&&r.revisions.length)aggregates.ratingBands[r.revisions.at(-1).finalRating-1]++;
    if(r.development)aggregates.development++;
    if(!['Closed','Approved exception'].includes(r.status))aggregates.outstanding[r.status]=(aggregates.outstanding[r.status]??0)+1;
  }
  return {aggregates,actor:{id:actor.id,name:actor.name,role:actor.role,grantedRoles:actor.grantedRoles??[actor.role],department:actor.department},roles,sections:labels,rows,available,detail,audit,notices,revision:s.revision};
}
function personName(s,r){return r.type==='employee'?r.title:s.records.find(e=>e.id===r.employeeId)?.title??'';}
export function processDeadlines(s,at=new Date().toISOString()){
  const today=isoDay(at);const actor={id:'scheduler',name:'Cycle scheduler',role:'pm'};const ctx=context(s,actor,at);let count=0;
  for(const r of list(s,'review')){
    const c=get(s,r.cycleId,'cycle');
    if(r.status==='In progress'&&today>=addWorkdays(c.end,-4,c.policy.holidays)){r.status='Self-review';journal(ctx,r,'deadline.openSelf',{from:'In progress',to:r.status});count++;}
    if(r.status==='Self-review'&&today>c.selfDue){r.selfBypass=at;r.status='Manager assessment';journal(ctx,r,'deadline.advance',{from:'Self-review',to:r.status});count++;}
    const date=r.status==='Manager assessment'?c.managerDue:r.status==='Calibration'?c.calibrationDue:null;
    if(!date)continue;
    for(const delay of [2,3,5]){
      const due=addWorkdays(date,delay,c.policy.holidays);const key='escalation:'+r.id+':'+r.status+':'+delay;
      if(today<due||s.outbox.some(n=>n.key===key))continue;
      const recipients=s.users.filter(u=>u.active!==false&&(delay===2?u.role==='hod'&&u.department===r.snapshot.department:['executive','pm'].includes(u.role)));
      for(const u of recipients){notify(ctx,r,u.id,'Overdue '+r.status+' · '+r.title,due);s.outbox.at(-1).key=key;}
      if(recipients.length)count++;
    }
  }
  for(const r of list(s,'probation').filter(r=>r.status!=='Closed')){
    for(const lead of [30,14,7]){
      const due=new Date(r.finalDue+'T12:00:00Z');due.setUTCDate(due.getUTCDate()-lead);
      const key='probation:'+r.id+':'+r.finalDue+':'+lead;
      if(today>=due.toISOString().slice(0,10)&&!s.outbox.some(n=>n.key===key)){notify(ctx,r,r.snapshot.managerId,'Confirmation decision due '+r.finalDue,r.finalDue);s.outbox.at(-1).key=key;count++;}
    }
  }
  if(count)s.revision++;return count;
}
export function exportData(s,actor,report,id){
  const ctx=context(s,actor);const rows=[];
  if(report==='payroll'){
    requireThat(actor.role==='finance','Finance export authority is required.',403);const r=get(s,id,'merit');
    need(ctx.scope(r)&&['Exported','Reconciled'].includes(r.status),'Prepare an approved payroll export first.');
    for(const l of r.lines)rows.push({batch:r.export.id,staff_id:l.staffId,employee:l.name,component:'Performance merit',annual_increase_NGN:l.awardKobo/100,effective:r.authorisation.effective,authority:r.authorisation.authority});
  }else if(report==='scores'){
    requireThat(isRole(actor,'pm','executive','auditor'),'Score reporting authority is required.',403);
    for(const r of permittedRecords(ctx,'review'))for(const v of r.revisions)rows.push({staff_id:r.snapshot.staffId,employee:r.snapshot.name,cycle:get(s,r.cycleId).title,revision:v.revision,supervisor:v.supervisor,calibrated:v.calibrated,deduction:v.deductionPoints,final:v.finalScore,rating:v.finalRating,reason:v.reason,by:v.by,at:v.at,status:r.status,current:r.revisions.at(-1)===v&&['Locked','Released','Conversation recorded','Acknowledged','Closed'].includes(r.status)});
  }else{
    requireThat(isRole(actor,'pm','hod','manager','executive','auditor'),'Management reporting authority is required.',403);
    for(const r of permittedRecords(ctx,'review'))rows.push({employee:r.snapshot.name,department:r.snapshot.department,company:r.snapshot.company,cycle:get(s,r.cycleId).title,status:r.status,baseline:!!r.baseline,selfSubmitted:!!r.selfReview,supervisorScored:r.supervisorScore!=null,calibrated:r.calibratedScore!=null,released:!!r.releasedAt,closed:r.status==='Closed',exception:r.status==='Approved exception'});
  }
  const headers=Object.keys(rows[0]??{status:''});const esc=x=>'"'+String(x??'').replace(/^\s*[=+@\-]/,"'$&").replaceAll('"','""')+'"';
  return [headers.map(esc).join(','),...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\r\n');
}

