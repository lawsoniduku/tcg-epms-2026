import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {openPlatform} from './platform-db.mjs';
import {platformHttp} from './platform-http.mjs';
import {processDeadlines} from '../public/workspace/engine.mjs';
const demo=process.argv.includes('--demo'),provision=process.argv.includes('--provision'),backup=process.argv.includes('--backup');
const filename=resolve(process.env.EPMS_DB_PATH??(demo?'data/sandbox-v2.sqlite':'data/platform-v2.sqlite'));
let key=process.env.EPMS_DATA_KEY;
if(demo&&!key){mkdirSync(dirname(filename),{recursive:true,mode:0o700});const keyfile=filename+'.key';if(!existsSync(keyfile))writeFileSync(keyfile,randomBytes(32).toString('base64'),{flag:'wx',mode:0o600});key=readFileSync(keyfile,'utf8').trim();}
const store=openPlatform(filename,{demo,key});
if(provision){
  if(!process.env.EPMS_ADMIN_PASSWORD)throw Error('Set EPMS_ADMIN_PASSWORD before initial provisioning.');
  if(store.profiles().some(u=>u.role==='admin'&&u.active))throw Error('An active administrator exists. Use Account administration.');
  store.account({id:randomUUID(),role:'admin',name:process.env.EPMS_ADMIN_NAME??'PMS administrator',email:process.env.EPMS_ADMIN_EMAIL,department:'Administration'},{password:process.env.EPMS_ADMIN_PASSWORD});
  console.log('Administrator provisioned.');store.close();
}else if(backup){
  const target=process.env.EPMS_BACKUP_PATH;if(!target||existsSync(target))throw Error('Set EPMS_BACKUP_PATH to a new file.');
  store.db.prepare('VACUUM INTO ?').run(resolve(target));console.log('Consistent database backup created.');store.close();
}else{
  if(!demo&&!store.profiles().length)throw Error('Provision the initial administrator with npm run provision.');
  const arg=name=>{const index=process.argv.indexOf(name);return index===-1?null:process.argv[index+1];};
  const options={demo,scanToken:process.env.EPMS_SCAN_TOKEN,secure:process.env.EPMS_SECURE_COOKIE==='1',origin:process.env.EPMS_PUBLIC_ORIGIN,rosterToken:process.env.EPMS_ROSTER_TOKEN,noticeToken:process.env.EPMS_NOTIFICATION_TOKEN,ssoKey:process.env.EPMS_SSO_PUBLIC_KEY_FILE?readFileSync(process.env.EPMS_SSO_PUBLIC_KEY_FILE):null,ssoIssuer:process.env.EPMS_SSO_ISSUER,ssoAudience:process.env.EPMS_SSO_AUDIENCE,ssoUrl:process.env.EPMS_SSO_URL};
  if(process.env.EPMS_STAGE==='production'){
    if(demo||!options.secure||!options.origin?.startsWith('https://'))throw Error('Production requires the live database, HTTPS origin and Secure cookies.');
    if(!store.load().records.some(r=>r.type==='cutover'&&r.status==='Approved'&&r.title===process.env.EPMS_ENVIRONMENT))throw Error('Complete the rollout approval for EPMS_ENVIRONMENT in staging before production startup.');
  }
  const server=platformHttp(store,options);const port=Number(arg('--port')||process.env.PORT||3000),host=arg('--host')||process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log('TCG PMS listening on '+host+':'+port+' ('+(demo?'acceptance':'live')+')'));
  const tick=setInterval(()=>{try{store.deadlines(processDeadlines);}catch(e){console.error('Deadline processing failed:',e.name);}},60000);tick.unref();
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(tick);server.close(()=>{store.close();process.exit(0);});});
}

