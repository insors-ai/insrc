import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { ThreadServices } from '../../../../daemon/threads/main-services.js';
import { ReviewWorkers } from '../../../../daemon/threads/review-workers.js';
import { startReviewWorkerBootstrap } from '../../../../daemon/threads/review-worker-bootstrap.js';
import { startWorker } from '../../../../daemon/threads/workers.js';
import { emptyLifecycle } from '../../../artifact-core/decode.js';
import { resolveArtifactMdPath } from '../../../path-scheme.js';
import { artifactJsonPath } from '../../../storage.js';
import { loadStoredDesignCheckpoint } from '../checkpoint.js';
import type { ArtifactKind } from '../../../path-scheme.js';

const hash='aaaaaaaaaaaaaaaa',time='2026-11-03T00:00:00.000Z';
const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
async function until(check:()=>Promise<boolean>|boolean){const end=Date.now()+10000;while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Fixture condition timed out');}
function fixture(t:{after:(fn:()=>Promise<void>)=>void},route:'epic'|'standalone'|'issue',author:'controller'|'daemon'='controller'){
 const repo=mkdtempSync(join(tmpdir(),'worker-design-admission-'));
 function put(kind:'DEF'|'HLD'|'LLD'|'ISSUE'){
  const id=`${kind}-${hash}${kind==='LLD'?'-s1':''}`;
  const meta={workflow:kind==='DEF'?'define':kind==='HLD'?'design.epic':kind==='ISSUE'?'issue':'design.story',[kind==='ISSUE'?'issueHash':'epicHash']:hash,...(kind==='LLD'?{storyId:'s1'}:{}),epicCreatedAt:time,createdAt:time,epicSlug:'fixture',authoredBy:author,lifecycle:{...emptyLifecycle(1),status:'approved'},...(route!=='epic'?{standalone:true}:{}),...(route==='issue'&&kind==='LLD'?{sizeClass:'bugfix'}:{})};
  const json=artifactJsonPath(repo,id),md=resolveArtifactMdPath(repo,{epicHash:hash,epicCreatedAt:time,...(kind==='LLD'?{story:'s1'}:{})},kind as ArtifactKind,route==='epic'?'epic':'standalone','fixture');
  mkdirSync(dirname(json),{recursive:true});mkdirSync(dirname(md),{recursive:true});
  writeFileSync(json,JSON.stringify({meta,body:kind==='DEF'?{problem:'Problem',stories:[{id:'s1',title:'Story'}]}:kind==='ISSUE'?{fixIntent:'Fix',rootCause:'Cause',reproduction:'Reproduce'}:{summary:'Review scope',requirements:[{id:'r1',statement:'Feature works'}]},citations:[]}));
  writeFileSync(md,`<!-- insrc:artifact ${id} -->\n# ${kind}\n\n## Summary\nReview scope\n`);return{id,json,md};
 }
 if(route==='epic'){put('DEF');put('HLD');}if(route==='issue')put('ISSUE');const artifact=put('LLD');
 const barrier=new Int32Array(new SharedArrayBuffer(16)),owner=new AbortController();
 const context={connectionIdentity:'design-fixture',daemonEpoch:'epoch',connectionSignal:owner.signal};
 const registry=new ReviewWorkers({services,resolveScope:async()=>({reviewer:author==='controller'?'daemon':'controller',subject:artifact.id,cleanupScope:`${repo}:${artifact.id}`,epicHash:hash}),authorizeNative:async()=>{throw new Error('No native command is needed by this design fixture');},resolveBinary:async()=>{throw new Error('No CLI lookup expected');},track:()=>{},start:(svc,input,port,deps)=>startReviewWorkerBootstrap(svc,input,port,{...deps,start:(services,name,_script,extra,created)=>startWorker(services,name,'../../workflow/review/design-review/__tests__/helpers/worker-admission',{workerData:{...extra!.workerData,fixtureBarrier:barrier.buffer},transferList:extra!.transferList},created)})});
 t.after(async()=>{Atomics.store(barrier,1,1);Atomics.notify(barrier,1);await registry.shutdown();rmSync(repo,{recursive:true,force:true});});
 const submit=(id='design-review')=>({key:{project:repo,family:'design' as const,reviewId:id},attempt:1,actionId:`action-${id}`,submitted:{phase:'start',repo,reviewId:id,attempt:1,artifactPath:artifact.json}});
 return{repo,artifact,registry,context,barrier,submit};
}
test('durable admission and current workflow ancestry run in the owner worker',async t=>{
 for(const route of ['epic','standalone','issue'] as const){
  const f=fixture(t,route),submission=f.submit(),ack=await f.registry.admit(submission,f.context);
  const saved=await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId);assert.equal(saved!.attempts[0]!.status,'pending');assert.ok('phase'in saved!.attempts[0]!);
  await f.registry.execute(ack,f.context);await until(()=>Atomics.load(f.barrier,0)===1);
  assert.equal(Atomics.load(f.barrier,2),0,'blocked subject qualification dispatches no provider');
  await assert.rejects(f.registry.admit(f.submit('same-artifact'),f.context),/subject or cleanup busy/);
  Atomics.store(f.barrier,1,1);Atomics.notify(f.barrier,1);
  await until(async()=>((await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!.attempts.at(-1)!.status==='passed'));
  const qualified=await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId);assert.ok(qualified!.subject);assert.equal(qualified!.subject.workflow.kind,route);assert.equal(qualified!.subject.reviewer,'daemon');assert.equal(Atomics.load(f.barrier,2),3);
  assert.deepEqual(qualified!.subject.workflow.requiredReferences.map(r=>r.role),route==='epic'?['definition','hld']:route==='issue'?['originating_issue']:[]);
 }
});
