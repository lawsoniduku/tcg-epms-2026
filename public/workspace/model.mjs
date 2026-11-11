import { DomainError, requireThat, ratingFor, scoreValue, trackAScore } from '../shared/domain.mjs';
export { DomainError, requireThat, ratingFor, scoreValue, trackAScore };

export const roles = {
  admin:'System administrator', pm:'Performance Management', employee:'Employee', manager:'Line manager',
  hod:'Head of function', executive:'Executive sponsor', finance:'Finance approver', sales:'Commercial data owner',
  er:'Employee Relations', talent:'Talent lead', auditor:'Auditor'
};
export const sections = {
  employee:'Employees', policy:'Policy versions', strategy:'Strategy', cycle:'Review cycles',
  review:'Formal appraisals', response:'360 feedback', commercial:'Commercial reviews',
  probation:'Confirmation', appeal:'Appeals', capability:'Capability and conduct', merit:'Merit reviews',
  talent:'Talent reviews', exception:'Exceptions', batch:'CSV deductions'
};
export const perspectives = ['Financial','Customer','Process','Learning'];
export const field = (key,label,type='text',options={}) => ({key,label,type,...options});
export const pick = (key,label,choices,options={}) => field(key,label,'select',{choices,...options});
export const num = (key,label,min,max,options={}) => field(key,label,'number',{min,max,...options});
export const note = (key,label,options={}) => field(key,label,'textarea',options);
export const yes = (key,label,options={}) => pick(key,label,['No','Yes'],options);
export const ref = (key,label) => field(key,label);
export const option = (value,label) => ({value,label});
export const isRole = (actor,...allowed) => allowed.includes(actor.role);
export const signed = actor => actor?.id && actor.active !== false;
export const isoDay = at => new Date(new Date(at).valueOf()+3600000).toISOString().slice(0,10);
export const titleCase = value => String(value).replaceAll('_',' ');
export const round = n => Math.round((n+Number.EPSILON)*100)/100;
export const average = values => round(values.reduce((a,b)=>a+b,0)/values.length);
export const need = (value,message) => requireThat(value,message);
export function dateValue(value) {
  need(/^\d{4}-\d{2}-\d{2}$/.test(value),'Enter a valid calendar date.');
  const d=new Date(value+'T12:00:00Z');
  need(!Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===value,'Enter a valid calendar date.');
  return d;
}
export function addWorkdays(value,count,holidays=[]) {
  const day=dateValue(value);
  const step=Math.sign(count);
  for(let left=Math.abs(count);left>0;) {
    day.setUTCDate(day.getUTCDate()+step);
    if(![0,6].includes(day.getUTCDay())&&!holidays.includes(day.toISOString().slice(0,10))) left--;
  }
  return day.toISOString().slice(0,10);
}
export function addMonths(date,count) {
  const d=dateValue(date), original=d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+count+1); d.setUTCDate(0);
  d.setUTCDate(Math.min(original,d.getUTCDate()));
  return d.toISOString().slice(0,10);
}
export function readFields(fields,input) {
  need(input && typeof input==='object'&&!Array.isArray(input),'The form data is invalid.');
  need(Object.keys(input).every(k=>fields.some(f=>f.key===k)),'An unsupported field was submitted.');
  const values={};
  for(const f of fields) {
    let value=input[f.key]??f.default??'';
    need(['string','number'].includes(typeof value),'Invalid value for '+f.label+'.');
    value=String(value).trim();
    if(!value){need(f.optional,f.label+' is required.');values[f.key]='';continue;}
    need(value.length<=(f.limit??(f.type==='textarea'?8000:500)),f.label+' is too long.');
    if(f.type==='select') need(f.choices.some(c=>String(c.value??c)===value),'Choose an available '+f.label.toLowerCase()+'.');
    if(f.type==='number'){
      need(/^-?(?:\d+\.?\d*|\.\d+)$/.test(value),'Enter a number for '+f.label+'.');
      value=Number(value);need(Number.isFinite(value)&&value>=f.min&&value<=f.max,f.label+' is outside its allowed range.');
      if(f.integer)need(Number.isSafeInteger(value),f.label+' must be a whole number.');
    }
    if(f.type==='date')dateValue(value);
    values[f.key]=value;
  }
  return values;
}
export function csv(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell.trim());cell='';}
    else if(c==='\n'&&!quoted){row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  need(!quoted,'CSV contains an unclosed quote.');
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  need(rows.length>1,'Include a header and at least one row.');
  const header=rows.shift().map(x=>x.replace(/^\uFEFF/,''));
  need(new Set(header).size===header.length,'CSV has duplicate column names.');
  return rows.map((r,i)=>{need(r.length===header.length,'CSV column mismatch at row '+(i+2));return Object.fromEntries(header.map((k,j)=>[k,r[j]]));});
}
export function emptyState() {return {schema:2,revision:0,records:[],users:[],events:[],outbox:[]};}
export const list = (s,type) => s.records.filter(r=>r.type===type);
export function get(s,id,type) {
  const r=s.records.find(r=>r.id===id && (!type||r.type===type));need(r,'The referenced record is unavailable.');return r;
}
export function create(ctx,type,title,status,data={}) {
  const record={id:crypto.randomUUID(),type,title,status,version:0,createdAt:ctx.at,createdBy:ctx.actor.id,company:ctx.actor.company||undefined,...data};
  ctx.s.records.push(record);return record;
}
export const person = (s,r) => r?.type==='employee'?r:s.records.find(e=>e.type==='employee'&&e.id===r?.employeeId);
export const own = (u,r) => !!u.employeeId && u.employeeId===(r?.employeeId??r?.id);
export function manages(s,u,r) {const e=r?.snapshot??person(s,r);return !!e&&u.role==='manager'&&(r?.actingReviewer??e.managerId)===u.id&&!own(u,r);}
export function heads(s,u,r) {const e=r?.snapshot??person(s,r);return !!e&&u.role==='hod'&&u.department===e.department&&!own(u,r);}
export function scope(s,u,r) {
  const company=r.company??r.snapshot?.company??person(s,r)?.company;
  if(company&&u.company&&company!==u.company)return false;
  if(r.type==='template')return isRole(u,'pm','executive','auditor')||r.department===u.department&&(r.status==='Approved'||u.role==='hod');
  if(r.type==='mapping')return isRole(u,'pm','sales','finance','executive','talent','hod','auditor');
  if(r.type==='payBasis')return isRole(u,'finance');
  if(r.type==='meritException')return isRole(u,'pm','finance','executive');
  if(r.type==='cutover')return isRole(u,'admin','pm','finance','er','executive','auditor');
  if(r.type==='sourceBatch')return isRole(u,'sales','finance','pm','auditor');
  if(r.type==='migration')return isRole(u,'pm','admin','auditor');
  if(r.type==='scenario')return isRole(u,'finance','executive');
  if(r.type==='track')return isRole(u,'pm')||heads(s,u,r);
  if(r.type==='response')return !own(u,r)&&(r.rater===u.id||isRole(u,'pm')||(r.status==='Nomination'&&manages(s,u,s.records.find(review=>review.id===r.reviewId))));
  if(r.type==='merit')return isRole(u,'finance','executive') || u.role==='pm'&&r.status==='HR equity review';
  if(r.type==='batch')return isRole(u,'pm','auditor')||u.role==='admin'&&r.status==='Applied'&&!r.rows;
  if(r.type==='policy'||r.type==='strategy'||r.type==='cycle')return true;
  if(r.type==='appeal')return own(u,r)||isRole(u,'pm','er')||r.reviewer===u.id;
  if(r.type==='capability')return own(u,r)||manages(s,u,r)||heads(s,u,r)||isRole(u,'er','executive');
  if(r.type==='talent')return heads(s,u,r)||isRole(u,'talent','executive','pm');
  if(r.type==='commercial')return own(u,r)||manages(s,u,r)||heads(s,u,r)||isRole(u,'sales','finance','pm','executive','auditor');
  if(r.type==='employee'&&isRole(u,'admin','sales','finance','talent','er'))return true;
  return own(u,r)||manages(s,u,r)||heads(s,u,r)||isRole(u,'pm','executive','auditor')||(r.type==='probation'&&u.role==='er');
}
export const choices=(records,label=r=>r.title)=>records.map(r=>option(r.id,label(r)));
export const route = e => !e.confirmed?'C':e.commercial?'B':'A';
export function journal(ctx,r,action,details={}) {
  const entry={id:crypto.randomUUID(),record:r.id,type:r.type,action,actor:ctx.actor.id,actorName:ctx.actor.name,actorRole:ctx.actor.role,at:ctx.at,...details};
  ctx.s.events.push(entry);r.version++;r.updatedAt=ctx.at;
  return entry;
}
export function notify(ctx,r,recipient,message,due='') {
  if(!recipient)return;
  ctx.s.outbox.push({id:crypto.randomUUID(),record:r.id,recipient,message,due,at:ctx.at,status:'pending',attempts:0});
}
export const action=(id,label,allowed,fields,apply)=>({id,label,allowed,fields,apply});
export const noFields=()=>[];
export const anyRole=(...allowed)=>(ctx)=>isRole(ctx.actor,...allowed);
export function activePolicy(s) {
  const policy=list(s,'policy').filter(r=>r.status==='Published').at(-1);
  need(policy,'Publish an approved policy version first.');return policy;
}
export function nextStatus(r,status,ctx,recipient,message) {r.status=status;if(recipient)notify(ctx,r,recipient,message??status);}
export function evidenceScore(actual,kpi,stretch) {
  if(kpi.direction==='Binary outcome'){need(actual===0||actual===1,'Use 0 for fail or 1 for pass.');return kpi.anchors[actual];}
  if(kpi.direction==='Higher is better'){
    need(kpi.target>0,'A positive target is required.');
    const attainment=actual/kpi.target*100;
    return attainment>=120&&stretch?5:attainment>=105?4:attainment>=90?3:attainment>=70?2:1;
  }
  const anchors=kpi.anchors;
  const comparison=kpi.direction==='Lower is better'?(a,b)=>a<=b:(a,b)=>a>=b;
  return [4,3,2,1].reduce((rating,index)=>Math.max(rating,comparison(actual,anchors[index-1])?index+1:1),1);
}

