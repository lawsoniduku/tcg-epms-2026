import {mkdirSync,copyFileSync,cpSync,rmSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const dst=resolve(root,'hosting/public');
mkdirSync(dst+'/workspace',{recursive:true});
for(const name of ['style.css','fonts.css','favicon.svg','workspace/ui.mjs'])copyFileSync(root+'/public/'+name,dst+'/'+name);
copyFileSync(root+'/public/index.html',dst+'/workspace.html');
cpSync(root+'/hosting/drizzle',root+'/drizzle',{recursive:true});
console.log('Hosted acceptance assets and database migration prepared.');

