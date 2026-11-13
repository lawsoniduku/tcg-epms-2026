import {nextTask,confirmationStep} from './work-queue.mjs';
import {questionsFor,defaultWeights} from './review-design.mjs';
import {importGoals} from './goal-import.mjs';
import {setupChecklist,reviewTracks} from './setup.mjs';
import {newCadence,cadenceActions} from './cadence.mjs';
import {operationsRows,outcomeTrends} from './reporting.mjs';
import {createMapping,mappingActions} from './commercial-mapping.mjs';
import {rosterAt} from './roster.mjs';
import {probationEscalation,reviewNotices} from './reminders.mjs';
import {campaignProgress,dueDate,outstanding} from './feedback.mjs';
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
  setupCheck:{new:[reviewTracks],actions:[]},
  cadence:{new:[newCadence],actions:cadenceActions},
  template:{
    new:[action('template.new','Save KPI template',ctx=>isRole(ctx.actor,'pm','hod'),ctx=>[
      field('title','Template name'),pick('review','Source baseline',choices(list(ctx.s,'review').filter(r=>r.baseline&&ctx.scope(r)))),
      field('jobTitle','Restrict to job title','text',{optional:true})
    ],(ctx,r,v)=>{
      const source=get(ctx.s,v.review,'review');
      return create(ctx,'template',v.title,'Approval',{...v,department:source.snapshot.department,goals:structuredClone(source.baseline.goals),sourceVersion:source.version,company:source.snapshot.company});
    })],
    actions:[action('template.approve','Approve template',(ctx,r)=>r.status==='Approval'&&isRole(ctx.actor,'pm','hod')&&r.createdBy!==ctx.actor.id&&(ctx.actor.role==='pm'||ctx.actor.department===r.department),
      ()=>[field('authority','Approval reference')],(ctx,r,v)=>Object.assign(r,{status:'Approved',...v,approvedBy:ctx.actor.id}))]
  },
  mapping:{new:[createMapping],actions:mappingActions},
  employee:{new:[createEmployee,importRoster],actions:employeeActions},policy:{new:[createPolicy],actions:policyActions},
  strategy:{new:[createStrategy],actions:strategyActions},cycle:{new:[createCycle],actions:cycleActions},
  goalBatch:{actions:[]},review:{actions:[importGoals,...reviewActions,...amendments,panel]},response:{actions:[...responseActions,...responseExtra]},commercial:{new:[createCommercial,importCommercial],actions:[...commercialActions,...commercialCorrections]},sourceBatch:{actions:sourceBatchActions},
  probation:{new:[createProbation],actions:probationActions},appeal:{new:[createAppeal],actions:appealActions},
  capability:{new:[createCapability],actions:[...capabilityActions,caseResponse]},talent:{new:[createTalent],actions:talentActions},
  exception:{new:[createException],actions:exceptionActions},merit:{new:[createMerit],actions:meritActions},
  payBasis:{new:[payrollBasis],actions:[]},meritException:{new:[newMeritException],actions:meritExceptionActions},cutover:{new:[createCutover],actions:cutoverActions},track:{new:[trackRequest],actions:trackActions},migration:{new:[reconcile],actions:migrationActions},scenario:{new:[createScenario],actions:[]},
  batch:{new:[previewDeductions],actions:batchActions},recognition:{new:[newRecognition],actions:[
    action('recognition.authorise','Decide recognition',(ctx,r)=>ctx.actor.role==='executive'&&r.status==='Approval'&&!own(ctx.actor,r),()=>[pick('decision','Decision',['Approve','Decline']),note('reason','Decision and budget authority')],(ctx,r,v)=>Object.assign(r,{decision:v,status:v.decision==='Approve'?'Approved':'Declined'}))
  ]}
};
Object.assign(sections,{setupCheck:'Roster and track sign-off',cadence:'Formal review schedules',template:'KPI templates',mapping:'Commercial rating conversions',recognition:'Recognition',track:'Track assignments',migration:'Migration reconciliation',scenario:'Salary scenarios',sourceBatch:'Commercial imports',cutover:'Rollout approval',payBasis:'Payroll snapshots',meritException:'Merit exceptions'});
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
import {canAttach,confidentialRead,indexedProjection} from './model.mjs';
const hidden=new Set(['id','type','title','version','createdBy','createdAt','updatedAt','status','employeeId','company','snapshot','history','author','policy','rater','answers']);
function displayRecord(ctx,r){
  if(r.type==='response'){
    const safe={category:r.category,cycleId:r.cycleId};
    if(ctx.actor.id===r.rater){safe.subject=get(ctx.s,r.employeeId).title;safe.submissionStatus=r.status;}
    if(['Nomination','HR validation'].includes(r.status)&&(isRole(ctx.actor,'pm')||ctx.actor.role==='manager')){safe.nominee=ctx.s.users.find(u=>u.id===r.rater)?.name;safe.exposure=r.exposure;
      const load=list(ctx.s,'response').filter(a=>a.rater===r.rater&&outstanding(a)&&ctx.scope(a)).length;
      safe.assignmentLoad=load;safe.workloadWarning=load>(r.observerLoad || (r.cycleId && get(ctx.s,r.cycleId).policy.observerLoad)||10)?'Review observer workload before invitation':undefined;}
    if(confidentialRead(ctx.actor,r,ctx.at)){
      safe.example=r.answers?.example;safe.score=r.score;
    }
    return safe;
  }
  if(r.type==='review'&&own(ctx.actor,r)){
    const data={cycleId:r.cycleId,goals:r.goals,checkIns:r.checkIns,selfReview:r.selfReview,goalFeedback:r.goalFeedback};
    if(r.releasedAt)Object.assign(data,{finalScore:r.revisions.at(-1).finalScore,rating:r.revisions.at(-1).finalRating,explanation:r.revisions.at(-1).employeeExplanation||undefined,conversation:r.conversation,development:r.development,receipt:r.ack});
    if(r.releasedAt && r.assessment?.behaviour.source==='360 feedback'){
      data.feedback = {score:Math.round(r.assessment.behaviour.score*100)/100,periodStart:r.campaign?.start,periodEnd:r.campaign?.end,competencies:r.assessment.behaviour.competencies,strengths:r.feedbackThemes?.strengths,development:r.feedbackThemes?.development};
    }
    return data;
  }
  if(r.type==='review' && r.assessment?.behaviour?.source==='360 feedback' && !isRole(ctx.actor,'pm')){
    const visible=Object.fromEntries(Object.entries(r).filter(([key])=>!hidden.has(key)&&!['feedbackReviewed','feedbackThemes','assessment'].includes(key)));
    visible.assessment={...r.assessment,behaviour:{source:'360 feedback',score:r.assessment.behaviour.score}};
    if(r.releasedAt)visible.feedback={...r.feedbackThemes,competencies:r.assessment.behaviour.competencies};
    return visible;
  }
  if(r.type==='employee')return {staffId:r.staffId,name:r.title,company:r.company,department:r.department,jobTitle:r.jobTitle,manager:r.managerId,confirmed:r.confirmed,commercial:r.commercial,joinedAt:r.joinedAt,track:r.track,email:r.email,businessUnit:r.businessUnit,team:r.team,grade:r.grade};
  if(r.type==='cycle')return {componentWeights:r.componentWeights??defaultWeights,questions:questionsFor(r),...(r.behaviourMode==='Full 360'&&isRole(ctx.actor,'pm') ? {campaignProgress:campaignProgress(ctx,r),feedbackDeadline:dueDate(ctx,{cycleId:r.id})} : {}),start:r.start,end:r.end,behaviourMode:r.behaviourMode,policyId:r.policyId,selfDue:r.selfDue,managerDue:r.managerDue,calibrationDue:r.calibrationDue,closeDue:r.closeDue,eligible:r.membership.length};
  if(r.type==='merit'&&ctx.actor.role==='pm')return {cadence:r.frequency,pool:r.pool,proposedCostNGN:(r.costKobo??0)/100,lines:r.lines.map(l=>({name:l.name,rating:l.rating,nominal:l.nominal,eligibility:l.eligibility})),equity:r.equity};
  if(r.type==='commercial'&&own(ctx.actor,r)&&!['Released','Acknowledged'].includes(r.status))return {month:r.month,target:r.target,unit:r.unit,coaching:r.coaching};
  if(r.type==='probation'&&own(ctx.actor,r))return {...(r.status==='Closed'?{outcome:r.outcome,decision:r.decisions?.at(-1)?.reason}:{}),deliverables:r.deliverables,support:r.support,dates:r.dates,finalDue:r.finalDue,checkpoints:r.checkpoints};
  if(r.type==='capability'&&own(ctx.actor,r))return {kind:r.kind,gap:r.gap,standard:r.standard,coaching:r.coaching,plan:r.plan,checkpoints:r.checkpoints,decision:r.status==='Closed'?r.decision:undefined};
  return Object.fromEntries(Object.entries(r).filter(([k,v])=>!hidden.has(k)&&v!=null&&v!==''));
}
function permittedRecords(ctx,type){return list(ctx.s,type).filter(r=>ctx.scope(r));}
export function view(s,actor,selection={}) {
  s=indexedProjection(s);
  const ctx=context(s,actor);
  const available={};const rows={};const tasks=[];
  for(const [type,defs] of Object.entries(catalogue)){
    const allowedCreates=(defs.new??[]).filter(d=>allowed(ctx,null,d)).map(d=>form(ctx,null,d));
    const visible=permittedRecords(ctx,type);
    rows[type]=visible.map(r=>({id:r.id,title:r.title,status:r.status,version:r.version,employee:personName(s,r),...(r.type==='talent'?{potential:r.potential,performance:r.performance}:{}),department:r.snapshot?.department??r.department??'',cycle:r.cycleId?s.records.find(x=>x.id===r.cycleId)?.title:'',manager:r.snapshot?.managerId??r.managerId??'',updatedAt:r.updatedAt??r.createdAt,actionCount:defs.actions.filter(d=>allowed(ctx,r,d)).length}));
    visible.forEach((r,i)=>{
      const task=nextTask(ctx,r,defs.actions.filter(d=>allowed(ctx,r,d)),s.byId.get(r.cycleId));
      if(task)tasks.push({...rows[type][i],type,...task});
      if(type==='probation')rows[type][i].step=confirmationStep(r);
    });
    available[type]=allowedCreates;
  }
  const planCreation=available.probation.find(a=>a.id==='probation.new');
  const planned=new Set(list(s,'probation').map(r=>r.employeeId));
  for(const employee of planCreation?.fields.find(f=>f.key==='employeeId')?.choices??[]){
    if(planned.has(employee.value))continue;
    const e=s.byId.get(employee.value);
    if(!e||actor.role!=='manager'||e.managerId!==actor.id)continue;
    const reminder=s.outbox.find(n=>n.key==='confirmation-plan:'+e.id+':'+actor.id);
    tasks.push({id:'',type:'probation',action:'probation.new',employeeId:e.id,label:'Create confirmation plan',title:e.title,reason:'New employee awaiting a plan',due:reminder?.due??null});
  }
  let detail=null;
  if(selection.id){
    const r=s.records.find(r=>r.id===selection.id);
    requireThat(r&&ctx.scope(r),'Record unavailable in your scope.',404);
    detail={canAttach:canAttach(s,actor,r),id:r.id,type:r.type,title:r.title,status:r.status,version:r.version,data:displayRecord(ctx,r),actions:catalogue[r.type].actions.filter(d=>allowed(ctx,r,d)).map(d=>form(ctx,r,d))};
    if(r.type==='probation')detail.step=confirmationStep(r);
    if(r.type==='review'){
      const ids=new Set([...(detail.data.calibrations??[]),...(detail.data.revisions??[])].map(entry=>entry.by));
      for(const key of ['approvedBy','chair','by']){
        for(const record of [detail.data.panel,detail.data.baseline,detail.data.assessment,detail.data.qualityReview])if(record?.[key])ids.add(record[key]);
      }
      if(detail.data.managerApproval)ids.add(detail.data.managerApproval);
      detail.people=Object.fromEntries(s.users.filter(u=>ids.has(u.id)).map(u=>[u.id,[...new Set([u.name,roles[u.role]])].join(' · ')]));
    }
    if(r.type==='review'&&detail.actions.some(a=>a.id==='review.goal')){
      const fields=detail.actions.find(a=>a.id==='review.goal').fields;
      const extract=g=>Object.fromEntries(fields.map(f=>[f.key,g[f.key]??f.default??'']));
      const templates=permittedRecords(ctx,'template').filter(t=>t.status==='Approved'&&t.department===r.snapshot.department&&(!t.jobTitle||t.jobTitle===r.snapshot.jobTitle));
      const previous=permittedRecords(ctx,'review').filter(a=>a.employeeId===r.employeeId&&a.baseline&&get(s,a.cycleId).end<get(s,r.cycleId).start).sort((a,b)=>get(s,b.cycleId).end.localeCompare(get(s,a.cycleId).end))[0];
      detail.kpiSources=[...templates.map(t=>({label:t.title,goals:t.goals.map(extract)})),...(previous?[{label:'Copy last cycle’s KPIs',goals:previous.baseline.goals.map(extract)}]:[])];
      detail.teamDrafts=actor.role==='manager'?permittedRecords(ctx,'review').filter(a=>a.cycleId===r.cycleId&&a.status==='Goal setting'&&(a.actingReviewer??a.snapshot.managerId)===actor.id).map(a=>({staffId:a.snapshot.staffId,name:a.snapshot.name??a.snapshot.staffId})):[];
    }
    detail.related=r.type==='employee'?Object.entries(rows).flatMap(([kind,entries])=>entries.filter(entry=>s.byId.get(entry.id)?.employeeId===r.id).map(entry=>({...entry,type:kind}))):[];
    detail.history=s.events.filter(e=>e.record===r.id&&r.type!=='response'&&(!own(actor,r)||r.type!=='review'||!['review.calibrate','review.moderate','review.lock','review.assess'].includes(e.action))).slice(-40).reverse().map(e=>({action:e.action,at:e.at,actor:e.actorName,from:e.from,to:e.to}));
  }
  if(detail?.type==='review'&&detail.data.selfReview){
    const r=get(s,detail.id);const submitted=r.selfReview;
    detail.data.selfReview={items:r.goals.map(g=>({title:g.title,rating:submitted['score_'+g.id],evidence:submitted['note_'+g.id]})),development:submitted.development,at:submitted.at};
  }
  const audit=isRole(actor,'pm','auditor','executive')?s.events.filter(e=>s.byId.has(e.record)&&ctx.scope(s.byId.get(e.record))&&e.type!=='response'&&(!['merit','capability'].includes(e.type)||isRole(actor,'executive'))).slice(-300).reverse().map(e=>({at:e.at,action:e.action,actor:e.actorName,from:e.from,to:e.to})):null;
  const notices=s.outbox.filter(n=>n.recipient===actor.id).slice(-50).reverse();
  const labels=Object.fromEntries(Object.entries(sections).filter(([k])=>Object.hasOwn(catalogue,k)));
  const aggregates={ratingBands:[0,0,0,0,0],outstanding:{},development:0};
  for(const r of permittedRecords(ctx,'review')){
    if(r.status==='Closed'&&r.revisions.length)aggregates.ratingBands[r.revisions.at(-1).finalRating-1]++;
    if(r.development)aggregates.development++;
    if(!['Closed','Approved exception'].includes(r.status))aggregates.outstanding[r.status]=(aggregates.outstanding[r.status]??0)+1;
  }
  return {tasks:tasks.sort((a,b)=>(a.due??'9999').localeCompare(b.due??'9999')||a.title.localeCompare(b.title)),setup:isRole(actor,'pm','admin')?setupChecklist(ctx,Number.isInteger(selection.setupYear)&&selection.setupYear>=2000&&selection.setupYear<=2200?selection.setupYear:new Date(ctx.at).getUTCFullYear()):undefined,trends:isRole(actor,'pm','hod','finance','executive','er','auditor')?outcomeTrends(ctx):[],operations:isRole(actor,'pm','hod','manager','executive','auditor')?operationsRows(ctx):[],aggregates,actor:{id:actor.id,name:actor.name,role:actor.role,grantedRoles:actor.grantedRoles??[actor.role],department:actor.department},roles,sections:labels,rows,available,detail,audit,notices,revision:s.revision};
}
function personName(s,r){return r.type==='employee'?r.title:(s.byId?s.byId.get(r.employeeId):s.records.find(e=>e.id===r.employeeId))?.title??'';}
import {trackAt} from './governance.mjs';
export function processDeadlines(s,at=new Date().toISOString(),previousDay=isoDay(at)){
  const today=isoDay(at);const actor={id:'scheduler',name:'Cycle scheduler',role:'pm'};const ctx=context(s,actor,at);let count=0;
  for(const employee of list(s,'employee')){
    const snapshot=rosterAt(employee,today);
    const currentTrack=trackAt(s,employee,today);
    if(employee.track!==currentTrack || (employee.assignments||[]).length && ['active','confirmed','commercial','peopleManager','managerId','department','company','grade','team','businessUnit','title','email','jobTitle'].some(k=>employee[k]!==snapshot[k])){
      Object.assign(employee,snapshot,{track:currentTrack});
      employee.status=employee.active?'Active':'Inactive';
      journal(ctx,employee,'roster.effective');count++;
    }
  }
  for(const r of list(s,'response')){
    const due=dueDate(ctx,r);
    if(['Invited','In progress'].includes(r.status)){
      const holidays=r.cycleId?get(s,r.cycleId).policy.holidays:[];
      for(const lead of [7,3,1]){
        const key='feedback-reminder:'+r.id+':'+lead+':'+due;
        const reminder=addWorkdays(due,-lead,holidays);
        if(today<=due&&reminder<=today&&(reminder>previousDay||reminder===today)&&!s.outbox.some(n=>n.key===key)){
          notify(ctx,r,r.rater,'Confidential questionnaire due '+due,due);
          s.outbox.at(-1).key=key;count++;
        }
      }
    }
    if(outstanding(r) && today>due){
      const from=r.status;
      r.status='Expired';
      journal(ctx,r,'response.expire',{from,to:r.status});
      count++;
    }
  }
  for(const r of list(s,'review')){
    const c=get(s,r.cycleId,'cycle');
    if(r.status==='In progress'&&today>=addWorkdays(c.end,-4,c.policy.holidays)){r.status='Self-review';journal(ctx,r,'deadline.openSelf',{from:'In progress',to:r.status});count++;}
    if(r.status==='Self-review'&&today>c.selfDue){r.selfBypass=at;r.status='Manager assessment';journal(ctx,r,'deadline.advance',{from:'Self-review',to:r.status});count++;}
    count+=reviewNotices(ctx,r,c,today,previousDay);
  }
  for(const r of list(s,'probation').filter(r=>r.status!=='Closed')){
    count+=probationEscalation(ctx,r,today);
    for(const lead of [30,14,7]){
      const due=new Date(r.finalDue+'T12:00:00Z');due.setUTCDate(due.getUTCDate()-lead);
      const key='probation:'+r.id+':'+r.finalDue+':'+lead;
      if(today>=due.toISOString().slice(0,10)&&!s.outbox.some(n=>n.key===key)){notify(ctx,r,r.snapshot.managerId,'Confirmation decision due '+r.finalDue,r.finalDue);s.outbox.at(-1).key=key;count++;}
    }
  }
  if(count)s.revision++;return count;
}
export function exportData(s,actor,report,id,filters={}){
  requireThat(['completion','scores','payroll','trends'].includes(report),'Unknown report.',400);
  const matches=row=>['cycle','frequency','company','department','manager'].every(k=>!filters[k]||row[k]===filters[k]);
  const ctx=context(s,actor);const rows=[];
  if(report==='payroll'){
    requireThat(actor.role==='finance','Finance export authority is required.',403);const r=get(s,id,'merit');
    need(ctx.scope(r)&&['Exported','Reconciled'].includes(r.status),'Prepare an approved payroll export first.');
    for(const l of r.lines)rows.push({batch:r.export.id,staff_id:l.staffId,employee:l.name,component:'Performance merit',annual_increase_NGN:l.awardKobo/100,effective:r.authorisation.effective,authority:r.authorisation.authority});
  }else if(report==='trends'){
    requireThat(isRole(actor,'pm','hod','finance','executive','er','auditor'),'Management reporting authority is required.',403);
    rows.push(...outcomeTrends(ctx));
  }else if(report==='scores'){
    requireThat(isRole(actor,'pm','executive','auditor'),'Score reporting authority is required.',403);
    const members=new Set(operationsRows(ctx).filter(matches).map(row=>row.review_id));
    for(const r of permittedRecords(ctx,'review').filter(r=>members.has(r.id)))for(const v of r.revisions)rows.push({staff_id:r.snapshot.staffId,employee:r.snapshot.name,cycle:get(s,r.cycleId).title,revision:v.revision,supervisor:v.supervisor,calibrated:v.calibrated,deduction:v.deductionPoints,final:v.finalScore,rating:v.finalRating,reason:v.reason,by:v.by,at:v.at,status:r.status,current:r.revisions.at(-1)===v&&['Locked','Released','Conversation recorded','Acknowledged','Closed'].includes(r.status)});
  }else{
    requireThat(isRole(actor,'pm','hod','manager','executive','auditor'),'Management reporting authority is required.',403);
    rows.push(...operationsRows(ctx).filter(matches));
  }
  for(const row of rows)Object.assign(row,{exported_by:actor.id,exported_at:ctx.at});
  const headers=Object.keys(rows[0]??{status:''});const esc=x=>'"'+String(x??'').replace(/^\s*[=+@\-]/,"'$&").replaceAll('"','""')+'"';
  return [headers.map(esc).join(','),...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\r\n');
}

