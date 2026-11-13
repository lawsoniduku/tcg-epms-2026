// @ts-check
import {action,create,csv,get,journal,list,manages,need,note,readFields,requireThat,scope} from './model.mjs';
import {addGoal,goalFields,goalsEditable,qa} from './quarterly.mjs';
export const goalHeaders=['title','objective','perspective','weight','target','unit','outcome','baseline','direction','thresholds','source','evidence','leadership','gateCap','gate'];
/** @param {any} s @param {any} actor @param {string} id @param {string} text */
export function previewGoals(s,actor,id,text){
 const ctx={s,actor},first=get(s,id,'review');
 requireThat(scope(s,actor,first)&&goalsEditable(ctx,first),'Draft unavailable.',403);
 const entries=csv(text);need(entries.length<=2000,'Select a file with at most 2,000 KPI rows.');
 const drafts=new Map(),versions={},rows=[],groups=[];
 const fields=goalFields(ctx).map(f=>f.key==='objective'?{...f,choices:f.choices.filter(c=>scope(s,actor,get(s,c.value)))}:f);
 for(const [index,line] of entries.entries()){
  const {staffId,...values}=line;
  try{
   const review=!staffId||staffId===first.snapshot.staffId?first:list(s,'review').find(r=>r.snapshot.staffId===staffId&&r.cycleId===first.cycleId&&manages(s,actor,r)&&scope(s,actor,r));
   need(review&&goalsEditable(ctx,review),'No editable scorecard in your scope.');
   if(!drafts.has(review.id)){drafts.set(review.id,{...review,goals:structuredClone(review.goals)});versions[review.id]=review.version;}
   addGoal(drafts.get(review.id),readFields(fields,values));
   rows.push({row:index+2,employee:review.snapshot.name||review.snapshot.staffId,title:line.title,valid:true});
  }catch(e){rows.push({row:index+2,employee:staffId||first.snapshot.staffId,title:line.title,valid:false,error:e.message});}
 }
 for(const draft of drafts.values()){
  const totals=Object.fromEntries(['Financial','Customer','Process','Learning'].map(p=>[p,draft.goals.filter(g=>g.perspective===p).reduce((n,g)=>n+Math.round(g.weight*100),0)/100]));
  let error='';try{qa(draft,get(s,draft.cycleId).policy);}catch(e){error=e.message;}
  groups.push({id:draft.id,employee:draft.snapshot.name||draft.snapshot.staffId,totals,total:Object.values(totals).reduce((a,b)=>a+b,0),error});
 }
 return {rows,groups,versions,valid:rows.every(r=>r.valid)&&groups.every(g=>!g.error),drafts};
}
export const importGoals=action('review.importGoals','Upload scorecard KPIs',goalsEditable,()=>[
 note('csv','KPI file',{limit:350000}),note('versions','Preview versions',{limit:50000})
],(ctx,first,v)=>{
 const preview=previewGoals(ctx.s,ctx.actor,first.id,v.csv);
 need(preview.valid,'Correct all row and policy errors before applying.');
 requireThat(JSON.stringify(preview.versions)===v.versions,'A previewed draft changed. Preview again.',409);
 const batch=create(ctx,'goalBatch','KPI import · '+first.title,'Applied',{count:preview.rows.length,employeeId:first.employeeId,company:first.snapshot.company,appliedBy:ctx.actor.id});
 for(const draft of preview.drafts.values()){
  const review=get(ctx.s,draft.id);review.goals=draft.goals;
  if(review.id!==first.id)journal(ctx,review,'review.importGoals',{batch:batch.id});
 }
 journal(ctx,batch,'goalBatch.apply');return first;
});
