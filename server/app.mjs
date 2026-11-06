import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { DomainError, requireThat } from '../public/shared/domain.mjs';
import { bootstrap, mutateAppraisal, reconciliationRows, csvFromRows } from '../public/shared/workflow.mjs';
const publicRoot=resolve(new URL('../public',import.meta.url).pathname);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const hash=v=>createHash('sha256').update(v).digest('hex');
export function createApp(store,{demo=false}={}) {
  if(!demo) throw new Error('Production sign-in is not configured. Use --demo with synthetic data only.');
  const sessions=new Map();const loginAttempts=new Map();
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control','no-store');
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      const write=!['GET','HEAD'].includes(req.method);
      if(write) {
        const origin=req.headers.origin;
        if(origin)requireThat(new URL(origin).host===req.headers.host,'Cross-origin writes are not allowed.',403);
        requireThat(req.headers['content-type']?.split(';')[0]==='application/json','JSON requests are required.',415);
      }
      const readBody=async()=>{let raw='';for await(const chunk of req){raw+=chunk;requireThat(Buffer.byteLength(raw)<=32_768,'Request is too large.',413);}try{return JSON.parse(raw);}catch{throw new DomainError('Invalid JSON.',400);}};
      if(url.pathname==='/api/health')return json(200,{ok:true,mode:'synthetic-reference'});
      if(url.pathname==='/api/demo/users'&&req.method==='GET')return json(200,{users:store.all('users'),demo:true});
      if(url.pathname==='/api/demo/login'&&req.method==='POST') {
        const key=req.socket.remoteAddress;const previous=loginAttempts.get(key);const entry=previous&&previous.reset>Date.now()?previous:{count:0,reset:Date.now()+60_000};
        entry.count++;loginAttempts.set(key,entry);requireThat(entry.count<=60,'Too many sign-in attempts. Try again shortly.',429);
        const body=await readBody();const user=store.all('users').find(u=>u.id===body.userId);requireThat(user,'Unknown demonstration user.',401);
        const oldToken=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('epms_session='))?.slice(13);
        if(oldToken)sessions.delete(hash(oldToken));
        const token=randomBytes(32).toString('hex');const csrf=randomBytes(24).toString('hex');
        sessions.set(hash(token),{userId:user.id,csrf,expires:Date.now()+8*60*60*1000});
        res.setHeader('Set-Cookie',`epms_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        store.audit(user,'session','demo-login',null,{mode:'synthetic'});
        return json(200,{actor:user,csrf});
      }
      if(url.pathname.startsWith('/api/')) {
        const token=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('epms_session='))?.slice(13);
        const session=token?sessions.get(hash(token)):null;
        requireThat(session&&session.expires>Date.now(),'Sign in to continue.',401);
        const actor=store.all('users').find(u=>u.id===session.userId);requireThat(actor,'Account unavailable.',401);
        if(write){const supplied=String(req.headers['x-csrf-token']??'');requireThat(supplied.length===session.csrf.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(session.csrf)),'Invalid session request token.',403);}
        if(req.method==='GET'&&url.pathname==='/api/bootstrap')return json(200,{...bootstrap(store,actor),csrf:session.csrf});
        if(req.method==='POST'&&url.pathname==='/api/logout') {sessions.delete(hash(token));res.setHeader('Set-Cookie','epms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{ok:true});}
        if(req.method==='GET'&&url.pathname==='/api/reports/final-scores.csv') {const rows=reconciliationRows(store,actor);store.audit(actor,'reports','export-final-scores',null,{rows:rows.length});res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="final-score-register.csv"'});return res.end(csvFromRows(rows));}
        const match=/^\/api\/appraisals\/([^/]+)\/([a-z-]+)$/.exec(url.pathname);
        if(match&&req.method==='POST')return json(200,mutateAppraisal(store,actor,decodeURIComponent(match[1]),match[2],await readBody()));
        throw new DomainError('API route not found.',404);
      }
      requireThat(['GET','HEAD'].includes(req.method),'Method not allowed.',405);
      const path=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
      const file=resolve(publicRoot,'.'+path);requireThat(file.startsWith(publicRoot+'/'),'Not found.',404);
      requireThat(mime[extname(file)],'Not found.',404);
      try {const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]});res.end(req.method==='HEAD'?undefined:body);}catch{throw new DomainError('Not found.',404);}
    } catch(e) {json(e.status||500,{error:e.status?e.message:'An unexpected error occurred.'});}
  });
  return server;
}
