/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { setImmediate as turn } from 'node:timers/promises';
import { ReviewProcessLeases } from '../review-processes.js';
import type { ReviewProcessDeps, ReviewProcessReservation, ReviewIntentReceipt, ReviewNativeCommand, ReviewProcessOwner } from '../review-processes.js';
import { spawnManaged } from '../../tools/shell-helper.js';
import { runWithToolSignal } from '../../tools/tool-signal.js';
import { observeOwnedProcessDisposal } from '../../../shared/process-group.js';

async function fixture(t: { after: (fn:()=>Promise<void>)=>void }, overrides: Partial<ReviewProcessDeps> = {}) {
 const repo=await mkdtemp(join(tmpdir(),'review-processes-')),owners:ReviewProcessOwner[]=[],events:string[]=[];
 let launches=0;
 const leases=new ReviewProcessLeases({daemonInstance:'daemon-fixture',
  authorize:(reservation,command)=>{events.push('authorize');assert.equal(reservation.key.project,repo);assert.equal(command.cwd,repo);},
  verifyIntent:async(reservation,receipt)=>{
   events.push('verify');const saved=JSON.parse(await readFile(receipt.checkpointPath,'utf8'));
   assert.equal(saved.attempt,receipt.attempt);assert.equal(saved.resourceGuard.daemonInstance,reservation.daemonInstance);
   assert.deepEqual(saved.resourceGuard.openLeases.find((l:{operationId:string})=>l.operationId===reservation.operationId),{
    operationId:reservation.operationId,workerIncarnation:reservation.workerIncarnation,kind:reservation.kind,openedAt:reservation.openedAt,
   });
  },
  launch:(command,signal)=>{launches++;events.push('spawn');return spawnManaged(command.command,command.args,{cwd:command.cwd,env:command.env,stdio:['pipe','pipe','pipe'],timeoutMs:command.timeoutMs,signal});},
  ...overrides,
 });
 const owner=(id='review-1',family:'code'|'design'='code')=>{const value=leases.register({project:repo,family,reviewId:id},`worker-${id}`);owners.push(value);return value;};
 const command=(source:string):ReviewNativeCommand=>({kind:'cli',command:process.execPath,args:['-e',source],cwd:repo,timeoutMs:2000});
 const intent=async(reservation:ReviewProcessReservation):Promise<ReviewIntentReceipt>=>{
  const path=join(repo,'.insrc/tmp',reservation.key.family==='code'?'code-review':'design-review',`${reservation.key.reviewId}.json`);
  await mkdir(dirname(path),{recursive:true});const file=await open(path,'w',0o600);
  try{await file.writeFile(JSON.stringify({attempt:1,resourceGuard:{daemonInstance:reservation.daemonInstance,openLeases:[{
   operationId:reservation.operationId,workerIncarnation:reservation.workerIncarnation,kind:reservation.kind,openedAt:reservation.openedAt,
  }]}}));await file.sync();}finally{await file.close();}
  const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
  events.push('durable');return{checkpointPath:path,attempt:1,operationId:reservation.operationId,workerIncarnation:reservation.workerIncarnation,daemonInstance:reservation.daemonInstance};
 };
 t.after(async()=>{for(const o of owners)try{await leases.close(o);if(leases.recheck(o))leases.release(o);}catch(error){assert.match(String(error),/unregistered_owner/);}await rm(repo,{recursive:true,force:true});});
 return{repo,leases,owner,command,intent,events,get launches(){return launches;}};
}

