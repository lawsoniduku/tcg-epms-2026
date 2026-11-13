import {previewGoals} from '../public/workspace/goal-import.mjs';
import {workbook,templateData} from './import-files.mjs';
import {initialiseEvidence,listEvidence,uploadEvidence,downloadEvidence,scanQueue,scanReceipt} from './evidence.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {randomBytes,randomUUID,timingSafeEqual,verify} from 'node:crypto';
import {digest,matches,passwordHash} from './platform-db.mjs';
import {execute,view,exportData,processDeadlines} from '../public/workspace/engine.mjs';
import {need,requireThat,roles,isoDay} from '../public/workspace/model.mjs';

import {rosterAt} from '../public/workspace/roster.mjs';
const root=resolve(new URL('../public/',import.meta.url).pathname);
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const equals=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function body(req,max=512000){
  requireThat(req.headers['content-type']?.split(';')[0]==='application/json','Send JSON.',415);
  const parts=[];let length=0;for await(const part of req){length+=part.length;requireThat(length<=max,'Request exceeds the permitted size.',413);parts.push(part);}
  let value;try{value=JSON.parse(Buffer.concat(parts));}catch{requireThat(false,'Invalid JSON.',400);}
  need(value&&typeof value==='object'&&!Array.isArray(value),'Send a JSON object.');return value;
}
function assertSSO(token,opts){
  requireThat(opts.ssoKey&&opts.ssoIssuer&&opts.ssoAudience,'SSO is unavailable.',403);
  const [head,payload,sig,...extra]=String(token).split('.');requireThat(!extra.length&&sig,'Invalid SSO assertion.',401);
  const header=JSON.parse(Buffer.from(head,'base64url')),claims=JSON.parse(Buffer.from(payload,'base64url')),now=Date.now()/1000;
  requireThat(header.alg==='RS256'&&verify('RSA-SHA256',Buffer.from(head+'.'+payload),opts.ssoKey,Buffer.from(sig,'base64url')),'Invalid assertion signature.',401);
  requireThat(claims.iss===opts.ssoIssuer&&claims.aud===opts.ssoAudience&&claims.exp>=now&&claims.exp<=now+300&&claims.iat<=now+30&&claims.iat>=now-300&&(!claims.nbf||claims.nbf<=now)&&typeof claims.sub==='string'&&typeof claims.jti==='string','Invalid assertion claims.',401);
  return claims;
}
export function platformHttp(store,opts={}){
  const {db}=store;initialiseEvidence(db);
  const clients=new Map(),dummyHash=passwordHash(randomBytes(32).toString('hex'));
  const idleMs=30*60000;
  const privileged=profile=>[profile.role,...profile.additionalRoles??[]].some(role=>['admin','pm','finance','auditor'].includes(role));
  let pendingHashes=0;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(data));};
    try{
      const url=new URL(req.url,'http://localhost'),path=url.pathname,post=req.method==='POST';
      if(!path.startsWith('/api/')){
        requireThat(['GET','HEAD'].includes(req.method),'Method unavailable.',405);
        const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));requireThat(file.startsWith(root+'/')&&types[extname(file)],'Page unavailable.',404);
        let bytes;try{bytes=await readFile(file);}catch{requireThat(false,'Page unavailable.',404);}
        res.writeHead(200,{'Content-Type':types[extname(file)]+'; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:bytes);
      }
      if(post&&req.headers.origin){requireThat(opts.origin?req.headers.origin===opts.origin:new URL(req.headers.origin).host===req.headers.host,'Cross-origin request denied.',403);}
      if(path==='/api/health')return send(200,{ok:true,schema:2});
      if(path==='/api/platform/info')return send(200,{mode:opts.demo?'sandbox':'live',ssoUrl:opts.ssoUrl??null,localLogin:opts.localLogin!=='off',evidence:true,users:opts.demo?store.profiles().map(({id,name,role})=>({id,name,role})):[]});
      const cookie=(req.headers.cookie??'').split(';').map(c=>c.trim()).find(c=>c.startsWith('pms_session='))?.slice(12);
      const session=cookie?db.prepare('SELECT * FROM sessions WHERE token=? AND expires>? AND last_seen>?').get(digest(cookie),Date.now(),Date.now()-idleMs):null;
      const ip=req.socket.remoteAddress??'unknown';
      const getAccount=id=>db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
      const activeProfile=profile=>{
        if(!profile?.active)return false;
        if(!profile.employeeId)return true;
        const employee=store.entity(profile.employeeId);
        return !!employee&&rosterAt(employee,isoDay(new Date().toISOString())).active!==false;
      };
      const newSession=actor=>{
        requireThat(activeProfile(actor),'Account is inactive.',401);if(session)db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);
        const valid=store.session(actor.id,actor.role);store.audit(actor.id,'sign-in');return send(200,{csrf:valid.csrf,changeRequired:!!actor.changeRequired},{'Set-Cookie':'pms_session='+valid.token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(opts.secure?'; Secure':'')});
      };
      if(post&&['/api/platform/login','/api/platform/sso'].includes(path)){
        const b=await body(req),bucket=digest(path+'|'+String(b.email??b.userId??digest(String(b.assertion??''))).trim().toLowerCase()),now=Date.now();
        const ipBucket=digest('ip:'+ip);
        const ipCount=db.prepare('SELECT * FROM auth_limits WHERE bucket=?').get(ipBucket);
        requireThat(!ipCount||ipCount.expires<=now||ipCount.count<90,'Try signing in again in a minute.',429);
        db.prepare('INSERT OR REPLACE INTO auth_limits VALUES(?,?,?)').run(ipBucket,ipCount?.expires>now?ipCount.count+1:1,ipCount?.expires>now?ipCount.expires:now+60000);
        const count=db.prepare('SELECT * FROM auth_limits WHERE bucket=?').get(bucket);requireThat(!count||count.expires<=now||count.count<40,'Try signing in again in a minute.',429);
        db.prepare('DELETE FROM auth_limits WHERE expires<=?').run(now);
        db.prepare('INSERT OR REPLACE INTO auth_limits VALUES(?,?,?)').run(bucket,count&&count.expires>now?count.count+1:1,count&&count.expires>now?count.expires:now+60000);
        if(path.endsWith('/sso')){
          const claims=assertSSO(b.assertion,opts);const user=db.prepare('SELECT * FROM accounts WHERE subject=?').get(claims.sub);requireThat(user,'Account has not been provisioned.',403);
          const replay=digest('sso:'+claims.jti);requireThat(!db.prepare('SELECT 1 FROM auth_limits WHERE bucket=? AND expires>?').get(replay,now),'Assertion already used.',401);db.prepare('INSERT OR REPLACE INTO auth_limits VALUES(?,1,?)').run(replay,claims.exp*1000);
          db.prepare('DELETE FROM auth_limits WHERE bucket=?').run(bucket);
          return newSession(store.open(user.profile));
        }
        const user=opts.demo?getAccount(String(b.userId)):db.prepare('SELECT * FROM accounts WHERE email=?').get(String(b.email??'').trim());
        if(!opts.demo){
          requireThat(opts.localLogin!=='off','Use company sign-in.',401);
          const count=clients.get(ip)??0;
          requireThat(count<3,'Sign-in is busy. Try again shortly.',429);
          requireThat(pendingHashes<12,'Sign-in is busy. Try again shortly.',429);
          pendingHashes++;clients.set(ip,count+1);
          try{
            const valid=await matches(b.password,user?.password??dummyHash);
            requireThat(valid&&user?.password&&!(opts.ssoKey&&privileged(store.open(user.profile))),'Sign-in details were not accepted.',401);
          }
          finally{pendingHashes--;const left=clients.get(ip)-1;if(left)clients.set(ip,left);else clients.delete(ip);}
          requireThat(getAccount(user.id)?.password===user.password,'Credentials changed. Sign in again.',401);
        }
        db.prepare('DELETE FROM auth_limits WHERE bucket=?').run(bucket);
          requireThat(user,'Sign-in details were not accepted.',401);return newSession(store.open(getAccount(user.id).profile));
      }
      if(path.startsWith('/api/integration/')){
        const token=/^Bearer (.+)$/.exec(req.headers.authorization??'')?.[1];
        function authenticateIntegration(service,configured){
          const active=String(configured??'').split(',').map(t=>t.trim()).filter(Boolean);
          const valid=active.reduce((matched,item)=>equals(token,item)||matched,false);
          const ips=String(opts.integrationIps??'').split(',').map(v=>v.trim()).filter(Boolean);
          const allowed=!ips.length||ips.includes(ip.replace(/^::ffff:/,''));
          store.audit('integration-'+service,'integration.'+service+'.'+(valid&&allowed?'accept':'deny'),path);
          requireThat(valid,'Invalid integration credential.',401);
          requireThat(allowed,'Integration source unavailable.',403);
        }
        if(path.startsWith('/api/integration/scanner/')){
          authenticateIntegration('scanner',opts.scanToken);
          if(req.method==='GET'&&path.endsWith('/queue'))return send(200,{files:scanQueue(store)});
          if(post&&path.endsWith('/receipt'))return send(200,scanReceipt(store,await body(req)));
          requireThat(false,'Scanner route unavailable.',404);
        }
        if(post&&path==='/api/integration/roster'){
          authenticateIntegration('roster',opts.rosterToken);
          const b=await body(req),actor={id:'integration-hris',name:'HRIS integration',role:'pm',active:true};
          return send(200,store.command(actor.id,b.requestId,b,s=>execute(s,actor,{type:'employee',action:'employee.import',values:{csv:b.csv}})));
        }
        authenticateIntegration('notification',opts.noticeToken);
        if(req.method==='GET'&&path.endsWith('/outbox')){
          const now=Date.now();
          const messages=store.change(s=>{
            const due=s.outbox.filter(m=>m.status!=='delivered'&&m.status!=='failed'&&(m.retryAfter??0)<=now)
              .sort((a,b)=>(a.retryAfter??0)-(b.retryAfter??0)).slice(0,100);
            for(const m of due){m.leaseId=randomUUID();m.retryAfter=now+120000;}
            return due;
          });
          return send(200,{messages});
        }
        if(post&&path.endsWith('/outbox/ack')){const b=await body(req);store.change(s=>{const m=s.outbox.find(m=>m.id===b.id);need(m,'Unknown message.');if(m.status!=='delivered'){
            requireThat(m.leaseId&&b.leaseId===m.leaseId,'Delivery lease changed.',409);
            m.attempts++;m.status=b.delivered===true?'delivered':m.attempts>=10?'failed':'pending';
            m.retryAfter=Date.now()+Math.min(3600000,1000*2**m.attempts);delete m.leaseId;
          }});return send(200,{ok:true});}
        requireThat(false,'Integration route unavailable.',404);
      }
      requireThat(session,'Sign in to continue.',401);
      const account=getAccount(session.actor);requireThat(account,'Account unavailable.',401);const profile=store.open(account.profile);
      if(profile.changeRequired)requireThat(['/api/platform/password','/api/platform/logout'].includes(path),'Change the provisioned password to continue.',403);
      db.prepare('UPDATE sessions SET last_seen=? WHERE token=?').run(Date.now(),session.token);
      const grantedRoles=[...new Set([profile.role,...(profile.additionalRoles??[])])];
      const actor={...profile,role:session.active_role??profile.role,grantedRoles};
      requireThat(grantedRoles.includes(actor.role),'Role access was revoked.',403);
      requireThat(activeProfile(actor),'Account inactive.',401);
      const scoped=target=>!actor.company||target.company===actor.company;
      async function authorisedBody(max){
        const input=await body(req,max);
        const current=db.prepare('SELECT actor FROM sessions WHERE token=? AND expires>?').get(session.token,Date.now());
        const user=getAccount(actor.id),profile=user&&store.open(user.profile);
        requireThat(current?.actor===actor.id&&activeProfile(profile),'Sign in again.',401);
        requireThat([profile.role,...profile.additionalRoles??[]].includes(actor.role),'Role access was revoked.',403);
        return input;
      }
      if(post)requireThat(equals(req.headers['x-csrf-token'],session.csrf),'Invalid session request token.',403);
      if(path==='/api/platform/kpi-template'&&req.method==='GET'){
        const s=store.readState(),id=url.searchParams.get('id'),detail=view(s,actor,{id}).detail;
        requireThat(detail?.actions.some(a=>a.id==='review.importGoals'),'Draft unavailable.',403);
        const data=templateData(s,actor,s.records.find(r=>r.id===id)),xlsx=url.searchParams.get('format')==='xlsx';
        const bytes=xlsx?Buffer.from(await workbook({op:'build',...data}),'base64'):[data.headers,data.example].map(r=>r.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(',')).join('\r\n');
        res.writeHead(200,{'Content-Type':xlsx?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv','Content-Disposition':'attachment; filename="KPI-template.'+(xlsx?'xlsx':'csv')+'"'});return res.end(bytes);
      }
      if(post&&path==='/api/platform/import-preview'){
        const b=await authorisedBody(2100000);
        const allowed=['review.importGoals','employee.import','commercial.import','batch.preview','migration.new'];
        requireThat(allowed.includes(b.action),'Unknown import.',400);
        let text=b.values.csv;
        if(b.workbook){requireThat(b.action==='review.importGoals','Upload a CSV for this operation.',422);text=await workbook({op:'parse',bytes:b.workbook});}
        need(typeof text==='string'&&text.length<=350000,'Import is too large.');
        const s=store.readState();
        if(b.action==='review.importGoals'){
          const {drafts,...preview}=previewGoals(s,actor,b.id,text);return send(200,{...preview,csv:text});
        }
        const copy=structuredClone(s),result=execute(copy,actor,{...b,values:{...b.values,csv:text}});
        const record=copy.records.find(r=>r.id===result.id);
        const rows=record.rows?.map((row,i)=>({row:i+2,employee:row.employee??row.staffId,title:row.rawStatus,valid:row.valid??!row.errors?.length,error:row.error??row.errors?.join(', ')}))??Array.from({length:record.count},(_,i)=>({row:i+2,valid:true}));
        return send(200,{rows,groups:[],valid:true,csv:text});
      }
      if(path==='/api/platform/files'){
        if(post)return send(201,uploadEvidence(store,actor,await authorisedBody(2900000)));
        if(req.method==='GET'&&url.searchParams.has('download')){
          const file=downloadEvidence(store,actor,url.searchParams.get('download'));
          res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+file.name+'"'});return res.end(file.bytes);
        }
        if(req.method==='GET')return send(200,{files:listEvidence(store,actor,url.searchParams.get('entity'))});
      }
      if(post&&path==='/api/platform/role'){const b=await authorisedBody();requireThat(grantedRoles.includes(b.role),'Role unavailable.',403);return newSession({...profile,role:b.role});}
      if(req.method==='GET'&&path==='/api/platform/view'){const result=view(store.readState(),actor,{id:url.searchParams.get('id'),setupYear:Number(url.searchParams.get('year'))});store.audit(actor.id,'view',url.searchParams.get('id')??'overview');return send(200,{...result,csrf:session.csrf});}
      if(post&&path==='/api/platform/command'){const b=await authorisedBody();return send(200,store.command(actor.id,b.requestId,b,s=>execute(s,actor,b)));}
      if(req.method==='GET'&&path==='/api/platform/export'){const report=url.searchParams.get('report');const out=exportData(store.readState(),actor,report,url.searchParams.get('id'),Object.fromEntries(url.searchParams));store.audit(actor.id,'export.'+report);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="performance-export.csv"'});return res.end(out);}
      if(post&&path==='/api/platform/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);return send(200,{ok:true},{'Set-Cookie':'pms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
      if(path==='/api/platform/accounts'){
        requireThat(actor.role==='admin'&&!opts.demo,'Account administration requires a live administrator.',403);
        if(req.method==='GET')return send(200,{users:store.profiles().filter(scoped),employees:store.readState().records.filter(r=>r.type==='employee'&&scoped(r)).map(({id,title})=>({id,title})),roles});
        if(post){
          const b=await authorisedBody();if(b.disable){need(b.disable!==actor.id,'Use another administrator to deactivate this account.');const row=getAccount(b.disable);need(row,'Unknown account.');const profile=store.open(row.profile);requireThat(scoped(profile),'Account outside your company scope.',403);profile.active=false;store.invalidate();store.transaction(()=>{db.prepare('UPDATE accounts SET profile=? WHERE id=?').run(store.seal(profile),profile.id);db.prepare('DELETE FROM sessions WHERE actor=?').run(profile.id);store.audit(actor.id,'account.disable',profile.id);});return send(200,{ok:true});}
          if(b.employeeId){need(store.load().records.some(e=>e.type==='employee'&&e.id===b.employeeId&&scoped(e)&&(!b.company||e.company===b.company)&&e.active!==false),'Select an existing employee.');need(!store.profiles().some(u=>u.employeeId===b.employeeId&&u.active),'This employee already has an account.');}
          need(b.password||b.subject,'Supply a local password or an SSO subject.');
          const additionalRoles=b.additionalRoles??[];need(Array.isArray(additionalRoles)&&additionalRoles.every(role=>Object.hasOwn(roles,role)),'Invalid additional role.');
          need(!actor.company||actor.company===b.company,'Provision users inside your company scope.');
          const id=randomUUID();store.account({id,name:b.name,role:b.role,additionalRoles,email:b.email,department:b.department,company:b.company||'',employeeId:b.employeeId||null,changeRequired:!!b.password},{password:b.password,subject:b.subject||null});store.audit(actor.id,'account.create',id);return send(201,{id});
        }
      }
      if(post&&path==='/api/platform/password'){const b=await authorisedBody();requireThat(await matches(b.current,account.password),'Current password is incorrect.',403);requireThat(db.prepare('SELECT 1 FROM sessions WHERE token=? AND expires>?').get(session.token,Date.now()),'Sign in again.',401);need(b.current!==b.password,'Choose a different password.');const hash=passwordHash(b.password);store.transaction(()=>{db.prepare('UPDATE accounts SET password=?,profile=? WHERE id=? AND password=?').run(hash,store.seal({...store.open(getAccount(actor.id).profile),changeRequired:false}),actor.id,account.password);store.invalidate();store.audit(actor.id,'password.change');db.prepare('DELETE FROM sessions WHERE actor=?').run(actor.id);});return send(200,{ok:true});}
      requireThat(false,'Route unavailable.',404);
    }catch(error){
      const conflict=error.code==='ERR_SQLITE_ERROR'&&String(error.message).includes('UNIQUE constraint');
      if(!error.status&&!conflict)console.error('PMS request failed:',error.name);
      send(error.status??(conflict?409:500),{error:error.status?error.message:conflict?'A record with that identifier already exists.':'The request could not be completed.'});
    }
  });
  return server;
}

