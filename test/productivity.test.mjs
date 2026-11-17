// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {productivityResult} from '../public/workspace/productivity.mjs';

test('final percentage rounds HALF_UP before selecting productivity entitlement',()=>{
 for(const [raw,rounded,unlock] of [[59.49,59,0],[59.5,60,50],[70.49,70,50],[70.5,71,75],[90.49,90,75],[90.5,91,100],[100,100,100]]){
  const result=productivityResult({numerator:String(Math.round(raw*100)),denominator:'2000'},0);
  assert.equal(result.finalPercentage,rounded);
  assert.equal(result.productivityUnlockPercent,unlock);
 }
});
test('deductions precede rounding and the existing one-point floor applies',()=>{
 assert.equal(productivityResult({numerator:'455',denominator:'100'},0.03).finalPercentage,90);
 assert.equal(productivityResult({numerator:'455',denominator:'100'},0.03).productivityUnlockPercent,75);
 assert.equal(productivityResult({numerator:'3',denominator:'1'},10).finalPercentage,20);
});
test('exact composite precision avoids premature rounding at payout boundaries',()=>{
 const result=productivityResult({numerator:'35249',denominator:'10000'},0);
 assert.equal(result.finalPercentage,70);
 assert.equal(result.productivityUnlockPercent,50);
 assert.equal(result.exactFinalScore.numerator,'3524900');
});
