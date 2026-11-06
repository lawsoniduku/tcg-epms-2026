import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
async function fixture(t){const store=openStore(':memory:');const server=createApp(store,{demo:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(r=>server.close(r));store.close();});return{store,base,async login(userId){const r=await fetch(base+'/api/demo/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId})});return{cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};}};}
const post=(base,path,session,body,extra={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',cookie:session.cookie,'x-csrf-token':session.csrf,...extra},body:JSON.stringify(body)});
test('production startup is refused without an identity adapter',()=>{const store=openStore(':memory:');try{assert.throws(()=>createApp(store),/Production/);}finally{store.close();}});
test('HTTP finalisation persists through API and reconciled CSV; UI assets served',async t=>{
  const {base,login}=await fixture(t);const session=await login('u-pm');
  const r=await post(base,'/api/appraisals/APP-E001/finalise',session,{expectedVersion:1});assert.equal(r.status,200);
  const b=await fetch(base+'/api/bootstrap',{headers:{cookie:session.cookie}});const state=await b.json();assert.equal(state.appraisals.find(a=>a.id==='APP-E001').revisions[0].finalScore,4.2);
  const csv=await fetch(base+'/api/reports/final-scores.csv',{headers:{cookie:session.cookie}});assert.equal(csv.status,200);assert.match(await csv.text(),/E001/);
  for(const path of ['/','/app.mjs','/style.css','/shared/domain.mjs'])assert.equal((await fetch(base+path)).status,200);
});
test('API enforces authentication, CSRF, cross-origin and record scope',async t=>{
  const {base,login}=await fixture(t);
  assert.equal((await fetch(base+'/api/bootstrap')).status,401);
  const session=await login('u-manager');
  assert.equal((await post(base,'/api/appraisals/APP-E001/finalise',session,{expectedVersion:1})).status,403);
  assert.equal((await post(base,'/api/appraisals/APP-E003/check-in',session,{expectedVersion:1,note:'x'})).status,403);
  assert.equal((await post(base,'/api/appraisals/APP-E001/check-in',session,{expectedVersion:1,note:'x'},{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await post(base,'/api/appraisals/APP-E001/check-in',session,{expectedVersion:1,note:'x'},{origin:'https://untrusted.invalid'})).status,403);
});
test('API rejects tampered scores, disabled deductions, stale updates and malformed JSON',async t=>{
  const {base,login}=await fixture(t);const session=await login('u-pm');const path='/api/appraisals/APP-E001/finalise';
  assert.equal((await post(base,path,session,{expectedVersion:1,finalScore:5})).status,422);
  assert.equal((await post(base,path,session,{expectedVersion:1,deductionPoints:.2,reason:'Test'})).status,422);
  assert.equal((await post(base,path,session,{expectedVersion:99})).status,409);
  const r=await fetch(base+path,{method:'POST',headers:{cookie:session.cookie,'x-csrf-token':session.csrf,'content-type':'application/json'},body:'invalid'});assert.equal(r.status,400);
});
test('logout invalidates session and session cookie is HttpOnly/SameSite',async t=>{
  const {base,login}=await fixture(t);const session=await login('u-pm');assert.equal((await post(base,'/api/logout',session,{})).status,200);assert.equal((await fetch(base+'/api/bootstrap',{headers:{cookie:session.cookie}})).status,401);
  const r=await fetch(base+'/api/demo/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'u-pm'})});assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
});