test('host leases precede spawn and enforce owner-bound replay and disposal',async t=>{
 const f=await fixture(t),owner=f.owner(),command=f.command("process.stdout.write('hello');process.stderr.write('diagnostic')");
 const reservation=f.leases.reserve(owner,1,command);
 assert.equal(f.launches,0,'reservation creates no native process');
 assert.strictEqual(f.leases.reserve(owner,1,command),reservation);
 assert.throws(()=>f.leases.reserve(owner,1,{...command,args:['-e','different']}),/conflicting_operation_replay/);
 assert.throws(()=>f.leases.reserve({...owner},1,command),/unregistered_owner/);
 const receipt=await f.intent(reservation),output:{stream:string;bytes:Uint8Array;sequence:number}[]=[];
 const run=f.leases.start(owner,1,receipt,async chunk=>{assert.ok(chunk.bytes.byteLength<=65536);output.push(chunk);});
 assert.strictEqual(f.leases.start(owner,1,{...receipt},async()=>{}),run);
 assert.throws(()=>f.leases.start(owner,1,{...receipt,attempt:2},async()=>{}),/conflicting_intent_replay/);
 assert.equal((await run.started).spawned,true);
 const result=await run.result;
 assert.equal(result.code,0);assert.deepEqual(result.disposal,{state:'confirmed',reason:'closed'});
 assert.deepEqual(f.events,['durable','authorize','verify','spawn']);assert.equal(f.launches,1);
 assert.equal(Buffer.concat(output.filter(c=>c.stream==='stdout').map(c=>Buffer.from(c.bytes))).toString(),'hello');
 assert.equal(Buffer.concat(output.filter(c=>c.stream==='stderr').map(c=>Buffer.from(c.bytes))).toString(),'diagnostic');
 assert.deepEqual(output.map(c=>c.sequence),output.map((_,i)=>i+1));
 assert.strictEqual(f.leases.start(owner,1,receipt,async()=>{}).result,run.result,'terminal replay cannot start another command');
 await f.leases.close(owner);assert.throws(()=>f.leases.register(owner.key,'replacement'),/fenced/);
 f.leases.release(owner);

 const missing=f.owner('missing'),r=f.leases.reserve(missing,1,f.command('process.exit(0)'));
 const forged={checkpointPath:join(f.repo,'.insrc/tmp/code-review/missing.json'),attempt:1,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance};
 const rejected=await f.leases.start(missing,1,forged,async()=>{}).result;
 assert.equal(rejected.error!.code,'unverified_open_intent');assert.deepEqual(rejected.disposal,{state:'confirmed',reason:'not_started'});assert.equal(f.launches,1);

 const denied=await fixture(t,{authorize:()=>{throw Error('Permission denied');}}),deniedOwner=denied.owner();
 const deniedReservation=denied.leases.reserve(deniedOwner,1,denied.command('process.exit(0)'));
 const deniedResult=await denied.leases.start(deniedOwner,1,await denied.intent(deniedReservation),async()=>{}).result;
 assert.equal(deniedResult.error!.code,'authorization_denied');assert.equal(denied.launches,0);

 const isolated=f.owner('ambient'),ambient=new AbortController(),r2=f.leases.reserve(isolated,1,f.command("setTimeout(()=>process.stdout.write('owned'),20)"));
 const saved=await f.intent(r2);
 const independent=runWithToolSignal(ambient.signal,()=>f.leases.start(isolated,1,saved,async()=>{}));ambient.abort();
 assert.equal((await independent.result).aborted,false,'chat/tool cancellation must not replace the host-owned signal');

 const inputOwner=f.owner('binary-input'),input=new Uint8Array([0,128,255]);
 const stdin=f.leases.reserve(inputOwner,1,{...f.command("process.stdin.on('data',b=>process.stdout.write(b))"),stdin:input});input.fill(9);
 const echoed:Buffer[]=[];
 const binary=await f.leases.start(inputOwner,1,await f.intent(stdin),async chunk=>{if(chunk.stream==='stdout')echoed.push(Buffer.from(chunk.bytes));}).result;
 assert.equal(binary.code,0);assert.deepEqual(Buffer.concat(echoed),Buffer.from([0,128,255]),'caller mutation cannot replace pinned stdin');
 const writableOwner=f.owner('stream-input'),wr=f.leases.reserve(writableOwner,1,{...f.command("process.stdin.pipe(process.stdout)"),keepStdinOpen:true});
 const writes:Buffer[]=[];
 const writable=f.leases.start(writableOwner,1,await f.intent(wr),async chunk=>{if(chunk.stream==='stdout')writes.push(Buffer.from(chunk.bytes));});
 await writable.started;await f.leases.write(writableOwner,1,new Uint8Array([17,18,19]),true);
 assert.equal((await writable.result).code,0);assert.deepEqual(Buffer.concat(writes),Buffer.from([17,18,19]));
});

