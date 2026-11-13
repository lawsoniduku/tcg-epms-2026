// @ts-check
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {goalHeaders} from '../public/workspace/goal-import.mjs';
import {requireThat} from '../public/shared/domain.mjs';
const script=fileURLToPath(new URL('./kpi-workbook.py',import.meta.url));
let running=0;
/** @param {Record<string,unknown>} request @returns {Promise<string>} */
export async function workbook(request){
 requireThat(running<3,'Spreadsheet processing is busy. Retry shortly.',429);running++;
 try{return await new Promise((resolve,reject)=>{
  const child=spawn('python3',['-I',script],{stdio:['pipe','pipe','ignore'],timeout:10000});
  let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{output+=part;if(output.length>3000000)child.kill();});
  child.on('error',()=>reject(Object.assign(Error('Spreadsheet service unavailable.'),{status:503})));
  child.stdin.on('error',()=>{});
  child.on('close',code=>{try{requireThat(code===0,'Use the supplied XLSX workbook. Check size, headers and cell values.',422);resolve(JSON.parse(output));}catch(e){reject(e);}});
  child.stdin.end(JSON.stringify(request));
 });}finally{running--;}
}
/** @param {any} state @param {any} actor @param {any} review */
export function templateData(state,actor,review){
 const objectives=state.records.filter(o=>o.type==='strategy'&&o.level==='Individual'&&o.status==='Approved'&&(!actor.company||!o.company||o.company===actor.company)).map(o=>[o.id,o.title]);
 const example=['Example service quality',objectives[0]?.[0]??'','Customer',20,95,'percent','Resolve cases on time',90,'Higher is better','','Service register','Monthly report','No',5,'',review.snapshot.staffId];
 return {headers:[...goalHeaders,'staffId'],example,objectives};
}
