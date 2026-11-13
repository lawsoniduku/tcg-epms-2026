// @ts-check
import {action,create,field,isRole,list,note,num,need} from './model.mjs';
import {rosterAt} from './roster.mjs';
import {trackAt} from './governance.mjs';
export const reviewTracks=action('setupCheck.review','Confirm roster and track review',ctx=>isRole(ctx.actor,'pm','admin'),()=>[
 num('year','Review year',2000,2200,{integer:true}),field('authority','Roster review reference'),note('findings','Review findings')
],(ctx,r,v)=>{
 const employees=list(ctx.s,'employee').filter(ctx.scope);
 need(employees.length,'Import the roster before reviewing tracks.');
 return create(ctx,'setupCheck','Track review · '+v.year,'Reviewed',{...v,rosterVersions:Object.fromEntries(employees.map(e=>[e.id,e.version]))});
});
/** @param {any} ctx @param {number} year */
export function setupChecklist(ctx,year){
 const visible=type=>list(ctx.s,type).filter(ctx.scope);
 const schedules=visible('cadence').filter(c=>c.year===year);
 const active=schedules.findLast(c=>c.status==='Active');
 const cycles=visible('cycle').filter(c=>c.start.startsWith(year+'-')&&c.status!=='Cancelled'&&(!active||c.cadenceId===active.id)).sort((a,b)=>a.start.localeCompare(b.start));
 const cycle=cycles.find(c=>c.status==='Draft')??cycles.at(-1);
 const at=cycle?.start??year+'-01-01';
 const staff=visible('employee').map(e=>rosterAt(e,at)).filter(e=>e.active&&e.joinedAt<=at);
 const managers=staff.filter(e=>!ctx.s.users.some(u=>u.active!==false&&u.id===e.managerId&&[u.role,...u.additionalRoles??[]].includes('manager'))).length;
 const missingTracks=staff.filter(e=>!['A','B','C'].includes(trackAt(ctx.s,e,at))).length;
 const policy=visible('policy').find(p=>p.status==='Published'&&p.effective<=at&&(!cycle||p.id===cycle.policyId));
 const objectives=visible('strategy').some(o=>o.status==='Approved'&&o.level==='Individual');
 const eligible=staff.filter(e=>trackAt(ctx.s,e,at)==='A').length;
 const linked=!!active&&cycles.length===active.periods.length&&cycles.every(c=>c.behaviourMode==='Full 360'&&c.feedbackDue&&c.policyId===active.policyId);
 const steps=[];let blocked='';
 /** @param {string} title @param {string} owner @param {string} target @param {boolean} done @param {string} reason @param {boolean} optional @param {string} id */
 function step(title,owner,target,done,reason,optional=false,id=''){
  steps.push({title,owner,target,id,status:done?'Done':blocked||target==='setupCheck'&&(managers||missingTracks)?'Blocked':'Not started',reason:done?'':blocked||reason,optional});
  if(!optional&&!done&&!blocked)blocked=reason;
 }
 step('Import the roster','Administration','employee',staff.length>0,'Import the roster for '+year+'.');
 step('Approve the policy version','Executive sponsor','policy',!!policy,'No approved policy effective for '+at+'.');
 step('Approve strategy objectives','Head of function','strategy',objectives,'Approve an individual objective in the strategy cascade.');
 step('Approve KPI templates','PM or head of function','template',visible('template').some(t=>t.status==='Approved'),'Templates are optional. Continue if employees will supply their own KPIs.',true);
 step('Review track assignments','Performance Management or administration','setupCheck',visible('setupCheck').some(r=>r.year===year&&staff.every(e=>r.rosterVersions?.[e.id]===e.version))&&staff.length>0&&!managers&&!missingTracks,managers||missingTracks?'Resolve missing managers and track assignments.':'Review the cycle roster and record track sign-off.'); 
 step('Preview and activate the formal schedule','Performance Management','cadence',!!active,'Preview the year and activate its approved schedule.',false,active?.id??schedules.at(-1)?.id);
 step('Confirm 360 campaign linkage','Performance Management','cycle',linked,'Activate a schedule with a full 360 for each formal review.',false,cycle?.id);
 const ready=!blocked;
 step('Open the review cycle','Performance Management','cycle',!!cycle&&cycle.status!=='Draft','Open the selected period after checking the blockers.',false,cycle?.id);
 return {year,eligible,managers,missingTracks,steps,ready,cycleId:cycle?.id,cycleTitle:cycle?.title,blockers:steps.filter(s=>!s.optional&&s.status!=='Done').slice(0,-1).map(s=>s.title)};
}
