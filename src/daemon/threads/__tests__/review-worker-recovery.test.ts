import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { writeFile,readFile,chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { clearanceFixture,workerRpc,until,pause } from './helpers/review-clearance-fixture.js';
import { inspectReviewResources,requireClosedReviewResources } from '../../../workflow/review/resource-recovery.js';

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
 const resumed=await f.registry.admit({...f.input,key,operation:'resume',actionId:'explicit-resume'},f.local);
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
