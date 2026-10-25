#!/usr/bin/env node
/** S002 final evidence only. Never enables release or operates a running daemon/keychain. */
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,relative,join} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const evidence=join(root,'docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S002/evidence');
await mkdir(evidence,{recursive:true});
async function walk(directory){const paths=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())paths.push(...await walk(path));else paths.push(path);}return paths.sort();}
async function fingerprints(){const result={};for(const path of (await walk(join(root,'src'))).filter(path=>/\.(?:tsx?|json)$/.test(path)))result[relative(root,path)]=createHash('sha256').update(await readFile(path)).digest('hex');return result;}
async function run(args,name){
 const output=join(evidence,name+'.log'),stream=createWriteStream(output),started=new Date().toISOString();
 const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,INSRC_LOG_LEVEL:'error',INSRC_LIVE_TESTS:'0'},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
 const outcome=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}));});
 await new Promise(accept=>stream.end(accept));const text=await readFile(output,'utf8');
 return {args,started,finished:new Date().toISOString(),...outcome,log:relative(root,output),digest:createHash('sha256').update(text).digest('hex'),failures:[...text.matchAll(/^\s*not ok \d+ - (.*)$/gm)].map(match=>match[1]),counts:Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name=>[name,Number([...text.matchAll(new RegExp('^# '+name+' (\\d+)$','gm'))].at(-1)?.[1]??0)]))};
}
const gatePath=join(root,'src/assets/connection-management-gates.json'),gateBefore=await readFile(gatePath,'utf8');
if(JSON.parse(gateBefore).ready!==false)throw new Error('Release must remain disabled while prerequisite review is deferred');
const sourceBefore=await fingerprints(),commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const build=await run(['node_modules/typescript/bin/tsc'],'t19-build');
const assets=build.code===0?await run(['copy-assets.mjs'],'t19-assets'):undefined;
const files=(await walk(join(root,'src'))).filter(path=>path.includes('/__tests__/')&&path.endsWith('.test.ts'));
const sweep=assets?.code===0?await run(['--import','tsx','--test','--test-timeout=600000','--test-concurrency=4',...files.map(path=>relative(root,path))],'t19-full-sweep'):undefined;
const sourceAfter=await fingerprints(),sourceDrift=[...new Set([...Object.keys(sourceBefore),...Object.keys(sourceAfter)])].filter(path=>sourceBefore[path]!==sourceAfter[path]);
const report={version:1,commit,node:process.version,platform:process.platform,startedAfterImplementation:true,liveLlmServices:'disabled',databaseFixtures:'isolated localhost and disposable labelled Docker only',testFiles:files.length,build,assets,sweep,sourceDrift,sourceFingerprints:sourceBefore,checksPassed:build.code===0&&assets?.code===0&&sweep?.code===0&&sourceDrift.length===0,releaseReady:false,unmetPrerequisites:['S001 independent code review explicitly deferred','S002 independent code review and BUILD approval pending','SQL Server live coverage awaits explicit EULA authorization','Arrow/Feather local reader unavailable: unsupported-temporary, no automatic INSTALL'],gateUnchanged:gateBefore===await readFile(gatePath,'utf8')};
await writeFile(join(evidence,'t19-regression.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({checksPassed:report.checksPassed,releaseReady:false,testFiles:files.length,report:relative(root,join(evidence,'t19-regression.json')),counts:sweep?.counts,failures:sweep?.failures})+'\n');
process.exitCode=report.checksPassed?0:1;
