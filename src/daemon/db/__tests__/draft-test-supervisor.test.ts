import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {RequestLifetime} from '../../request-context.js';
import {DraftTestSupervisor,probeWorkerEnvironment} from '../draft-test.js';
const request=(root:string)=>({requestId:randomUUID(),draftRevision:1,key:{repoRoot:root,scope:'saved',id:'fixture'},publicPatch:{},credentials:{}});
const context=(lifetime:RequestLifetime,id=randomUUID())=>({connectionIdentity:id,daemonEpoch:'epoch',signal:lifetime.signal,registerDrain:lifetime.registerDrain});
test('CM-S2-B1: supervisor bounds preparation capacity cancellation and late spawn with true drain',async()=>{
 let spawns=0;const supervisor=new DraftTestSupervisor((entry,options)=>{spawns++;return fork(entry,[],options);}),lifetimes:RequestLifetime[]=[],pending:Promise<unknown>[]=[],releases:(()=>void)[]=[];
 let preparation=0;
 for(let i=0;i<4;i++){
  const lifetime=new RequestLifetime(),ctx=context(lifetime),input=request('/tmp');lifetimes.push(lifetime);
  let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});releases.push(release);
  pending.push(supervisor.run(input,ctx,async()=>{preparation++;await wait;return {config:{id:'late',kind:'postgres',url:'postgres://localhost:1/fixture'},credentialActions:{}};}));
  assert.throws(()=>supervisor.run(request('/tmp'),ctx,async()=>{throw new Error();}),/busy/);
  assert.equal(supervisor.cancel({requestId:input.requestId},{...ctx,daemonEpoch:'other'}).canceled,false);
  assert.equal(supervisor.cancel({requestId:input.requestId},ctx).canceled,true);
  assert.equal(supervisor.cancel({requestId:input.requestId},ctx).canceled,false);
 }
 assert.equal(supervisor.activeCount,4);assert.equal(preparation,4);
 assert.throws(()=>supervisor.run(request('/tmp'),context(new RequestLifetime()),async()=>{throw new Error();}),/busy/);
 for(const lifetime of lifetimes)lifetime.complete();
 for(const result of await Promise.all(pending))assert.equal((result as {status:string}).status,'canceled');
 assert.equal(supervisor.activeCount,4);for(const release of releases)release();await Promise.all(lifetimes.map(l=>l.drained));assert.equal(supervisor.activeCount,0);assert.equal(spawns,0);
 await supervisor.shutdown();
});
test('CM-S2-B1: real worker cleanup precedes success and ten second response keeps stalled preparation reserved',async()=>{
 const supervisor=new DraftTestSupervisor(),root=await mkdtemp(join(tmpdir(),'cm-supervisor-'));
 try{
  const path=join(root,'data.csv');await writeFile(path,'value\nfirst\n');
  const lifetime=new RequestLifetime();const result=await supervisor.run(request(root),context(lifetime),async()=>({config:{id:'fixture',kind:'csv',path},credentialActions:{}}));
  assert.equal(result.status,'reachable');lifetime.complete();await lifetime.drained;assert.equal(supervisor.activeCount,0);
  let release!:()=>void;const wait=new Promise<void>(r=>{release=r;}),stalled=new RequestLifetime();const began=performance.now();
  const timeout=await supervisor.run(request(root),context(stalled),async signal=>{await wait;signal.throwIfAborted();throw new Error();});
  assert.equal(timeout.status,'timeout');assert.ok(performance.now()-began>=9900);assert.equal(supervisor.activeCount,1);stalled.complete();release();await stalled.drained;assert.equal(supervisor.activeCount,0);
  assert.equal(probeWorkerEnvironment()['AWS_SECRET_ACCESS_KEY'],undefined);assert.equal(probeWorkerEnvironment()['NODE_OPTIONS'],undefined);
 }finally{await supervisor.shutdown();await rm(root,{recursive:true,force:true});}
});
test('CM-S2-B1: disconnect cancels a real stalled worker and waits owned child reaping',async()=>{
 const sockets=new Set<import('node:net').Socket>(),server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');
 const supervisor=new DraftTestSupervisor(),lifetime=new RequestLifetime();
 try {
  const connected=new Promise<void>(r=>server.once('connection',()=>r()));
  const pending=supervisor.run(request('/tmp'),context(lifetime),async()=>({config:{id:'fixture',kind:'postgres',url:'postgres://fixture:private-canary@127.0.0.1:'+address.port+'/fixture'},credentialActions:{}}));
  await connected;lifetime.abort();assert.equal((await pending).status,'canceled');lifetime.complete();await lifetime.drained;assert.equal(supervisor.activeCount,0);
 }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>server.close(()=>r()));await supervisor.shutdown();}
});