test('worker loss and unknown child cleanup fence only the owning review',async t=>{
 const before=await fixture(t),o=before.owner(),r=before.leases.reserve(o,1,before.command('process.exit(0)'));
 const closed=await before.leases.close(o);assert.deepEqual(closed[0]!.disposal,{state:'confirmed',reason:'not_started'});
 const late=before.leases.start(o,1,await before.intent(r),async()=>{});
 assert.equal((await late.result).aborted,true);assert.equal(before.launches,0);

 let checked!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>{checked=r;}),held=new Promise<void>(r=>{release=r;});
 const during=await fixture(t,{verifyIntent:async()=>{checked();await held;}}),duringOwner=during.owner();
 const reservation=during.leases.reserve(duringOwner,1,during.command('process.exit(0)'));
 const validating=during.leases.start(duringOwner,1,await during.intent(reservation),async()=>{});await entered;
 await during.leases.close(duringOwner);assert.equal((await validating.started).spawned,false);
 during.leases.release(duringOwner);during.leases.register(duringOwner.key,'new-incarnation');release();await turn();
 assert.equal(during.launches,0,'late intent acknowledgment cannot launch a closed incarnation');

 let real!:Awaited<ReturnType<typeof fixture>>,realOwner!:ReviewProcessOwner;
 real=await fixture(t,{launch:(command,signal)=>{
  const child=spawnManaged(command.command,command.args,{cwd:command.cwd,stdio:['pipe','pipe','pipe'],signal});
  void real.leases.close(realOwner);return child;
 }});realOwner=real.owner('spawn-race');
 const pending=real.leases.reserve(realOwner,1,real.command('setInterval(()=>{},1000)'));
 const raced=await real.leases.start(realOwner,1,await real.intent(pending),async()=>{}).result;
 assert.equal(raced.aborted,true);assert.equal(raced.disposal.state,'confirmed','host cancellation survives worker loss during native registration');

 const streaming=await fixture(t),streamOwner=streaming.owner('stream-loss'),sr=streaming.leases.reserve(streamOwner,1,streaming.command('process.stdout.write(Buffer.alloc(200000));setInterval(()=>{},1000)'));
 const lost=await streaming.leases.start(streamOwner,1,await streaming.intent(sr),async()=>{throw Error('worker consumer disconnected');}).result;
 assert.equal(lost.error!.code,'output_consumer_lost');assert.equal(lost.disposal.state,'confirmed');
 const blockedOwner=streaming.owner('blocked-consumer'),br=streaming.leases.reserve(blockedOwner,1,streaming.command('process.stdout.write(Buffer.alloc(200000));setInterval(()=>{},1000)'));
 let consumed!:()=>void;const consuming=new Promise<void>(r=>{consumed=r;});
 const blocked=streaming.leases.start(blockedOwner,1,await streaming.intent(br),async chunk=>{assert.ok(chunk.bytes.byteLength<=65536);consumed();await new Promise<void>(()=>{});});
 await consuming;await streaming.leases.close(blockedOwner);assert.equal((await blocked.result).disposal.state,'confirmed','worker loss rejects outstanding output acknowledgments');

 // No native process has this synthetic PID. Intercept its signal/probe only;
 // all real processes used by other reviews retain their normal lifecycle.
 const fakePid=2_000_000_000,kill=process.kill.bind(process);let gone=false;
 t.mock.method(process,'kill',(pid:number,signal?:number|NodeJS.Signals)=>{
  if(pid===-fakePid)throw Object.assign(Error('synthetic group state'),{code:gone?'ESRCH':'EPERM'});
  return kill(pid,signal);
 });
 const fake=new ChildProcess();Object.defineProperty(fake,'pid',{value:fakePid});
 Object.defineProperty(fake,'stdout',{value:new PassThrough()});
 Object.defineProperty(fake,'stderr',{value:new PassThrough()});
 const inspect=observeOwnedProcessDisposal(fake);
 const unknown=await fixture(t,{launch:(command,signal)=>command.args[1]==='unused fixture'
  ?{spawned:true,child:fake,settled:Promise.resolve({code:null,signal:null,timedOut:true,aborted:false}),disposal:inspect}
  :spawnManaged(command.command,command.args,{cwd:command.cwd,stdio:['pipe','pipe','pipe'],signal})});
 const unknownOwner=unknown.owner('uncertain'),ur=unknown.leases.reserve(unknownOwner,1,unknown.command('unused fixture'));
 const uncertain=await unknown.leases.start(unknownOwner,1,await unknown.intent(ur),async()=>{}).result;
 assert.equal(uncertain.timedOut,true);assert.equal(uncertain.disposal.state,'unknown','settlement timeout is not child close');
 assert.equal(fake.stdout!.destroyed,true,'unclosed output pipes cannot hold an unknown outcome indefinitely');
 fake.emit('exit',null,'SIGKILL');fake.emit('close',null,'SIGKILL');
 assert.equal(unknown.leases.recheck(unknownOwner),false,'permission errors are not proof of group disposal');
 assert.equal(unknown.leases.isFenced(unknownOwner.key),true);assert.throws(()=>unknown.leases.register(unknownOwner.key,'replacement'),/fenced/);
 const other=unknown.owner('other','design'),otherReservation=unknown.leases.reserve(other,1,unknown.command("process.stdout.write('unrelated')"));
 const otherResult=await unknown.leases.start(other,1,await unknown.intent(otherReservation),async()=>{}).result;
 assert.equal(otherResult.code,0);assert.equal(otherResult.aborted,false,'another review uses the SAME service while the first is fenced');
 assert.equal(unknown.leases.isFenced(other.key),false);assert.ok(otherReservation.operationId);
 gone=true;assert.equal(unknown.leases.recheck(unknownOwner),true);assert.equal(uncertain.disposal.state,'unknown','new disposal proof does not rewrite a returned outcome');
 unknown.leases.release(unknownOwner);unknown.leases.register(unknownOwner.key,'replacement');
});
