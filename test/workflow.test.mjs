import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.mjs';
import {mutateAppraisal,bootstrap,reconciliationRows,csvFromRows} from '../public/shared/workflow.mjs';
const actors=s=>Object.fromEntries(s.all('users').map(u=>[u.role,u]));
function setup(t){const s=openStore(':memory:');t.after(()=>s.close());return {s,...actors(s)};}
test('FIN-01/06: PM lock persists immutable source, revision and transactional audit',t=>{
  const {s,pm}=setup(t);mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:1});
  const a=s.getAppraisal('APP-E001');assert.equal(a.status,'locked');assert.equal(a.supervisorScore,4.2);assert.equal(a.revisions[0].finalScore,4.2);assert.equal(a.version,2);assert.equal(s.events()[0].action,'finalise');assert.equal(s.all('finalisations').length,1);
  assert.throws(()=>s.db.prepare('UPDATE finalisations SET version=9').run(),/immutable/);
  assert.throws(()=>s.db.prepare('DELETE FROM audit_events').run(),/immutable/);
});
test('FIN-06: roles without finalisation permission are denied, no audit or revision written',t=>{
  const {s,manager,employee,hod,executive,auditor}=setup(t);
  for(const actor of [manager,employee,hod,executive,auditor])assert.throws(()=>mutateAppraisal(s,actor,'APP-E001','finalise',{expectedVersion:1}),/permission/);
  assert.equal(s.getAppraisal('APP-E001').version,1);assert.equal(s.events().length,0);
});
test('record scope: manager and HOD cannot read or mutate another department',t=>{
  const {s,manager,hod,employee}=setup(t);
  for(const actor of [manager,hod,employee]){
    assert.equal(bootstrap(s,actor).employees.some(e=>e.id==='E003'),false);
    assert.throws(()=>mutateAppraisal(s,actor,'APP-E003','check-in',{expectedVersion:1,note:'x'}),/access/);
  }
});
test('FIN-07: reopening preserves old revision; relock creates a new immutable version',t=>{
  const {s,pm}=setup(t);mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:1});
  const first=s.getAppraisal('APP-E001').revisions[0];
  assert.throws(()=>mutateAppraisal(s,pm,'APP-E001','reopen',{expectedVersion:2,reason:'Correction'}),/authorisation/);
  mutateAppraisal(s,pm,'APP-E001','reopen',{expectedVersion:2,reason:'Correction',approvalReference:'TEST-AUTH'});
  mutateAppraisal(s,pm,'APP-E001','calibrate',{expectedVersion:3,score:4,reason:'Evidence correction',evidence:'TEST-REF'});
  mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:4});
  const a=s.getAppraisal('APP-E001');assert.deepEqual(a.revisions[0],first);assert.equal(a.revisions[1].version,2);assert.equal(a.revisions[1].finalScore,4);assert.equal(a.revisions[1].reopenedFromId,first.id);assert.equal(s.all('finalisations').length,2);
});
test('FIN-02: calibrated score plus controlled authorised deduction persists snapshots',t=>{
  const {s,pm}=setup(t);s.setMeta('deductionPolicy',{mode:'controlled',approvalReference:'TEST-ONLY',approvedBy:'Test authority',tracks:['A'],maxPoints:.5,floor:1,evidenceRequired:true});
  mutateAppraisal(s,pm,'APP-E002','finalise',{expectedVersion:1,deductionPoints:.2,reason:'Test evidence',basis:'Provisional test category',evidence:'TEST-REF'});
  const r=s.getAppraisal('APP-E002').revisions[0];assert.equal(r.finalScore,3.8);assert.equal(r.supervisorSnapshot,4.2);assert.equal(r.calibratedSnapshot,4);assert.equal(r.policySnapshot.approvalReference,'TEST-ONLY');
});
test('stale writes and repeated locking are rejected without duplicate revision',t=>{
  const {s,pm}=setup(t);mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:1});
  assert.throws(()=>mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:1}),/changed/);
  assert.throws(()=>mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:2}),/locked/);
  assert.equal(s.all('finalisations').length,1);
});
test('pending calibration blocks finalisation; scoped HOD evidence review unlocks the queue',t=>{
  const {s,pm,hod}=setup(t);assert.throws(()=>mutateAppraisal(s,pm,'APP-E010','finalise',{expectedVersion:1}),/calibration/);
  assert.throws(()=>mutateAppraisal(s,hod,'APP-E010','calibrate',{expectedVersion:1,score:3.8,reason:'Evidence reviewed'}),/evidence/);
  mutateAppraisal(s,hod,'APP-E010','calibrate',{expectedVersion:1,score:3.8,reason:'Evidence reviewed',evidence:'TEST-PANEL'});
  mutateAppraisal(s,pm,'APP-E010','finalise',{expectedVersion:2});assert.equal(s.getAppraisal('APP-E010').status,'locked');
});
test('employee cannot view unreleased results, supervisor scores or calibration identities',t=>{
  const {s,pm,employee}=setup(t);mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:1});
  const before=bootstrap(s,employee);assert.equal(before.appraisals[0].supervisorScore,undefined);assert.equal(before.appraisals[0].calibrations,undefined);assert.equal(before.appraisals[0].revisions.length,0);assert.equal(before.audit.length,0);
  mutateAppraisal(s,pm,'APP-E001','release',{expectedVersion:2});const after=bootstrap(s,employee).appraisals[0];assert.equal(after.revisions[0].finalScore,4.2);assert.equal(after.revisions[0].finalisedBy,undefined);
  mutateAppraisal(s,pm,'APP-E001','reopen',{expectedVersion:3,reason:'Correction',approvalReference:'TEST'});assert.equal(bootstrap(s,employee).appraisals[0].revisions.length,0);
});
test('a people manager sees their own appraisal through the employee projection',t=>{
  const {s,manager}=setup(t);const own=bootstrap(s,manager).appraisals.find(a=>a.employeeId===manager.employeeId);
  assert.equal(own.selfView,true);assert.equal(own.supervisorScore,undefined);assert.equal(own.calibrations,undefined);
});
test('report reconciles locked ledger and superseded revisions, protects CSV formulas',t=>{
  const {s,pm,employee}=setup(t);mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:1,reason:'=HYPERLINK("bad")'});
  const rows=reconciliationRows(s,pm);assert.equal(rows.length,1);assert.equal(rows[0].current,true);assert.equal(rows[0].final,4.2);assert.ok(csvFromRows(rows).includes("'=HYPERLINK"));assert.throws(()=>reconciliationRows(s,employee),/permission/);
});
test('notes and self-review obey role, locking and source immutability',t=>{
  const {s,pm,employee,manager}=setup(t);
  mutateAppraisal(s,employee,'APP-E001','self-review',{expectedVersion:1,note:'Completed analysis.'});assert.equal(s.getAppraisal('APP-E001').status,'awaiting_finalisation');
  mutateAppraisal(s,manager,'APP-E001','check-in',{expectedVersion:2,note:'Agreed development action.'});
  assert.throws(()=>mutateAppraisal(s,employee,'APP-E001','check-in',{expectedVersion:3,note:'x'}),/manager/);
  mutateAppraisal(s,pm,'APP-E001','finalise',{expectedVersion:3});
  assert.throws(()=>mutateAppraisal(s,manager,'APP-E001','check-in',{expectedVersion:4,note:'x'}),/Locked/);
});
test('SQLite persistence survives service reopen; audit and revisions survive',()=>{
  const dir=mkdtempSync(join(tmpdir(),'epms-test-'));const path=join(dir,'db.sqlite');let s;
  try{s=openStore(path);mutateAppraisal(s,actors(s).pm,'APP-E001','finalise',{expectedVersion:1});s.close();s=openStore(path);assert.equal(s.getAppraisal('APP-E001').status,'locked');assert.equal(s.all('finalisations').length,1);assert.equal(s.events().length,1);}finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});
