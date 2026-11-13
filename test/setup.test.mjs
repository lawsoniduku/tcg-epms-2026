// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {view} from '../public/workspace/engine.mjs';
import {emptyState} from '../public/workspace/model.mjs';
test('cycle setup exposes ordered scoped blockers only to PM and admin',()=>{
 const s=emptyState(),actor={id:'example',name:'Example',role:'pm',active:true,company:'Fictional'};
 const setup=view(s,actor,{setupYear:2027}).setup;
 assert.equal(setup.steps.length,8);
 assert.equal(setup.steps[0].status,'Not started');
 assert.equal(setup.steps.at(-1).status,'Blocked');
 assert.equal(setup.ready,false);
 assert.equal(view(s,{...actor,role:'employee'}).setup,undefined);
});
