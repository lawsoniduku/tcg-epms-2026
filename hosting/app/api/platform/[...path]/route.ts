import {env} from 'cloudflare:workers';
import {sampleState} from '../../../../../public/workspace/sample.mjs';
import {execute, exportData, view} from '../../../../../public/workspace/engine.mjs';

export const dynamic='force-dynamic';
const reply=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function route(request:Request){
 const owner=request.headers.get('oai-authenticated-user-id');
 if(!owner)return reply({error:'Sign in to this private acceptance workspace.'},401);
 const db=env.DB;if(!db)return reply({error:'The acceptance database is unavailable.'},503);
 const path=new URL(request.url).pathname.split('/').at(-1),post=request.method==='POST';
 if(post&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Cross-origin request denied.'},403);
 try{
   let row=await db.prepare('SELECT version,payload FROM workspaces WHERE owner=?').bind(owner).first<{version:number,payload:string}>();
   if(!row){
     const payload=JSON.stringify({state:sampleState(),requests:{}});
     await db.prepare('INSERT OR IGNORE INTO workspaces(owner,version,payload) VALUES(?,0,?)').bind(owner,payload).run();
     row=await db.prepare('SELECT version,payload FROM workspaces WHERE owner=?').bind(owner).first<{version:number,payload:string}>();
   }
   if(!row)throw Error('Workspace unavailable');
   const saved=JSON.parse(row.payload),state=saved.state;
   if(path==='info'&&!post)return reply({mode:'sandbox',users:state.users.map(({id,name,role}:any)=>({id,name,role}))});
   const cookie=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pms_acceptance='))?.slice(15);
   const token=cookie?await hash(cookie):'';
   if(post&&!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Send JSON.'},415);
   const raw=post?await request.text():'';if(raw.length>500000)return reply({error:'Request too large.'},413);
   let input;try{input=post?JSON.parse(raw):{};}catch{return reply({error:'Invalid JSON.'},400);}
   if(path==='login'&&post){
     const user=state.users.find((u:any)=>u.id===input.userId);if(!user)return reply({error:'Unknown acceptance role.'},401);
     const session=crypto.randomUUID()+crypto.randomUUID(),csrf=crypto.randomUUID();
     await db.batch([db.prepare('DELETE FROM acceptance_sessions WHERE expires<? OR (owner=? AND token=?)').bind(Date.now(),owner,token),db.prepare('INSERT INTO acceptance_sessions(token,owner,actor,csrf,expires) VALUES(?,?,?,?,?)').bind(await hash(session),owner,user.id,csrf,Date.now()+28800000)]);
     return reply({csrf},200,{'Set-Cookie':'pms_acceptance='+session+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800'});
   }
   const session=await db.prepare('SELECT actor,csrf FROM acceptance_sessions WHERE owner=? AND token=? AND expires>?').bind(owner,token,Date.now()).first<{actor:string,csrf:string}>();
   if(!session)return reply({error:'Choose an acceptance role.'},401);
   if(post&&request.headers.get('x-csrf-token')!==session.csrf)return reply({error:'Invalid session request token.'},403);
   const actor=state.users.find((u:any)=>u.id===session.actor);
   const url=new URL(request.url);
   if(path==='view'&&!post)return reply({...view(state,actor,{id:url.searchParams.get('id')}),csrf:session.csrf});
   if(path==='export'&&!post)return new Response(exportData(state,actor,url.searchParams.get('report'),url.searchParams.get('id')),{headers:{'Content-Type':'text/csv','Cache-Control':'no-store','Content-Disposition':'attachment; filename="performance-export.csv"'}});
   if(path==='logout'&&post){await db.prepare('DELETE FROM acceptance_sessions WHERE owner=? AND token=?').bind(owner,token).run();return reply({ok:true},200,{'Set-Cookie':'pms_acceptance=; Max-Age=0; Path=/; Secure; HttpOnly'});}
   if(path==='command'&&post){
     if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId))return reply({error:'Invalid request ID.'},422);
     const key=actor.id+':'+input.requestId,fingerprint=await hash(raw),prior=saved.requests[key];
     if(prior)return prior.fingerprint===fingerprint?reply(prior.result):reply({error:'Request ID already used.'},409);
     const result=execute(state,actor,input);saved.requests[key]={fingerprint,result};
     const update=await db.prepare('UPDATE workspaces SET version=version+1,payload=? WHERE owner=? AND version=?').bind(JSON.stringify(saved),owner,row.version).run();
     return update.meta.changes===1?reply(result):reply({error:'Workspace changed. Refresh and try again.'},409);
   }
   return reply({error:'Route unavailable.'},404);
 }catch(e:any){return reply({error:e.status?e.message:'The request could not be completed.'},e.status??500);}
}
export const GET=route,POST=route;
