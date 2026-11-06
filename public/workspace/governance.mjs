import {action,addWorkdays,anyRole,choices,create,csv,field,get,heads,isRole,isoDay,journal,list,manages,need,noFields,note,num,option,own,pick,route,yes} from './model.mjs';
const assigned=(ctx,r)=>manages(ctx.s,ctx.actor,r);
export const amendments=[
  action('review.amend','Request prospective KPI amendment',(ctx,r)=>r.status==='In progress'&&assigned(ctx,r)&&!r.pendingAmendment,(ctx,r)=>[
    pick('goalId','KPI',choices(r.goals)),num('target','Revised target',-1e12,1e12),field('effective','Effective date','date'),note('rationale','Business change and rationale'),field('evidence','Evidence reference')
  ],(ctx,r,v)=>{const c=get(ctx.s,r.cycleId);need(v.effective>=isoDay(ctx.at)&&v.effective<=c.end,'Use a prospective date within this cycle.');const g=r.goals.find(g=>g.id===v.goalId);if(g.direction==='Higher is better')need(v.target>0,'Target must be positive.');r.pendingAmendment={...v,original:g.target,by:ctx.actor.id,status:'PM review'};return r;}),
  action('review.amendQA','Check KPI amendment',(ctx,r)=>ctx.actor.role==='pm'&&r.pendingAmendment?.status==='PM review',()=>[pick('decision','Decision',['Pass','Return']),note('assessment','QA findings')],(ctx,r,v)=>{r.pendingAmendment.qa={...v,by:ctx.actor.id};if(v.decision==='Pass')r.pendingAmendment.status='HOD approval';else{r.amendments??=[];r.amendments.push({...r.pendingAmendment,status:'Returned'});r.pendingAmendment=null;}return r;}),
  action('review.amendApprove','Decide KPI amendment',(ctx,r)=>heads(ctx.s,ctx.actor,r)&&r.pendingAmendment?.status==='HOD approval',()=>[pick('decision','Decision',['Approve','Decline']),field('reference','Decision reference')],(ctx,r,v)=>{
    const request=r.pendingAmendment;need(request.effective>=isoDay(ctx.at),'Approval cannot backdate an expired amendment.');
    r.amendments??=[];r.amendments.push({...request,status:v.decision,authority:v.reference,approvedBy:ctx.actor.id});r.pendingAmendment=null;return r;
  })
];
export function effectiveGoals(r,at){
  const goals=structuredClone(r.baseline?.goals??r.goals);
  for(const change of (r.amendments??[]).filter(a=>a.status==='Approve'&&a.effective<=at).sort((a,b)=>a.effective.localeCompare(b.effective))){
    const goal=goals.find(g=>g.id===change.goalId);if(goal)goal.target=change.target;
  }return goals;
}
export const panel=action('review.panel','Convene calibration panel',(ctx,r)=>r.status==='Calibration'&&ctx.actor.role==='pm'&&!r.panel,(ctx,r)=>[
  pick('chair','Independent panel chair',ctx.s.users.filter(u=>u.active!==false&&(u.role==='hod'||u.additionalRoles?.includes('hod'))&&u.id!==ctx.actor.id&&u.department===r.snapshot.department&&u.employeeId!==r.employeeId&&u.id!==r.snapshot.managerId).map(u=>option(u.id,u.name))),
  field('members','Attendees and functional representation'),field('mandate','Panel mandate or delegation reference'),note('conflicts','Conflict declarations and recusals')
],(ctx,r,v)=>{r.panel={...v,appointedBy:ctx.actor.id,at:ctx.at};return r;});
export const responseExtra=[
  action('response.invalidate','Invalidate conflicted nomination',(ctx,r)=>ctx.actor.role==='pm'&&['Nomination','Invited','Submitted','Validated'].includes(r.status)&&!get(ctx.s,r.reviewId).assessment,()=>[note('reason','Conflict, eligibility or quality reason')],(ctx,r,v)=>{r.status='Excluded';r.moderation=v.reason;return r;})
];
export const caseResponse=action('capability.respond','Submit employee representation',(ctx,r)=>own(ctx.actor,r)&&r.status!=='Closed',()=>[note('representation','Your response and circumstances'),field('evidence','Evidence reference','text',{optional:true})],(ctx,r,v)=>{r.employeeRepresentations??=[];r.employeeRepresentations.push({...v,at:ctx.at});return r;});
export const trackRequest=action('track.new','Request track assignment',anyRole('pm','hod'),ctx=>[
  pick('employeeId','Employee',choices(list(ctx.s,'employee').filter(e=>e.active&&e.confirmed&&ctx.scope(e)))),pick('track','Primary track',['A','B']),field('effective','Effective from','date'),note('rationale','Mixed-role duties and proposed treatment'),field('evidence','Supporting evidence')
],(ctx,r,v)=>{need(v.effective>=isoDay(ctx.at),'Track assignment must be prospective.');const e=get(ctx.s,v.employeeId);return create(ctx,'track',e.title+' · track '+v.track,'HOD review',{...v,original:route(e)});});
export const trackActions=[
  action('track.hod','Endorse mixed-role assignment',(ctx,r)=>r.status==='HOD review'&&heads(ctx.s,ctx.actor,r),()=>[field('reference','Functional approval')],(ctx,r,v)=>{r.hod={...v,by:ctx.actor.id};r.status='HR approval';return r;}),
  action('track.publish','Approve dated assignment',(ctx,r)=>r.status==='HR approval'&&ctx.actor.role==='pm'&&ctx.actor.id!==r.hod.by,()=>[field('reference','HR approval')],(ctx,r,v)=>{need(r.effective>=isoDay(ctx.at),'Approval must be prospective.');r.hr={...v,by:ctx.actor.id};r.status='Approved';return r;})
];
export function trackAt(s,e,date){
  if(!e.confirmed&&!(e.confirmedFrom&&e.confirmedFrom<=date))return 'C';
  const override=list(s,'track').filter(r=>r.employeeId===e.id&&r.status==='Approved'&&r.effective<=date).sort((a,b)=>b.effective.localeCompare(a.effective))[0];
  return override?.track??(e.commercial?'B':'A');
}
export const reconcile=action('migration.new','Reconcile legacy score extract',anyRole('pm','admin'),()=>[
  field('title','Import batch'),field('source','Authoritative ERP extract reference'),note('csv','Legacy CSV',{limit:350000,hint:'staff_id,cycle,supervisor_score,legacy_status. Keep original IDs and status labels.'})
],(ctx,r,v)=>{
  const entries=csv(v.csv),seen=new Set(),rows=[];
  for(const line of entries){const e=list(ctx.s,'employee').find(e=>ctx.scope(e)&&e.staffId===line.staff_id);const key=line.staff_id+'|'+line.cycle;
    const n=line.supervisor_score===''?null:Number(line.supervisor_score);
    const errors=[];if(!e)errors.push('Unknown staff ID');if(seen.has(key))errors.push('Duplicate staff/period');seen.add(key);
    if(!line.cycle)errors.push('Missing cycle');if(n!==null&&(!Number.isFinite(n)||n<1||n>5))errors.push('Invalid score');
    rows.push({staffId:line.staff_id,cycle:line.cycle,rawStatus:line.legacy_status,rawScore:line.supervisor_score,canonical:n===null?'Awaiting supervisor':'Supervisor score recorded',errors});
  }
  return create(ctx,'migration',v.title,'Reconciliation review',{source:v.source,rows,unresolved:rows.filter(l=>l.errors.length).length});
});
export const migrationActions=[action('migration.sign','Certify reconciliation',(ctx,r)=>ctx.actor.role==='pm'&&r.status==='Reconciliation review',()=>[field('reference','Reconciliation approval'),note('findings','Control totals and findings')],(ctx,r,v)=>{need(r.unresolved===0,'Resolve quarantined rows in the source and submit a corrected batch.');r.certificate=v;r.status='Certified';return r;})];
export const createScenario=action('scenario.new','Model salary scenario',anyRole('finance'),()=>[
  field('title','Scenario'),pick('window','Comparison period',['Six months','Twelve months']),field('start','CPI observation start','date'),field('end','CPI observation end','date'),num('initial','Opening CPI index',0.01,1e9),num('closing','Closing CPI index',0.01,1e9),
  field('source','CPI source and publication month'),num('payroll','Eligible annual payroll (NGN)',1,1e12),num('merit','Merit (%)',0,100),num('cola','Cost of living (%)',0,100),num('market','Market corrections (%)',0,100),num('promotion','Promotion (%)',0,100)
],(ctx,r,v)=>{
  const months=(Number(v.end.slice(0,4))-Number(v.start.slice(0,4)))*12+Number(v.end.slice(5,7))-Number(v.start.slice(5,7));need(months===(v.window==='Six months'?6:12),'CPI observations must match the selected review period.');
  const nominal=v.merit+v.cola+v.market+v.promotion;const inflation=v.closing/v.initial-1;
  return create(ctx,'scenario',v.title,'Modelled',{...v,nominal,comparableInflation:Number((inflation*100).toFixed(2)),realMovement:Number((((1+nominal/100)/(1+inflation)-1)*100).toFixed(2)),annualCostNGN:Number((v.payroll*nominal/100).toFixed(2))});
});


