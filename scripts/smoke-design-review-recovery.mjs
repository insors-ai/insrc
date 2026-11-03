// Compiled S2 qualification. Every owner/socket/project/CLI below is a disposable fixture.
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,appendFileSync,chmodSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { setLogMode } from '../out/shared/logger.js';
setLogMode('mcp');

if(process.argv[2]==='owner'){
 const [socket,project,bin]=process.argv.slice(3);assert.ok(socket&&project&&bin&&bin.startsWith(dirname(socket)+'/'));
 const {IpcServer,directDispatch}=await import('../out/daemon/server.js');
 const {Router}=await import('../out/daemon/threads/router.js');
 const {TargetRegistry}=await import('../out/daemon/threads/registry.js');
 const {createStepCallHandler,stepToolTable}=await import('../out/daemon/steps/host.js');
 const {handleDesignReviewStep}=await import('../out/daemon/steps/design-review-step.js');
 const {designReviewOperation}=await import('../out/daemon/design-review-rpc.js');
 const {DESIGN_REVIEW_PHASES}=await import('../out/workflow/review/design-review/contracts.js');
 const {CliProvider}=await import('../out/agent/providers/cli-provider.js');
 const native=new CliProvider({kind:'codex',binPath:bin}),deps={provider:()=>({provider:native,model:'fake-codex-cli (S2 synthetic)'})};
 const table=stepToolTable({tools:{insrc_review_step:(args,_s,_p,_e,trusted)=>handleDesignReviewStep(args,trusted,deps)}});
 const local=directDispatch(Object.fromEntries(DESIGN_REVIEW_PHASES.map(phase=>[`designReview.${phase}`,(args,trusted)=>designReviewOperation(phase,args,trusted,deps)])),{'step.call':createStepCallHandler(table,{registeredRepos:async()=>new Set([project])})});
 const router=new Router({classOf:()=> 'session',registry:new TargetRegistry(),routed:new Set(['session']),holdMs:50,local});
 const ipc=new IpcServer(router.forward,Date.now,socket);await ipc.listen();process.stdout.write('OWNER_READY\n');
}else{
 const work=mkdtempSync(join(tmpdir(),'insrc-design-recovery-')),project=join(work,'project'),socket=join(work,'daemon.sock'),bin=join(work,'native.mjs');
 const control=join(work,'control.json'),callsPath=join(work,'calls.jsonl'),evidencePath=join(work,'evidence.json'),ownerLog=join(work,'owner.log');
 const put=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,typeof value==='string'?value:JSON.stringify(value));};
 const time='2026-11-03T00:00:00.000Z',hash='1234567890abcdef',artifact=join(project,`.insrc/artifacts/LLD-${hash}-s1.json`);
 const {resolveArtifactMdPath}=await import('../out/workflow/path-scheme.js');
 const md=resolveArtifactMdPath(project,{epicHash:hash,epicCreatedAt:time,story:'s1'},'LLD','standalone','recovery-smoke');
 put(artifact,{meta:{epicHash:hash,storyId:'s1',epicCreatedAt:time,createdAt:time,epicSlug:'recovery-smoke',standalone:true,authoredBy:'controller'},body:{summary:'Synthetic recovery qualification',requirements:[{id:'r1',statement:'Recover without repeating accepted work'}]},citations:[]});
 put(md,`<!-- insrc:artifact LLD-${hash}-s1 -->\n# Synthetic LLD\n\n## Summary\nRecovery fixture only\n`);put(join(project,'.insrc/schema.json'),{version:2});
 const originalDocument=readFileSync(md,'utf8');
 put(bin,String.raw`#!${process.execPath}
import {readFileSync,appendFileSync} from 'node:fs';
let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>prompt+=s);process.stdin.on('end',async()=>{
 const path=prompt.match(/^Checkpoint\/inventory\/accepted feedback: (.*)$/m)[1],cp=JSON.parse(readFileSync(path)),attempt=cp.attempts.at(-1),units=attempt.inventory.units.map(u=>u.id),match=prompt.match(/^Chunk assignment: (.*)$/m),chunk=match?JSON.parse(match[1]):null,stage=chunk?.id??'planning',control=JSON.parse(readFileSync(${JSON.stringify(control)}));
 appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({reviewId:cp.reviewId,attempt:attempt.number,stage,pid:process.pid,ownerPid:control.ownerPid,held:stage==='final'&&control.mode==='hang-final',pointedFeedback:prompt.includes('Previous technical output feedback'),at:Date.now()})+'\n');
 if(stage==='final'&&control.mode==='hang-final'){
  process.stdout.write(JSON.stringify({type:'item.started',item:{type:'command_execution',id:'fixture-held-tool',command:'synthetic long-running read'}})+'\n');
  for(;;){try{process.kill(control.ownerPid,0);}catch{process.exit(0);}await new Promise(r=>setTimeout(r,50));}
 }
 if(stage==='final'&&control.mode==='fail-final'){process.stderr.write('Synthetic CLI execution failure\n');process.exitCode=1;return;}
 const plan={chunks:[{id:'content',title:'Content',selectors:units,concerns:['Fixture'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All fixture units',finalConsistencyChunkId:'final',coverage:units.map(unitId=>({unitId,chunkIds:['content']}))};
 const result=chunk?{chunkId:stage,status:'passed',summary:'Synthetic compiled CLI feedback, no hosted review',findings:[],inspectedReferences:[...units,cp.subject.documentPath,path],limitations:[],advice:[]}:plan;
 process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');
});`);chmodSync(bin,0o755);
 const evidence={compiled:true,hostedModel:false,isolatedOwner:true,installedDaemonTouched:false,project,startedAt:new Date().toISOString(),scenarios:[]};
 const save=()=>put(evidencePath,evidence),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(fn,label)=>{const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await pause(25);}throw new Error(`Fixture wait expired: ${label}`);};
 const calls=()=>existsSync(callsPath)?readFileSync(callsPath,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 const checkpoint=id=>JSON.parse(readFileSync(join(project,'.insrc/tmp/design-review',id+'.json'),'utf8'));
 let owner,client;
 const mode=value=>put(control,{mode:value,ownerPid:owner.pid});
 async function startOwner(value){
  rmSync(socket,{force:true});let ready=false,output='',startupError;
  owner=spawn(process.execPath,[fileURLToPath(import.meta.url),'owner',socket,project,bin],{stdio:['ignore','pipe','pipe']});assert.ok(owner.pid);mode(value);
  owner.on('error',error=>startupError=error);
  owner.stdout.on('data',data=>{appendFileSync(ownerLog,data);output=(output+data.toString()).slice(-128);if(output.includes('OWNER_READY'))ready=true;});owner.stderr.on('data',data=>appendFileSync(ownerLog,data));
  await until(()=>{if(startupError)throw startupError;if(owner.exitCode!==null||owner.signalCode!==null)throw new Error('Fixture owner exited before readiness');return ready;},'owner ready');
  client=new Client({name:'codex',version:'S2-compiled-smoke'});await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./smoke-design-review.mjs',import.meta.url)),'mcp',socket,project],env:{...process.env,INSRC_MODE:'mcp'},stderr:'pipe'}));
 }
 async function stopOwner(){
  await client?.close();client=undefined;
  if(owner&&owner.exitCode===null&&owner.signalCode===null){const ended=once(owner,'exit');owner.kill('SIGTERM');await ended;}
  // Only recorded fake CLI processes with this exact script path are eligible for fixture cleanup.
  for(const row of calls())if(row.held){try{if(readFileSync(`/proc/${row.pid}/cmdline`,'utf8').split('\0').includes(bin))process.kill(row.pid,'SIGTERM');}catch{/* already reaped */}}
 }
 async function call(id,phase,fields={}){
  const response=await client.callTool({name:'insrc_review_step',arguments:{phase,repo:project,reviewId:id,attempt:1,...fields}},undefined,{timeout:300000});if(response.isError)throw new Error(JSON.stringify(response));return JSON.parse(response.content[0].text);
 }
 async function status(id,wanted,attempt=1){let view;await until(async()=>{view=await call(id,'progress',{attempt});if(view.status===wanted)return true;if(!['pending','running'].includes(view.status))throw new Error(`Expected ${wanted}, got ${view.status}: ${JSON.stringify(view.failure)}`);return false;},`${id} ${wanted}`);return view;}
 async function held(id){await until(async()=>{const v=await call(id,'progress');return v.completedChunks===1&&v.activeToolCount===1;},`${id} held final tool`);}
 try{
  await startOwner('hang-final');
  const id='compiled-interruption';const ack=await call(id,'start',{artifactPath:artifact});await held(id);const before=checkpoint(id).attempts[0].completedChunks;
  await stopOwner();await startOwner('pass');assert.equal((await call(id,'progress')).status,'interrupted');
  await call(id,'recover',{actionId:'resume-after-owner-loss',operation:'resume'});await status(id,'passed');
  const recovered=checkpoint(id);assert.deepEqual(recovered.attempts[0].completedChunks.slice(0,1),before);assert.deepEqual(calls().filter(c=>c.reviewId===id).map(c=>c.stage),['planning','content','final','final']);
  evidence.scenarios.push({name:'owner-process interruption and explicit same-attempt recovery',passed:true,ack,checkpoint:recovered});save();
  mode('fail-final');const retryId='compiled-retry';await call(retryId,'start',{artifactPath:artifact});const paused=await status(retryId,'paused');assert.equal(paused.retriesUsed,3);
  assert.equal(calls().filter(c=>c.reviewId===retryId&&c.stage==='final').length,4);
  await assert.rejects(call(retryId,'recover',{actionId:'no-direction',operation:'resume'}),/user direction/);
  mode('pass');const extra={actionId:'approved-one-extra',operation:'resume',userDecision:{action:'retry_failed_unit',reason:'Synthetic fixture user direction',recordedAt:time}};
  await call(retryId,'recover',extra);await status(retryId,'passed');const count=calls().length;await call(retryId,'recover',extra);assert.equal(calls().length,count);
  const retried=checkpoint(retryId),finalSummary=retried.attempts[0].unitSummaries.find(s=>s.unitId==='final');assert.equal(finalSummary.automaticDispatches,4);assert.equal(finalSummary.userDirectedDispatches,1);
  assert.deepEqual(calls().filter(c=>c.reviewId===retryId).map(c=>c.stage),['planning','content','final','final','final','final','final']);
  assert.ok(calls().filter(c=>c.reviewId===retryId&&c.stage==='final').slice(1).every(c=>c.pointedFeedback));
  evidence.scenarios.push({name:'three automatic retries then pause and one directed execution',passed:true,checkpoint:retried});save();
  mode('hang-final');const changedId='compiled-mutation';await call(changedId,'start',{artifactPath:artifact});await held(changedId);appendFileSync(md,'\nChanged while final tool runs');await status(changedId,'invalidated');
  put(md,originalDocument);assert.equal((await call(changedId,'progress')).status,'invalidated');mode('pass');
  let restarted;await until(async()=>{try{restarted=await call(changedId,'recover',{actionId:'approved-full-restart',operation:'restart_full',userDecision:{action:'restart_full',reason:'Synthetic fixture full-restart approval',recordedAt:time}});return true;}catch(error){if(error.message.includes('active execution'))return false;throw error;}},'old fixture execution drained');
  assert.equal(restarted.attempt,2);await status(changedId,'passed',2);const changed=checkpoint(changedId);assert.equal(changed.attempts[0].status,'invalidated');assert.equal(changed.attempts[0].completedChunks.length,1);assert.equal(changed.attempts[1].completedChunks.length,2);
  assert.deepEqual(calls().filter(c=>c.reviewId===changedId&&c.attempt===2).map(c=>c.stage),['planning','content','final']);
  evidence.scenarios.push({name:'tool-time mutation remains invalidated after restoration and requires full fresh attempt',passed:true,checkpoint:changed});
  evidence.passed=true;evidence.calls=calls();evidence.finishedAt=new Date().toISOString();evidence.elapsedMs=Date.parse(evidence.finishedAt)-Date.parse(evidence.startedAt);save();process.stdout.write(JSON.stringify({passed:true,scenarios:evidence.scenarios.map(s=>s.name),evidencePath})+'\n');
 }catch(error){evidence.passed=false;evidence.error=error.message;evidence.calls=calls();save();throw error;}
 finally{await stopOwner();rmSync(project,{recursive:true,force:true});process.stdout.write(JSON.stringify({evidencePath})+'\n');}
}
