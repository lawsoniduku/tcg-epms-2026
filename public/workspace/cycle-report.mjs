// @ts-check
import {isRole,list,requireThat,scope} from './model.mjs';
import {defaultWeights} from './review-design.mjs';
/** Authorized cycle workbook. Each sheet contains literal cell values only.
 * @param {any} s @param {any} actor @param {string} id */
export function cycleReport(s,actor,id){
 requireThat(isRole(actor,'pm','auditor','executive'),'Score reporting authority is required.',403);
 const cycle=list(s,'cycle').find(c=>c.id===id&&scope(s,actor,c));
 requireThat(cycle,'Cycle unavailable.',404);
 const reviews=new Map(list(s,'review').filter(r=>r.cycleId===id&&scope(s,actor,r)).map(r=>[r.employeeId,r]));
 const names=new Map(s.users.map(u=>[u.id,u.name]));
 const weights=cycle.componentWeights??defaultWeights;
 const results=[['Staff ID','Employee','Company','Department','Manager','Stage','BSC (%)','360 (%)','BSC score','360 score','Supervisor composite','Calibrated score','Deduction','Current final','Rating','Released']];
 const kpis=[['Staff ID','Employee','KPI','Perspective','Weight (%)','Target','Unit','Actual','Rating']];
 const history=[['Staff ID','Employee','Revision','Supervisor','Calibrated','Deduction','Final','Rating','Reason','Recorded by','Recorded at']];
 let closed=0;
 for(const member of cycle.membership.filter(e=>e.track==='A')){
  const r=reviews.get(member.id);
  if(!scope(s,actor,r??{type:'review',snapshot:member,employeeId:member.id}))continue;
  const current=['Locked','Released','Conversation recorded','Acknowledged','Closed'].includes(r?.status)?r.revisions.at(-1):null;
  const mix=r?.componentWeights??weights;
  const who=[member.staffId,member.name];
  results.push([...who,member.company,member.department,names.get(r?.actingReviewer??member.managerId),r?.status??'Missing appraisal',mix.bsc,mix.feedback,r?.assessment?.bsc,r?.assessment?.behaviour?.score,r?.supervisorScore,r?.calibratedScore,current?.deductionPoints,current?.finalScore,current?.finalRating,r?.releasedAt??'']);
  if(r?.status==='Closed')closed++;
  for(const g of r?.goals??[]){
   const actual=r.assessment?.items?.find(i=>i.goalId===g.id);
   kpis.push([...who,g.title,g.perspective,actual?.weight??g.weight,actual?.target??g.target,g.unit,actual?.actual,actual?.rating]);
  }
  for(const v of r?.revisions??[])history.push([...who,v.revision,v.supervisor,v.calibrated,v.deductionPoints,v.finalScore,v.finalRating,v.reason,names.get(v.by),v.at]);
 }
 return [['Cycle summary',[['Field','Value'],['Cycle',cycle.title],['Start',cycle.start],['End',cycle.end],['Stage',cycle.status],['BSC (%)',weights.bsc],['360 (%)',weights.feedback],['Eligible Track A employees',results.length-1],['Closed appraisals',closed],['Exported at (UTC)',new Date().toISOString()]]],['Appraisals',results],['KPI detail',kpis],['Score revisions',history]];
}
