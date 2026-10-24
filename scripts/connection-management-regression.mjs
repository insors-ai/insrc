#!/usr/bin/env node
/** Explicit final build/sweep runner. Never runs adoption, stops a daemon or accesses credentials. */
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,relative,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const evidence=join(root,'docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S001/evidence');
await mkdir(evidence,{recursive:true});
const gatePath=join(root,'src/assets/connection-management-gates.json');
await writeFile(gatePath,JSON.stringify({version:2,ready:false,sourceFiles:{},compiledFiles:{},inventoryDigest:'',testReportDigest:'',scopes:[]},null,2)+'\n');
async function walk(directory){const paths=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())paths.push(...await walk(path));else paths.push(path);}return paths.sort();}
async function sourceSnapshot(){const result={};const inputs=[...(await walk(join(root,'src'))).filter(path=>/\.(?:tsx?|json|mjs)$/.test(path)),...['package.json','package-lock.json','tsconfig.json','copy-assets.mjs','scripts/connection-management-regression.mjs'].map(path=>join(root,path))];for(const path of inputs)result[relative(root,path)]=createHash('sha256').update(await readFile(path)).digest('hex');return result;}
const testedSources=await sourceSnapshot();
async function run(args,name){
 const {createWriteStream}=await import('node:fs');const output=join(evidence,name+'.log'),stream=createWriteStream(output);
 const started=new Date().toISOString();const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,INSRC_LOG_LEVEL:'error',INSRC_LIVE_TESTS:'0'},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
 const result=await new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>accept({code,signal}));});
 await new Promise(accept=>stream.end(accept));const text=await readFile(output,'utf8');
 return{name,args,started,finished:new Date().toISOString(),...result,log:relative(root,output),digest:createHash('sha256').update(text).digest('hex')};
}
const build=await run(['node_modules/typescript/bin/tsc'],'t23-build');
if(build.code===0){const assets=await run(['copy-assets.mjs'],'t23-assets');if(assets.code!==0)throw new Error('Asset build failed');}
const runtimeSources=Object.entries(testedSources).filter(([path])=>path.startsWith('src/')&&!path.includes('/__tests__/')&&!path.endsWith('.d.ts')&&!/\.test\.tsx?$/.test(path)&&/\.tsx?$/.test(path));
const testedCompiled={};if(build.code===0)for(const[path]of runtimeSources){const name=path.slice(4).replace(/\.tsx?$/,'.js');testedCompiled[name]=createHash('sha256').update(await readFile(join(root,'out',name))).digest('hex');}
const files=(await walk(join(root,'src'))).filter(path=>path.includes('/__tests__/')&&path.endsWith('.test.ts'));
const sweep=build.code===0?await run(['--import','tsx','--test','--test-timeout=600000','--test-concurrency=4',...files.map(path=>relative(root,path))],'t23-full-sweep'):undefined;
const finalSources=await sourceSnapshot(),sourceDrift=[...new Set([...Object.keys(testedSources),...Object.keys(finalSources)])].filter(path=>testedSources[path]!==finalSources[path]);
const compiledDrift=[];for(const[path,expected]of Object.entries(testedCompiled)){const actual=await readFile(join(root,'out',path)).then(bytes=>createHash('sha256').update(bytes).digest('hex')).catch(()=>undefined);if(actual!==expected)compiledDrift.push(path);}
const report={version:2,node:process.version,platform:process.platform,liveServices:'disabled',build,sweep,testFiles:files.length,sourceDrift,compiledDrift,testedSources,ready:build.code===0&&sweep?.code===0&&sourceDrift.length===0&&compiledDrift.length===0};
const reportText=JSON.stringify(report,null,2)+'\n';await writeFile(join(evidence,'t23-regression.json'),reportText);
if(report.ready){
 const sourceFiles={},compiledFiles={...testedCompiled};for(const[path,digest]of runtimeSources)sourceFiles[path.slice(4)]=digest;
 const inventory=await readFile(join(root,'src/daemon/db/__tests__/fixtures/connection-source-inventory.json'));
 await writeFile(gatePath,JSON.stringify({version:2,ready:true,sourceFiles,compiledFiles,inventoryDigest:createHash('sha256').update(inventory).digest('hex'),testReportDigest:createHash('sha256').update(reportText).digest('hex'),scopes:['sc1','sc2','sc3','sc8']},null,2)+'\n');
 await run(['copy-assets.mjs'],'t23-gate-assets');
}
process.stdout.write(JSON.stringify({ready:report.ready,files:files.length,report:relative(root,join(evidence,'t23-regression.json'))})+'\n');
process.exitCode=report.ready?0:1;
