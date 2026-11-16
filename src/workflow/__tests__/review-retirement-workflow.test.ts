import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { createCompletionEvidence } from '../artifact-core/completion-evidence.js';
import { History } from '../artifact-core/history.js';
import { LifecycleService } from '../artifact-core/lifecycle-service.js';
import { approveArtifactByJsonPath, approveWorkflowTarget, readPlanUpstream } from '../gates.js';
import { artifactJsonPath } from '../storage.js';
import { _setGateDepsForTests } from '../team/gate.js';
import { _setSignoffDepsForTests } from '../team/signoff.js';
import { H, alice, bob, clock, kit } from '../artifact-core/__tests__/store-kit.js';
import type { Kit } from '../artifact-core/__tests__/store-kit.js';
import { EPIC, STORY, T1, T2, seedEpic } from '../artifact-core/__tests__/lifecycle-kit.js';

const BUILD=`BUILD-${H}-s1`,LLD=`LLD-${H}-s1`,CR=`CR-${H}-s1`;
const noPolicy={readPolicy:async()=>({ok:true as const,value:'none' as const})};
function service(k:Kit){return new LifecycleService({store:k.store,now:clock(),evidence:ctx=>createCompletionEvidence(k.repo,{...ctx,history:new History(k.sidecar)})});}
async function ready(k:Kit,fail=false){
 await seedEpic(k);
 unlinkSync(artifactJsonPath(k.repo,CR));
 await k.store.write({...await k.store.read(BUILD),payload:{body:{tasks:[{id:'t1',passed:true},{id:'t2',passed:!fail}]},citations:[]}},alice);
 for(const id of [T1,T2])await new History(k.sidecar).appendLog(id,{id:`round-${id}`,actor:bob,timestamp:'2026-11-16T00:00:00.000Z',operation:'update',outcome:{result:fail&&id===T2?'fail':'pass',summary:'test round',data:{kind:'build-round'}}});
}

test('human approval and completion work without CR while remaining guards still refuse invalid work',async()=>{
 _setGateDepsForTests(noPolicy);_setSignoffDepsForTests(noPolicy);
 try{
  const k=kit();
  try{
   await ready(k);const svc=service(k);
   await approveArtifactByJsonPath(artifactJsonPath(k.repo,LLD),{lifecycle:svc,actor:bob,afterBuildApproval:async()=>{throw Error('Review cleanup was called');}});
   assert.equal((await k.store.read(LLD)).lifecycle.approval?.override,undefined);
   assert.equal((await k.store.read(LLD)).lifecycle.review,undefined);
   const result=await approveWorkflowTarget({repoPath:k.repo,artifactPath:artifactJsonPath(k.repo,BUILD),lifecycle:svc,actor:bob,afterBuildApproval:async()=>{throw Error('Review cleanup was called');}});
   assert.equal(result.skipped.length,0,JSON.stringify(result));assert.equal(result.approved.length,1);assert.deepEqual(result.codeReview,[]);
   assert.equal((await k.store.read(STORY)).lifecycle.status,'completed');
   assert.equal((await k.store.read(EPIC)).lifecycle.status,'completed');
   assert.equal(existsSync(artifactJsonPath(k.repo,CR)),false);
   for(const id of [LLD,BUILD,STORY])assert(!(await k.store.history.log(id)).some(e=>e.operation==='review'),'No fake review');
  }finally{k.done();}
  const failed=kit();
  try{
   await ready(failed,true);const svc=service(failed);
   await svc.apply(BUILD,'approve',bob);
   await svc.completeIfRolledUp(STORY,bob);
   assert.equal((await failed.store.read(STORY)).lifecycle.status,'draft');
   assert.match(await svc.holdReason(STORY),/t2|latest build round/);
  }finally{failed.done();}
  const unapproved=kit();
  try{
   await ready(unapproved);const svc=service(unapproved);
   assert.deepEqual((await svc.completeIfRolledUp(STORY,bob)).completed,[]);
   assert.match(await svc.holdReason(STORY),/BUILD approval/);
   assert.throws(()=>readPlanUpstream(unapproved.repo,H,'s1'),/approv|LLD/i);
   const path=artifactJsonPath(unapproved.repo,LLD),head=JSON.parse(readFileSync(path,'utf8'));
   head.meta.lifecycle.revision.contentHash='0'.repeat(64);writeFileSync(path,JSON.stringify(head));
   await assert.rejects(approveArtifactByJsonPath(path,{lifecycle:svc,actor:bob}),/hash|integrity|conflict/i);
  }finally{unapproved.done();}
  const held=kit();
  try{
   await ready(held);const svc=service(held);await svc.apply(BUILD,'approve',bob);
   assert.deepEqual((await svc.completeIfRolledUp(STORY,bob,{holds:()=>true})).completed,[]);
   assert.equal((await held.store.read(STORY)).lifecycle.status,'draft');
   assert.match(await svc.holdReason(STORY,{holds:()=>true}),/signoff/);
   _setGateDepsForTests({readPolicy:async()=>({ok:false,error:'policy could not be verified'} as never)});
   await assert.rejects(approveArtifactByJsonPath(artifactJsonPath(held.repo,LLD),{lifecycle:svc,actor:bob}),/policy|authoriz|refus/i);
  }finally{held.done();}
 }finally{_setGateDepsForTests();_setSignoffDepsForTests();}
});
