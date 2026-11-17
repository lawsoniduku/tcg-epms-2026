import {action,create,field,get,isRole,list,need,num,own,choices,pick} from './model.mjs';

export const createMapping=action('mapping.new','Define commercial rating conversion',ctx=>isRole(ctx.actor,'finance','sales'),()=>[
  field('title','Conversion schedule'),field('effective','Effective from','date'),field('authority','Commercial schedule reference'),
  ...[2,3,4,5].map(b=>num('lower'+b,'Minimum commercial score for common rating '+b,1.01,5))
],(ctx,r,v)=>{
  need([3,4,5].every(i=>v['lower'+i]>v['lower'+(i-1)]),'Conversion thresholds must increase.');
  return create(ctx,'mapping',v.title,'Approval',v);
});
export const mappingActions=[action('mapping.publish','Publish rating conversion',
  (ctx,r)=>isRole(ctx.actor,'executive') && r.status==='Approval' && r.createdBy!==ctx.actor.id,
  ()=>[field('reference','Signed approval reference')],(ctx,r,v)=>Object.assign(r,{status:'Published',reference:v.reference,approvedBy:ctx.actor.id}))];
export function mappingField(ctx,key) {
  return pick(key,'Approved commercial rating conversion',choices(list(ctx.s,'mapping').filter(r=>r.status==='Published')),{optional:true});
}
export function mappedRating(s,id,monthly) {
  const schedule=list(s,'mapping').find(x=>x.id===id);
  need(schedule?.status==='Published' && schedule.effective<=monthly.month,'Select a published conversion effective for every commercial month.');
  if(schedule.company && monthly.snapshot?.company)need(schedule.company===monthly.snapshot.company,'Conversion belongs to a different company.');
  let rating=1;
  for(const band of [2,3,4,5])if(monthly.result.score>=schedule['lower'+band])rating=band;
  return rating;
}
