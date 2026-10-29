/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { subjectFixture } from '../../workflow/code-review/investigation/__tests__/fixtures.js';
import { prepareReviewSubject } from '../../workflow/code-review/investigation/subject.js';
import { CanonicalReviewWorkAdapter,approvedScopeReference } from '../review-investigation-work.js';
import { ArtifactStore } from '../../workflow/artifact-core/store.js';
import { History } from '../../workflow/artifact-core/history.js';
import { createFileSidecarStore } from '../../workflow/artifact-core/sidecar-store.js';
import { createFileJournal } from '../../workflow/artifact-core/journal.js';
import { creationContextProvider } from '../../workflow/artifact-core/codecs.js';
import { emptyLifecycle } from '../../workflow/artifact-core/decode.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
const hash='c32aa60534232f36',root=`ISSUE-${hash}`,buildId=`BUILD-${hash}-s1`,planId=`PLAN-${hash}-s1`,scopeId='ISSUE-1234567890abcdef';
const actor={id:'github:fixture',kind:'person' as const,properties:{}};

test('Canonical approved planned and upstream scope rejects ambiguous attribution',async()=>{
 const f=await subjectFixture();try{
  f.write('unrelated.txt','unrelated HEAD');f.commit();
  const history=new History(createFileSidecarStore(f.dir));
  const store=new ArtifactStore({repoPath:f.dir,history,journal:createFileJournal(f.dir),contexts:creationContextProvider(f.dir,{rootKinds:['ISSUE','PLAN','BUILD']})});
  const service=new LifecycleService({store,evidence:{taskBuildPassed:async()=>true,storyCodeReview:async()=>({kind:'clean'})}});
  const create=async(id:string,body:Record<string,unknown>,approve=true)=>{
   await store.write({id,description:'',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body,citations:[]}},actor);
   if(approve)await service.apply(id,'approve',actor);
  };
  const issue={title:'Review fixture',reproduction:'Changed source',rootCause:'Fixture',fixIntent:'Keep exact scope'};
  await create(root,issue);await create(buildId,{commit:f.commitId,tasks:[{id:'t1',passed:true}]},false);
  let registered=true;
  const adapter=new CanonicalReviewWorkAdapter({repoPath:f.dir,repoId:'repo',canonical:store,assertRegistered:async()=>{if(!registered)throw Error('unregistered repository');}});
  const proof={...f.proof,rootArtifactId:root,buildArtifactId:buildId};const {ref:_,...bodyProof}=proof;
  await create(scopeId,{...issue,fixIntent:JSON.stringify({kind:'review-scope-v1',attestations:[bodyProof]})});
  const reference=approvedScopeReference(scopeId,1,bodyProof);
  const request={...f.request,rootArtifactId:root,buildArtifactId:buildId,selections:[{...f.request.selections[0]!,attestationRef:reference}]};
  const deps={repoPath:f.dir,readWork:adapter.readWork,readAttestation:(ref:string)=>adapter.readAttestation(ref,request),assertFresh:(work:Parameters<typeof adapter.assertFresh>[0])=>adapter.assertFresh(work)};
  const initial=await adapter.readWork(request);assert.equal(initial.taskBasis,'approved-upstream');assert.equal(initial.tasks.length,0);
  await assert.rejects(()=>adapter.readAttestation('story-trailer-only',request),{code:'ambiguous-attribution'});
  await assert.rejects(()=>prepareReviewSubject({...request,selections:[{...request.selections[0]!,blockIds:f.packet.blocks.map(b=>b.blockId)}]},deps),{code:'ambiguous-attribution'});
  // A separately approved revision can explicitly attest both selected blocks, including unplanned scope.
  const all={...bodyProof,blockIds:f.packet.blocks.map(b=>b.blockId)};
  await service.updateContent(scopeId,actor,{body:{...issue,fixIntent:JSON.stringify({kind:'review-scope-v1',attestations:[all]})},citations:[]});
  await service.apply(scopeId,'approve',actor);
  request.selections[0]!.attestationRef=approvedScopeReference(scopeId,2,all);
  const subject=await prepareReviewSubject(request,deps);
  assert.equal(subject.packets[0]!.blocks.length,f.packet.blocks.length);assert.equal(subject.build.sourceCommit,f.commitId);
  assert.ok(subject.packets.flatMap(p=>p.blocks).every(b=>b.oldPath==='a.txt'));await adapter.assertFresh(initial);
  const plan={tasks:[{id:'t1',title:'Keep',summary:'Keep data',size:'S',order:1,dependsOn:[],acceptanceChecks:['Keep source pinned'],derivedFrom:[],tests:[]}],testStrategyCoverage:[]};
  await create(planId,plan,false);
  await assert.rejects(()=>adapter.readWork(request),{code:'unapproved-contract'});
  await service.apply(planId,'approve',actor);
  const planned=await adapter.readWork(request);assert.equal(planned.taskBasis,'approved-plan');assert.equal(planned.tasks.length,1);
  assert.ok(planned.contractText[planId]!.includes('Keep data'));
  await assert.rejects(()=>adapter.assertFresh(initial),{code:'stale-contract'});
  await service.updateContent(buildId,actor,{body:{commit:f.git('rev-parse','HEAD'),tasks:[{id:'t1',passed:true}]},citations:[]});
  await assert.rejects(()=>adapter.assertFresh(planned),{code:'stale-contract'});
  await assert.rejects(()=>adapter.readAttestation(request.selections[0]!.attestationRef,request),{code:'ambiguous-attribution'});
  const path=join(f.dir,'.insrc','artifacts',`${planId}.json`),raw=JSON.parse(readFileSync(path,'utf8'));
  raw.body.tasks[0].summary='human edit without lifecycle revision';writeFileSync(path,JSON.stringify(raw));
  await assert.rejects(()=>adapter.readWork(request),{code:'stale-contract'});
  registered=false;await assert.rejects(()=>adapter.readWork(request),/unregistered repository/);
 }finally{f.close();}
});
