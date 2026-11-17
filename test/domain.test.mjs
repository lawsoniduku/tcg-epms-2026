import test from 'node:test';
import assert from 'node:assert/strict';
import {hundredths,ratingFor,trackAScore,trackFor,finalisationPreview,aggregateFeedback} from '../public/shared/domain.mjs';
const appraisal={track:'A',status:'awaiting_finalisation',supervisorScore:4.2,calibratedScore:null,calibrationComplete:true,version:1};
const disabled={mode:'disabled'};
const approved={mode:'controlled',approvalReference:'SYNTHETIC-TEST-ONLY',approvedBy:'Test Authority',tracks:['A'],maxPoints:.5,floor:1,evidenceRequired:true};
test('FIN-01: 4.20 unchanged at zero deduction, no comment needed',()=>{
  assert.deepEqual(finalisationPreview(appraisal,{expectedVersion:1},disabled),{baseScore:4.2,deductionPoints:0,finalScore:4.2,finalRating:4});
});
test('FIN-02: calibrated 4.00 less 0.20 yields 3.80 exactly',()=>{
  const r=finalisationPreview({...appraisal,calibratedScore:4},{expectedVersion:1,deductionPoints:'.20',reason:'x',basis:'test',evidence:'test'},approved);
  assert.equal(r.finalScore,3.8);
});
test('FIN-03: whitespace-only justification rejected',()=>assert.throws(()=>finalisationPreview(appraisal,{expectedVersion:1,deductionPoints:.2,reason:'  ',basis:'test',evidence:'ref'},approved),/reason/));
test('FIN-04: client source or final-score override rejected',()=>{
  for(const field of ['supervisorScore','finalScore','calibratedScore'])assert.throws(()=>finalisationPreview(appraisal,{expectedVersion:1,[field]:5},disabled),/overridden/);
});
test('FIN-05: disabled deductions rejected even with a reason',()=>assert.throws(()=>finalisationPreview(appraisal,{expectedVersion:1,deductionPoints:.2,reason:'Example'},disabled),/disabled/));
test('FIN-10: Track B cannot use the Track A workflow',()=>assert.throws(()=>finalisationPreview({...appraisal,track:'B'},{expectedVersion:1},disabled),/Track A/));
test('Track C takes precedence for an unconfirmed salesperson',()=>{
  assert.equal(trackFor({confirmed:false,commercial:true}),'C');assert.equal(trackFor({confirmed:true,commercial:true}),'B');assert.equal(trackFor({confirmed:true,commercial:false}),'A');
});
test('all score-band edges and rounding precision are deterministic',()=>{
  for(const [s,r] of [[1,1],[1.99,1],[2,2],[2.74,2],[2.75,3],[3.74,3],[3.75,4],[4.49,4],[4.5,5],[5,5]])assert.equal(ratingFor(s),r);
  assert.equal(trackAScore(4.2,4),4.14);assert.equal(hundredths(4.2),420);
});
test('reject malformed, nonfinite, negative, high-precision and out-of-range numbers',()=>{
  for(const n of [null,undefined,NaN,Infinity,-1,'',' ','1e2','0x10','4.201',{},[]])assert.throws(()=>hundredths(n));
  for(const n of [0,.99,5.01,335.4])assert.throws(()=>ratingFor(n));
});
test('finalisation requires supervisor, calibration completion, fresh version and unlocked state',()=>{
  for(const patch of [{supervisorScore:null},{calibrationComplete:false},{version:2},{status:'locked'}])assert.throws(()=>finalisationPreview({...appraisal,...patch},{expectedVersion:1},disabled));
});
test('controlled deductions require explicit limits, evidence, basis and applicable track',()=>{
  const input={expectedVersion:1,deductionPoints:.2,reason:'reason',basis:'example',evidence:'ref'};
  for(const patch of [{approvalReference:null},{approvedBy:null},{tracks:['B']},{maxPoints:null},{floor:null},{maxPoints:.1},{floor:4.1}])assert.throws(()=>finalisationPreview(appraisal,input,{...approved,...patch}));
  for(const field of ['basis','evidence'])assert.throws(()=>finalisationPreview(appraisal,{...input,[field]:''},approved));
});
test('360 anonymity: insufficient cohorts suppressed only under an approved redistribution rule',()=>{
  const categories=[{type:'manager',count:1,score:4,weight:50},{type:'peer',count:2,score:1,weight:30},{type:'stakeholder',count:3,score:3,weight:20}];
  assert.throws(()=>aggregateFeedback(categories,{approved:false}),/approval/);
  assert.deepEqual(aggregateFeedback(categories,{approved:true}),{score:3.71,suppressed:['peer']});
});
