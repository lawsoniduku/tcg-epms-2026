import {get,isoDay,list} from './model.mjs';

// Build the denominator from the cycle's frozen roster, including records needing repair.
export function operationsRows(ctx) {
  const rows=[];
  for(const cycle of list(ctx.s,'cycle').filter(c=>ctx.scope(c))){
    const reviews=new Map(list(ctx.s,'review').filter(r=>r.cycleId===cycle.id).map(r=>[r.employeeId,r]));
    for(const member of cycle.membership.filter(e=>e.track==='A')){
      const r=reviews.get(member.id);
      if(!ctx.scope(r || {type:'review',employeeId:member.id,snapshot:member}))continue;
      const status=r?.status || 'Missing appraisal';
      const deadlines={'Goal setting':cycle.goalDue,'Manager goal approval':cycle.goalDue,'PM quality review':cycle.qaDue,
        'HOD baseline approval':cycle.baselineDue,'Self-review':cycle.selfDue,'Manager assessment':cycle.managerDue,
        'Calibration':cycle.calibrationDue,'Enterprise moderation':cycle.calibrationDue,'Finalisation':cycle.closeDue};
      const due=deadlines[status];
      const manager=ctx.s.users.find(u=>u.id===(r?.actingReviewer || member.managerId));
      const closed=status==='Closed',exception=status==='Approved exception';
      rows.push({cycle:cycle.title,company:member.company,department:member.department,manager:manager?.name || 'Unassigned',
        staff_id:member.staffId,employee:member.name,status,baseline:!!r?.baseline,midpoint:!!r?.checkIns.some(c=>c.kind==='Mid-quarter checkpoint'),
        self_review:r?.selfReview?'Submitted':r?.selfBypass?'Expired':'Pending',supervisor_scored:r?.supervisorScore!=null,
        calibrated:r?.calibratedScore!=null,released:!!r?.releasedAt,conversation:!!r?.conversation,acknowledged:!!r?.ack,
        completed:closed,resolved:closed||exception,approved_exception:exception,due:due || '',
        overdue:!!due&&due<isoDay(ctx.at),diagnostic:!r?'Missing appraisal':!manager||manager.active===false?'Missing or inactive reviewer':
          r.selfBypass&&!r.selfReview?'Self-review expired':r.goalFeedback&&!r.baseline?'KPI corrections requested':''});
    }
  }
  return rows;
}

export function outcomeTrends(ctx) {
  const months=new Map();
  function bucket(date){
    const month=date.slice(0,7);
    if(!months.has(month))months.set(month,{month,appeals:0,cases:0,pips:0,confirmations:0,commercialBelowTarget:0,approvedMeritNGN:0});
    return months.get(month);
  }
  for(const r of ctx.s.records){
    if(!ctx.scope(r))continue;
    if(r.type==='appeal')bucket(r.createdAt).appeals++;
    if(r.type==='capability'){
      bucket(r.createdAt).cases++;
      if(r.plan && r.hodActivation)bucket(r.plan.start).pips++;
    }
    if(r.type==='probation')for(const d of r.decisions || [])bucket(d.effective).confirmations++;
    if(r.type==='commercial' && ['Released','Acknowledged'].includes(r.status) && r.result.attainment<r.minimum)bucket(r.month).commercialBelowTarget++;
    if(r.type==='merit' && r.authorisation && ['Export ready','Exported','Reconciled'].includes(r.status))bucket(r.authorisation.effective).approvedMeritNGN+=(r.costKobo || 0)/100;
  }
  return [...months.values()].sort((a,b)=>b.month.localeCompare(a.month));
}