export const importCommercial=action('commercial.import','Preview monthly source file',anyRole('sales'),()=>[
  field('title','Batch name'),field('sourceId','Unique signed source extract ID'),field('signature','Source-owner attestation reference'),
  note('csv','Commercial CSV',{limit:250000,hint:'staff_id,month,actual,quality,execution,breach,source. Month uses YYYY-MM-01. Breach uses Yes or No.'})
],(ctx,r,v)=>{
  need(!list(ctx.s,'sourceBatch').some(b=>b.sourceId===v.sourceId),'This source extract has already been registered.');
  const seen=new Set(),rows=[];
  for(const line of csv(v.csv)){
    try{
      const record=list(ctx.s,'commercial').find(c=>c.snapshot.staffId===line.staff_id&&c.month===line.month&&ctx.scope(c));
      need(record&&record.status==='Active','No approved open commercial month for this staff ID.');
      need(!seen.has(record.id),'Duplicate employee and month.');seen.add(record.id);
      const number=(key,min,max)=>{need(String(line[key]??'').trim()!==''&&Number.isFinite(Number(line[key]))&&Number(line[key])>=min&&Number(line[key])<=max,'Invalid '+key);return Number(line[key]);};
      need(['Yes','No'].includes(line.breach)&&line.source,'Evidence reference and gate result are required.');
      rows.push({valid:true,id:record.id,version:record.version,employee:record.snapshot.title,actual:number('actual',0,1e12),quality:number('quality',1,5),execution:number('execution',1,5),breach:line.breach,source:line.source});
    }catch(error){rows.push({valid:false,employee:line.staff_id,error:error.message});}
  }
  return create(ctx,'sourceBatch',v.title,'Preview',{sourceId:v.sourceId,signature:v.signature,rows,accepted:rows.filter(x=>x.valid).length,rejected:rows.filter(x=>!x.valid).length});
});
export const sourceBatchActions=[action('sourceBatch.apply','Freeze accepted source rows',(ctx,r)=>r.status==='Preview'&&ctx.actor.role==='sales',noFields,(ctx,r)=>{
  need(r.accepted>0,'No valid rows to apply.');
  for(const line of r.rows.filter(x=>x.valid)){
    const month=get(ctx.s,line.id,'commercial');
    need(ctx.scope(month)&&month.status==='Active'&&month.version===line.version,'A previewed month has changed. Reconcile the source.');
    month.inputs={actual:line.actual,quality:line.quality,execution:line.execution,breach:line.breach,source:line.source,by:ctx.actor.id,batchId:r.id,context:r.signature};
    month.status='Source validation';journal(ctx,month,'commercial.sourceFreeze',{batchId:r.id});
  }
  r.status='Applied';return r;
})];
export const commercialCorrections=[
 action('commercial.recurrence','Decide recurrence treatment',(ctx,r)=>ctx.actor.role==='er'&&r.recurrence?.status==='Pending human review',()=>[pick('decision','Treatment',['Retain current alert','Resume prior recovery stage']),note('reason','Threshold, market context and support reviewed'),field('authority','ER and functional approval reference')],(ctx,r,v)=>{if(v.decision==='Resume prior recovery stage')r.recovery=r.recurrence.priorStage;r.recurrence={...r.recurrence,...v,status:'Reviewed',by:ctx.actor.id};return r;}),

 action('commercial.correct','Request source correction',(ctx,r)=>ctx.actor.role==='sales'&&['Released','Acknowledged'].includes(r.status),()=>[note('reason','Correction rationale'),field('evidence','Corrected source evidence')],(ctx,r,v)=>{r.correctionRequest={...v,previous:r.status,by:ctx.actor.id};r.status='Correction approval';return r;}),
 action('commercial.correctApprove','Decide source correction',(ctx,r)=>ctx.actor.role==='finance'&&r.status==='Correction approval',()=>[pick('decision','Decision',['Approve','Decline']),field('reference','Finance authority')],(ctx,r,v)=>{if(v.decision==='Approve'){r.priorResults??=[];r.priorResults.push({result:r.result,inputs:r.inputs,reason:r.correctionRequest.reason,approval:v.reference});r.status='Active';r.releasedAt=null;}else r.status=r.correctionRequest.previous;return r;}),
 action('commercial.recovery','Record recovery response',(ctx,r)=>['Released','Acknowledged'].includes(r.status)&&['Structured recovery review','HR and ER decision review'].includes(r.recovery)&&(ctx.actor.role==='er'||heads(ctx.s,ctx.actor,r)),()=>[note('context','Market, target, ramp-up and control context'),note('support','Recovery actions and coaching support'),field('due','Next checkpoint','date'),field('authority','Decision authority')],(ctx,r,v)=>{r.recoveryReviews??=[];r.recoveryReviews.push({...v,by:ctx.actor.id,at:ctx.at});return r;})
];

