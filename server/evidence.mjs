import {createHash,randomUUID} from 'node:crypto';
import {get,isRole,manages,heads,own,scope,confidentialRead,canAttach,need,requireThat} from '../public/workspace/model.mjs';
const limit=2*1024*1024;
const safeName=name=>String(name??'').replace(/[^A-Za-z0-9._ -]/g,'_').slice(0,120);
export function initialiseEvidence(db){
 db.exec(`CREATE TABLE IF NOT EXISTS evidence_files(id TEXT PRIMARY KEY,entity TEXT NOT NULL,uploader TEXT NOT NULL,visibility TEXT NOT NULL,scan TEXT NOT NULL,metadata TEXT NOT NULL,content TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS evidence_receipts(actor TEXT,request_id TEXT,fingerprint TEXT,file_id TEXT,PRIMARY KEY(actor,request_id));
 CREATE INDEX IF NOT EXISTS evidence_entity ON evidence_files(entity);`);
}
function visible(s,user,row){
 const r=get(s,row.entity);
 if(!scope(s,user,r))return false;
 if(row.uploader===user.id)return true;
 if(r.type==='response')return confidentialRead(user,r,new Date().toISOString());
 if(row.visibility==='Employee shared')return true;
 return !own(user,r)&&!isRole(user,'employee');
}
export function listEvidence(store,user,entity){
 const s=store.readState();const r=get(s,entity);requireThat(scope(s,user,r),'Record unavailable.',404);
 return store.db.prepare('SELECT id,entity,uploader,visibility,scan,metadata FROM evidence_files WHERE entity=?').all(entity).filter(row=>visible(s,user,row)).map(row=>({id:row.id,...store.open(row.metadata),visibility:row.visibility,scan:row.scan}));
}
export function uploadEvidence(store,user,b){
 const s=store.readState(),r=get(s,b.entity);requireThat(scope(s,user,r),'Record unavailable.',404);
 requireThat(canAttach(s,user,r),'File changes are unavailable at this stage.',403);
 const name=safeName(b.name);need(name&&typeof b.base64==='string'&&b.base64.length<=Math.ceil(limit/3)*4,'File exceeds 2 MiB or is missing.');
 const bytes=Buffer.from(b.base64,'base64');need(bytes.length>0&&bytes.length<=limit,'Invalid file size.');
 const extension=name.split('.').at(-1).toLowerCase();
 const valid=extension==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':extension==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):['jpg','jpeg'].includes(extension)?bytes[0]===255&&bytes[1]===216:extension==='txt'&&!bytes.includes(0);
 need(valid,'Choose a matching PDF, PNG, JPEG or plain-text file.');
 need(['Internal','Employee shared'].includes(b.visibility),'Choose a visibility.');
 const visibility=r.type==='response'?'Internal':b.visibility,id=randomUUID();
 const meta={name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),at:new Date().toISOString()};
 const fingerprint=JSON.stringify([r.id,name,visibility,meta.sha256]);
 return store.transaction(()=>{
   if(b.requestId){
     need(/^[a-zA-Z0-9-]{8,80}$/.test(b.requestId),'Invalid upload request ID.');
     const old=store.db.prepare('SELECT * FROM evidence_receipts WHERE actor=? AND request_id=?').get(user.id,b.requestId);
     if(old){requireThat(old.fingerprint===fingerprint,'Upload request already used.',409);return {id:old.file_id,scan:store.db.prepare('SELECT scan FROM evidence_files WHERE id=?').get(old.file_id).scan};}
     store.db.prepare('INSERT INTO evidence_receipts VALUES(?,?,?,?)').run(user.id,b.requestId,fingerprint,id);
   }
   store.db.prepare('INSERT INTO evidence_files VALUES(?,?,?,?,?,?,?)').run(id,r.id,user.id,visibility,'Quarantined',store.seal(meta),store.seal(bytes.toString('base64')));store.audit(user.id,'evidence.upload',id);return {id,scan:'Quarantined'};});
}
export function downloadEvidence(store,user,id){
 const row=store.db.prepare('SELECT * FROM evidence_files WHERE id=?').get(id);
 requireThat(row&&visible(store.readState(),user,row),'File unavailable.',404);requireThat(row.scan==='Clean','File is awaiting an accepted malware scan.',403);
 store.audit(user.id,'evidence.download',id);return {name:store.open(row.metadata).name,bytes:Buffer.from(store.open(row.content),'base64')};
}
export function scanQueue(store){
 return store.db.prepare("SELECT * FROM evidence_files WHERE scan='Quarantined' LIMIT 1").all().map(row=>({id:row.id,...store.open(row.metadata),base64:store.open(row.content)}));
}
export function scanReceipt(store,b){
 need(['Clean','Rejected'].includes(b.result)&&typeof b.reference==='string'&&b.reference.trim(),'Scanner result and attestation are required.');
 const row=store.db.prepare('SELECT scan,metadata FROM evidence_files WHERE id=?').get(b.id);need(row&&store.open(row.metadata).sha256===b.sha256,'File digest mismatch.');
 if(row.scan===b.result)return {ok:true};
 need(row.scan==='Quarantined','The scanner already issued a different result.');
 store.transaction(()=>{store.db.prepare('UPDATE evidence_files SET scan=? WHERE id=?').run(b.result,b.id);store.audit('malware-scanner','evidence.'+b.result+':'+b.reference.slice(0,100),b.id);});return {ok:true};
}
