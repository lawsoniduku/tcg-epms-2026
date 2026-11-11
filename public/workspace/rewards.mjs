import {mappingField,mappedRating} from './commercial-mapping.mjs';
import {trackAt} from './governance.mjs';
import {action,addMonths,anyRole,average,choices,create,csv,field,get,isRole,journal,list,need,noFields,note,num,pick,ratingFor,round,yes} from './model.mjs';
import {hundredths} from '../shared/domain.mjs';
import {lockReview} from './quarterly.mjs';
const byRole=(status,role)=>(ctx,r)=>r.status===status&&ctx.actor.role===role&&!(ctx.actor.employeeId&&r.lines?.some(l=>l.employeeId===ctx.actor.employeeId));
function moneyProduct(base,reference,factor,position,cap){
  const salary=BigInt(base), ceiling=salary*BigInt(hundredths(cap))/10000n;
  const amount=salary*BigInt(hundredths(reference))*BigInt(hundredths(factor))*BigInt(hundredths(position))/100000000n;
  return Number(amount<ceiling?amount:ceiling);
}
function windowLastDate(r){
  const end=new Date(addMonths(r.start,r.frequency==='Annual'?12:6)+'T12:00:00Z');
  end.setUTCDate(end.getUTCDate()-1);
  return end.toISOString().slice(0,10);
}
function eligibleHistory(s,employee,r){
  const cEnd=addMonths(r.start,r.frequency==='Annual'?12:6);
  const months=r.frequency==='Annual'?12:6;
  const exception=list(s,'meritException').some(x=>x.employeeId===employee.id&&x.meritId===r.id&&x.status==='Approved');
  const track=trackAt(s,employee,windowLastDate(r));
  if(track==='B'){
    need(r.salesMap,'An approved commercial-to-common-rating mapping is required.');
    const scores=list(s,'commercial').filter(a=>a.employeeId===employee.id&&['Released','Acknowledged'].includes(a.status)&&a.month>=r.start&&a.month<cEnd&&trackAt(s,employee,a.month)==='B').sort((a,b)=>a.month.localeCompare(b.month));
    need(scores.length===months||scores.length>0&&exception,'A full window of validated commercial months is required.');
    return scores.map(a=>({id:a.id,version:a.version,score:mappedRating(s,r.salesMap,a)}));
  }
  need(track==='A','Only confirmed eligible employees may enter merit review.');
  const reviews=list(s,'review').filter(a=>a.employeeId===employee.id&&a.status==='Closed'&&get(s,a.cycleId).start>=r.start&&get(s,a.cycleId).end<cEnd).sort((a,b)=>get(s,a.cycleId).end.localeCompare(get(s,b.cycleId).end));
  need(reviews.length===months/3||reviews.length>0&&exception,'A full window of closed quarterly appraisals is required.');
  return reviews.map(a=>({id:a.id,version:a.version,score:a.revisions.at(-1).finalScore}));
}
function fresh(s,r){
  for(const line of r.lines){
    const e=get(s,line.employeeId,'employee');need(e.active,'An employee is inactive. Remodel the proposal.');
    const payroll=list(s,'payBasis').filter(p=>p.employeeId===e.id).sort((a,b)=>b.effective.localeCompare(a.effective))[0];
    if(payroll)need(line.payBasisId===payroll.id&&payroll.annualKobo===line.salaryKobo,'Payroll basis changed. Return to modelling and replace the proposal.');
    const history=eligibleHistory(s,e,r);need(JSON.stringify(history)===JSON.stringify(line.history),'A source result changed. Rebuild the affected merit line.');
    need(history.at(-1).score>=2.75,'Latest rating requires an eligibility review.');
    need(!list(s,'capability').some(c=>c.employeeId===e.id&&(c.kind==='Misconduct investigation'&&c.status!=='Closed'||['Active PIP','Hearing','Authorised decision'].includes(c.status))),'An eligibility review is required for an open case.');
  }
}
export const createMerit=action('merit.new','Model merit window',anyRole('finance'),ctx=>[
  field('title','Review title'),pick('frequency','Approved cadence',['H1/H2','Annual']),field('start','Window start','date'),
  field('authority','Approved cadence and matrix reference'),num('pool','Budget pool (NGN)',0,1e12),num('reference','Reference merit rate (%)',0,100),num('cap','Maximum increase (%)',0,100),
  ...[3,4,5].map(n=>num('factor'+n,'Approved factor for rating '+n,0,10)),
  mappingField(ctx,'salesMap'),num('cpiStart','CPI index at window start',0.01,1e9),num('cpiEnd','CPI index at window end',0.01,1e9),
  field('cpiSource','CPI source and observation dates')
],(ctx,r,v)=>{
  need(v.start.endsWith('-01-01')||v.frequency==='H1/H2'&&v.start.endsWith('-07-01'),'Choose 1 January or the applicable 1 July half-year start.');
  const end=addMonths(v.start,v.frequency==='Annual'?12:6);
  need(!list(ctx.s,'merit').some(m=>m.start<end&&v.start<addMonths(m.start,m.frequency==='Annual'?12:6)),'A merit review already covers this window.');
  return create(ctx,'merit',v.title,'Modelling',{...v,poolKobo:hundredths(v.pool),inflation:round((v.cpiEnd/v.cpiStart-1)*100),lines:[]});
});
export const meritActions=[
  action('merit.remodel','Return proposal to modelling',(ctx,r)=>ctx.actor.role==='finance'&&['HR equity review','Executive approval','Export ready'].includes(r.status),()=>[note('reason','Changed data or budget reason')],(ctx,r,v)=>{r.priorApprovalRounds??=[];r.priorApprovalRounds.push({reason:v.reason,at:ctx.at,costKobo:r.costKobo,authorisation:r.authorisation??null});r.authorisation=null;r.equity=null;r.status='Modelling';return r;}),

  action('merit.line','Add or replace salary proposal',byRole('Modelling','finance'),(ctx,r)=>[
    pick('employeeId','Employee',choices(list(ctx.s,'employee').filter(e=>e.active&&trackAt(ctx.s,e,windowLastDate(r))!=='C'&&ctx.scope(e)))),num('salary','Annual guaranteed salary (NGN)',0.01,1e11),
    num('position','Approved pay-position factor',0,5,{default:1}),field('paySource','Pay and grade/range reference'),note('eligibility','Eligibility, risk and equity assessment')
  ],(ctx,r,v)=>{
    const e=get(ctx.s,v.employeeId,'employee'),history=eligibleHistory(ctx.s,e,r);const index=average(history.map(h=>h.score)),rating=ratingFor(index),factor=rating>=3?r['factor'+rating]:0;
    const payroll=list(ctx.s,'payBasis').filter(p=>p.employeeId===e.id).sort((a,b)=>b.effective.localeCompare(a.effective))[0];
    if(ctx.s.liveCalendar)need(payroll,'Register a certified payroll snapshot for this employee.');
    if(payroll)need(payroll.annualKobo===hundredths(v.salary),'Use the certified annual pay from the most recent payroll snapshot.');
    const salaryKobo=hundredths(v.salary),proposed=moneyProduct(salaryKobo,r.reference,factor,v.position,r.cap);
    r.lines=r.lines.filter(l=>l.employeeId!==e.id);r.lines.push({...v,name:e.title,staffId:e.staffId,payBasisId:payroll?.id??null,index,rating,history,salaryKobo,proposedKobo:proposed});return r;
  }),
  action('merit.remove','Remove proposal',byRole('Modelling','finance'),(ctx,r)=>[pick('employeeId','Employee proposal',r.lines.map(x=>({value:x.employeeId,label:x.name})))],(ctx,r,v)=>{r.lines=r.lines.filter(x=>x.employeeId!==v.employeeId);return r;}),
  action('merit.submit','Submit affordability model',byRole('Modelling','finance'),()=>[yes('normalise','Approve uniform scaling if over budget'),note('budget','Finance affordability review')],(ctx,r,v)=>{
    need(r.lines.length,'Add an eligible employee proposal.');fresh(ctx.s,r);
    const total=r.lines.reduce((sum,l)=>sum+l.proposedKobo,0);need(Number.isSafeInteger(total),'Budget model exceeds the accounting range.');
    need(total<=r.poolKobo||v.normalise==='Yes','Finance must authorise scaling or increase the approved pool.');
    for(const l of r.lines){l.awardKobo=total>r.poolKobo?Number(BigInt(l.proposedKobo)*BigInt(r.poolKobo)/BigInt(total)):l.proposedKobo;
      l.nominal=round(l.awardKobo/l.salaryKobo*100);l.real=round(((1+l.nominal/100)/(r.cpiEnd/r.cpiStart)-1)*100);}
    r.costKobo=r.lines.reduce((sum,l)=>sum+l.awardKobo,0);r.financeReview={...v,by:ctx.actor.id};r.status='HR equity review';return r;
  }),
  action('merit.equity','Complete HR equity review',byRole('HR equity review','pm'),()=>[note('findings','Equity, eligibility and exceptions'),pick('decision','Disposition',['Approve for executive review','Return to Finance'])],(ctx,r,v)=>{need(ctx.actor.id!==r.financeReview.by,'Independent HR equity review is required.');r.equity={...v,by:ctx.actor.id};r.status=v.decision==='Return to Finance'?'Modelling':'Executive approval';return r;}),
  action('merit.authorise','Authorise merit proposals',byRole('Executive approval','executive'),()=>[field('authority','Delegated approval reference'),field('effective','Payroll effective date','date'),pick('decision','Decision',['Approve','Return to Finance'])],(ctx,r,v)=>{need(![r.equity?.by,r.financeReview?.by].includes(ctx.actor.id),'Executive approval requires an independent signer.');fresh(ctx.s,r);r.authorisation={...v,by:ctx.actor.id,at:ctx.at};r.status=v.decision==='Approve'?'Export ready':'Modelling';return r;}),
  action('merit.export','Prepare approved payroll export',(ctx,r)=>r.status==='Export ready'&&ctx.actor.role==='finance'&&r.financeReview.by!==ctx.actor.id,()=>[field('reference','Finance export authorisation')],(ctx,r,v)=>{fresh(ctx.s,r);r.export={...v,id:crypto.randomUUID(),at:ctx.at,by:ctx.actor.id};r.status='Exported';return r;}),
  action('merit.ack','Record payroll reconciliation',byRole('Exported','finance'),()=>[field('reference','Payroll acknowledgement reference'),num('cost','Acknowledged annual award total (NGN)',0,1e12)],(ctx,r,v)=>{need(hundredths(v.cost)===r.costKobo,'Payroll acknowledgement does not reconcile to the approved amount.');r.payrollAck=v;r.status='Reconciled';return r;})
];
export const previewDeductions=action('batch.preview','Preview deduction CSV',anyRole('pm'),()=>[
  field('filename','Batch name'),note('csv','Deduction CSV',{limit:250000,hint:'employee_id,appraisal_cycle_id,deduction_points,reason_comment,evidence_reference. Use the staff ID and cycle ID or name.'})
],(ctx,r,v)=>{
  const entries=csv(v.csv),results=[],seen=new Set();
  need(Object.keys(entries[0]).every(k=>['employee_id','appraisal_cycle_id','deduction_points','reason_comment','evidence_reference'].includes(k)),'Unsupported CSV column.');
  for(const entry of entries){
    try{const employees=list(ctx.s,'employee').filter(e=>e.staffId===entry.employee_id);
      const cycles=list(ctx.s,'cycle').filter(c=>[c.id,c.title].includes(entry.appraisal_cycle_id));need(employees.length===1&&cycles.length===1,'Unknown or ambiguous employee/cycle.');
      const review=list(ctx.s,'review').find(a=>a.employeeId===employees[0].id&&a.cycleId===cycles[0].id);need(review,'Missing appraisal.');
      need(!seen.has(review.id),'Duplicate employee/cycle row.');seen.add(review.id);
      const input={deduction:entry.deduction_points,reason:entry.reason_comment,evidence:entry.evidence_reference??''};
      const clone=structuredClone(review);lockReview(ctx,clone,input);
      results.push({employee:employees[0].title,id:review.id,version:review.version,before:review.calibratedScore,after:clone.revisions.at(-1).finalScore,input,valid:true});
    }catch(e){results.push({employee:entry.employee_id,valid:false,error:e.message});}
  }
  return create(ctx,'batch',v.filename,'Preview',{rows:results,accepted:results.filter(x=>x.valid).length,rejected:results.filter(x=>!x.valid).length});
});
export const batchActions=[action('batch.apply','Confirm and lock accepted rows',byRole('Preview','pm'),noFields,(ctx,r)=>{
  need(r.accepted>0,'No accepted rows to apply.');
  for(const line of r.rows.filter(x=>x.valid)){const a=get(ctx.s,line.id,'review');need(a.version===line.version,'A previewed appraisal changed. Create another preview.');lockReview(ctx,a,line.input);a.revisions.at(-1).batchId=r.id;journal(ctx,a,'batch.finalise',{batchId:r.id});}
  r.status='Applied';r.appliedBy=ctx.actor.id;r.appliedAt=ctx.at;return r;
})];


