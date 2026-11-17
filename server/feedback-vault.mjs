// @ts-check
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
/** @param {Buffer} key @param {string} aad @param {unknown} value */
function encrypt(key,aad,value){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(aad));
 const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');
}
/** @param {Buffer} key @param {string} aad @param {string} value */
function decrypt(key,aad,value){
 const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
 cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(data.subarray(12,28));
 return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());
}
/** @param {import('node:sqlite').DatabaseSync} db @param {Buffer} master */
export function feedbackVault(db,master){
 if(master.length!==32)throw Error('A 32-byte feedback wrapping key is required.');
 db.exec('CREATE TABLE IF NOT EXISTS feedback_private(entity TEXT,version INTEGER,payload TEXT NOT NULL,PRIMARY KEY(entity,version))');
 const keySlot='feedback.wrappedKey';
 const insert=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING');
 insert.run(keySlot,encrypt(master,keySlot,randomBytes(32).toString('base64')));
 const key=()=>Buffer.from(decrypt(master,keySlot,String(db.prepare('SELECT value FROM settings WHERE key=?').get(keySlot)?.value)),'base64');
 key();
 return {
  /** @param {Record<string,any>} record */
  split(record){
   if(record.type!=='response')return record;
   const {id,version,type}=record;
   db.prepare('INSERT OR IGNORE INTO feedback_private VALUES(?,?,?)').run(id,version,encrypt(key(),id+'/'+version,record));
   return {id,version,type,privateVersion:true};
  },
  /** @param {Record<string,any>} record */
  restore(record){
   if(!record.privateVersion)return record;
   const {id,version}=record,row=db.prepare('SELECT payload FROM feedback_private WHERE entity=? AND version=?').get(id,version);
   if(!row)throw Error('Missing confidential response version.');
   return decrypt(key(),id+'/'+version,String(row.payload));
  },
  rotate(){
   const old=key(),next=randomBytes(32);
   for(const row of db.prepare('SELECT * FROM feedback_private').all()){
    const aad=row.entity+'/'+row.version;
    db.prepare('UPDATE feedback_private SET payload=? WHERE entity=? AND version=?').run(encrypt(next,aad,decrypt(old,aad,String(row.payload))),row.entity,row.version);
   }
   db.prepare('UPDATE settings SET value=? WHERE key=?').run(encrypt(master,keySlot,next.toString('base64')),keySlot);
  }
 };
}
/** @param {string} filename @param {string|undefined} explicit */
export function resolveFeedbackKey(filename,explicit){
 if(explicit)return Buffer.from(explicit,'base64');
 if(filename===':memory:')return randomBytes(32);
 const path=filename+'.feedback.key';
 try{return readFileSync(path);}catch(error){if(/** @type {NodeJS.ErrnoException} */(error).code!=='ENOENT')throw error;}
 try{writeFileSync(path,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(/** @type {NodeJS.ErrnoException} */(error).code!=='EEXIST')throw error;}
 return readFileSync(path);
}
