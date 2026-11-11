import {rosterAt,rosterSnapshot,recordAssignment} from './roster.mjs';
import {trackAt} from './governance.mjs';
import {action,activePolicy,addMonths,addWorkdays,anyRole,choices,create,csv,dateValue,field,get,heads,isRole,isoDay,journal,list,need,noFields,note,notify,num,option,perspectives,pick,readFields,route,yes} from './model.mjs';

const allStaff = s => list(s,'employee').filter(e=>e.active);
const managers = ctx => ctx.s.users.filter(u=>u.active!==false&&u.role==='manager').map(u=>option(u.id,u.name));
export const staffFields = ctx => [
  field('staffId','Staff ID'),field('name','Full name'),field('email','Work email'),field('company','Company'),
  field('department','Department'),field('jobTitle','Job title'),pick('managerId','Line manager',managers(ctx)),
  yes('confirmed','Confirmed employee'),yes('commercial','Commercial role'),yes('peopleManager','Manages people'),
  field('joinedAt','Start date','date'),...['businessUnit','team','grade'].map(key=>field(key,{businessUnit:'Business unit',team:'Team',grade:'Grade'}[key],'text',{optional:true})),pick('employmentStatus','Roster status',['Active','Inactive'],{optional:true}),field('effective','Roster effective date','date',{optional:true})
];
function upsert(ctx,values) {
  need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email),'Enter a valid work email.');
  need(!ctx.actor.company||values.company===ctx.actor.company,'Employee is outside your company scope.');
  const duplicate=list(ctx.s,'employee').find(e=>e.email.toLowerCase()===values.email.toLowerCase()&&e.staffId!==values.staffId);
  need(!duplicate,'This email belongs to another staff ID.');
  let e=list(ctx.s,'employee').find(e=>e.staffId===values.staffId);
  if(!e)e=create(ctx,'employee',values.name,'Active',{history:[]});
  if(e.staffId)need(ctx.scope(e),'Employee is outside your record scope.');
  if(e.staffId)e.history.push({at:ctx.at,company:e.company,department:e.department,managerId:e.managerId,confirmed:e.confirmed,commercial:e.commercial});
  const today=isoDay(ctx.at);
  const effective=values.effective || (e.staffId?today:values.joinedAt);
  need(effective>=values.joinedAt,'Roster change precedes hire date.');
  if(e.staffId&&!e.assignments)recordAssignment(e,rosterSnapshot(e),e.joinedAt,today);
  const basis=e.staffId?rosterAt(e,effective):{};
  for(const key of ['businessUnit','team','grade'])values[key] ||= basis[key] || '';
  const next={...values,title:values.name,active:values.employmentStatus ? values.employmentStatus==='Active' : basis.active!==false,confirmed:values.confirmed==='Yes',commercial:values.commercial==='Yes',peopleManager:values.peopleManager==='Yes'};
  if(!e.staffId)Object.assign(e,next);
  recordAssignment(e,rosterSnapshot(next),effective,today);
  e.track=trackAt(ctx.s,e,today);
  if(e.active&&e.track==='C'&&!list(ctx.s,'probation').some(plan=>plan.employeeId===e.id)){
    const key='confirmation-plan:'+e.id+':'+e.managerId;
    if(!ctx.s.outbox.some(n=>n.key===key)){
      const holidays=list(ctx.s,'policy').filter(p=>p.status==='Published'&&p.effective<=e.joinedAt).sort((a,b)=>b.effective.localeCompare(a.effective))[0]?.holidays || [];
      notify(ctx,e,e.managerId,'Agree a confirmation plan for '+e.title,addWorkdays(e.joinedAt,10,holidays));
      ctx.s.outbox.at(-1).key=key;
    }
  }
  return e;
}
export const createEmployee=action('employee.new','Add employee',anyRole('admin','pm'),staffFields,(ctx,r,v)=>upsert(ctx,v));
export const importRoster=action('employee.import','Import employee roster',anyRole('admin','pm'),ctx=>[
  note('csv','Roster CSV',{limit:350000,hint:'Columns: staffId,name,email,company,department,jobTitle,managerId,confirmed,commercial,peopleManager,joinedAt. Use Yes or No for flags.'})],(ctx,r,v)=>{
  const entries=csv(v.csv);need(entries.length<=2000,'Import up to 2,000 employees at a time.');
  const seen=new Set();
  for(const row of entries) {
    for(const f of staffFields(ctx))need(f.optional||row[f.key],'Missing '+f.label+' for '+(row.staffId??'row'));
    need(!seen.has(row.staffId),'Duplicate staff ID in import.');seen.add(row.staffId);
    need(managers(ctx).some(u=>u.value===row.managerId),'Unknown manager ID for '+row.staffId);
    for(const k of ['confirmed','commercial','peopleManager'])need(['Yes','No'].includes(row[k]),'Use Yes or No in '+k);
    dateValue(row.joinedAt);const e=upsert(ctx,readFields(staffFields(ctx),row));journal(ctx,e,'roster.import');
  }
  return create(ctx,'batch','Roster import · '+entries.length+' rows','Applied',{count:entries.length});
});
export const employeeActions=[
  action('employee.update','Update employee',anyRole('admin','pm'),(ctx,r)=>staffFields(ctx).filter(f=>f.key!=='staffId').map(f=>({...f,default:f.key==='effective'?undefined:typeof r[f.key]==='boolean'?(r[f.key]?'Yes':'No'):r[f.key]})),(ctx,r,v)=>upsert(ctx,{...v,staffId:r.staffId})),
  action('employee.archive','Deactivate employee',(ctx,r)=>r.active&&isRole(ctx.actor,'admin','pm'),()=>[note('reason','Reason for deactivation')],(ctx,r,v)=>{if(!r.assignments)recordAssignment(r,rosterSnapshot(r),r.joinedAt,isoDay(ctx.at));recordAssignment(r,{...rosterSnapshot(r),active:false},isoDay(ctx.at),isoDay(ctx.at));r.reason=v.reason;return r;})
];
const scheduleFields=()=>[
  field('title','Policy version name'),field('effective','Effective from','date'),field('authority','Signed policy or approval reference'),
  ...perspectives.map((p,i)=>num('weight'+i,p+' weight (%)',0,100,{integer:true})),
  pick('fallback','Insufficient 360 response treatment',['Require additional raters','Redistribute across valid observer categories']),
  pick('quarterlyEvidence','Quarters without a full 360',['Approved documented manager observations','Require full 360']),
  num('freshness','Maximum behavioural evidence age (days)',1,366,{integer:true}),
  field('holidays','Public holidays','text',{optional:true,hint:'Comma-separated ISO dates, for example 2027-01-01.'}),
  yes('allowDeduction','Authorise manual score deductions'),num('deductionCap','Maximum deduction (points)',0,4,{default:0}),
  num('deductionFloor','Minimum final score',1,5,{default:1}),field('deductionBasis','Deduction authority and eligible events','text',{optional:true}),
  num('appealDays','Appeal window (working days)',1,90,{integer:true,default:5})
];
export const createPolicy=action('policy.new','Draft policy version',anyRole('pm'),scheduleFields,(ctx,r,v)=>{
  need(perspectives.reduce((sum,p,i)=>sum+v['weight'+i],0)===100,'Perspective weights must total 100%.');
  const holidays=v.holidays.split(',').map(h=>h.trim()).filter(Boolean);holidays.forEach(dateValue);
  if(v.allowDeduction==='Yes')need(v.deductionCap>0&&v.deductionBasis,'Enter an approved cap and event basis.');
  return create(ctx,'policy',v.title,'Awaiting executive approval',{...v,holidays,weights:perspectives.map((p,i)=>v['weight'+i]),author:ctx.actor.id});
});
export const policyActions=[action('policy.publish','Publish approved policy',(ctx,r)=>isRole(ctx.actor,'executive')&&r.status==='Awaiting executive approval'&&r.author!==ctx.actor.id,()=>[field('reference','Executive approval reference')],(ctx,r,v)=>{r.status='Published';r.approval={by:ctx.actor.id,at:ctx.at,reference:v.reference};return r;})];
const levels=['Group','Business unit','Department','Team','Individual'];
export const createStrategy=action('strategy.new','Create objective',anyRole('executive','hod','manager','pm'),ctx=>[
  field('title','Objective'),pick('level','Cascade level',levels),pick('parent','Parent objective',[option('ROOT','Group root'),...choices(list(ctx.s,'strategy').filter(x=>x.status==='Approved'))]),field('unit','Business unit or function'),note('outcome','Expected outcome')
],(ctx,r,v)=>{
  const depth=levels.indexOf(v.level);
  if(depth===0)need(v.parent==='ROOT','Group objectives must be root objectives.');
  else{const p=get(ctx.s,v.parent,'strategy');need(p.status==='Approved'&&levels.indexOf(p.level)===depth-1,'Select an approved objective at the preceding level.');}
  return create(ctx,'strategy',v.title,'Draft',{...v});
});
export const strategyActions=[action('strategy.approve','Approve objective',(ctx,r)=>r.status==='Draft'&&isRole(ctx.actor,'executive','hod')&&(ctx.actor.role==='executive'||r.level!=='Group'&&ctx.actor.department===r.unit),()=>[field('reference','Approval reference')],(ctx,r,v)=>{r.status='Approved';r.approval=v.reference;r.approvedBy=ctx.actor.id;return r;})];
export const createCycle=action('cycle.new','Create review cycle',anyRole('pm'),ctx=>[
  field('title','Cycle name'),field('start','Period start','date'),field('end','Period end','date'),
  pick('policyId','Approved policy',choices(list(ctx.s,'policy').filter(r=>r.status==='Published'))),
  pick('behaviourMode','Behaviour evidence for this cycle',['Policy calendar','Full 360','Documented observations'],{default:'Policy calendar'}),
  field('feedbackDue','360 response deadline','date',{optional:true,hint:'Defaults to the supervisor deadline.'}),
  field('selfDue','Self-review deadline','date',{optional:true,hint:'Defaults to period end.'}),field('managerDue','Manager deadline','date',{optional:true,hint:'Defaults to five working days after period end.'}),field('calibrationDue','Calibration deadline','date',{optional:true,hint:'Defaults to ten working days after period end.'}),field('closeDue','Closure deadline','date',{optional:true,hint:'Defaults to fifteen working days after period end.'})
],(ctx,r,v)=>{
  const p=get(ctx.s,v.policyId,'policy');need(p.status==='Published'&&p.effective<=v.start,'Select a policy effective by cycle start.');
  if(v.behaviourMode==='Policy calendar'){
    const quarter=Math.ceil(Number(v.end.slice(5,7))/3);
    v.behaviourMode=(quarter%2===0 || p.quarterlyEvidence!=='Approved documented manager observations')?'Full 360':'Documented observations';
  }
  v.selfDue ||= v.end;v.managerDue ||= addWorkdays(v.end,5,p.holidays);v.calibrationDue ||= addWorkdays(v.end,10,p.holidays);v.closeDue ||= addWorkdays(v.end,15,p.holidays);
  v.feedbackDue ||= v.managerDue;
  need(v.feedbackDue>=v.start && v.feedbackDue<=v.managerDue,'Feedback must close between cycle start and supervisor deadline.');
  need(v.start<v.end&&v.selfDue>=v.start&&v.selfDue<=v.managerDue&&v.end<=v.managerDue&&v.managerDue<=v.calibrationDue&&v.calibrationDue<=v.closeDue,'Cycle deadlines must follow the review sequence.');
  need(v.behaviourMode==='Full 360'||p.quarterlyEvidence==='Approved documented manager observations','This policy requires a full 360.');
  need(!list(ctx.s,'cycle').some(c=>c.start<=v.end&&v.start<=c.end),'A quarterly cycle already covers part of this period.');
  return create(ctx,'cycle',v.title,'Draft',{...v,policy:structuredClone(p),membership:[],goalDue:addWorkdays(v.start,5,p.holidays),qaDue:addWorkdays(v.start,7,p.holidays),baselineDue:addWorkdays(v.start,10,p.holidays)});
});
export const cycleActions=[
  action('cycle.open','Open cycle',(ctx,r)=>r.status==='Draft'&&isRole(ctx.actor,'pm'),noFields,(ctx,r)=>{
    const staff=list(ctx.s,'employee').map(e=>rosterAt(e,r.start)).filter(e=>e.active&&ctx.scope(e)&&e.joinedAt<=r.start);need(staff.length,'Add eligible employees first.');
    for(const e of staff){
      const snapshot={id:e.id,staffId:e.staffId,name:e.title,managerId:e.managerId,department:e.department,company:e.company,businessUnit:e.businessUnit,team:e.team,grade:e.grade,jobTitle:e.jobTitle,peopleManager:e.peopleManager,track:trackAt(ctx.s,e,r.start)};
      r.membership.push(snapshot);
      if(snapshot.track==='A'){
        const review=create(ctx,'review',e.title+' · '+r.title,'Goal setting',{employeeId:e.id,cycleId:r.id,policyId:r.policyId,snapshot,goals:[],checkIns:[],responses:[],calibrations:[],revisions:[],tasks:[],selfReview:null});
        notify(ctx,review,e.managerId,'Agree objectives and scorecard',addWorkdays(r.start,5,r.policy.holidays));
      }
    }
    r.status='Open';return r;
  }),
  action('cycle.close','Close cycle',(ctx,r)=>r.status==='Open'&&isRole(ctx.actor,'pm'),()=>[field('reference','Closure reconciliation reference')],(ctx,r,v)=>{
    const reviews=list(ctx.s,'review').filter(a=>a.cycleId===r.id);
    need(reviews.every(a=>['Closed','Approved exception'].includes(a.status)),'Every quarterly appraisal requires closure or an approved exception.');
    r.status='Closed';r.closureReference=v.reference;return r;
  })
];

