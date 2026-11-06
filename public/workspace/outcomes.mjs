import {action,addWorkdays,anyRole,average,choices,create,field,get,heads,isRole,isoDay,journal,list,manages,need,noFields,note,num,option,own,pick,ratingFor,round,yes} from './model.mjs';
const role=(role,stage)=>(ctx,r)=>ctx.actor.role===role&&r.status===stage&&!own(ctx.actor,r);
const details=()=>[note('reason','Findings and rationale'),field('evidence','Evidence or authority reference')];
const people=ctx=>list(ctx.s,'employee').filter(e=>e.active&&ctx.scope(e));
export const createAppeal=action('appeal.new','File appeal',ctx=>!!ctx.actor.employeeId,ctx=>[
  pick('reviewId','Released decision',choices(ctx.s.records.filter(r=>['review','commercial','probation','capability'].includes(r.type)&&own(ctx.actor,r)&&(r.releasedAt||['Closed','Acknowledged'].includes(r.status))))),
  note('grounds','Grounds and requested remedy'),field('evidence','Evidence reference'),note('lateReason','Reason for late filing',{optional:true})
],(ctx,r,v)=>{
  const target=get(ctx.s,v.reviewId);need(!list(ctx.s,'appeal').some(a=>a.reviewId===target.id&&a.status!=='Closed'),'An appeal is already open.');
  const p=target.cycleId?get(ctx.s,target.cycleId,'cycle').policy:null;
  const late=isoDay(ctx.at)>addWorkdays(isoDay(target.releasedAt??target.updatedAt),p?.appealDays??5,p?.holidays??[]);
  need(!late||v.lateReason,'Document the reason for a late appeal.');
  return create(ctx,'appeal',target.title+' · appeal','Intake',{...v,employeeId:target.employeeId,late,deadline:addWorkdays(isoDay(ctx.at),10,p?.holidays??[])});
});
export const appealActions=[
  action('appeal.assign','Appoint independent reviewer',role('pm','Intake'),(ctx,r)=>{
    const t=get(ctx.s,r.reviewId);const prior=new Set(ctx.s.events.filter(e=>e.record===t.id).map(e=>e.actor));
    const reviewers=ctx.s.users.filter(u=>!prior.has(u.id)&&u.employeeId!==r.employeeId&&u.active!==false&&['er','executive','hod'].includes(u.role));
    return [pick('reviewer','Independent reviewer',reviewers.map(u=>option(u.id,u.name))),note('intake','Scope, conflict check and late-filing decision')];
  },(ctx,r,v)=>Object.assign(r,v,{status:'Independent review'})),
  action('appeal.resolve','Decide appeal',(ctx,r)=>r.status==='Independent review'&&r.reviewer===ctx.actor.id,()=>[
    pick('outcome','Finding',['Uphold decision','Return for reassessment']),...details()
  ],(ctx,r,v)=>{r.finding={...v,by:ctx.actor.id};r.status='Communicate decision';return r;}),
  action('appeal.communicate','Record communication and close',role('pm','Communicate decision'),()=>[field('reference','Written outcome reference')],(ctx,r,v)=>{
    r.communication=v.reference;r.status='Closed';if(r.finding.outcome==='Return for reassessment'){
      const t=get(ctx.s,r.reviewId);t.appealRemedy=r.finding.reason;
      if(t.type==='review'){const c=get(ctx.s,t.cycleId);if(c.status==='Closed'){c.status='Open';journal(ctx,c,'cycle.reopen',{appeal:r.id});}t.status='Calibration';t.panel=null;t.releasedAt=null;t.ack=null;t.conversation=null;}
      else if(t.type==='commercial'){t.priorResults??=[];t.priorResults.push(t.result);t.status='Active';t.releasedAt=null;}
      else if(t.type==='probation')t.status='Final assessment';
      else t.status='Hearing';
      journal(ctx,t,'appeal.reassessment',{appealId:r.id});
    }return r;
  })
];
export const createCapability=action('capability.new','Open support or conduct case',anyRole('er','manager','hod'),ctx=>[
  pick('employeeId','Employee',choices(people(ctx))),pick('kind','Case type',['Capability','Misconduct investigation']),
  note('gap','Observed gap or allegation'),note('standard','Expected standard'),field('evidence','Supporting evidence'),note('context','Context and adjustments')
],(ctx,r,v)=>{const e=get(ctx.s,v.employeeId,'employee');need(!own(ctx.actor,e),'An independent case owner is required.');return create(ctx,'capability',e.title+' · '+v.kind,v.kind==='Capability'?'Coaching':'Investigation',{...v,snapshot:structuredClone(e),owner:ctx.actor.id,checkpoints:[],extensions:0});});
const caseOwner=(ctx,r)=>ctx.actor.id===r.owner||manages(ctx.s,ctx.actor,r)||ctx.actor.role==='er';
export const capabilityActions=[
  action('capability.coach','Document support',(ctx,r)=>caseOwner(ctx,r)&&r.status==='Coaching',()=>[note('support','Support provided'),note('response','Employee response'),field('followup','Follow-up date','date'),pick('next','Next step',['Continue coaching','Resolve case','Request formal review'])],(ctx,r,v)=>{
    r.coaching??=[];r.coaching.push({...v,at:ctx.at});if(v.next==='Resolve case')r.status='Closed';if(v.next==='Request formal review')r.status='HOD review';return r;
  }),
  action('capability.escalate','Authorise formal escalation',(ctx,r)=>r.status==='HOD review'&&heads(ctx.s,ctx.actor,r),details,(ctx,r,v)=>Object.assign(r,{hodReview:v,status:'ER diagnostic'})),
  action('capability.warning','Record capability diagnostic',role('er','ER diagnostic'),()=>[...details(),note('response','Employee representations and adjustments'),pick('next','Decision',['Return to coaching','Written warning and PIP proposal','PIP proposal'])],(ctx,r,v)=>Object.assign(r,{diagnostic:v,status:v.next==='Return to coaching'?'Coaching':'PIP proposal'})),
  action('capability.plan','Submit improvement plan',(ctx,r)=>r.status==='PIP proposal'&&caseOwner(ctx,r),()=>[
    pick('days','Duration (days)',['30','60','90']),field('start','Plan start','date'),note('targets','Measurable targets and evidence sources'),note('support','Manager support and resources'),field('cadence','Checkpoint dates or cadence'),note('consequence','Possible outcomes and employee rights')
  ],(ctx,r,v)=>Object.assign(r,{plan:v,status:'PIP approval'})),
  action('capability.activate','Approve improvement plan',role('er','PIP approval'),()=>[field('reference','Approval and communication reference')],(ctx,r,v)=>{
    const d=new Date(r.plan.start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(r.plan.days));r.end=d.toISOString().slice(0,10);r.checkpointDates=[];const step=r.plan.days==='30'?7:14;
    for(let day=step;day<Number(r.plan.days);day+=step){const due=new Date(r.plan.start+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+day);r.checkpointDates.push(due.toISOString().slice(0,10));}
    r.checkpointDates.push(r.end);r.approval=v.reference;r.status='HOD activation';return r;
  }),
  action('capability.hodActivate','Activate approved PIP',(ctx,r)=>r.status==='HOD activation'&&heads(ctx.s,ctx.actor,r),()=>[field('reference','HOD activation and employee communication reference')],(ctx,r,v)=>{r.hodActivation=v.reference;r.status='Active PIP';return r;}),
  action('capability.check','Record PIP checkpoint',(ctx,r)=>r.status==='Active PIP'&&caseOwner(ctx,r),()=>[note('performance','Measured progress'),note('support','Support actually delivered'),note('response','Employee response')],(ctx,r,v)=>{r.checkpoints.push({...v,at:ctx.at});return r;}),
  action('capability.evaluate','Evaluate PIP',role('er','Active PIP'),()=>[pick('outcome','Outcome',['Improved','Justified extension','Formal capability hearing']),...details(),note('response','Employee representations')],(ctx,r,v)=>{
    need(r.checkpoints.length,'Record at least one checkpoint and delivered support.');
    if(v.outcome==='Justified extension'){need(!r.extensions,'Ordinary extension already used.');r.extensions++;r.status='PIP proposal';}
    else r.status=v.outcome==='Improved'?'Closed':'Hearing';r.evaluation=v;return r;
  }),
  action('capability.investigate','Record investigation',role('er','Investigation'),()=>[...details(),note('response','Employee response'),pick('next','Next step',['Close','Hearing','Request precautionary suspension'])],(ctx,r,v)=>Object.assign(r,{investigation:v,status:{Close:'Closed',Hearing:'Hearing','Request precautionary suspension':'Suspension review'}[v.next]})),
  action('capability.suspend','Decide investigation safeguard',role('executive','Suspension review'),()=>[field('legal','Legal clearance reference'),field('contract','Contractual authority'),field('review','Review date','date'),pick('decision','Decision',['Decline suspension','Authorise precautionary suspension']),note('terms','Pay terms and written reasons')],(ctx,r,v)=>Object.assign(r,{suspension:v,status:'Investigation follow-up'})),
  action('capability.followup','Complete investigation follow-up',role('er','Investigation follow-up'),details,(ctx,r,v)=>Object.assign(r,{followup:v,status:'Hearing'})),
  action('capability.hear','Record formal hearing',role('er','Hearing'),()=>[field('notice','Notice and hearing date/reference'),note('response','Employee response and representation'),note('alternatives','Adjustments, support and redeployment considered'),pick('recommendation','Recommendation',['Close','Redeploy','Final warning','Propose termination']),field('legal','HR/ER and legal clearance reference')],(ctx,r,v)=>Object.assign(r,{hearing:v,status:'Authorised decision'})),
  action('capability.decide','Approve case decision',role('executive','Authorised decision'),()=>[pick('decision','Decision',['Approve recommendation','Return to hearing']),note('reasons','Written reasons, appeal rights and communication'),field('delegation','Delegated authority reference')],(ctx,r,v)=>Object.assign(r,{decision:v,status:v.decision==='Return to hearing'?'Hearing':'Closed',releasedAt:ctx.at}))
];
export const createTalent=action('talent.new','Open talent review',anyRole('talent','hod'),ctx=>[pick('employeeId','Employee',choices(people(ctx))),pick('potential','Potential axis',['Developing','Established','High']),note('potentialEvidence','Potential evidence distinct from current performance'),note('aspirations','Employee aspirations'),field('owner','Development owner'),field('reviewDate','Development review date','date'),field('commercialMapping','Signed commercial rating mapping','text',{optional:true}),note('development','Development plan'),field('successorFor','Potential succession role','text',{optional:true})],(ctx,r,v)=>{
  const e=get(ctx.s,v.employeeId,'employee');
  const history=list(ctx.s,'review').filter(a=>a.employeeId===e.id&&a.status==='Closed').sort((a,b)=>get(ctx.s,b.cycleId).end.localeCompare(get(ctx.s,a.cycleId).end)).slice(0,4);
  let scores=history.map(a=>a.revisions.at(-1).finalScore);let periods=history.map(a=>a.id);let sustained=scores.length===4;
  if(e.commercial){need(v.commercialMapping,'An approved commercial mapping is required.');const months=list(ctx.s,'commercial').filter(m=>m.employeeId===e.id&&['Released','Acknowledged'].includes(m.status)).sort((a,b)=>b.month.localeCompare(a.month)).slice(0,12);scores=months.map(m=>m.result.score);periods=months.map(m=>m.id);sustained=months.length===12;}
  need(scores.length,'At least one closed performance result is required.');
  const index=average(scores);return create(ctx,'talent',e.title+' · talent review','Draft',{...v,periods,index,performance:index<2.75?'Developing':index<3.75?'Effective':'High',promotionEligible:sustained&&index>=4});
});
export const talentActions=[
  action('talent.submit','Submit talent recommendation',(ctx,r)=>r.status==='Draft'&&isRole(ctx.actor,'talent','hod'),()=>[pick('route','Recommendation',['Develop in role','Succession pool','Promotion consideration']),field('roleNeed','Role need or vacancy'),note('readiness','Readiness evidence and development action')],(ctx,r,v)=>{
    if(v.route==='Promotion consideration')need(r.promotionEligible&&!list(ctx.s,'capability').some(c=>c.employeeId===r.employeeId&&c.status!=='Closed'),'Promotion consideration requires sustained performance and resolved capability cases.');
    r.recommendation=v;r.status='Executive review';return r;
  }),
  action('talent.decide','Record talent decision',role('executive','Executive review'),()=>[pick('decision','Decision',['Approve','Defer','Decline']),...details()],(ctx,r,v)=>Object.assign(r,{decision:v,status:'Closed'}))
];
export const createException=action('exception.new','Request appraisal exception',anyRole('manager','hod','pm'),ctx=>[pick('reviewId','Appraisal',choices(list(ctx.s,'review').filter(r=>ctx.scope(r)&&!['Closed','Approved exception'].includes(r.status)))),pick('kind','Exception',['Approved exclusion','Alternate reviewer']),note('reason','Business reason'),field('evidence','Evidence reference')],(ctx,r,v)=>{const a=get(ctx.s,v.reviewId);return create(ctx,'exception',a.title+' · '+v.kind,'Pending',{...v,employeeId:a.employeeId});});
export const exceptionActions=[action('exception.decide','Decide exception',(ctx,r)=>r.status==='Pending'&&isRole(ctx.actor,'pm','executive')&&r.createdBy!==ctx.actor.id,(ctx,r)=>[pick('decision','Decision',['Approve','Decline']),note('reason','Decision rationale'),...(r.kind==='Alternate reviewer'?[pick('reviewer','Acting reviewer',ctx.s.users.filter(u=>u.role==='manager'&&u.active!==false&&u.employeeId!==r.employeeId).map(u=>option(u.id,u.name)))]:[])],(ctx,r,v)=>{
  const a=get(ctx.s,r.reviewId);need(!['Closed','Approved exception'].includes(a.status),'The appraisal is already resolved.');r.decision=v;r.status=v.decision==='Approve'?'Approved':'Declined';
  if(r.status==='Approved'){if(r.kind==='Approved exclusion')a.status='Approved exception';else a.actingReviewer=v.reviewer;journal(ctx,a,'exception.applied',{exceptionId:r.id});}return r;
})];

