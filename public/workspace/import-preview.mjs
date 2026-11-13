// @ts-check
import {csv,need,requireThat} from './model.mjs';
import {previewGoals} from './goal-import.mjs';
import {execute} from './engine.mjs';
/** @param {any} s @param {any} actor @param {any} b @param {string} text */
export function previewImport(s,actor,b,text){
 requireThat(['review.importGoals','employee.import','commercial.import','batch.preview','migration.new'].includes(b.action),'Unknown import.',400);
 need(typeof text==='string'&&text.length<=350000,'Import is too large.');
  if(b.action==='review.importGoals'){
    const {drafts,...preview}=previewGoals(s,actor,b.id,text);return {...preview,csv:text};
  }
  if(b.action==='employee.import'){
    requireThat(['pm','admin'].includes(actor.role),'Roster import unavailable.',403);
    const entries=csv(text);need(entries.length<=2000,'Import up to 2,000 employees at a time.');
    const copy=structuredClone(s),seen=new Set(),rows=[];
    for(const [index,line] of entries.entries()){
      try{
        need(!seen.has(line.staffId),'Duplicate staff ID in import.');seen.add(line.staffId);
        const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
        const csv=[Object.keys(line),Object.values(line)].map(r=>r.map(quote).join(',')).join('\n');
        execute(copy,actor,{type:'employee',action:'employee.import',values:{csv}});
        rows.push({row:index+2,employee:line.staffId,valid:true});
      }catch(error){rows.push({row:index+2,employee:line.staffId,valid:false,error:error.message});}
    }
    return {rows,groups:[],valid:rows.every(row=>row.valid),csv:text};
  }
  const copy=structuredClone(s),result=execute(copy,actor,{...b,values:{...b.values,csv:text}});
  const record=copy.records.find(r=>r.id===result.id);
  const rows=record.rows?.map((row,i)=>({row:i+2,employee:row.employee??row.staffId,title:row.rawStatus,valid:row.valid??!row.errors?.length,error:row.error??row.errors?.join(', ')}))??Array.from({length:record.count},(_,i)=>({row:i+2,valid:true}));
  return {rows,groups:[],valid:true,csv:text};
}
