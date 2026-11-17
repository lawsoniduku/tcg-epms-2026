// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {rounded,mean,weighted,percent,adjustedGrowth} from '../public/workspace/decimal.mjs';
test('decimal HALF_UP preserves signed ties, confirmation weights and competency means',()=>{
 assert.equal(weighted([4.22,2.86,4.08],[70,15,15]),4);
 assert.equal(rounded(-1.005),-1.01);
 assert.equal(mean([4.22,4.23]),4.23);
 assert.equal(percent(209.99,200),105);
 assert.equal(adjustedGrowth(5,100,105),0);
 assert.equal(rounded(1e-7),0);
});
test('Excel template round trips editable KPI rows and excludes instructions from imported data',async()=>{
 const {workbook}=await import('../server/import-files.mjs');
 const bytes=await workbook({op:'build',headers:['title','objective','perspective','direction'],example:['Example','O1','Customer','Higher is better'],objectives:[['O1','Fictional objective']]});
 assert.equal((await workbook({op:'parse',bytes})).trim(),'title,objective,perspective,direction');
});
