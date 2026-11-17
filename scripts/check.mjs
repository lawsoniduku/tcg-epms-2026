import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):e.name.endsWith('.mjs')?[join(dir,e.name)]:[]);}
const source=['public','server','scripts','test'].flatMap(files);
for(const file of source){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status){console.error(r.stderr);process.exit(r.status);}}
console.log(`Syntax checks passed: ${source.length} JavaScript modules.`);
