// Compiled S3 qualification: synthetic CLI, disposable owner/socket/project, no installed-daemon changes.
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,appendFileSync,chmodSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const work=mkdtempSync(join(tmpdir(),'insrc-design-impact-')),project=join(work,'project'),socket=join(work,'daemon.sock'),bin=join(work,'native.mjs'),callsPath=join(work,'calls.jsonl'),evidencePath=join(work,'evidence.json');
const put=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));};
const time='2026-11-03T00:00:00.000Z',hash='1234567890abcdef',artifact=join(project,`.insrc/artifacts/LLD-${hash}-s1.json`);
const {resolveArtifactMdPath}=await import('../out/workflow/path-scheme.js');
const md=resolveArtifactMdPath(project,{epicHash:hash,epicCreatedAt:time,story:'s1'},'LLD','standalone','impact-smoke');
put(artifact,{meta:{epicHash:hash,storyId:'s1',epicCreatedAt:time,createdAt:time,epicSlug:'impact-smoke',standalone:true,authoredBy:'controller'},body:{summary:'Synthetic impact qualification',requirements:[{id:'r1',statement:'Review direct and indirect correction impact'}]},citations:[]});
put(md,`<!-- insrc:artifact LLD-${hash}-s1 -->\n# Synthetic LLD\n\n## Summary\nImpact fixture only\n`);put(join(project,'.insrc/schema.json'),{version:2});
put(bin,String.raw`#!${process.execPath}
import {readFileSync,appendFileSync} from 'node:fs';
let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>prompt+=s);process.stdin.on('end',()=>{
 const path=prompt.match(/^Checkpoint\/inventory\/accepted feedback: (.*)$/m)[1],cp=JSON.parse(readFileSync(path)),a=cp.attempts.at(-1),units=a.inventory.units.map(u=>u.id),match=prompt.match(/^Chunk assignment: (.*)$/m),chunk=match?JSON.parse(match[1]):null,stage=chunk?.id??(a.preparationKind==='impact'?'impact':'planning');
 appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({attempt:a.number,stage,at:Date.now()})+'\n');
 const plan={chunks:[{id:'keep',title:'Ownership',selectors:units,concerns:['Ownership'],dependsOn:[],purpose:'substantive'},{id:'edit',title:'Contract',selectors:units,concerns:['Correctness'],dependsOn:['keep'],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['keep','edit'],purpose:'consistency'}],coverageExplanation:'All fixture units',finalConsistencyChunkId:'final',coverage:units.map(unitId=>({unitId,chunkIds:['keep','edit']}))};
 const keep={attempt:1,chunkId:'keep',findingId:'keep-blocker'},edit={attempt:1,chunkId:'edit',findingId:'edit-blocker'},evidenceReferences=[cp.subject.documentPath];
 const decisions=a.number===2?[{source:keep,action:'carry',rationale:'Retained ownership concern remains',evidenceReferences},{source:edit,action:'resolved',rationale:'Fresh contract inspection confirms correction',evidenceReferences,reviewedInChunkIds:['edit']}]:[{source:keep,action:'resolved',rationale:'Indirect ownership impact freshly inspected',evidenceReferences,reviewedInChunkIds:['keep']}];
 const impact={baselineAttempt:a.number-1,mode:'affected_chunks',changes:['Contract correction'],directChunkIds:['edit'],indirectChunkIds:a.number===3?['keep']:[],rationale:a.number===3?'Unchanged ownership is indirectly affected':'Ownership unaffected by first correction',chunkMapping:[{priorIds:['keep'],currentIds:['keep'],explanation:'Same ownership concern'},{priorIds:['edit'],currentIds:['edit'],explanation:'Same contract concern'}],retainedCoverage:a.number===2?[{chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'Ownership unchanged'}]:[],carriedFindingIds:(a.number===2?[keep,edit]:[keep]).map(o=>JSON.stringify([o.attempt,o.chunkId,o.findingId])),consistencyChunkIds:['final']};
 const findings=a.number===1&&stage!=='final'?[{id:stage+'-blocker',severity:stage==='keep'?'HIGH':'MED',location:'/body/summary',message:'Synthetic initial concern '+stage,evidenceReferences}]:[];
 const result=chunk?{chunkId:stage,status:findings.length?'changes_requested':'passed',summary:'Synthetic compiled CLI assessment, no hosted model',findings,inspectedReferences:[...units,cp.subject.documentPath,path],limitations:[],advice:[],...(stage==='final'&&a.number>1?{findingDecisions:decisions}:{})}:stage==='impact'?{plan,impact}:plan;
 process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');
});`);chmodSync(bin,0o755);
const evidence={compiled:true,hostedModel:false,installedDaemonTouched:false,isolatedOwner:true,startedAt:new Date().toISOString(),scenarios:[]};
const save=()=>put(evidencePath,evidence),pause=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,label)=>{const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await pause(25);}throw Error('Fixture wait expired: '+label);};
const calls=()=>existsSync(callsPath)?readFileSync(callsPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const checkpoint=()=>JSON.parse(readFileSync(join(project,'.insrc/tmp/design-review/compiled-impact.json'),'utf8'));
let owner,client;
try{
 let ready=false,output='';owner=spawn(process.execPath,[fileURLToPath(new URL('./smoke-design-review-recovery.mjs',import.meta.url)),'owner',socket,project,bin],{stdio:['ignore','pipe','pipe']});
 owner.stdout.on('data',data=>{output+=data.toString();if(output.includes('OWNER_READY'))ready=true;});owner.stderr.on('data',data=>appendFileSync(join(work,'owner.log'),data));
 await until(()=>{if(owner.exitCode!==null)throw Error('Fixture owner exited: '+owner.exitCode);return ready;},'owner ready');
 client=new Client({name:'codex',version:'S3-compiled-smoke'});await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./smoke-design-review.mjs',import.meta.url)),'mcp',socket,project],env:{...process.env,INSRC_MODE:'mcp'},stderr:'pipe'}));
 const call=async(attempt,phase,fields={})=>{const r=await client.callTool({name:'insrc_review_step',arguments:{phase,repo:project,reviewId:'compiled-impact',attempt,...fields}},undefined,{timeout:300000});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);};
 async function complete(attempt,wanted){let view;await until(async()=>{view=await call(attempt,'progress');if(['pending','running'].includes(view.status))return false;assert.equal(view.status,wanted,JSON.stringify(view));return true;},'attempt '+attempt);return view;}
 await call(1,'start',{artifactPath:artifact});await complete(1,'changes_requested');const original=checkpoint().attempts[0];assert.deepEqual(original.report.counts,{HIGH:1,MED:1,LOW:0});
 appendFileSync(md,'\nCorrected contract');await call(2,'start',{artifactPath:artifact});const selective=await complete(2,'changes_requested'),second=checkpoint();
 assert.deepEqual(second.attempts[0],original);assert.equal(selective.totalChunks,2);assert.equal(selective.coverageProgress.retainedChunks,1);assert.deepEqual(second.attempts[1].report.counts,{HIGH:1,MED:0,LOW:0});assert.deepEqual(second.attempts[1].report.chunks.map(r=>r.chunkId),['edit','final']);
 const count=calls().length;await call(2,'start',{artifactPath:artifact});assert.equal(calls().length,count);assert.equal((await call(2,'progress',{includeResult:true})).completedResults[0].chunkId,'edit');
 evidence.scenarios.push({name:'full initial review then selective correction retains coverage and carries blocker',passed:true,checkpoint:second});
 appendFileSync(md,'\nContract update with indirect ownership impact');await call(3,'start',{artifactPath:artifact});const indirect=await complete(3,'passed'),third=checkpoint();assert.equal(indirect.totalChunks,3);assert.equal(indirect.coverageProgress.retainedChunks,0);assert.deepEqual(third.attempts[2].report.counts,{HIGH:0,MED:0,LOW:0});assert.deepEqual(third.attempts[2].impact.indirectChunkIds,['keep']);
 assert.deepEqual(calls().map(c=>c.stage),['planning','keep','edit','final','impact','edit','final','impact','keep','edit','final']);
 evidence.scenarios.push({name:'indirect effect selects unchanged concern and fresh inspection resolves carried finding',passed:true,checkpoint:third});
 evidence.passed=true;evidence.calls=calls();evidence.finishedAt=new Date().toISOString();evidence.elapsedMs=Date.parse(evidence.finishedAt)-Date.parse(evidence.startedAt);save();process.stdout.write(JSON.stringify({passed:true,hostedModel:false,scenarios:evidence.scenarios.map(s=>s.name),evidencePath})+'\n');
}catch(error){evidence.passed=false;evidence.error=error.message;evidence.calls=calls();save();throw error;}
finally{await client?.close();if(owner&&owner.exitCode===null&&owner.signalCode===null){const ended=once(owner,'exit');owner.kill('SIGTERM');await ended;}rmSync(project,{recursive:true,force:true});}
