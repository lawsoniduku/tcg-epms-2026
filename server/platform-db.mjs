import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {emptyState,need,roles} from '../public/workspace/model.mjs';
import {sampleState} from '../public/workspace/sample.mjs';

export const digest=value=>createHash('sha256').update(value).digest('hex');
export function passwordHash(password){
  need(typeof password==='string'&&password.length>=12&&password.length<=256,'Use a password between 12 and 256 characters.');
  const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');
}
export function matches(password,hash){
  if(typeof password!=='string'||password.length>256||!hash)return false;
  const [salt,expected]=hash.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'));
}
export function openPlatform(filename,{demo=false,key}={}){
  const cipherKey=Buffer.isBuffer(key)?key:Buffer.from(key??'','base64');
  need(cipherKey.length===32,'Supply a 32-byte base64 EPMS_DATA_KEY.');
  if(filename!==':memory:')mkdirSync(dirname(filename),{recursive:true,mode:0o700});
  const db=new DatabaseSync(filename);if(filename!==':memory:')chmodSync(filename,0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE COLLATE NOCASE,password TEXT,subject TEXT UNIQUE,profile TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY,id TEXT UNIQUE,entity TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots(sequence INTEGER PRIMARY KEY,entity TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(entity,version));
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,actor TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,actor TEXT NOT NULL REFERENCES accounts(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS access_log(seq INTEGER PRIMARY KEY,at TEXT,actor TEXT,operation TEXT,entity TEXT);
    CREATE TRIGGER IF NOT EXISTS immutable_events BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'Immutable audit event');END;
    CREATE TRIGGER IF NOT EXISTS retain_events BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Immutable audit event');END;
    CREATE TRIGGER IF NOT EXISTS immutable_snapshots BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'Immutable revision');END;
    CREATE TRIGGER IF NOT EXISTS retain_snapshots BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'Immutable revision');END;
    CREATE INDEX IF NOT EXISTS kind_index ON entities(kind);
    CREATE INDEX IF NOT EXISTS history_index ON events(entity,sequence);`);
  if(!db.prepare('PRAGMA table_info(sessions)').all().some(c=>c.name==='active_role')) db.exec('ALTER TABLE sessions ADD COLUMN active_role TEXT');
  const seal=obj=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',cipherKey,iv);const content=Buffer.concat([cipher.update(JSON.stringify(obj),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),content]).toString('base64');};
  const open=value=>{const buf=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',cipherKey,buf.subarray(0,12));decipher.setAuthTag(buf.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)),decipher.final()]).toString());};
  const setting=k=>db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value;
  const set=(k,v)=>db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(k,String(v));
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  function write(s,before){
    for(const r of s.records){
      if(before.versions.get(r.id)===r.version)continue;
      const payload=seal(r);db.prepare('INSERT INTO entities VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,payload=excluded.payload').run(r.id,r.type,r.version,payload);
      db.prepare('INSERT INTO snapshots(entity,version,payload) VALUES(?,?,?)').run(r.id,r.version,payload);
    }
    for(const e of s.events.slice(before.count))db.prepare('INSERT INTO events(id,entity,payload) VALUES(?,?,?)').run(e.id,e.record,seal(e));
    for(const message of s.outbox){if(before.messages.get(message.id)!==JSON.stringify(message))db.prepare('INSERT OR REPLACE INTO messages VALUES(?,?)').run(message.id,seal(message));}
    set('revision',s.revision);
  }
  function account(profile,{password,subject}={}){
    need(Object.hasOwn(roles,profile.role)&&profile.id&&profile.name,'A valid user, name and role are required.');
    const email=String(profile.email??'').trim().toLowerCase();need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'A valid email address is required.');
    const passwordValue=password?passwordHash(password):null;
    db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?)').run(profile.id,email,passwordValue,subject??null,seal({...profile,email,active:true}));
  }
  if(!setting('mode'))transaction(()=>{
    set('mode',demo?'sandbox':'production');set('keyCheck',seal('TCG-EPMS'));set('schema','2');
    const s=demo?sampleState():emptyState();for(const u of s.users)account({...u,email:u.id+'@example.invalid'});
    write(s,{versions:new Map(),count:0,messages:new Map()});
  });
  need(setting('mode')===(demo?'sandbox':'production'),'Database mode mismatch. Use a separate database for live and sandbox data.');
  need(open(setting('keyCheck'))==='TCG-EPMS','Database encryption key mismatch.');
  const profiles=()=>db.prepare('SELECT profile FROM accounts').all().map(u=>open(u.profile));
  function load(){
    return {schema:2,liveCalendar:!demo,revision:Number(setting('revision')),users:profiles(),records:db.prepare('SELECT payload FROM entities ORDER BY rowid').all().map(x=>open(x.payload)),events:db.prepare('SELECT payload FROM events ORDER BY sequence').all().map(x=>open(x.payload)),outbox:db.prepare('SELECT payload FROM messages ORDER BY rowid').all().map(x=>open(x.payload))};
  }
  function change(fn){return transaction(()=>{const s=load(),before={versions:new Map(s.records.map(r=>[r.id,r.version])),count:s.events.length,messages:new Map(s.outbox.map(m=>[m.id,JSON.stringify(m)]))};const result=fn(s);write(s,before);return result;});}
  function command(actor,requestId,payload,fn){
    need(typeof requestId==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(requestId),'A valid idempotency key is required.');
    const fingerprint=digest(JSON.stringify(payload));
    return change(s=>{const prior=db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);
      if(prior){need(prior.actor===actor&&prior.fingerprint===fingerprint,'Idempotency key was used for another command.');return open(prior.result);}
      const result=fn(s);db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(requestId,actor,fingerprint,seal(result));return result;});
  }
  return {db,load,change,command,transaction,account,profiles,open,seal,
    audit(actor,operation,entity=''){db.prepare('INSERT INTO access_log(at,actor,operation,entity) VALUES(?,?,?,?)').run(new Date().toISOString(),actor,operation,entity);},
    session(actor,role){const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions(token,actor,csrf,expires,active_role) VALUES(?,?,?,?,?)').run(digest(token),actor,csrf,Date.now()+8*3600000,role??null);return {token,csrf};},
    close(){db.close();}
  };
}

