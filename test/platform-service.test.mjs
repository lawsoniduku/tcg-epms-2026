import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {openPlatform} from '../server/platform-db.mjs';
import {platformHttp} from '../server/platform-http.mjs';
import {execute,view} from '../public/workspace/engine.mjs';
const pwd='Acceptance-password-0001';
async function fixture(t,{demo=false,opts={}}={}){
 const dir=mkdtempSync(join(tmpdir(),'pms-install-')),key=randomBytes(32),file=join(dir,'deploy.sqlite');const store=openPlatform(file,{key,demo});
 if(!demo)store.account({id:'first',name:'Initial administrator',role:'admin',email:'admin@example.invalid',department:'IT'},{password:pwd});
 const server=platformHttp(store,{demo,...opts});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(path,b,session={})=>fetch(base+'/api/platform/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(session.cookie?{cookie:session.cookie,'x-csrf-token':session.csrf}:{} )},body:JSON.stringify(b)});
 const login=async(b)=>{const r=await post('login',b);assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};};
 t.after(async()=>{await new Promise(ok=>server.close(ok));store.close();rmSync(dir,{recursive:true,force:true});});
 return {dir,key,file,store,base,post,login};
}
test('empty installation provisions real accounts and roster via authenticated HTTP, with durable encrypted backup/restore',async t=>{
 const f=await fixture(t);const info=await (await fetch(f.base+'/api/platform/info')).json();assert.equal(info.mode,'live');assert.equal(info.users.length,0);
 const admin=await f.login({email:'admin@example.invalid',password:pwd});
 const add=async(role,email)=>{const response=await f.post('accounts',{name:role,role,department:'Operations',email,password:pwd},admin);assert.equal(response.status,201);return (await response.json()).id;};
 const mgr=await add('manager','manager@example.invalid');await add('pm','pm@example.invalid');
 const temporary=await f.login({email:'pm@example.invalid',password:pwd});assert.equal((await f.post('password',{current:pwd,password:pwd+'-changed'},temporary)).status,200);const pm=await f.login({email:'pm@example.invalid',password:pwd+'-changed'});const command={requestId:randomUUID(),type:'employee',action:'employee.new',values:{staffId:'LIVE-A',name:'Test install person',email:'person@example.invalid',company:'TCG',department:'Operations',jobTitle:'Analyst',managerId:mgr,confirmed:'Yes',commercial:'No',peopleManager:'No',joinedAt:'2026-01-02'}};
 const saved=await f.post('command',command,pm);assert.equal(saved.status,200);const result=await saved.json();
 const replay=await f.post('command',command,pm);assert.deepEqual(await replay.json(),result);
 assert.equal((await f.post('command',{...command,values:{...command.values,name:'Changed'}},pm)).status,422);
 const state=await (await fetch(f.base+'/api/platform/view',{headers:{cookie:pm.cookie}})).json();assert.equal(state.rows.employee.length,1);
 assert.equal((await f.post('accounts',{disable:'first'},pm)).status,403);
 const bad=await f.post('command',{...command,requestId:randomUUID()},{...pm,csrf:'forged'});assert.equal(bad.status,403);
 const backup=join(f.dir,'restored.sqlite');f.store.db.prepare('VACUUM INTO ?').run(backup);
 assert.equal(readFileSync(backup).includes(Buffer.from('Test install person')),false);
 copyFileSync(f.file+'.feedback.key',backup+'.feedback.key');const restored=openPlatform(backup,{key:f.key});try{assert.equal(restored.load().records[0].title,'Test install person');assert.equal(restored.load().events.length,1);}finally{restored.close();}
 assert.throws(()=>f.store.db.exec('DELETE FROM snapshots'),/Immutable/);
});
test('stale edits, out-of-scope actions and protected 360 identities are denied through the service',async t=>{
 const f=await fixture(t,{demo:true});const pm=await f.login({userId:'pm'}),employee=await f.login({userId:'employee'});const s=f.store.load(),r=s.records.find(x=>x.type==='review'&&x.status==='Goal setting');
 const cmd={requestId:randomUUID(),id:r.id,type:'review',version:999,action:'review.submitGoals',values:{}};
 assert.equal((await f.post('command',cmd,employee)).status,409);
 assert.equal((await f.post('command',{...cmd,requestId:randomUUID(),action:'review.lock'},employee)).status,403);
 const unauth=await fetch(f.base+'/api/platform/view');assert.equal(unauth.status,401);
 assert.equal((await fetch(f.base+'/api/platform/export?report=scores',{headers:{cookie:employee.cookie}})).status,403);
 assert.equal((await fetch(f.base+'/api/platform/export?report=scores',{headers:{cookie:pm.cookie}})).status,200);
 assert.equal((await f.post('logout',{},employee)).status,200);assert.equal((await fetch(f.base+'/api/platform/view',{headers:{cookie:employee.cookie}})).status,401);
});
test('SSO accepts a signed scoped assertion once and rejects replay and an untrusted issuer',async t=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),f=await fixture(t,{opts:{ssoKey:keys.publicKey,ssoIssuer:'corporate-idp',ssoAudience:'tcg-pms'}});
 f.store.account({id:'sso-user',name:'SSO employee',role:'employee',email:'sso@example.invalid',department:'Operations'},{subject:'external-123'});
 const jwt=(issuer,jti)=>{const now=Math.floor(Date.now()/1000),unsigned=Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:issuer,aud:'tcg-pms',sub:'external-123',iat:now,exp:now+60,jti})).toString('base64url');return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),keys.privateKey).toString('base64url');};
 const assertion=jwt('corporate-idp',randomUUID());assert.equal((await f.post('sso',{assertion})).status,200);
 assert.equal((await f.post('sso',{assertion})).status,401);assert.equal((await f.post('sso',{assertion:jwt('other-idp',randomUUID())})).status,401);
});
test('cross-company actor cannot read, import or mutate another company’s employee',async t=>{
 const f=await fixture(t,{demo:true});const s=f.store.load(),actor={id:'scoped',name:'PM',role:'pm',company:'Other company',active:true};const e=s.records.find(r=>r.type==='employee');
 assert.throws(()=>view(s,actor,{id:e.id}),/scope/);
 assert.throws(()=>execute(s,actor,{type:'employee',action:'employee.new',values:{staffId:e.staffId,name:'Attempt',company:'Other company',department:'Operations',email:e.email,jobTitle:e.jobTitle,managerId:'manager',confirmed:'Yes',commercial:'No',peopleManager:'No',joinedAt:e.joinedAt}}),/scope/);
});

