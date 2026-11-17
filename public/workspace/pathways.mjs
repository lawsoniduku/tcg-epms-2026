import {weighted,percent} from './decimal.mjs';
import {probationNomination,behaviourResult} from './quarterly.mjs';
import {competencyBank} from './feedback.mjs';
import {trackAt} from './governance.mjs';
import {action,addMonths,anyRole,choices,create,field,get,heads,isRole,isoDay,journal,list,manages,need,noFields,note,num,own,pick,ratingFor,round,route,yes} from './model.mjs';
const eligible=(ctx,track)=>list(ctx.s,'employee').filter(e=>e.active&&ctx.scope(e)&&trackAt(ctx.s,e,isoDay(ctx.at))===track);
const selectPerson=(ctx,track)=>pick('employeeId','Employee',choices(eligible(ctx,track).filter(e=>ctx.actor.role!=='manager'||manages(ctx.s,ctx.actor,e))));
const stage=(status,allowed)=>(ctx,r)=>r.status===status&&allowed(ctx,r);
const manager=(ctx,r)=>manages(ctx.s,ctx.actor,r);
const er=ctx=>ctx.actor.role==='er';
const executive=ctx=>ctx.actor.role==='executive';
export const createCommercial=action('commercial.new','Set monthly commercial targets',anyRole('sales','pm','manager'),ctx=>[
  selectPerson(ctx,'B'),field('month','Period start (first day of month)','date'),field('schedule','Approved role schedule reference'),
  num('outputWeight','Approved output weight (%)',0,100,{default:70,integer:true}),num('qualityWeight','Approved quality weight (%)',0,100,{default:20,integer:true}),num('executionWeight','Approved execution weight (%)',0,100,{default:10,integer:true}),
  num('recurrenceWindow','Recurrence lookback (months)',0,3,{default:3,integer:true}),
  num('target','Output target',0.01,1e12),field('unit','Output unit'),num('minimum','Minimum acceptable attainment (%)',0,200),
  num('criticalCap','Critical quality gate rating cap',1,5,{integer:true}),field('qualityRule','Quality and risk scoring rubric'),
  field('executionRule','Execution and compliance scoring rubric'),yes('ramp','Approved ramp-up period')
],(ctx,r,v)=>{
  need(v.outputWeight+v.qualityWeight+v.executionWeight===100,'Commercial component weights must total 100%.');
  need(v.month.endsWith('-01'),'Select the first day of the month.');need(!list(ctx.s,'commercial').some(x=>x.employeeId===v.employeeId&&x.month===v.month),'A commercial review already exists for that month.');
  const e=get(ctx.s,v.employeeId,'employee');
  return create(ctx,'commercial',e.title+' · '+v.month.slice(0,7),'Target approval',{...v,snapshot:structuredClone(e),coaching:[]});
});
export const commercialActions=[
  action('commercial.approve','Approve monthly targets',stage('Target approval',(ctx,r)=>heads(ctx.s,ctx.actor,r)),()=>[field('approval','Role schedule approval')],(ctx,r,v)=>{r.approval=v.approval;r.status='Active';return r;}),
  action('commercial.coach','Record weekly coaching',stage('Active',manager),()=>[note('coaching','Progress, obstacles and agreed support'),field('due','Action due','date')],(ctx,r,v)=>{r.coaching.push({...v,at:ctx.at});return r;}),
  action('commercial.freeze','Freeze commercial source data',stage('Active',anyRole('sales')),()=>[
    num('actual','Verified output',0,1e12),num('quality','Quality and risk rating',1,5),num('execution','Execution rating',1,5),yes('breach','Critical quality gate breached'),
    field('source','Source record or signed extract reference'),note('context','Quality, evidence and period context')
  ],(ctx,r,v)=>{r.inputs={...v,by:ctx.actor.id};r.status='Source validation';return r;}),
  action('commercial.return','Return source for correction',stage('Source validation',anyRole('finance')),()=>[note('reason','Validation issue')],(ctx,r,v)=>{r.correction=v.reason;r.status='Active';return r;}),
  action('commercial.validate','Validate commercial inputs',stage('Source validation',anyRole('finance')),()=>[field('reference','Finance validation reference')],(ctx,r,v)=>{
    const attainment=percent(r.inputs.actual,r.target);
    const output=attainment>=120?5:attainment>=105?4:attainment>=90?3:attainment>=70?2:1;
    need(ctx.actor.id!==r.inputs.by,'Source validation requires a different person from the data submitter.');
    const raw=weighted([output,r.inputs.quality,r.inputs.execution],[r.outputWeight??70,r.qualityWeight??20,r.executionWeight??10]);
    r.result={attainment,raw,score:r.inputs.breach==='Yes'?Math.min(raw,r.criticalCap):raw,output,validation:v.reference,verifiedBy:ctx.actor.id};
    r.status='Manager review';return r;
  }),
  action('commercial.review','Review monthly result',stage('Manager review',manager),()=>[note('review','Manager review, context and agreed support')],(ctx,r,v)=>{
    let consecutive=0,month=r.month;
    const history=list(ctx.s,'commercial').filter(x=>x.employeeId===r.employeeId&&(x.id===r.id||['Released','Acknowledged'].includes(x.status)));
    for(let i=0;i<3;i++){const rec=history.find(x=>x.month===month);if(!rec||rec.ramp==='Yes'||rec.result.attainment>=rec.minimum)break;consecutive++;month=addMonths(month,-1);}
    r.recovery=['Within threshold','First month alert','Structured recovery review','HR and ER decision review'][consecutive];
    const prior=history.filter(m=>m.id!==r.id&&m.month>=addMonths(r.month,-(r.recurrenceWindow??3))&&m.month<r.month&&['Structured recovery review','HR and ER decision review'].includes(m.recovery));
    if(consecutive===1&&prior.length)r.recurrence={priorStage:prior.sort((a,b)=>b.month.localeCompare(a.month))[0].recovery,status:'Pending human review'};
    r.managerNote=v.review;r.status='Released';r.releasedAt=ctx.at;return r;
  }),
  action('commercial.ack','Acknowledge result',stage('Released',(ctx,r)=>own(ctx.actor,r)),noFields,(ctx,r)=>{r.status='Acknowledged';return r;})
];
export const createProbation=action('probation.new','Create confirmation plan',anyRole('manager','pm'),ctx=>[
  selectPerson(ctx,'C'),note('deliverables','Six-month deliverables and standards'),note('support','Training and support'),
  field('evidence','Evidence sources'),field('contract','Contract and probation schedule reference')
],(ctx,r,v)=>{
  const e=get(ctx.s,v.employeeId,'employee');need(!list(ctx.s,'probation').some(x=>x.employeeId===e.id&&x.status!=='Closed'),'This employee has an open confirmation plan.');
  const policy=list(ctx.s,'policy').filter(p=>ctx.scope(p)&&p.status==='Published'&&p.effective<=isoDay(ctx.at)).sort((a,b)=>b.effective.localeCompare(a.effective))[0];
  const feedbackConfig=policy?.probationFeedback==='Require linked full 360'?{start:e.joinedAt,end:addMonths(e.joinedAt,6),feedbackDue:addMonths(e.joinedAt,6),policy:structuredClone(policy),scoringVersion:'4.2',behaviourMode:'Full 360'}:null;
  const campaign=feedbackConfig?{id:crypto.randomUUID(),start:e.joinedAt,end:feedbackConfig.end,version:'4.2',questions:competencyBank(e.peopleManager).map(([key,label])=>[key,policy.labels?.[key]||label])}:null;
  return create(ctx,'probation',e.title+' · confirmation','Plan approval',{...v,campaign,feedbackConfig,snapshot:structuredClone(e),checkpoints:[],extensions:0,finalDue:addMonths(e.joinedAt,6),dates:[1,3,5].map(m=>addMonths(e.joinedAt,m))});
});
export const probationActions=[probationNomination,
  action('probation.approve','Approve confirmation plan',stage('Plan approval',(ctx,r)=>heads(ctx.s,ctx.actor,r)),()=>[field('reference','Plan approval reference')],(ctx,r,v)=>{r.approval=v.reference;r.status='Month 1 checkpoint';return r;}),
  ...[1,3,5].map((month,index)=>action('probation.m'+month,'Record month '+month+' checkpoint',stage('Month '+month+' checkpoint',manager),()=>[
    pick('progress','Performance',['On track','At risk']),note('evidence','Progress and evidence'),note('support','Support delivered and next actions'),
    field('discussed','Discussion date','date'),note('response','Employee feedback')
  ],(ctx,r,v)=>{if(ctx.s.liveCalendar)need(v.discussed>=r.dates[index]&&v.discussed<=isoDay(ctx.at),'Use an actual discussion date on or after the scheduled checkpoint.');need(v.discussed>=r.snapshot.joinedAt&&(!r.checkpoints.length||v.discussed>=r.checkpoints.at(-1).discussed),'Checkpoint dates must be chronological.');r.checkpoints.push({...v,month,by:ctx.actor.id});r.status=index<2?'Month '+[1,3,5][index+1]+' checkpoint':'Final assessment';return r;})),
  action('probation.assess','Submit confirmation recommendation',(ctx,r)=>['Final assessment','Extension review'].includes(r.status)&&manager(ctx,r),()=>[
    num('delivery','Delivery or commercial productivity (1–5)',1,5),num('capability','Capability (1–5)',1,5),num('behaviour','Behaviour and risk (1–5)',1,5),
    yes('critical','Critical breach or insufficient evidence'),pick('recommendation','Recommended outcome',['Confirm','Confirm with development','Extend','Non-confirmation']),
    note('grounds','Evidence and support history'),note('employeeResponse','Employee representation'),field('evidence','Evidence reference')
  ],(ctx,r,v)=>{
    if(r.feedbackConfig)r.feedbackReport=behaviourResult(ctx,r);
    const w=r.snapshot.commercial?[70,15,15]:[60,20,20];const score=weighted([v.delivery,v.capability,v.behaviour],w);
    if(v.recommendation==='Extend')need(r.extensions===0,'Only one ordinary extension is permitted.');
    r.assessment={...v,score,weights:w,guide:v.critical==='Yes'?'HR/ER review':score>=3?'Consider confirmation':score>=2.5?'Consider justified extension':'HR/ER review',by:ctx.actor.id};r.status='HR and ER review';return r;
  }),
  action('probation.er','Clear confirmation recommendation',stage('HR and ER review',er),()=>[note('fairness','Contract, evidence and fairness review'),field('authority','Authority reference')],(ctx,r,v)=>{r.erReview={...v,by:ctx.actor.id};r.status='Decision approval';return r;}),
  action('probation.decide','Record authorised decision',stage('Decision approval',executive),(ctx,r)=>[
    note('reason','Written reasons and communication plan'),field('reference','Decision authority'),field('effective','Decision effective date','date'),
    ...(r.assessment.recommendation==='Extend'?[num('months','Extension duration (months)',1,3,{integer:true}),note('extensionPlan','Evidence, support and review plan')]:[])
  ],(ctx,r,v)=>{
    if(ctx.s.liveCalendar)need(isoDay(ctx.at)>=r.finalDue&&v.effective>=r.finalDue,'The contractual decision date has not been reached.');
    const outcome=r.assessment.recommendation;r.decisions??=[];r.decisions.push({...v,outcome,at:ctx.at,by:ctx.actor.id});
    if(outcome==='Extend'){need(!r.extensions,'Only one ordinary extension is permitted.');r.extensions++;r.finalDue=addMonths(r.finalDue,v.months);r.status='Extension review';}
    else{r.status='Closed';r.outcome=outcome;if(outcome.startsWith('Confirm')){const e=get(ctx.s,r.employeeId,'employee');e.confirmedFrom=v.effective;journal(ctx,e,'confirmation.effective',{effective:v.effective});}}
    return r;
  })
];

