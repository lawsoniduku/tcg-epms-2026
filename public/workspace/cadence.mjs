import {action,choices,create,field,get,isoDay,isRole,journal,list,need,note,num,pick} from './model.mjs';
import {trackAt} from './governance.mjs';
import {rosterAt} from './roster.mjs';
import {createCycle} from './organisation.mjs';

function periods(year,frequency) {
  const months=frequency==='Biannual'?6:3;
  return Array.from({length:12/months},(_,i)=>({
    title:year+' '+(months===6?'H':'Q')+(i+1),
    start:new Date(Date.UTC(year,i*months,1,12)).toISOString().slice(0,10),
    end:new Date(Date.UTC(year,(i+1)*months,0,12)).toISOString().slice(0,10)
  }));
}

function affected(ctx,schedule){
  return list(ctx.s,'cycle').filter(c=>c.status!=='Cancelled' && (!ctx.actor.company || !c.company || c.company===ctx.actor.company) &&
    c.start.slice(0,4)===String(schedule.year));
}
export const newCadence=action('cadence.new','Preview formal review schedule',ctx=>isRole(ctx.actor,'pm'),ctx=>[
  num('year','Review year',2000,2200,{integer:true}),pick('frequency','Formal reviews',['Quarterly','Biannual'],{default:'Quarterly'}),
  pick('policyId','Approved policy',choices(list(ctx.s,'policy').filter(p=>p.status==='Published'))),
  note('reason','Reason and scope'),note('targetBasis','How period targets and observations are aggregated'),
  field('authority','Signed cadence and privacy authority reference')
],(ctx,r,v)=>{
  const plan=periods(v.year,v.frequency), prior=affected(ctx,v),policy=get(ctx.s,v.policyId);
  need(!ctx.s.liveCalendar||plan[0].start>isoDay(ctx.at),'Select a prospective review year.');
  need(policy.effective<=plan[0].start,'Policy must be effective by the first review.');
  need(prior.every(c=>c.status==='Draft'),'REVIEW_CYCLE_LOCKED: this year contains launched reviews.');
  const eligible=list(ctx.s,'employee').map(e=>rosterAt(e,plan[0].start)).filter(e=>ctx.scope(e)&&e.active&&trackAt(ctx.s,e,plan[0].start)==='A').length;
  return createSchedule(ctx,v,plan,prior,eligible,policy);
});
function createSchedule(ctx,v,plan,prior,eligible,policy){
  return create(ctx,'cadence',v.year+' · '+v.frequency,'Awaiting PM approval',{
    ...v,periods:plan,previous:prior.map(c=>({id:c.id,version:c.version})),
    preview:{formalPeriods:plan.length,estimatedEligible:eligible,estimatedCampaigns:eligible*plan.length,
      minimumAnonymousAssignments:eligible*plan.length*(policy.minimumAnonymous||3),replacedDrafts:prior.length,
      notifications:'Rater invitations follow validated assignments. Timetables follow the new periods.'}
  });
}
export const cadenceActions=[action('cadence.activate','Activate reviewed schedule',
  (ctx,r)=>isRole(ctx.actor,'pm') && r.status==='Awaiting PM approval',()=>[field('approval','PM lead approval reference')],(ctx,r,v)=>{
    const prior=affected(ctx,r);
    need(prior.length===r.previous.length && prior.every(c=>c.status==='Draft'&&r.previous.some(p=>p.id===c.id&&p.version===c.version)),'Schedule changed after preview. Generate a fresh preview.');
    need(!ctx.s.liveCalendar || r.periods[0].start>isoDay(ctx.at),'The effective period has started.');
    for(const c of prior){c.status='Cancelled';journal(ctx,c,'cycle.superseded',{cadence:r.id});}
    for(const period of r.periods){
      const c=createCycle.apply(ctx,null,{...period,policyId:r.policyId,behaviourMode:'Full 360',frequency:r.frequency,cadenceId:r.id});
      journal(ctx,c,'cycle.scheduled',{cadence:r.id});
    }
    Object.assign(r,{status:'Active',approval:v.approval,approvedBy:ctx.actor.id});return r;
  })];
