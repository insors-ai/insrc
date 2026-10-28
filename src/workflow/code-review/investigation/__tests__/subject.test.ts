/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './git-packets.test.js';
import { ReviewGitReader, readCommitPacket } from '../git-packets.js';
import { prepareReviewSubject, assertReviewSubjectFresh } from '../subject.js';
import { readApprovedWork } from '../work.js';
import type { VerifiedWorkInputs, VerifiedWorkArtifact } from '../work.js';
import type { PrepareReviewRequest, ScopeAttestation } from '../types.js';

export async function subjectFixture() {
 const f = fixture(); f.write('a.txt', 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'); const parent = f.commit();
 f.write('a.txt','ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n'); const commit = f.commit();
 const request: PrepareReviewRequest = { repoId: 'repo', rootArtifactId: 'DEF-root', storyId: 's1', buildArtifactId: 'BUILD-root-s1',
  selections: [{commitId:commit,parentId:parent,attestationRef:'scope-1'}] };
 const artifact = (id: string): VerifiedWorkArtifact => ({ artifactId:id,path:`docs/${id}.md`,revision:1,contentDigest:'a'.repeat(64),repoId:'repo',rootArtifactId:'DEF-root',storyId:'s1',status:'approved',approvedRevision:1,body:{},text:'approved text' });
 const plan = {...artifact('PLAN-root-s1'),body:{tasks:[{id:'t1',title:'Title',summary:'Detailed summary',order:1,dependsOn:[],acceptanceChecks:['check one','check two']} ]}};
 const inputs: VerifiedWorkInputs = {build:{artifactId:request.buildArtifactId,revision:1,sourceCommit:commit,repoId:'repo',rootArtifactId:'DEF-root',storyId:'s1'},route:'planned',plan,upstream:[artifact('LLD-root-s1')]};
 const packet = await readCommitPacket(new ReviewGitReader(f.dir),commit,parent);
 const proof: ScopeAttestation={ref:'scope-1',commitId:commit,parentId:parent,rootArtifactId:'DEF-root',storyId:'s1',buildArtifactId:request.buildArtifactId,sourceCommit:commit,exclusive:false,blockIds:[packet.blocks[0]!.blockId]};
 let current=inputs, attestation=proof;
 const deps={repoPath:f.dir, readWork:(r:PrepareReviewRequest)=>readApprovedWork(r,{readVerifiedInputs:async()=>current}),readAttestation:async()=>attestation,assertFresh:async()=>{}};
 return {...f, request, inputs, packet, deps, proof, commitId:commit,parentId:parent,setInputs:(v:VerifiedWorkInputs)=>{current=v;},setProof:(v:ScopeAttestation)=>{attestation=v;}};
}

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