test('evidence uploads remain encrypted and quarantined until a scanner attests to the same digest',async t=>{
 const f=await fixture(t,{demo:true,opts:{scanToken:'test-scanner-secret'}}),pm=await f.login({userId:'pm'}),employee=await f.login({userId:'employee'});
 const review=f.store.load().records.find(r=>r.type==='review'&&r.status==='Goal setting');const bytes=Buffer.from('Synthetic test evidence.');
 const put=await f.post('files',{entity:review.id,name:'evidence.txt',base64:bytes.toString('base64'),visibility:'Internal'},pm);assert.equal(put.status,201);const file=await put.json();
 const read=who=>fetch(f.base+'/api/platform/files?download='+file.id,{headers:{cookie:who.cookie}});
 assert.equal((await read(pm)).status,403);assert.equal((await read(employee)).status,404);
 const token={authorization:'Bearer test-scanner-secret'};const queue=await (await fetch(f.base+'/api/integration/scanner/queue',{headers:token})).json();assert.equal(queue.files[0].id,file.id);
 const scan=await fetch(f.base+'/api/integration/scanner/receipt',{method:'POST',headers:{...token,'content-type':'application/json'},body:JSON.stringify({id:file.id,sha256:queue.files[0].sha256,result:'Clean',reference:'SCANNER-TEST'})});assert.equal(scan.status,200);assert.equal(await (await read(pm)).text(),bytes.toString());
 assert.equal((await read(employee)).status,404);
});
test('multi-role accounts switch only between granted roles and keep one actor identity',async t=>{
 const f=await fixture(t);f.store.account({id:'dual',name:'Dual role',email:'dual@example.invalid',role:'manager',additionalRoles:['hod'],department:'Operations'},{password:pwd});
 const session=await f.login({email:'dual@example.invalid',password:pwd});assert.equal((await f.post('role',{role:'executive'},session)).status,403);
 const switchRole=await f.post('role',{role:'hod'},session);assert.equal(switchRole.status,200);const cookie=switchRole.headers.get('set-cookie').split(';')[0];
 const v=await (await fetch(f.base+'/api/platform/view',{headers:{cookie}})).json();assert.equal(v.actor.role,'hod');assert.equal(v.actor.id,'dual');
});