test('CM-S2-C2: shutdown stops admission immediately and retains uncancelable preparation until it drains',async()=>{
 const supervisor=new DraftTestSupervisor(),lifetime=new RequestLifetime();let release!:()=>void;
 const wait=new Promise<void>(r=>{release=r;});const pending=supervisor.run(request('/tmp'),context(lifetime),async signal=>{await wait;signal.throwIfAborted();throw new Error();});
 let stopped=false;const shutdown=supervisor.shutdown().then(()=>{stopped=true;});assert.equal((await pending).status,'canceled');
 assert.throws(()=>supervisor.run(request('/tmp'),context(new RequestLifetime()),async()=>{throw new Error();}),/busy/);
 await Promise.resolve();assert.equal(stopped,false);assert.equal(supervisor.activeCount,1);lifetime.complete();release();await lifetime.drained;await shutdown;assert.equal(supervisor.activeCount,0);
});

test('CM-S2-B1: actual owned children enforce init and close deadlines and SIGKILL after 250ms grace',async()=>{
 for(const mode of ['hang','reply-hang']){
  let child:ReturnType<typeof fork>|undefined,spawned!:()=>void;const started=new Promise<void>(r=>{spawned=r;});let messageSeen!:()=>void;const message=new Promise<void>(r=>{messageSeen=r;});
  const supervisor=new DraftTestSupervisor((_entry,options)=>{child=fork(fileURLToPath(new URL('./fixtures/probe-lifecycle-child.ts',import.meta.url)),[],{...options,execArgv:['--import','tsx'],env:{...options.env,CM_PROBE_FIXTURE_MODE:mode}});child.once('spawn',spawned);if(mode==='reply-hang')child.once('message',messageSeen);return child;});
  const lifetime=new RequestLifetime(),began=performance.now();let settled=false;
  const pending=supervisor.run(request('/tmp'),context(lifetime),async()=>({config:{id:'fixture',kind:'postgres',url:'postgres://localhost:1/fixture'},credentialActions:{}})).then(result=>{settled=true;return result;});
  await started;if(mode==='reply-hang'){await message;assert.equal(settled,false,'reachable IPC alone is not success before process exit');}
  const result=await pending,responded=performance.now();assert.equal(result.status,'timeout');assert.ok(responded-began>=9900);assert.equal(supervisor.activeCount,1);assert.equal(child!.signalCode,null);
  lifetime.complete();await lifetime.drained;assert.equal(child!.signalCode,'SIGKILL');assert.ok(performance.now()-responded>=230,'grace is held before force-kill');assert.ok(performance.now()-responded<2000);assert.equal(supervisor.activeCount,0);assert.equal(getEventListeners(lifetime.signal,'abort').length,0);assert.equal(child!.listenerCount('message'),0);assert.equal(child!.listenerCount('error'),0);await supervisor.shutdown();
 }
});
test('CM-S2-B1: a late actual worker success cannot overwrite cancellation while exit still drains',async()=>{
 const lifetime=new RequestLifetime();let child:ReturnType<typeof fork>|undefined,sawResult=false;
 const supervisor=new DraftTestSupervisor((_entry,options)=>{
  child=fork(fileURLToPath(new URL('./fixtures/probe-lifecycle-child.ts',import.meta.url)),[],{...options,execArgv:['--import','tsx'],env:{...options.env,CM_PROBE_FIXTURE_MODE:'late'}});
  // Cancel synchronously when the real result arrives, before the parent's
  // result listener. The later valid success and exit must not win this race.
  child.once('message',()=>{sawResult=true;lifetime.abort();});return child;
 });
 const pending=supervisor.run(request('/tmp'),context(lifetime),async()=>({config:{id:'fixture',kind:'postgres',url:'postgres://localhost:1/fixture'},credentialActions:{}}));
 assert.equal((await pending).status,'canceled');assert.equal(sawResult,true);lifetime.complete();await lifetime.drained;assert.equal(supervisor.activeCount,0);assert.equal(child!.signalCode,null);assert.equal((await pending).status,'canceled');await supervisor.shutdown();
});