export const createCutover=action('cutover.new','Prepare rollout approval',anyRole('pm'),ctx=>[
  field('title','Deployment environment'),pick('policyId','Published policy',choices(list(ctx.s,'policy').filter(p=>p.status==='Published'&&ctx.scope(p)))),
  pick('migrationId','Certified reconciliation batch',choices(list(ctx.s,'migration').filter(b=>b.status==='Certified'&&ctx.scope(b)))),
  field('uat','Business UAT evidence'),field('rollback','Restore and rollback rehearsal'),field('training','Manager training and support owner')
],(ctx,r,v)=>create(ctx,'cutover',v.title,'Security review',{...v,signatures:[{role:'pm',actor:ctx.actor.id,at:ctx.at,reference:v.uat}]}));
export const cutoverActions=[
  ['admin','Security review','Finance review','Record security acceptance'],
  ['finance','Finance review','ER review','Record Finance acceptance'],
  ['er','ER review','Executive decision','Record legal and ER acceptance'],
  ['executive','Executive decision','Approved','Approve rollout']
].map(([role,stage,next,title])=>action('cutover.'+role,title,(ctx,r)=>r.status===stage&&ctx.actor.role===role&&!r.signatures.some(s=>s.actor===ctx.actor.id),()=>[field('reference','Signed acceptance reference'),note('findings','Scope and findings')],(ctx,r,v)=>{r.signatures.push({...v,role,actor:ctx.actor.id,at:ctx.at});r.status=next;return r;}));
