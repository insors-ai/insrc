/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
import { chmod, mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { authorizeReviewNative } from '../../../daemon/review-native-policy.js';
import { CliProvider } from '../cli-provider.js';
import { ReviewProcessLeases } from '../../../daemon/threads/review-processes.js';
import { withReviewNativeTransport } from '../../../shared/review-process-bridge.js';
import type { ReviewNativeTransport } from '../../../shared/review-process-bridge.js';
import type { ReviewProcessReservation } from '../../../shared/review-native.js';
import { runInProcessGroup } from '../../../shared/process-group.js';

const schema={type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false};
async function fixture(t:{after:(fn:()=>Promise<void>)=>void},production=false){
 const repo=await mkdtemp(join(tmpdir(),'review-cli-bridge-')),events:string[]=[],resolved:string[]=[];
 const path=join(repo,'.insrc/tmp/code-review/fixture.json');let sequence=0;
 const leases=new ReviewProcessLeases({daemonInstance:'cli-test',authorize:async(r,c,signal)=>{if(production)await authorizeReviewNative(r.key,c,'daemon',signal,{sourceValidation:'qualified',checkpointPath:path,attempt:1,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance});events.push('authorize');},verifyIntent:async r=>{
  const saved=JSON.parse(await readFile(path,'utf8'));assert.equal(saved.operationId,r.operationId);assert.equal(saved.workerIncarnation,r.workerIncarnation);events.push('verified');
 }});
 const owner=leases.register({project:repo,family:'code',reviewId:'fixture'},'incarnation');
 const number=(r:ReviewProcessReservation)=>Number(r.operationId.split(':').at(-1));
 async function durable(value:unknown){await mkdir(dirname(path),{recursive:true});const f=await open(path,'w',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}}
 let binary=process.execPath;
 const transport:ReviewNativeTransport={
  resolveBinary:async command=>{resolved.push(command);return binary;},
  reserve:async command=>{events.push('reserved');return leases.reserve(owner,++sequence,command);},
  saveOpenIntent:async r=>{await durable(r);events.push('saved');return{sourceValidation:'qualified',checkpointPath:path,attempt:1,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance};},
  start:async(r,receipt,consume)=>leases.start(owner,number(r),receipt,async output=>{events.push('output');assert.ok(output.bytes.byteLength<=65536);await consume(output);}).result,
  waitStarted:async r=>({spawned:(await leases.waitStarted(owner,number(r))).spawned}),
  write:(r,bytes,end)=>leases.write(owner,number(r),bytes,end),
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
 return{repo,events,resolved,transport,leases,owner,cli,setBinary:(path:string)=>{binary=path;}};
}
async function threadFixture(t:{after:(fn:()=>Promise<void>)=>void},h:Awaited<ReturnType<typeof fixture>>,noTransport=false,kind='claude'){
 const worker=new Worker(new URL('./helpers/review-process-worker.mjs',import.meta.url),{workerData:{role:'review',repo:h.repo,noTransport,kind,provider:new URL('../cli-provider.ts',import.meta.url).href,bridge:new URL('../../../shared/review-process-bridge.ts',import.meta.url).href,guard:new URL('../../../shared/review-native-guard.ts',import.meta.url).href}});
 let next=0,parsedThread=0;const acknowledgments=new Map<number,{resolve:()=>void;reject:(error:Error)=>void}>();
 let active!:()=>void;const activity=new Promise<void>(r=>{active=r;});
 const done=new Promise<{value?:unknown;error?:string;threadId:number}>((resolve,reject)=>{
  worker.once('error',reject);
  worker.on('message',async message=>{
   if(message.kind==='parsed')parsedThread=message.threadId;
   if(message.kind==='active')active();
   if(message.kind==='done')resolve(message);
   if(message.kind==='ack'){const p=acknowledgments.get(message.id);acknowledgments.delete(message.id);if(message.error)p?.reject(Error(message.error));else p?.resolve();}
   if(message.kind==='request'){
    try{
     let value:unknown;
     if(message.op==='start')value=await h.transport.start(message.args.r,message.args.receipt,output=>new Promise<void>((resolve,reject)=>{const id=++next;acknowledgments.set(id,{resolve,reject});worker.postMessage({kind:'output',id,output});}));
     else if(message.op==='write')value=await h.transport.write(message.args.r,message.args.bytes,message.args.end);
     else{const method=message.op as 'resolveBinary';value=await h.transport[method](message.args);}
     worker.postMessage({kind:'reply',id:message.id,value});
    }catch(error){worker.postMessage({kind:'reply',id:message.id,error:String(error)});}
   }
  });
 });
 const closed=new Promise<Awaited<ReturnType<typeof h.leases.close>>>(resolve=>worker.once('exit',()=>{
  for(const p of acknowledgments.values())p.reject(Error('worker ended'));acknowledgments.clear();
  void h.leases.close(h.owner).then(resolve);
 }));
 t.after(async()=>{await worker.terminate();await closed;});
 return{worker,done,closed,activity,parsedThread:()=>parsedThread};
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
 const threaded=await fixture(t);await threaded.cli('claude');
 const real=await threadFixture(t,threaded);const complete=await real.done;
 assert.deepEqual(complete.value,{ok:true});assert.ok(real.parsedThread()>0,'CLI response parsing happens on the real worker thread');await real.closed;
 const dying=await fixture(t);await dying.cli('claude');
 await writeFile(join(dying.repo,'claude.mjs'),'#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.once("end",()=>{process.stdout.write(JSON.stringify({type:"stream_event",event:{type:"content_block_delta",delta:{type:"text_delta",text:"working"}}})+"\\n");setInterval(()=>{},1000)});');
 const crash=await threadFixture(t,dying);await crash.activity;await crash.worker.terminate();
 assert.ok((await crash.closed).every(result=>result.disposal.state==='confirmed'),'terminating the real worker leaves cleanup with the surviving host');
});
test('review binary lookup cannot spawn synchronously on the worker',async t=>{
 const h=await fixture(t);await h.cli('claude');let syncCalls=0;
 const mock=t.mock.method(childProcess,'execFileSync',()=>{syncCalls++;throw Error('synchronous lookup forbidden');});syncBuiltinESMExports();
 try{
  const value=await withReviewNativeTransport(h.transport,()=>new CliProvider({kind:'claude',binPath:'bare-review-cli'}).runReviewSession('test prompt',schema,{mode:'activity',cwd:h.repo,signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,onActivity:()=>{},onCandidate:async()=>({accepted:true})}));
  assert.deepEqual(value,{ok:true});assert.deepEqual(h.resolved,['bare-review-cli']);assert.equal(syncCalls,0);
 }finally{mock.mock.restore();syncBuiltinESMExports();}
 const guarded=await fixture(t);await guarded.cli('claude');
 const unbound=await threadFixture(t,guarded,true);
 assert.match((await unbound.done).error!,/native transport is not installed/);assert.equal(guarded.events.length,0,'an unbound review worker cannot fall back to local spawning');await unbound.closed;
});

test('bound Vibe review worker starts through production native authorization and host leases',async t=>{
 const h=await fixture(t,true),binary=join(h.repo,'vibe-app-server'),savedPath=process.env['PATH'];
 const source=`#!${process.execPath}
const {createInterface}=require('node:readline');
const model={name:'mistral-vibe-cli-latest',alias:'mistral-medium-3.5',thinking:'high',thinkingLevels:['off','high']};
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\\n');
const event=(method,params)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method,params:{sessionId:'vibe-test',...params}})+'\\n');
createInterface({input:process.stdin}).on('line',line=>{const {method,id,params}=JSON.parse(line);
if(method==='initialize')reply(id,{});
else if(method==='session/start')reply(id,{state:{session:{id:'vibe-test'}}});
else if(method==='runtime/read')reply(id,{runtime:{config:{activeModel:model,models:[model]},tools:[{name:'read_file'}],bypassToolPermissions:false}});
else if(method==='config/model/write')reply(id,{status:'applied'});
else if(method==='turn/start'){const turn={id:'turn-1',sessionId:'vibe-test',status:'in_progress'};reply(id,{turn});event('turn/started',{turn});event('history/entryAdded',{turnId:turn.id,entry:{id:'m1',type:'message',role:'assistant',content:[{type:'text',text:'{"ok":true}'}]}});event('turn/completed',{turn:{...turn,status:'completed'}});}
});setInterval(()=>{},1000);`;
 await writeFile(binary,source);await chmod(binary,0o755);h.setBinary(binary);process.env['PATH']=h.repo+':'+savedPath;
 t.after(async()=>{if(savedPath===undefined)delete process.env['PATH'];else process.env['PATH']=savedPath;});
 const w=await threadFixture(t,h,false,'vibe');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const out=await Promise.race([w.done,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Vibe worker stalled: '+JSON.stringify(h.events))),10000);})]).finally(()=>clearTimeout(timer));
 await w.closed;
 assert.deepEqual(out.value,{ok:true},out.error);assert.ok(out.threadId>0);assert.equal(w.parsedThread(),out.threadId);
 assert.ok(h.events.indexOf('saved')<h.events.indexOf('authorize'));assert.ok(h.events.includes('closed'));
});
