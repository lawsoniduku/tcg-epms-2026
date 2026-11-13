import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {loadWorkspace,receipt,commitWorkspace} from './workspace-store.ts';

test('hosted legacy data migrates atomically; stale commits preserve records, order and receipts',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try{
   for(const file of ['0000_greedy_triton','0001_workspace_items'])sqlite.exec(readFileSync(new URL('../drizzle/'+file+'.sql',import.meta.url),'utf8'));
   const db={
     prepare(sql){
       return {bind(...args){const stmt=sqlite.prepare(sql);return {first:async()=>stmt.get(...args),run:async()=>stmt.run(...args),batch(){return {results:stmt.all(...args)};}};}};
     },
     async batch(statements){
       sqlite.exec('BEGIN IMMEDIATE');
       try{const result=statements.map(statement=>statement.batch());sqlite.exec('COMMIT');return result;}
       catch(e){sqlite.exec('ROLLBACK');throw e;}
     }
   };
   const seed=()=>({schema:2,users:[],events:[],records:[{id:'old',version:1}],outbox:[],revision:1});
   const one=await loadWorkspace(db,'tester',seed),two=await loadWorkspace(db,'tester',seed);
   one.state.records.push({id:'new',version:0});
   assert.equal(await commitWorkspace(db,'tester',one,'pm:create',{fingerprint:'F',result:{id:'new'}}),true);
   two.state.records[0].version++;
   assert.equal(await commitWorkspace(db,'tester',two,'pm:stale',{}),false);
   const latest=await loadWorkspace(db,'tester',seed);
   assert.deepEqual(latest.state.records,[{id:'old',version:1},{id:'new',version:0}]);
   assert.equal((await receipt(db,'tester','pm:create')).result.id,'new');
   assert.equal(await receipt(db,'tester','pm:stale'),null);
   assert.equal((await loadWorkspace(db,'other',seed)).state.records.length,1);
 }finally{sqlite.close();}
});
