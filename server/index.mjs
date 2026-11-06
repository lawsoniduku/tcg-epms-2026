import { resolve } from 'node:path';
import { openStore } from './store.mjs';
import { createApp } from './app.mjs';
const demo=process.argv.includes('--demo');
if(!demo){console.error('Production is blocked: configure approved SSO/database adapters first. For synthetic development run npm run demo.');process.exit(1);}
const store=openStore(resolve(process.env.EPMS_DB_PATH||'data/epms.sqlite'));
const server=createApp(store,{demo});
const argument=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;};
const port=Number(argument('--port')||process.env.PORT||3000);
const host=argument('--host')||process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`TCG EPMS synthetic reference: http://${host}:${server.address().port}`));
for(const event of ['SIGTERM','SIGINT'])process.on(event,()=>server.close(()=>{store.close();process.exit(0);}));
