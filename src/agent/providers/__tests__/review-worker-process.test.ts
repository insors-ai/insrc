/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { chmod, mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { CliProvider } from '../cli-provider.js';
import { ReviewProcessLeases } from '../../../daemon/threads/review-processes.js';
import { withReviewNativeTransport } from '../../../shared/review-process-bridge.js';
import type { ReviewNativeTransport } from '../../../shared/review-process-bridge.js';
import type { ReviewProcessReservation } from '../../../shared/review-native.js';
import { runInProcessGroup } from '../../../shared/process-group.js';

const schema={type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false};
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const repo=await mkdtemp(join(tmpdir(),'review-cli-bridge-')),events:string[]=[],resolved:string[]=[];
 const path=join(repo,'.insrc/tmp/code-review/fixture.json');let sequence=0;
 const leases=new ReviewProcessLeases({daemonInstance:'cli-test',authorize:()=>{events.push('authorize');},verifyIntent:async r=>{
  const saved=JSON.parse(await readFile(path,'utf8'));assert.equal(saved.operationId,r.operationId);assert.equal(saved.workerIncarnation,r.workerIncarnation);events.push('verified');
 }});
 const owner=leases.register({project:repo,family:'code',reviewId:'fixture'},'incarnation');
 const number=(r:ReviewProcessReservation)=>Number(r.operationId.split(':').at(-1));
 async function durable(value:unknown){await mkdir(dirname(path),{recursive:true});const f=await open(path,'w',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}}
 let binary=process.execPath;
 const transport:ReviewNativeTransport={
  resolveBinary:async command=>{resolved.push(command);return binary;},
  reserve:async command=>{events.push('reserved');return leases.reserve(owner,++sequence,command);},
  saveOpenIntent:async r=>{await durable(r);events.push('saved');return{checkpointPath:path,attempt:1,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance};},
  start:async(r,receipt,consume)=>leases.start(owner,number(r),receipt,async output=>{events.push('output');assert.ok(output.bytes.byteLength<=65536);await consume(output);}).result,
  cancel:r=>leases.cancel(owner,number(r)),
  saveClosedIntent:async()=>{events.push('closed');await durable({closed:true});},
 };
 t.after(async()=>{await leases.close(owner);if(leases.recheck(owner))leases.release(owner);await rm(repo,{recursive:true,force:true});});
 async function cli(kind:'claude'|'codex'){
  binary=join(repo,`${kind}.mjs`);
  const frames=kind==='claude'?[{type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:{ok:true}}]}}]
   :[{type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}},{type:'turn.completed'}];
  await writeFile(binary,'#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.once("end",()=>{process.stdout.write('+JSON.stringify(frames.map(f=>JSON.stringify(f)+'\n').join(''))+');setInterval(()=>{},1000)});');await chmod(binary,0o755);
 }
 return{repo,events,resolved,transport,leases,owner,cli};
}
test('fake native review CLI streams and cancellation use host-owned leases',async t=>{
 const h=await fixture(t);
 for(const kind of ['claude','codex'] as const){
  await h.cli(kind);let candidates=0;
  const value=await withReviewNativeTransport(h.transport,()=>new CliProvider({kind,binPath:`fake-${kind}`,timeoutMs:1}).runReviewSession('test prompt',schema,{mode:'activity',cwd:h.repo,signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,onActivity:()=>{},onCandidate:async()=>{candidates++;return{accepted:true};}}));
  assert.deepEqual(value,{ok:true});assert.equal(candidates,1);
 }
 assert.ok(h.events.indexOf('saved')<h.events.indexOf('verified'));assert.ok(h.events.indexOf('verified')<h.events.indexOf('output'));assert.ok(h.events.includes('closed'));
 const run=(script:string,signal:AbortSignal,onStdoutChunk:(b:Buffer)=>Promise<void>)=>withReviewNativeTransport(h.transport,()=>runInProcessGroup(process.execPath,['-e',script],{mode:'activity',cwd:h.repo,signal,onStdoutChunk}));
 let first!:()=>void;const output=new Promise<void>(r=>{first=r;}),abort=new AbortController();let chunks=0;
 const pending=run("process.stdout.write('first');setInterval(()=>process.stdout.write('later'),50)",abort.signal,async()=>{chunks++;first();});
 await output;abort.abort();assert.equal((await pending).aborted,true);const count=chunks;await new Promise(r=>setTimeout(r,70));assert.equal(chunks,count,'late output cannot be delivered after cancellation');
 await assert.rejects(run("process.stdout.write('bad');setInterval(()=>{},1000)",new AbortController().signal,async()=>{throw Error('observer failed');}),/observer failed/);
 const missing=await withReviewNativeTransport(h.transport,()=>runInProcessGroup(join(h.repo,'missing'),[],{timeoutMs:1000,cwd:h.repo}));assert.ok(missing.spawnError);
 const failing={...h.transport,saveOpenIntent:async()=>{throw Error('save failed');}};
 await assert.rejects(withReviewNativeTransport(failing,()=>runInProcessGroup(process.execPath,['-e',"throw Error('must not spawn')"],{timeoutMs:1000,cwd:h.repo})),/save failed/);
 let started!:()=>void;const live=new Promise<void>(r=>{started=r;});
 const lost=run("process.stdout.write('live');setInterval(()=>{},1000)",new AbortController().signal,async()=>{started();});
 await live;await h.leases.close(h.owner);assert.equal((await lost).aborted,true,'host owner survives loss of the worker consumer');
});
test('review binary lookup cannot spawn synchronously on the worker',async t=>{
 const h=await fixture(t);await h.cli('claude');let syncCalls=0;
 const mock=t.mock.method(childProcess,'execFileSync',()=>{syncCalls++;throw Error('synchronous lookup forbidden');});syncBuiltinESMExports();
 try{
  const value=await withReviewNativeTransport(h.transport,()=>new CliProvider({kind:'claude',binPath:'bare-review-cli'}).runReviewSession('test prompt',schema,{mode:'activity',cwd:h.repo,signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,onActivity:()=>{},onCandidate:async()=>({accepted:true})}));
  assert.deepEqual(value,{ok:true});assert.deepEqual(h.resolved,['bare-review-cli']);assert.equal(syncCalls,0);
 }finally{mock.mock.restore();syncBuiltinESMExports();}
});
