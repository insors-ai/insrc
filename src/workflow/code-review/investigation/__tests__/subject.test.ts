/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectFixture } from './fixtures.js';
import { ReviewGitReader, readCommitPacket } from '../git-packets.js';
import { prepareReviewSubject, assertReviewSubjectFresh } from '../subject.js';
import { readApprovedWork } from '../work.js';
import type { VerifiedWorkInputs, VerifiedWorkArtifact } from '../work.js';
import type { PrepareReviewRequest, ScopeAttestation } from '../types.js';

test('Approved task projection, trusted attribution and freshness fixtures',async()=>{
 const f=await subjectFixture();try{
  const subject=await prepareReviewSubject(f.request,f.deps);
  assert.equal(subject.packets[0]?.blocks.length,1);assert.equal(f.packet.blocks.length,2);
  assert.equal(subject.tasks[0]?.description,'Title\n\nDetailed summary');assert.deepEqual(subject.tasks[0]?.acceptanceChecks.map(a=>a.id),['t1/ac1','t1/ac2']);
  assert.equal(subject.packets[0]?.blocks[0]?.attributionRefs[0],'scope-1');
  assert.equal(subject.subjectDigest,(await prepareReviewSubject(f.request,f.deps)).subjectDigest);
  const foreign=f.packet.blocks[1]!.blockId;
  await assert.rejects(()=>prepareReviewSubject({...f.request,selections:[{...f.request.selections[0]!,blockIds:[foreign]}]},f.deps),{code:'ambiguous-attribution'});
  f.setProof({...f.proof,blockIds:['forged']});await assert.rejects(()=>prepareReviewSubject(f.request,f.deps),{code:'ambiguous-attribution'});
  f.setProof({...f.proof,storyId:'s2'});await assert.rejects(()=>prepareReviewSubject(f.request,f.deps),{code:'ambiguous-attribution'});
  f.setProof(f.proof);
  await assert.rejects(()=>prepareReviewSubject({...f.request,selections:[...f.request.selections,...f.request.selections]},f.deps),{code:'invalid-input'});
  f.write('foreign.txt','foreign\n');f.commit();await assertReviewSubjectFresh(subject,f.deps);
  f.setInputs({...f.inputs,plan:{...f.inputs.plan!,revision:2,approvedRevision:2}});
  await assert.rejects(()=>assertReviewSubjectFresh(subject,f.deps),{code:'stale-contract'});
 }finally{f.close();}
});
test('planless provenance and present unapproved PLAN are distinct',async()=>{
 const f=await subjectFixture();try{
  f.setInputs({...f.inputs,route:'approved-upstream',plan:null});
  const subject=await prepareReviewSubject(f.request,f.deps);assert.equal(subject.taskBasis,'approved-upstream');assert.deepEqual(subject.tasks,[]);
  f.setInputs({...f.inputs,plan:{...f.inputs.plan!,status:'draft',approvedRevision:null}});
  await assert.rejects(()=>prepareReviewSubject(f.request,f.deps),{code:'unapproved-contract'});
  f.setInputs({...f.inputs,route:'approved-upstream'});
  await assert.rejects(()=>prepareReviewSubject(f.request,f.deps),{code:'invalid-input'});
  f.setInputs(f.inputs);
  await assert.rejects(()=>prepareReviewSubject(f.request,{...f.deps,assertFresh:async()=>{throw Error('concurrent contract update');}}),/concurrent contract update/);
 }finally{f.close();}
});
