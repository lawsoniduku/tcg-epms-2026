// @ts-check
import {action,field,isRole,need,num,pick} from './model.mjs';
import {competencyBank} from './feedback.mjs';
export const defaultWeights={bsc:70,feedback:30};
/** @param {any} cycle */
export function questionsFor(cycle){
 return cycle.questions??competencyBank(true).map(([id,label])=>({id,prompt:cycle.policy.labels?.[id]||label,audience:id==='leadership'?'People managers':'Everyone'}));
}
const draft=(ctx,r)=>isRole(ctx.actor,'pm')&&r.status==='Draft'&&r.scoringVersion==='4.2';
const prompt=()=>field('prompt','360 question');
const audience=()=>pick('audience','Applies to',['Everyone','People managers']);
const choose=r=>pick('question','Question',questionsFor(r).map(q=>({value:q.id,label:q.prompt})));
/** @param {any} cycle @param {any[]} questions */
function save(cycle,questions){
 need(questions.filter(q=>q.audience==='Everyone').length>=(cycle.policy.minimumObserved||1),'Keep enough questions for the policy minimum observed answers.');
 need(new Set(questions.map(q=>q.prompt.trim().toLowerCase())).size===questions.length,'This question already exists.');
 cycle.questions=questions;return cycle;
}
export const designActions=[
 action('cycle.weights','Configure appraisal weights',draft,(ctx,r)=>[
 num('bsc','Balanced Scorecard (%)',0,100,{integer:true,default:(r.componentWeights??defaultWeights).bsc}),
 num('feedback','360 feedback (%)',0,100,{integer:true,default:(r.componentWeights??defaultWeights).feedback,hint:'The two percentages must total 100. Every validated observer has equal weight within 360.'})
 ],(ctx,r,v)=>{need(v.bsc+v.feedback===100,'Component weights must total 100%.');r.componentWeights=v;return r;}),
 action('cycle.addQuestion','Add 360 question',draft,()=>[prompt(),audience()],(ctx,r,v)=>save(r,[...questionsFor(r),{id:'q_'+crypto.randomUUID(),...v}])),
 action('cycle.editQuestion','Edit 360 question',draft,(ctx,r)=>[choose(r),prompt(),audience()],(ctx,r,v)=>save(r,questionsFor(r).map(q=>q.id===v.question?{...q,prompt:v.prompt,audience:v.audience}:q))),
 action('cycle.removeQuestion','Remove 360 question',draft,(ctx,r)=>[choose(r)],(ctx,r,v)=>save(r,questionsFor(r).filter(q=>q.id!==v.question)))
];