export const payrollBasis=action('payBasis.new','Register payroll snapshot',anyRole('finance'),ctx=>[
  pick('employeeId','Employee',choices(list(ctx.s,'employee').filter(e=>e.active&&ctx.scope(e)))),num('annual','Annual guaranteed salary (NGN)',0.01,1e11),
  field('grade','Grade or range'),field('effective','Payroll snapshot date','date'),field('source','Certified payroll extract reference')
],(ctx,r,v)=>{
  const e=get(ctx.s,v.employeeId,'employee');
  need(!list(ctx.s,'payBasis').some(p=>p.employeeId===e.id&&p.effective===v.effective),'A payroll snapshot exists for that date.');
  return create(ctx,'payBasis',e.title+' · '+v.effective,'Registered',{...v,annualKobo:hundredths(v.annual)});
});
export const newMeritException=action('meritException.new','Request merit eligibility review',anyRole('pm','finance'),ctx=>[
  pick('employeeId','Employee',choices(list(ctx.s,'employee').filter(e=>e.active&&ctx.scope(e)))),
  pick('meritId','Merit window',choices(list(ctx.s,'merit').filter(w=>w.status==='Modelling'&&ctx.scope(w)))),
  pick('basis','Reason',['Approved absence','Recent confirmation','Manager non-compliance','Transfer','Material case reviewed']),
  note('reason','Evidence available and fair treatment'),field('reference','HR review reference')
],(ctx,r,v)=>create(ctx,'meritException',get(ctx.s,v.employeeId).title+' · eligibility','Executive review',v));
export const meritExceptionActions=[action('meritException.decide','Decide eligibility exception',(ctx,r)=>r.status==='Executive review'&&ctx.actor.role==='executive'&&!ownEmployee(ctx,r),()=>[pick('outcome','Finding',['Approve','Defer','Decline']),field('authority','Signed authority'),note('rationale','Reasons and scope')],(ctx,r,v)=>Object.assign(r,{decision:v,status:v.outcome==='Approve'?'Approved':v.outcome}))];
function ownEmployee(ctx,r){return ctx.actor.employeeId&&ctx.actor.employeeId===r.employeeId;}