test('delegated administrators only see and manage accounts and links in their company',async t=>{
 const f=await fixture(t);
 for(const company of ['A','B'])f.store.account({id:company,name:company,email:company+'@example.invalid',company,role:'admin'},{password:pwd});
 const a=await f.login({email:'A@example.invalid',password:pwd});
 const response=await fetch(f.base+'/api/platform/accounts',{headers:{cookie:a.cookie}});
 assert.deepEqual((await response.json()).users.map(u=>u.id),['A']);
 assert.equal((await f.post('accounts',{disable:'B'},a)).status,403);
 f.store.change(s=>s.records.push({id:'staffB',type:'employee',company:'B',title:'Example B',active:true,version:1}));
 assert.equal((await f.post('accounts',{name:'New user',email:'new@example.invalid',role:'employee',company:'A',employeeId:'staffB',password:pwd},a)).status,422);
});
test('archived employees lose existing sessions and cannot sign in again',async t=>{
 const f=await fixture(t,{demo:true}),pm=await f.login({userId:'pm'}),employee=await f.login({userId:'employee'});
 const id=f.store.profiles().find(u=>u.id==='employee').employeeId,record=f.store.entity(id);
 const result=await f.post('command',{type:'employee',id,action:'employee.archive',version:record.version,values:{reason:'Test leaver'},requestId:randomUUID()},pm);
 assert.equal(result.status,200);
 assert.equal((await fetch(f.base+'/api/platform/view',{headers:{cookie:employee.cookie}})).status,401);
 assert.equal((await f.post('login',{userId:'employee'})).status,401);
});
test('outbox claims are exclusive and require the active delivery receipt',async t=>{
 const f=await fixture(t,{demo:true,opts:{noticeToken:'consumer'}});
 const url=f.base+'/api/integration/outbox',headers={authorization:'Bearer consumer','content-type':'application/json'};
 const get=async()=>(await (await fetch(url,{headers})).json()).messages;
 const first=await get();assert.ok(first.length);assert.equal((await get()).length,0);
 const m=first[0],ack=leaseId=>fetch(url+'/ack',{method:'POST',headers,body:JSON.stringify({id:m.id,leaseId,delivered:true})});
 assert.equal((await ack('expired')).status,409);assert.ok((await ack(m.leaseId)).ok);
 assert.ok((await ack(m.leaseId)).ok);
});
test('file uploads replay safely and confidential attachments follow purpose-bound access',async t=>{
 const f=await fixture(t,{demo:true}),observer=await f.login({userId:'observer1'}),pm=await f.login({userId:'pm'});
 f.store.change(s=>s.records.push({id:'response-file',type:'response',status:'Invited',version:1,rater:'observer1',feedbackAdmins:['pm'],employeeId:s.users.find(u=>u.id==='employee').employeeId}));
 const payload={requestId:randomUUID(),entity:'response-file',name:'fictional.txt',base64:Buffer.from('test').toString('base64'),visibility:'Internal'};
 const first=await f.post('files',payload,observer);assert.equal(first.status,201);const file=await first.json();
 assert.equal((await (await f.post('files',payload,observer)).json()).id,file.id);
 const list=async()=>(await (await fetch(f.base+'/api/platform/files?entity=response-file',{headers:{cookie:pm.cookie}})).json()).files;
 assert.equal((await list()).length,0);
 f.store.change(s=>{const r=s.records.find(r=>r.id==='response-file');r.version++;r.status='Submitted';r.inspection={actor:'pm',at:new Date().toISOString(),reason:'Scoped test'};});
 assert.equal((await list()).length,1);
 const policy=f.store.readState().records.find(r=>r.type==='policy');
 assert.equal((await f.post('files',{...payload,entity:policy.id},observer)).status,403);
});

