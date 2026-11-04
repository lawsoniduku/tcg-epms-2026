import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialState } from '../public/shared/fixtures.mjs';
export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), {recursive:true});
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('./migrations/001_initial.sql',import.meta.url),'utf8'));
  const meta=(key)=>{const r=db.prepare('SELECT value FROM metadata WHERE key=?').get(key);return r?JSON.parse(r.value):null;};
  const setMeta=(key,value)=>db.prepare('INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
  if (!meta('schemaVersion')) {
    const state=initialState();
    db.exec('BEGIN IMMEDIATE');
    try {
      for(const key of ['schemaVersion','synthetic','cycle','deductionPolicy','decisions']) setMeta(key,state[key]);
      for(const u of state.users) db.prepare('INSERT INTO users VALUES (?,?)').run(u.id,JSON.stringify(u));
      for(const e of state.employees) db.prepare('INSERT INTO employees VALUES (?,?)').run(e.id,JSON.stringify(e));
      for(const a of state.appraisals) db.prepare('INSERT INTO appraisals VALUES (?,?,?,?)').run(a.id,a.employeeId,a.version,JSON.stringify(a));
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK');throw e; }
  }
  if(meta('synthetic')!==true) throw new Error('Reference service refuses a database without the synthetic-data marker.');
  return {
    db,meta,setMeta,
    all(table){if(!['users','employees','appraisals','finalisations'].includes(table))throw new Error('Invalid table');return db.prepare(`SELECT payload FROM ${table}`).all().map(r=>JSON.parse(r.payload));},
    getAppraisal(id){const r=db.prepare('SELECT payload FROM appraisals WHERE id=?').get(id);return r?JSON.parse(r.payload):null;},
    saveAppraisal(a,expectedVersion){const r=db.prepare('UPDATE appraisals SET version=?,payload=? WHERE id=? AND version=?').run(a.version,JSON.stringify(a),a.id,expectedVersion);if(r.changes!==1)throw new Error('Concurrent appraisal update');},
    addRevision(a,r){db.prepare('INSERT INTO finalisations VALUES (?,?,?,?)').run(r.id,a.id,r.version,JSON.stringify(r));},
    audit(actor,entityId,action,before,after){const event={id:randomUUID(),at:new Date().toISOString(),actorId:actor.id,actorName:actor.name,entityId,action,before,after};db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?)').run(event.id,event.at,actor.id,entityId,action,JSON.stringify(event));return event;},
    events(){return db.prepare('SELECT payload FROM audit_events ORDER BY rowid DESC').all().map(r=>JSON.parse(r.payload));},
    transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},
    close(){db.close();}
  };
}
