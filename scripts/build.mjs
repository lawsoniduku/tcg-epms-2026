import {cpSync,mkdirSync,rmSync} from 'node:fs';
const destination='build/tcg-epms';
rmSync(destination,{recursive:true,force:true});mkdirSync(destination,{recursive:true});
for(const path of ['public','server','docs','package.json','README.md','test','scripts'])cpSync(path,destination+'/'+path,{recursive:true});
for(const path of ['hosting/lib/workspace-store.ts','hosting/drizzle'])cpSync(path,destination+'/'+path,{recursive:true});
console.log('Standalone application packaged in '+destination+'. Run with Node.js 24.');
