import test from 'node:test';
import assert from 'node:assert/strict';
import { fork,spawn } from 'node:child_process';
import { writeFile,readFile,chmod,mkdir,rm,readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { clearanceFixture,workerRpc,until,pause } from './helpers/review-clearance-fixture.js';
import { inspectReviewResources,requireClosedReviewResources } from '../../../workflow/review/resource-recovery.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import { startReviewWorkerBootstrap } from '../review-worker-bootstrap.js';
import type { StartedReviewWorker } from '../review-worker-bootstrap.js';
import { fixture as publicationFixture } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { saveCheckpoint,checkpointPath } from '../../../workflow/code-review/task-review/checkpoint.js';
import { readFileSync } from 'node:fs';
import { designFixture } from '../../../workflow/review/design-review/__tests__/fixtures.js';
import { hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { LocalPeer } from './helpers/review-clearance-fixture.js';
import { execFileSync } from 'node:child_process';

test('crash-boundary owner-loss and cleanup races retain targeted lifecycle guarantees',async t=>{
 const code=await publicationFixture();let cleanDesign=()=>{};const design=designFixture({after:fn=>{cleanDesign=fn;}});
 await writeFile(join(design.repo,'.insrc/schema.json'),JSON.stringify({version:2}));
 const git=(...args:string[])=>execFileSync('git',args,{cwd:design.repo,encoding:'utf8'}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-qm','Design fixture');
 const bin=join(code.repo,'native-bin');await mkdir(bin);
 // This is a local executable fixture, never a model. It checks that actual
 // production transport persisted an open intent before the OS spawned it.
 const executable=`#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{
 const p=JSON.parse(input),cp=JSON.parse(fs.readFileSync(p.checkpointPath,'utf8')),a=cp.attempts.at(-1);
 if(a.phase==='admission'||!a.resourceGuard?.openLeases.length)process.exit(91);
 fs.appendFileSync(path.join(process.cwd(),'native-spawns.jsonl'),JSON.stringify({pid:process.pid,reviewId:p.reviewId,leases:a.resourceGuard.openLeases,qualified:true,args:process.argv.slice(2)})+'\\n');
 process.stdout.write(JSON.stringify({type:'system',subtype:'init',session_id:'fixture-'+process.pid})+'\\n');
 if(!fs.existsSync(path.join(process.cwd(),'hold-'+p.reviewId))){
  process.stdout.write(JSON.stringify({type:'system',subtype:'fixture-padding',padding:'x'.repeat(200000)})+'\\n');
  process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:JSON.parse(fs.readFileSync(p.reply,'utf8'))}]}})+'\\n');
 }
 setInterval(()=>{},1000);
});`;
 await writeFile(join(bin,'claude'),executable);await chmod(join(bin,'claude'),0o755);
 const config=join(code.repo,'production-daemon.json'),socket=join(code.repo,'native.sock');
 await writeFile(config,JSON.stringify({repos:[code.repo,design.repo],socket,bin,results:{[code.repo]:code.result},git:{[design.repo]:{commit:git('rev-parse','HEAD'),path:design.json.slice(design.repo.length+1)}}}));
 let daemon:ReturnType<typeof fork>|undefined,diagnostic='';const peers:LocalPeer[]=[],survivors=new Map<number,string>();
 const stop=async(crash=false)=>{if(!daemon||daemon.exitCode!==null||daemon.signalCode!==null)return;const exit=once(daemon,'exit');if(crash)daemon.kill('SIGKILL');else{for(const p of peers)p.close();daemon.send('stop');}await exit;};
 t.after(async()=>{for(const p of peers)p.close();await stop(true);for(const [pid,repo] of survivors){try{if(await readlink(`/proc/${pid}/cwd`)===repo)process.kill(-pid,'SIGKILL');}catch{}}cleanDesign();code.cleanup();});
 const start=async()=>{
  diagnostic='';daemon=fork(new URL('./helpers/review-production-daemon.ts',import.meta.url),[config],{execArgv:['--import','tsx'],env:{...process.env,INSRC_TEST_HOOKS:'1'},stdio:['ignore','ignore','pipe','ipc']});
  daemon.stderr!.on('data',s=>{diagnostic=(diagnostic+String(s)).slice(-8000);});
  await Promise.race([once(daemon,'message'),once(daemon,'exit').then(()=>{throw Error(diagnostic);}),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Fixture daemon readiness: '+diagnostic)),15000).unref())]);
  const peer=await LocalPeer.connect(socket);peers.push(peer);return peer;
 };
 const spawns=async(repo:string)=>{try{return(await readFile(join(repo,'native-spawns.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s) as {pid:number;reviewId:string;qualified:boolean;leases:Array<{operationId:string}>});}catch{return[];}};
 let peer=await start();
 // Unrelated live process is deliberately outside every review lease. Every
 // targeted worker/daemon disposal and cleanup must leave it untouched.
 const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)','review-unrelated-sentinel'],{cwd:code.repo,stdio:'ignore'});
 t.after(()=>{sentinel.kill('SIGKILL');});
 for(const family of ['code','design'] as const){
  const repo=family==='code'?code.repo:design.repo,method=family==='code'?'taskReview':'designReview';
  const base={repo,attempt:1,...(family==='code'?{epicHash:hash}:{})};
  const submitted=family==='code'?{packet:code.packet}:{artifactPath:design.json};
  for(const boundary of ['reserve','save']){
   const request={...base,...submitted,reviewId:`boundary-${boundary}-${family}`},key={project:repo,family,reviewId:request.reviewId};
   const count=(await spawns(repo)).length;await writeFile(join(repo,'hold-'+request.reviewId),'fixture boundary barrier');
   await peer.call(method+'.start',request);
   await until(async()=>readFile(join(repo,'stage-'+request.reviewId),'utf8').then(()=>true,()=>false));
   await assert.rejects(peer.call('fixture.bypass',{reviewId:request.reviewId}),/transport is not installed/);
   await peer.call('fixture.terminate',{reviewId:request.reviewId});
   assert.equal((await spawns(repo)).length,count,'worker death before spawn never starts a native child');
   const recovery={...base,reviewId:request.reviewId,...(family==='code'?{operation:'resume'}:{phase:'recover',operation:'resume',actionId:'boundary-resume'})};
   if(boundary==='save'){
    const route=method+(family==='code'?'.start':'.recover');assert.equal((await peer.call(route,recovery)).status,'resource_recovery_required');
    peer.subscribe();await pause();const pending=peer.call(route,{...recovery,resourceRecovery:{reason:'Verified fixture operation saved intent but never spawned'}}),approval=await peer.request();
    await peer.call('approval.answer',{requestId:approval.requestId,decision:'approve'});assert.equal((await pending).status,'cleared');
   }
   await requireClosedReviewResources(key);process.kill(sentinel.pid!,0);
  }
  const denied={...base,...submitted,reviewId:`denied-${family}`};
  const before=(await spawns(repo)).length;
  await peer.call(method+'.start',denied);
  await until(async()=> ['failed','incomplete','paused'].includes((await peer.call(method+'.progress',denied)).status));
  assert.equal((await spawns(repo)).length,before,'concrete host readonly policy refuses before any native CLI spawn');
  await requireClosedReviewResources({project:repo,family,reviewId:denied.reviewId});
  await peer.call('fixture.terminate',{reviewId:denied.reviewId});
  const loss={...base,...submitted,reviewId:`worker-loss-${family}`};
  await writeFile(join(repo,'hold-'+loss.reviewId),'owned fixture worker-loss barrier');
  await peer.call(method+'.start',loss);await until(async()=> (await spawns(repo)).some(s=>s.reviewId===loss.reviewId));
  const child=(await spawns(repo)).find(s=>s.reviewId===loss.reviewId)!;survivors.set(child.pid,repo);
  await peer.call('fixture.terminate',{reviewId:loss.reviewId});
  await until(async()=>{try{process.kill(child.pid,0);return false;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return true;throw error;}});
  survivors.delete(child.pid);
  const resume={...base,reviewId:loss.reviewId,...(family==='code'?{operation:'resume'}:{phase:'recover',operation:'resume',actionId:'worker-loss-resume'})},route=method+(family==='code'?'.start':'.recover');
  assert.equal((await peer.call(route,resume)).status,'resource_recovery_required','lost writer cannot erase an unresolved closure save');
  peer.subscribe();await pause();
  const pending=peer.call(route,{...resume,resourceRecovery:{reason:'Verified host ended exact fixture child after worker loss'}}),request=await peer.request();
  await peer.call('approval.answer',{requestId:request.requestId,decision:'approve'});assert.equal((await pending).status,'cleared');
  assert.equal((await spawns(repo)).filter(s=>s.reviewId===loss.reviewId).length,1);
  await rm(join(repo,'hold-'+loss.reviewId));await peer.call(route,resume);
  await until(async()=>{const p=await peer.call(method+'.progress',loss);if(p.status==='failed')throw Error(JSON.stringify(p));return p.status==='passed';});
  const proof=JSON.parse(await readFile(join(repo,`byte-proof-${loss.reviewId}.json`),'utf8'));
  assert.equal(proof.maxActive,1);assert.ok(proof.maxFrameBytes<=65536);assert.ok(proof.totalBytes>=200000);assert.ok(proof.frames>=4);
  process.kill(sentinel.pid!,0);
  await peer.call('fixture.terminate',{reviewId:loss.reviewId});
 }
 for(const family of ['code','design'] as const){
  const repo=family==='code'?code.repo:design.repo,id=`production-crash-${family}`,key={project:repo,family,reviewId:id};
  const base={repo,reviewId:id,attempt:1,...(family==='code'?{epicHash:hash}:{})};
  const method=family==='code'?'taskReview':'designReview';
  const initial={...base,...(family==='code'?{packet:code.packet}:{artifactPath:design.json})};
  await writeFile(join(repo,'hold-'+id),'owned fixture barrier');
  await peer.call(method+'.start',initial);
  await until(async()=> (await spawns(repo)).some(s=>s.reviewId===id));
  const spawn=(await spawns(repo)).find(s=>s.reviewId===id)!;assert.equal(spawn.qualified,true);survivors.set(spawn.pid,repo);
  const before=await inspectReviewResources(key);assert.ok(before.remaining>0);assert.ok(before.guards.flatMap(g=>g.resourceGuard.openLeases).some(l=>spawn.leases.some(s=>s.operationId===l.operationId)));
  await stop(true);peer.close();assert.equal(await readlink(`/proc/${spawn.pid}/cwd`),repo,'only the fixture child survives its fixture daemon');
  peer=await start();
  const recovery={...base,...(family==='code'?{operation:'resume'}:{phase:'recover',operation:'resume',actionId:'explicit-fixture-resume'})};
  const route=method+(family==='code'?'.start':'.recover');
  assert.equal((await peer.call(route,recovery)).status,'resource_recovery_required');
  const callsBefore=(await spawns(repo)).filter(s=>s.reviewId===id).length;
  const unrelated={...code.packet,functionalSummary:'Unrelated review remains usable'};
  const other={repo:code.repo,epicHash:hash,reviewId:`unrelated-during-${family}`,attempt:1,packet:unrelated};
  await peer.call('taskReview.start',other);
  await until(async()=>{const p=await peer.call('taskReview.progress',other);if(p.status==='failed')throw Error(JSON.stringify(p));return p.status==='passed';});
  assert.equal((await spawns(repo)).filter(s=>s.reviewId===id).length,callsBefore);
  const otherCheckpoint=await readFile(join(code.repo,'.insrc/tmp/code-review',`${other.reviewId}.json`),'utf8');
  // Verify exact owned child before ending its process group. Ending it alone
  // cannot authorize a cold replacement or clear the durable uncertainty.
  assert.ok((await readFile(`/proc/${spawn.pid}/cmdline`,'utf8')).includes(join(bin,'claude')));
  process.kill(-spawn.pid,'SIGKILL');await until(async()=>{try{return /\) Z /.test(await readFile(`/proc/${spawn.pid}/stat`,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return true;throw error;}});survivors.delete(spawn.pid);
  assert.equal((await peer.call(route,recovery)).status,'resource_recovery_required');
  await assert.rejects(peer.call(route,{...recovery,resourceRecovery:{reason:'Wrong fixture lease',leaseIds:['foreign-operation']}}),/exact set/);
  await assert.rejects(peer.call(route,{...recovery,resourceRecovery:{reason:'Forged receipt',approvalReceipt:{decision:'approve'}}}),/caller approval receipts/);
  peer.subscribe();await pause();
  const clearing=peer.call(route,{...recovery,resourceRecovery:{reason:'Verified exact fixture child process group ended',leaseIds:before.guards.flatMap(g=>g.resourceGuard.openLeases.map(l=>l.operationId))}});
  const approval=await peer.request();assert.equal(approval.toolId,'review_resource_clearance');
  await peer.call('approval.answer',{requestId:approval.requestId,decision:'approve'});
  assert.equal((await clearing).status,'cleared');
  await requireClosedReviewResources(key);
  process.kill(sentinel.pid!,0);
  assert.equal((await spawns(repo)).filter(s=>s.reviewId===id).length,callsBefore,'clearance is metadata only');
  const guarded=await inspectReviewResources(key);assert.ok(guarded.guards.some(g=>g.resourceGuard.clearance?.approvalReceipt.requestId===approval.requestId));
  assert.equal(await readFile(join(code.repo,'.insrc/tmp/code-review',`${other.reviewId}.json`),'utf8'),otherCheckpoint,'targeted clearance never changes unrelated checkpoints');
  await rm(join(repo,'hold-'+id));
  // Start is never implicit recovery. Only this separate explicit operation
  // can dispatch the interrupted review after operator clearance.
  await peer.call(route,recovery);
  await until(async()=>{const p=await peer.call(method+'.progress',base);if(p.status==='failed')throw Error(JSON.stringify(p));return p.status==='passed';});
  assert.ok((await spawns(repo)).filter(s=>s.reviewId===id).length>callsBefore);
  await requireClosedReviewResources(key);
 }
 for(const repo of [code.repo,design.repo])for(const event of await spawns(repo)){
  assert.equal(event.qualified,true);assert.ok(event.leases.length>0);
  try{process.kill(event.pid,0);assert.fail('Completed fixture native child remains live');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
 }
 await stop();
});

test('legacy interrupted code history retains uncertainty on earlier attempts',async t=>{
 const f=await publicationFixture();t.after(f.cleanup);
 const reviewId='legacy-interrupted-code',cp=f.checkpoint(reviewId),first=cp.attempts[0]!;
 first.header.status='incomplete';first.header.interrupted=true;
 const second=structuredClone(first);second.header.attempt=2;second.header.status='passed';delete second.header.interrupted;
 // The unrelated terminal successor uses the historical unpinned format;
 // it has no final-scope attribution authority copied from attempt one.
 delete second.submitted.reviewRevision;
 for(const field of ['finalScopeIdentity','attributionState','acceptedAttribution','taskScopeIdentities','attributionIdentity','attributionFailure'] as const)delete second.header[field];
 cp.attempts.push(second);await saveCheckpoint(checkpointPath(f.repo,reviewId),cp);
 const key={project:f.repo,family:'code' as const,reviewId},snapshot=await inspectReviewResources(key);
 assert.equal(snapshot.remaining,1);assert.equal(snapshot.guards[0]!.attempt,1);
 assert.equal(snapshot.guards[0]!.resourceGuard.daemonInstance,'unverifiable-legacy');
 await assert.rejects(requireClosedReviewResources(key),/review_resources_fenced/);
 const again=await inspectReviewResources(key);assert.equal(again.digest,snapshot.digest,'read replay cannot erase or replace uncertainty');
});

test('shutdown drains host leases before worker reclamation and replacement',async t=>{
 const old=process.env['INSRC_TEST_HOOKS'];process.env['INSRC_TEST_HOOKS']='1';
 const f=await publicationFixture(),started:StartedReviewWorker[]=[];
 const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
 const registry=new ReviewWorkers({services,resolveScope:async()=>({reviewer:'daemon',subject:'fixture',cleanupScope:`${f.repo}:s1`}),authorizeNative:async(_key,c)=>assert.equal(c.command,process.execPath),resolveBinary:async c=>c,track:()=>{},start:async(...args)=>{const s=await startReviewWorkerBootstrap(...args);started.push(s);return s;}});
 t.after(async()=>{await registry.shutdown();f.cleanup();if(old===undefined)delete process.env['INSRC_TEST_HOOKS'];else process.env['INSRC_TEST_HOOKS']=old;});
 const key={project:f.repo,family:'code' as const,reviewId:'shutdown-review'},input={key,attempt:1,actionId:'shutdown-admission',submitted:f.packet};
 const context={connectionIdentity:'shutdown-fixture',daemonEpoch:'epoch',connectionSignal:new AbortController().signal};
 await registry.admit(input,context);const owner=started[0]!,path=join(f.repo,'.insrc/tmp/code-review/shutdown-review.json');
 const running=workerRpc(owner,'test.review.native',{...owner.admission,probe:'hold'}).catch(()=>undefined);
 await until(async()=> (await inspectReviewResources(key)).remaining===1);
 let closedBeforeExit=false;owner.worker.once('exit',()=>{const cp=JSON.parse(readFileSync(path,'utf8'));closedBeforeExit=cp.attempts.every((a:any)=>!a.resourceGuard?.openLeases.length);});
 await registry.shutdown();await running;await owner.reclaimed;
 assert.equal(closedBeforeExit,true,'confirmed native disposal must be durably saved while its writer is alive');
 assert.equal((await inspectReviewResources(key)).remaining,0);assert.equal(owner.worker.threadId,-1);
 const replacement=await registry.admit({...input,operation:'resume'},context);assert.notEqual(replacement.incarnation,owner.admission.incarnation);
 assert.notEqual(started[1]!.threadId,owner.threadId);
 const next=started[1]!,again=workerRpc(next,'test.review.native',{...next.admission,probe:'hold'}).catch(()=>undefined);
 await until(async()=> (await inspectReviewResources(key)).remaining===1);
 next.port.close();await next.reclaimed;await again;
 assert.equal((await inspectReviewResources(key)).remaining,0,'lost hub connection also drains native work before reclaim');
});

test('disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable',async t=>{
 const f=await clearanceFixture(t),binary=join(f.repo,'survivor-cli'),packetFile=join(f.repo,'crash-packet.json');
 await writeFile(binary,'#!/usr/bin/env node\nrequire("node:fs").writeFileSync("survivor.pid",String(process.pid));setInterval(()=>{},1000);');await chmod(binary,0o755);await writeFile(packetFile,JSON.stringify(f.f.packet));
 // The helper uses the same source loader as production worker bootstrap.
 const source=new URL('./helpers/review-crash-daemon.ts',import.meta.url);
 const daemon=fork(source, [f.repo,binary,packetFile],{execArgv:['--import','tsx'],env:{...process.env,INSRC_TEST_HOOKS:'1'},stdio:['ignore','ignore','pipe','ipc']});
 let diagnostic='';daemon.stderr!.on('data',chunk=>{diagnostic+=String(chunk);});let survivor=0;
 t.after(async()=>{if(daemon.exitCode===null&&daemon.signalCode===null){daemon.kill('SIGKILL');await once(daemon,'exit');}if(survivor){try{process.kill(-survivor,'SIGKILL');}catch{}}});
 const ready=await Promise.race([once(daemon,'message').then(([value])=>value as {pid:number}),once(daemon,'exit').then(()=>{throw new Error(diagnostic);}),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Disposable daemon readiness timeout: '+diagnostic)),15000).unref())]);
 survivor=ready.pid;const key={project:f.repo,family:'code' as const,reviewId:'crash-review'};
 const before=await inspectReviewResources(key);assert.equal(before.remaining,1);
 const exited=once(daemon,'exit');daemon.kill('SIGKILL');await exited;
 process.kill(survivor,0); // Only verifies the PID owned by this disposable fixture.
 await assert.rejects(requireClosedReviewResources(key),/review_resources_fenced/);
 const unrelated={...f.input,key:{...f.key,reviewId:'unrelated-review'},actionId:'unrelated-start'};
 const admitted=await f.registry.admit(unrelated,f.local);assert.notEqual(admitted.key.reviewId,key.reviewId);
 assert.equal((await inspectReviewResources(key)).remaining,1);
 // Even independently ending the orphan never clears durable uncertainty.
 process.kill(-survivor,'SIGKILL');survivor=0;
 await assert.rejects(requireClosedReviewResources(key),/review_resources_fenced/);
 const clearing=f.recovery.clear(key,{reason:'Verified fixture process group ended'},f.local);
 // Existing broker treats automated local clients identically to UI clients.
 // Subscribe before the next request if the first was denied for no client.
 const denied=await clearing;assert.equal(denied.status,'withheld');
 f.peer.subscribe();await pause();
 const permitted=f.recovery.clear(key,{reason:'Verified owned fixture group ended'},f.local),request=await f.peer.request();
 await f.peer.call('approval.answer',{requestId:request.requestId,decision:'approve'});assert.equal((await permitted).status,'cleared');
 await requireClosedReviewResources(key);assert.equal(f.started.has('crash-review'),false);
 await assert.rejects(f.registry.admit({...f.input,key,actionId:'crash-start'},f.local),/explicit resume/);
 await f.registry.shutdown();
 assert.equal(f.started.has('crash-review'),false,'rejected start cannot dispatch inference');
 const resumed=await f.registry.admit({...f.input,key,operation:'resume',actionId:'explicit-resume'},f.local);
 await assert.rejects(f.registry.execute(resumed,f.local,'start'),/explicit resume/);
 await f.registry.execute(resumed,f.local,'resume');
 const started=f.started.get('crash-review')!;
 await until(async()=> (await workerRpc(started,'fixture.stats')).entered);
 assert.equal((await workerRpc(started,'fixture.stats')).calls,0);
 await workerRpc(started,'fixture.release');
 await until(async()=> (await workerRpc(started,'fixture.stats')).calls>0);
 assert.ok((await readFile(join(f.repo,'.insrc/tmp/code-review/crash-review.json'),'utf8')).includes('Verified owned fixture group ended'));
});

test('legacy active missing guards reconstruct only the requested review fence',async t=>{
 const f=await clearanceFixture(t,'design');
 const {saveDesignCheckpoint}=await import('../../../workflow/review/design-review/checkpoint.js');
 const {readFile}=await import('node:fs/promises');
 const {designCheckpointPath}=await import('../../../workflow/review/design-review/checkpoint.js');
 const unrelated=await readFile(designCheckpointPath(f.repo,f.key.reviewId),'utf8');
 const key={...f.key,reviewId:'legacy-interrupted'};
 await saveDesignCheckpoint(f.repo,{...f.d!.checkpoint,reviewId:key.reviewId,schemaVersion:1,attempts:f.d!.checkpoint.attempts.map(a=>({...a,status:'interrupted' as const,progress:{...a.progress,checkpointPath:designCheckpointPath(f.repo,key.reviewId)}}))});
 const restored=await inspectReviewResources(key);assert.equal(restored.remaining,1);
 assert.equal(restored.guards[0]!.resourceGuard.daemonInstance,'unverifiable-legacy');
 await assert.rejects(requireClosedReviewResources(key),/review_resources_fenced/);
 assert.equal(await readFile(designCheckpointPath(f.repo,f.key.reviewId),'utf8'),unrelated);
 assert.deepEqual(await inspectReviewResources(key),restored);
});
