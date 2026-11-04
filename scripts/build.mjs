import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
rmSync('dist',{recursive:true,force:true});mkdirSync('dist',{recursive:true});
cpSync('public','dist',{recursive:true});
const html=readFileSync('dist/index.html','utf8').replace('<meta charset="UTF-8">','<meta charset="UTF-8">\n  <meta name="epms-mode" content="browser-demo">');
writeFileSync('dist/index.html',html);
console.log('Static synthetic demonstration built in dist/. The SQLite service is not included in static hosting.');