test('disabled local login and gateway-protected roles cannot establish password sessions',async t=>{
 for(const opts of [{localLogin:'off'},{ssoKey:'configured'}]){
  const f=await fixture(t,{opts});
  assert.equal((await f.post('login',{email:'admin@example.invalid',password:pwd})).status,401);
 }
});
test('integration rotation accepts both active tokens, audits use and enforces source-IP restrictions',async t=>{
 const f=await fixture(t,{opts:{noticeToken:'old-token,new-token'}});
 for(const token of ['old-token','new-token']){
  assert.equal((await fetch(f.base+'/api/integration/outbox',{headers:{authorization:'Bearer '+token}})).status,200);
 }
 assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM access_log WHERE operation='integration.notification.accept'").get().n,2);
 const other=await fixture(t,{opts:{noticeToken:'new-token',integrationIps:'192.0.2.1'}});
 assert.equal((await fetch(other.base+'/api/integration/outbox',{headers:{authorization:'Bearer new-token'}})).status,403);
});
test('session idle limit and forced first-password change are enforced server-side',async t=>{
 const f=await fixture(t);
 const admin=await f.login({email:'admin@example.invalid',password:pwd});
 await f.post('accounts',{name:'Fixture',role:'employee',department:'Ops',email:'new@example.invalid',password:pwd},admin);
 const auth=await f.login({email:'new@example.invalid',password:pwd});
 assert.equal(auth.changeRequired,true);
 const view=()=>fetch(f.base+'/api/platform/view',{headers:{cookie:auth.cookie}});
 assert.equal((await view()).status,403);
 assert.equal((await f.post('password',{current:pwd,password:pwd+'x'},auth)).status,200);
 const fresh=await f.login({email:'new@example.invalid',password:pwd+'x'});
 f.store.db.prepare('UPDATE sessions SET last_seen=0').run();
 assert.equal((await fetch(f.base+'/api/platform/view',{headers:{cookie:fresh.cookie}})).status,401);
});
test('confidential response versions survive data-key rotation independently of general snapshots',async t=>{
 const f=await fixture(t,{demo:true});
 f.store.change(s=>s.records.push({id:'privacy-fixture',version:1,type:'response',rater:'fictional-observer',answers:{example:'restricted fixture'}}));
 const row=f.store.db.prepare('SELECT payload FROM entities WHERE id=?').get('privacy-fixture');
 assert.equal(f.store.open(row.payload).rater,undefined);
 const ciphertext=()=>f.store.db.prepare('SELECT payload FROM feedback_private WHERE entity=?').get('privacy-fixture').payload;
 const before=ciphertext();f.store.rotateFeedbackKey();
 assert.notEqual(ciphertext(),before);
 assert.equal(f.store.entity('privacy-fixture').answers.example,'restricted fixture');
 const manager=await f.login({userId:'manager'});
 const lookup=async id=>{const res=await fetch(f.base+'/api/platform/raw-response/'+id,{headers:{cookie:manager.cookie}});return [res.status,await res.text()];};
 const denial=await lookup('privacy-fixture');assert.equal(denial[0],404);assert.deepEqual(denial,await lookup('absent-fixture'));
});
test('backup CLI creates an owner-only database even under a permissive umask',async t=>{
 const {spawnSync}=await import('node:child_process'),{statSync}=await import('node:fs');
 const f=await fixture(t);
 const path=join(f.dir,'backup.sqlite');
 const result=spawnSync(process.execPath,['server/platform.mjs','--backup'],{env:{...process.env,EPMS_DB_PATH:f.file,EPMS_BACKUP_PATH:path,EPMS_DATA_KEY:f.key.toString('base64')}});
 assert.equal(result.status,0,result.stderr.toString());assert.equal(statSync(path).mode&0o777,0o600);
});
test('roster preview reports bad rows without committing other rows',async t=>{
 const f=await fixture(t,{demo:true}),admin=await f.login({userId:'admin'});
 const csv='staffId,name,email,company,department,jobTitle,managerId,confirmed,commercial,peopleManager,joinedAt\nFA,Example A,example-a@example.invalid,TCG,Operations,Analyst,manager,Yes,No,No,2025-01-01\nFB,Example B,bad,TCG,Operations,Analyst,manager,Yes,No,No,2025-01-01';
 const count=f.store.load().records.length;
 const preview=await f.post('import-preview',{type:'employee',action:'employee.import',values:{csv}},admin);
 assert.equal(preview.status,200);const result=await preview.json();
 assert.deepEqual(result.rows.map(r=>r.valid),[true,false]);assert.equal(result.valid,false);assert.equal(f.store.load().records.length,count);
});
test('login limits are keyed by transport peer across different account names',async t=>{
 const f=await fixture(t),{digest}=await import('../server/platform-db.mjs');
 f.store.db.prepare('INSERT INTO auth_limits VALUES(?,90,?)').run(digest('ip:127.0.0.1'),Date.now()+60000);
 for(const email of ['a@example.invalid','admin@example.invalid']){
  assert.equal((await f.post('login',{email,password:pwd})).status,429);
 }
});
test('integration roster cannot reassign the manager of a privileged account',async t=>{
 const f=await fixture(t,{demo:true,opts:{rosterToken:'roster-fixture'}});
 const employee=f.store.load().records.find(r=>r.type==='employee'&&r.staffId==='T001');
 f.store.account({id:'dual-priv',role:'employee',additionalRoles:['finance'],name:'Fixture Finance',email:'priv@example.invalid',employeeId:employee.id});
 f.store.account({id:'second-manager',role:'manager',name:'Fixture Manager',email:'second@example.invalid'});
 const csv='staffId,name,email,company,department,jobTitle,managerId,confirmed,commercial,peopleManager,joinedAt\n'+[employee.staffId,employee.title,employee.email,employee.company,employee.department,employee.jobTitle,'second-manager','Yes','No','No',employee.joinedAt].join(',');
 const response=await fetch(f.base+'/api/integration/roster',{method:'POST',headers:{authorization:'Bearer roster-fixture','Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),csv})});
 assert.equal(response.status,422);assert.equal(f.store.entity(employee.id).managerId,employee.managerId);
});
