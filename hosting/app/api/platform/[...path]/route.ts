import {loadWorkspace,receipt,commitWorkspace} from '../../../../lib/workspace-store';
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
   const saved=await loadWorkspace(db,owner,sampleState),state=saved.state;
   if(path==='info'&&!post)return reply({mode:'sandbox',users:state.users.map(({id,name,role}:any)=>({id,name,role}))});
   const cookie=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pms_acceptance='))?.slice(15);
   const token=cookie?await hash(cookie):'';
   if(post&&!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Send JSON.'},415);
   let raw='',input:any={};
   if(post){
     const reader=request.body?.getReader(),decoder=new TextDecoder();
     let size=0;
     if(reader)try{
       while(true){
         const {done,value}=await reader.read();if(done)break;
         size+=value.byteLength;
         if(size>500000){await reader.cancel();return reply({error:'Request too large.'},413);}
         raw+=decoder.decode(value,{stream:true});
       }
       raw+=decoder.decode();
     }finally{reader.releaseLock();}
     try{input=JSON.parse(raw);}catch{return reply({error:'Invalid JSON.'},400);}
     if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Send a JSON object.'},400);
   }
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
   if(path==='export'&&!post)return new Response(exportData(state,actor,url.searchParams.get('report'),url.searchParams.get('id'),Object.fromEntries(url.searchParams)),{headers:{'Content-Type':'text/csv','Cache-Control':'no-store','Content-Disposition':'attachment; filename="performance-export.csv"'}});
   if(path==='logout'&&post){await db.prepare('DELETE FROM acceptance_sessions WHERE owner=? AND token=?').bind(owner,token).run();return reply({ok:true},200,{'Set-Cookie':'pms_acceptance=; Max-Age=0; Path=/; Secure; HttpOnly'});}
   if(path==='command'&&post){
     if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId))return reply({error:'Invalid request ID.'},422);
     const key=actor.id+':'+input.requestId,fingerprint=await hash(raw);
     for(let attempt=0;attempt<3;attempt++){
       const snapshot=attempt===0?saved:await loadWorkspace(db,owner,sampleState);
       const prior=snapshot.legacy?.[key]??await receipt(db,owner,key);
       if(prior)return prior.fingerprint===fingerprint?reply(prior.result):reply({error:'Request ID already used.'},409);
       const result=execute(snapshot.state,actor,input);
       if(await commitWorkspace(db,owner,snapshot,key,{fingerprint,result}))return reply(result);
     }
     return reply({error:'Workspace changed. Refresh and try again.'},409);
   }
   return reply({error:'Route unavailable.'},404);
 }catch(e:any){return reply({error:e.status?e.message:'The request could not be completed.'},e.status??500);}
}
export const GET=route,POST=route;
