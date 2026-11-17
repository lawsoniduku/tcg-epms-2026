import {cpSync,mkdirSync,rmSync} from 'node:fs';
const destination='build/tcg-epms';
rmSync(destination,{recursive:true,force:true});mkdirSync(destination,{recursive:true});
for(const path of ['public','server','docs','package.json','README.md','START-HERE.md','CHANGELOG.md','test','scripts'])cpSync(path,destination+'/'+path,{recursive:true});

console.log('Standalone application packaged in '+destination+'. Run with Node.js 24.');
