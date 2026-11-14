import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,appendFileSync,rmSync } from 'node:fs';
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
import type { DesignChunkPlan,DesignUnitAssignment,DesignRecoveryRequest } from '../contracts.js';

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
 let contextMd:string|undefined;if(route==='epic'){put('DEF');contextMd=put('HLD').md;}if(route==='issue')put('ISSUE');const artifact=put('LLD');
 const barrier=new Int32Array(new SharedArrayBuffer(32)),owner=new AbortController();
 const context={connectionIdentity:'design-fixture',daemonEpoch:'epoch',connectionSignal:owner.signal};
 const registry=new ReviewWorkers({services,resolveScope:async()=>({reviewer:JSON.parse(readFileSync(artifact.json,'utf8')).meta.authoredBy==='controller'?'daemon':'controller',subject:artifact.id,cleanupScope:`${repo}:${artifact.id}`,epicHash:hash}),authorizeNative:async()=>{throw new Error('No native command is needed by this design fixture');},resolveBinary:async()=>{throw new Error('No CLI lookup expected');},track:()=>{},start:(svc,input,port,deps)=>startReviewWorkerBootstrap(svc,input,port,{...deps,start:(services,name,_script,extra,created)=>startWorker(services,name,'../../workflow/review/design-review/__tests__/helpers/worker-admission',{workerData:{...extra!.workerData,fixtureBarrier:barrier.buffer},transferList:extra!.transferList},created)})});
 t.after(async()=>{Atomics.store(barrier,1,1);Atomics.notify(barrier,1);Atomics.store(barrier,3,0);Atomics.notify(barrier,3);await registry.shutdown();rmSync(repo,{recursive:true,force:true});});
 const submit=(id='design-review')=>({key:{project:repo,family:'design' as const,reviewId:id},attempt:1,actionId:`action-${id}`,submitted:{phase:'start',repo,reviewId:id,attempt:1,artifactPath:artifact.json}});
 return{repo,artifact,registry,context,barrier,submit,contextMd};
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
  await until(()=>f.registry.identity(ack.key)===undefined);
  let fresh:typeof ack|undefined;
  await until(async()=>{try{fresh=await f.registry.admit(f.submit('same-artifact-after-completion'),f.context);return true;}catch(error){if(!String(error).includes('subject or cleanup busy'))throw error;return false;}});
  assert.notEqual(fresh!.incarnation,ack.incarnation,'terminal owner is reclaimed before a fresh review of the subject');
 }
});
test('subject invalidation explicit recovery and impact-selected chunks preserve saved feedback',async t=>{
 const f=fixture(t,'epic','daemon'),submitted=f.submit(),ack=await f.registry.admit(submitted,f.context);
 await f.registry.execute(ack,f.context);Atomics.store(f.barrier,1,1);Atomics.notify(f.barrier,1);
 const cp=()=>loadStoredDesignCheckpoint(f.repo,ack.key.reviewId);
 const unit=async(identity=ack,attempt=1)=>{let found:DesignUnitAssignment|undefined;await until(async()=>{try{const out=await f.registry.control({...identity,attempt,phase:'assignment',actionId:'controller-action',executionId:'pending',sequence:1,input:{}},f.context) as {assignment:DesignUnitAssignment|null};found=out.assignment??undefined;return!!found;}catch{return false;}});return found!;};
 const send=(identity:typeof ack,attempt:number,a:DesignUnitAssignment,phase:'plan'|'impact'|'result',input:unknown)=>f.registry.control({...identity,attempt,phase,actionId:'controller-action',executionId:a.executionId,sequence:1,input},f.context);
 let a=await unit();assert.equal(a.kind,'planning');
 const first=(await cp())!.attempts[0]!;assert.ok('inventory'in first);
 const selectors=first.inventory.units.map(u=>u.id);
 const plan:DesignChunkPlan={chunks:[{id:'keep',title:'Ownership',selectors,concerns:['ownership'],dependsOn:[],purpose:'substantive'},{id:'edit',title:'Behavior',selectors,concerns:['correctness'],dependsOn:['keep'],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['consistency'],dependsOn:['keep','edit'],purpose:'consistency'}],coverageExplanation:'All units with separate ownership and behavior concerns',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['keep','edit']}))};
 const feedback=(id:string)=>({chunkId:id,status:'passed',summary:'Deterministic controller fixture',findings:[],inspectedReferences:[...selectors,f.artifact.md,`${f.repo}/.insrc/tmp/design-review/${ack.key.reviewId}.json`],limitations:[],advice:[]});
 await send(ack,1,a,'plan',{plan});a=await unit();assert.equal(a.chunkId,'keep');await send(ack,1,a,'result',{result:feedback('keep')});
 const oldUnit=await unit();assert.equal(oldUnit.chunkId,'edit');const before=(await cp())!.attempts[0]!;assert.ok('completedChunks'in before);const kept=structuredClone(before.completedChunks);
 appendFileSync(f.contextMd!,'\nUnrelated context change must not restart the target\n');
 assert.equal((await unit()).executionId,oldUnit.executionId);
 await f.registry.shutdown();
 const recovery:DesignRecoveryRequest={phase:'recover',repo:f.repo,reviewId:ack.key.reviewId,attempt:1,actionId:'resume-partial',operation:'resume'};
 const resumed=await f.registry.admit({...submitted,submitted:recovery,actionId:recovery.actionId,operation:'resume'},f.context);
 Atomics.store(f.barrier,3,1);Atomics.store(f.barrier,4,0);
 await f.registry.execute(resumed,f.context);await until(()=>Atomics.load(f.barrier,4)===1);
 const pending=(await cp())!.attempts[0]!;assert.equal(pending.actions!.at(-1)!.validation,'unverified');assert.ok('completedChunks'in pending);assert.deepEqual(pending.completedChunks,kept);
 Atomics.store(f.barrier,3,0);Atomics.notify(f.barrier,3);
 a=await unit(resumed);assert.equal(a.chunkId,'edit');assert.notEqual(a.executionId,oldUnit.executionId);
 const qualified=(await cp())!.attempts[0]!;assert.equal(qualified.actions!.at(-1)!.validation,'qualified');assert.ok('completedChunks'in qualified);assert.deepEqual(qualified.completedChunks,kept);
 await assert.rejects(send(resumed,1,oldUnit,'result',{result:feedback('edit')}),/generation/);
 await send(resumed,1,a,'result',{result:feedback('edit')});a=await unit(resumed);assert.equal(a.chunkId,'final');await send(resumed,1,a,'result',{result:feedback('final')});
 await until(async()=>((await cp())!.attempts[0]!.status==='passed'));
 assert.deepEqual(await f.registry.recover(resumed,recovery,f.context),await f.registry.recover(resumed,recovery,f.context));
 await assert.rejects(f.registry.recover(resumed,{...recovery,operation:'restart_full',userDecision:{action:'restart_full',reason:'Conflicting replay',recordedAt:time}},f.context),/Conflicting/);
 const baseline=structuredClone((await cp())!.attempts[0]!);assert.ok('completedChunks'in baseline);
 writeFileSync(f.artifact.md,readFileSync(f.artifact.md,'utf8').replace('Review scope','Corrected scope'));
 const correction=await f.registry.admit({...submitted,attempt:2,actionId:'correction-2',submitted:{...submitted.submitted,attempt:2}},f.context);
 await f.registry.execute(correction,f.context);a=await unit(correction,2);assert.equal(a.kind,'impact');
 const impact={baselineAttempt:1,mode:'affected_chunks',changes:['Behavior correction'],directChunkIds:['edit'],indirectChunkIds:[],rationale:'Ownership remains equivalent; inspect changed correctness and whole-design consistency',chunkMapping:[{priorIds:['keep'],currentIds:['keep'],explanation:'Equivalent ownership'},{priorIds:['edit'],currentIds:['edit'],explanation:'Changed behavior'}],retainedCoverage:[{chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'Equivalent unchanged ownership concern'}],carriedFindingIds:[],consistencyChunkIds:['final']};
 await send(correction,2,a,'impact',{plan,impact});a=await unit(correction,2);assert.equal(a.chunkId,'edit');await send(correction,2,a,'result',{result:feedback('edit')});const final=await unit(correction,2);assert.equal(final.chunkId,'final');
 const selected=(await cp())!.attempts[1]!;assert.ok('completedChunks'in selected);assert.deepEqual(selected.completedChunks.map(c=>c.chunkId),['edit']);assert.deepEqual((await cp())!.attempts[0],baseline);
 appendFileSync(f.artifact.md,'\nTarget changed during final review\n');
 await until(async()=>((await cp())!.attempts[1]!.status==='invalidated'));
 const invalidated=structuredClone((await cp())!.attempts[1]!);
 const deniedResume:DesignRecoveryRequest={phase:'recover',repo:f.repo,reviewId:ack.key.reviewId,attempt:2,actionId:'invalidated-cannot-resume',operation:'resume'};
 await until(async()=>{try{await f.registry.recover(correction,deniedResume,f.context);return true;}catch(error){if(!String(error).includes('still active'))throw error;return false;}});
 await until(async()=>((await cp())!.attempts[1]!.actions?.find(x=>x.actionId===deniedResume.actionId)?.validation==='failed'));
 const denied=(await cp())!.attempts[1]!;assert.equal(denied.status,'invalidated');assert.ok('completedChunks'in denied&&'completedChunks'in invalidated);assert.deepEqual(denied.completedChunks,invalidated.completedChunks);assert.match(denied.actions!.find(x=>x.actionId===deniedResume.actionId)!.outcome!.summary,/not resumable/);
 const restart:DesignRecoveryRequest={phase:'recover',repo:f.repo,reviewId:ack.key.reviewId,attempt:2,actionId:'restart-approved',operation:'restart_full',userDecision:{action:'restart_full',reason:'Fixture user approved full restart',recordedAt:time}};
 let receipt:unknown;await until(async()=>{try{receipt=await f.registry.recover(correction,restart,f.context);return true;}catch(error){if(!String(error).includes('still active'))throw error;return false;}});
 assert.ok(receipt);a=await unit(correction,3);assert.equal(a.kind,'planning');const restarted=await cp();assert.equal(restarted!.attempts.length,3);assert.ok('completedChunks'in restarted!.attempts[1]!&&'completedChunks'in invalidated);assert.deepEqual(restarted!.attempts[1]!.completedChunks,invalidated.completedChunks);
 assert.equal(restarted!.attempts[1]!.actions!.at(-1)!.validation,'qualified');assert.equal(Atomics.load(f.barrier,2),0,'controller execution never constructs a model');
});
test('cold unverified design recovery retains its original submission and qualifies before provider dispatch',async t=>{
 const f=fixture(t,'standalone'),submitted=f.submit(),ack=await f.registry.admit(submitted,f.context);
 await f.registry.execute(ack,f.context);await until(()=>Atomics.load(f.barrier,0)===1);
 const original=(await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!.attempts[0]!;assert.ok('submitted'in original);
 await f.registry.shutdown();
 const request:DesignRecoveryRequest={phase:'recover',repo:f.repo,reviewId:ack.key.reviewId,attempt:1,actionId:'resume-unverified',operation:'resume'};
 const resumed=await f.registry.admit({...submitted,submitted:request,actionId:request.actionId,operation:'resume'},f.context);
 const pending=(await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!.attempts[0]!;assert.ok('submitted'in pending);assert.deepEqual(pending.submitted,original.submitted);assert.equal(pending.actions!.at(-1)!.validation,'unverified');assert.equal(Atomics.load(f.barrier,2),0);
 await f.registry.execute(resumed,f.context);Atomics.store(f.barrier,1,1);Atomics.notify(f.barrier,1);
 await until(async()=>((await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!.attempts[0]!.status==='passed'));
 const saved=(await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!;assert.equal(saved.attempts.length,1);assert.equal(saved.attempts[0]!.actions!.at(-1)!.validation,'qualified');assert.equal(Atomics.load(f.barrier,2),3);
});

test('rejected full restart retains the source attempt for subsequent explicit resume',async t=>{
 const f=fixture(t,'standalone','daemon'),input=f.submit(),ack=await f.registry.admit(input,f.context);
 Atomics.store(f.barrier,1,1);Atomics.notify(f.barrier,1);await f.registry.execute(ack,f.context);
 await until(async()=>{try{return!!(await f.registry.control({...ack,attempt:1,phase:'assignment',actionId:'assignment',executionId:'pending',sequence:1,input:{}},f.context) as any).assignment;}catch{return false;}});
 await f.registry.shutdown();
 const bad:DesignRecoveryRequest={phase:'recover',repo:f.repo,reviewId:ack.key.reviewId,attempt:1,actionId:'restart-not-invalidated',operation:'restart_full',userDecision:{action:'restart_full',reason:'Fixture asks for restart',recordedAt:time}};
 const restarted=await f.registry.admit({...input,submitted:bad,actionId:bad.actionId},f.context);
 const receipt=await f.registry.execute(restarted,f.context) as {attempt:number};assert.equal(receipt.attempt,1);
 await until(async()=>((await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!.attempts[0]!.actions?.at(-1)?.validation==='failed'));
 const cp=(await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!;assert.equal(cp.attempts.length,1);
 await f.registry.shutdown();
 const resume:DesignRecoveryRequest={phase:'recover',repo:f.repo,reviewId:ack.key.reviewId,attempt:1,actionId:'resume-after-rejected-restart',operation:'resume'};
 const resumed=await f.registry.admit({...input,submitted:resume,actionId:resume.actionId},f.context);await f.registry.execute(resumed,f.context);
 await until(async()=>{try{const out=await f.registry.control({...resumed,attempt:1,phase:'assignment',actionId:'assignment',executionId:'pending',sequence:1,input:{}},f.context) as any;return out.assignment?.kind==='planning';}catch{return false;}});
 assert.equal((await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!.attempts.length,1);
});

test('explicit restart refreshes independent reviewer authority after authorship changes',async t=>{
 const f=fixture(t,'standalone','daemon'),input=f.submit(),ack=await f.registry.admit(input,f.context);
 Atomics.store(f.barrier,1,1);Atomics.notify(f.barrier,1);await f.registry.execute(ack,f.context);
 await until(async()=>{try{return!!(await f.registry.control({...ack,attempt:1,phase:'assignment',actionId:'assignment',executionId:'pending',sequence:1,input:{}},f.context) as any).assignment;}catch{return false;}});
 const head=JSON.parse(readFileSync(f.artifact.json,'utf8'));head.meta.authoredBy='controller';writeFileSync(f.artifact.json,JSON.stringify(head));
 await until(async()=>((await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!.attempts[0]!.status==='invalidated'));
 const restart:DesignRecoveryRequest={phase:'recover',repo:f.repo,reviewId:ack.key.reviewId,attempt:1,actionId:'refresh-reviewer',operation:'restart_full',userDecision:{action:'restart_full',reason:'Fixture approves changed author restart',recordedAt:time}};
 await until(async()=>{try{const identity=f.registry.identity(ack.key);if(identity)await f.registry.recover(identity,restart,f.context);else{const next=await f.registry.admit({...input,actionId:restart.actionId,submitted:restart},f.context);await f.registry.execute(next,f.context);}return true;}catch(error){if(!/closed|fenced|reclaimed|still active|subject or cleanup busy/i.test(String(error)))throw error;return false;}});
 await until(async()=>{const cp=await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId);return cp!.attempts.length===2&&cp!.attempts[1]!.status==='passed';});
 const saved=(await loadStoredDesignCheckpoint(f.repo,ack.key.reviewId))!;assert.equal(saved.subject!.reviewer,'daemon');assert.equal(saved.attempts[1]!.number,2);
});
