import {readFileSync} from 'node:fs';
import {readApprovedEvaluationOracle,scriptedEvaluationRecord,evaluateReviewRecords,evaluationOracleSchema} from '../review-investigation-evaluation.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,budget } from './review-investigation-fixtures.js';
import { InvestigationRepository } from '../review-investigation-repository.js';
import { InvestigationAdoptionPolicy,readApprovedEvidence,approvedEvidenceReference,RECONCILIATION_CLAUSE,PREDECESSOR_EPIC,preparePredecessorReconciliation } from '../review-investigation-adoption.js';
import { CanonicalReviewWorkAdapter } from '../review-investigation-work.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import { emptyLifecycle } from '../../workflow/artifact-core/decode.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';
import { scopedReviewCatalogDigest } from '../../shared/review-investigation-catalog.js';
import { investigationCapabilities } from '../review-investigation-gateway.js';
import { handleCodeReviewStep,DEFAULT_DEPS } from '../steps/code-review-step/handler.js';
import { rawControllerCall } from '../steps/code-review-step/__tests__/controller-client.js';
import type { NativeIsolationEvidence } from '../../agent/providers/investigation-session.js';
import type { InvestigationTurnV1 } from '../../workflow/code-review/investigation/continuation-types.js';

test('Opt in readiness and rollback retain status while refusing unsupported resumes',async(t)=>{
 const f=await fixture(true,false,false);try{
  let enabled=true;const repository=new InvestigationRepository({...f.repository.options,assertReady:async()=>{if(!enabled)throw Error('Disabled');},assertExecutionAllowed:()=>{if(!enabled)throw Error('Rollback');}});
  const accepted=await repository.start(f.start as Parameters<InvestigationRepository['start']>[0],budget),frame=await repository.advance(accepted.descriptor.runId,budget),turn=frame.turn as InvestigationTurnV1;
  enabled=false;
  for(let n=0;n<200&&(await repository.service.open(turn.runId)).store.status().owner;n++)await new Promise(resolve=>setTimeout(resolve,5));
  const status=await repository.view(turn.runId);assert.equal((status.status as {resume:{available:boolean}}).resume.available,false);assert.equal((await repository.service.open(turn.runId)).store.status().owner,null);assert.equal((await repository.service.open(turn.runId)).store.status().attempts.length,1);
  await assert.rejects(()=>repository.advance(turn.runId,budget));await assert.rejects(()=>repository.start({...f.start,requestId:'11111111-1111-1111-1111-111111111111'} as Parameters<InvestigationRepository['start']>[0],budget));
  await assert.rejects(()=>repository.advance('pre-S005-volatile-token',budget));assert.equal((await repository.cancel(turn.runId)).next,'status');
  const work=f.repository.work,lifecycle=new LifecycleService({store:f.repository.options.canonical}),actor={id:'github:fixture',kind:'person' as const,properties:{}};
  const put=async(id:string,data:unknown,approve=true,by:typeof actor|{id:string;kind:'agent';properties:{}}=actor)=>{await f.repository.options.canonical.write({id,description:'',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body:{title:'Protocol fixture only',reproduction:'Fixture',rootCause:'Fixture',fixIntent:JSON.stringify(data)},citations:[]}},by);if(approve)await lifecycle.apply(id,'approve',actor);const head=(await work.readCanonicalHead(id))!;return approvedEvidenceReference(id,head);};
  const unsignedEvidence={identity:{profileDigest:'a'.repeat(64),adapterVersion:'candidate-script-v1'}} as NativeIsolationEvidence;
  const probe=await put('ISSUE-1111111111111111',{version:1,kind:'review-investigation-installed-probe',origin:'installed-probe',evidence:unsignedEvidence});
  const oracleData=evaluationOracleSchema.parse(JSON.parse(readFileSync(new URL('./fixtures/review-evaluation-oracle.v1.json',import.meta.url),'utf8')));
  const adjudication=await put('ISSUE-2222222222222222',oracleData,true,{id:'insrc:oracle-author',kind:'agent',properties:{}});
  const oracle=await readApprovedEvaluationOracle(work,adjudication),binding={sourceCommit:f.commitId,sourceDigest:'b'.repeat(64),profileDigest:'a'.repeat(64),policyDigest:'c'.repeat(64),catalogDigest:scopedReviewCatalogDigest(false),schemaVersion:1 as const,adapterVersion:'candidate-script-v1',fixtureVersion:oracleData.fixtureVersion,oracleDigest:oracle.oracleDigest};
  const observations=oracleData.cases.map(c=>({caseId:c.caseId,foundDefects:c.requiredDefects,covered:c.requiredCoverage,unverified:[]}));
  const baseline=scriptedEvaluationRecord(binding,observations,[['fixture contract'],['fixture contract']],'policy-baseline-fixture'),candidateRecord=scriptedEvaluationRecord(binding,observations,[['fixture contract']],'policy-candidate-fixture');
  const evaluation=await put('ISSUE-3333333333333333',evaluateReviewRecords(oracle,baseline,candidateRecord));
  const readiness=await put('ISSUE-4444444444444444',{version:1,kind:'review-investigation-readiness',wire:1,canonical:1,sourceCommit:f.commitId,sourceDigest:'b'.repeat(64),evaluationRef:evaluation,backendRefs:{'source-only':probe,'indexed-impact':probe}});
  // Draft and wrong predecessor records never authorize execution.
  const draft=await put('ISSUE-5555555555555555',{kind:'draft'},false);await assert.rejects(()=>readApprovedEvidence(work,draft));
  const policy=new InvestigationAdoptionPolicy({work,selection:()=>({engine:'legacy',readiness,reconciliation:draft}),sourceDigest:()=> 'b'.repeat(64)});await assert.rejects(()=>policy.evidence('source-only'),/disabled/);
  const missing=new InvestigationAdoptionPolicy({work,selection:()=>({engine:'plan-investigation-v1',readiness,reconciliation:draft}),sourceDigest:()=> 'b'.repeat(64)});await assert.rejects(()=>missing.evidence('source-only'),/draft/);
  assert.equal(investigationCapabilities().defaultEngine,'legacy');assert.match(RECONCILIATION_CLAUSE,/CODE reviews only/);assert.match(RECONCILIATION_CLAUSE,/DEF\/HLD\/LLD/);assert.equal(PREDECESSOR_EPIC,'8315a11f29fd2812');
  await put(`ISSUE-${PREDECESSOR_EPIC}`,{kind:'predecessor-anchor'});
  const store=f.repository.options.canonical;
  const writeBody=async(id:string,body:Record<string,unknown>)=>{await store.write({id,description:'',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body,citations:[]}},actor);await lifecycle.apply(id,'approve',actor,{override:{reason:'Synthetic test setup; no installed backend certification'}});return approvedEvidenceReference(id,(await work.readCanonicalHead(id))!);};
  await writeBody(`HLD-${PREDECESSOR_EPIC}`,{nonFunctional:{performance:'Legacy performance target'}});
  const reconciliation=await writeBody(`AMD-${PREDECESSOR_EPIC}-1`,{amendment:{type:'nonFunctional.retarget',property:'performance',oldTarget:'Legacy performance target',newTarget:RECONCILIATION_CLAUSE}});
  const candidate=new InvestigationAdoptionPolicy({work,selection:()=>({engine:'plan-investigation-v1',readiness,reconciliation}),sourceDigest:()=> 'b'.repeat(64)});
  await t.test('Approved installed probe without signature is accepted without trust-key provisioning',async()=>{
   const loaded=await candidate.evidence('source-only');assert.equal(loaded.readiness.sourceCommit,f.commitId);assert.equal(loaded.report.signature,undefined);
  });
  let probeCase=0;
  const policyWithProbe=async(data:unknown)=>{
   const ref=await put(`ISSUE-${String(6000000000000000+probeCase++)}`,data);
   const ready=await put(`ISSUE-${String(7000000000000000+probeCase++)}`,{...(await candidate.evidence('source-only')).readiness,backendRefs:{'source-only':ref,'indexed-impact':ref}});
   return new InvestigationAdoptionPolicy({work,selection:()=>({engine:'plan-investigation-v1',readiness:ready,reconciliation}),sourceDigest:()=> 'b'.repeat(64)});
  };
  await t.test('Legacy signature metadata is inert and bounded',async()=>{
   const base={version:1,kind:'review-investigation-installed-probe',origin:'installed-probe',evidence:unsignedEvidence};
   assert.equal((await (await policyWithProbe({...base,signature:'not-a-cryptographic-signature'})).evidence('source-only')).report.signature,'not-a-cryptographic-signature');
   await assert.rejects(()=>(async()=> (await policyWithProbe({...base,signature:'x'.repeat(4097)})).evidence('source-only'))());
  });
  await t.test('Draft stale and tampered evidence remain refused',async()=>{
   const stale=await put('ISSUE-8888888888888888',{kind:'initial'});
   await put('ISSUE-8888888888888888',{kind:'edited'},false);
   await assert.rejects(()=>readApprovedEvidence(work,stale));
   await assert.rejects(()=>readApprovedEvidence(work,draft));
   await assert.rejects(()=>readApprovedEvidence(work,probe.replace(/#[a-f0-9]+$/,'#'+'0'.repeat(64))));
   const raw=await policyWithProbe({version:1,kind:'review-investigation-probe-observations',origin:'unsigned-installed-observations',evidence:unsignedEvidence});
   await assert.rejects(()=>raw.evidence('source-only'));
  });
  const oldHead=await store.readHeadSnapshot(`HLD-${PREDECESSOR_EPIC}`),proposal=await preparePredecessorReconciliation(work,lifecycle);assert.equal(proposal.pendingExternalApproval,true);assert.equal((await preparePredecessorReconciliation(work,lifecycle)).id,proposal.id);assert.equal((await store.readHeadSnapshot(`HLD-${PREDECESSOR_EPIC}`))!.digest,oldHead!.digest);const pending=(await work.readCanonicalHead(proposal.id))!;await assert.rejects(()=>readApprovedEvidence(work,approvedEvidenceReference(proposal.id,pending)),/draft/);
  await assert.rejects(()=>candidate.evidence('indexed-impact'),/Evaluation/);
  await assert.rejects(()=>candidate.adapter(f.dir,'source-only')); // No real installed qualification in this fixture.
  // An approved fixture-shaped report still cannot become a real native backend.
  const invalid=new InvestigationAdoptionPolicy({work,selection:()=>({engine:'plan-investigation-v1',readiness,reconciliation:adjudication}),sourceDigest:()=> 'b'.repeat(64)});await assert.rejects(()=>invalid.adapter(f.dir,'source-only'));
 }finally{f.close();}
});

test('Legacy S005 pre S005 design and installation order partitions remain compatible',async()=>{
 for(const order of [['legacy','investigation'],['investigation','legacy']] as const){
  let legacy=0,modern=0;const deps={...DEFAULT_DEPS,resolveSubject:async()=>{legacy++;return {ok:false as const,reason:'no-build-record' as const};},investigation:async()=>{modern++;throw Error('Missing approved readiness');}};
  for(const installed of order){
   const result=await handleCodeReviewStep(installed==='investigation'?{phase:'investigation',engine:'plan-investigation-v1'}:{phase:'start',repo:'/repo',epicHash:'1234567890abcdef',storyId:'s1'},deps);assert.equal(result.isError,true);
  }
  assert.equal(legacy,1);assert.equal(modern,1);
  const stale=await rawControllerCall({phase:'judgements',state:'pre-S005-token',judgements:{judgements:[]}},deps);assert.equal(stale.isError,true);
 }
});

test('Rollback retains accepted complete work for publication without new judgment',async()=>{
 const f=await fixture(false,false,false,true);try{
  let enabled=true;const repository=new InvestigationRepository({...f.repository.options,assertReady:async()=>{if(!enabled)throw Error('Rollback');},daemonAdapter:async(...args)=>{const adapter=await f.repository.options.daemonAdapter(...args);return {...adapter,execute:async(...turn)=>{const reply=await adapter.execute(...turn);return {...reply,next:{kind:'pause',remainingWork:[],reason:'Transport detached after all durable assessments'}};}};}});
  const accepted=await repository.start(f.start as Parameters<InvestigationRepository['start']>[0]);const first=await repository.advance(accepted.descriptor.runId);assert.equal(first.next,'status');assert.equal(f.calls(),1);
  enabled=false;await assert.rejects(()=>repository.advance(accepted.descriptor.runId));assert.equal(f.calls(),1);
  enabled=true;const completed=await repository.advance(accepted.descriptor.runId);assert.equal(completed.next,'done');assert.ok(completed.receipt);assert.equal(f.calls(),1);
 }finally{f.close();}
});

test('An exact start replay never schedules another completed or paused attempt',async()=>{
 const f=await fixture(false,false,false);try{const first=await f.dispatch(f.envelope(f.start));assert.equal(f.calls(),1);const replay=await f.dispatch(f.envelope(f.start));assert.equal(replay.runId,first.runId);assert.equal(f.calls(),1);assert.equal((await f.repository.service.open(String(first.runId))).store.status().attempts.length,1);}finally{f.close();}
});

test('Concurrent resume requests converge on one bounded invocation',async()=>{
 const f=await fixture(false,false,false);try{const accepted=await f.repository.start(f.start as Parameters<InvestigationRepository['start']>[0]);const first=f.repository.advance(accepted.descriptor.runId),second=f.repository.advance(accepted.descriptor.runId);assert.deepEqual(await first,await second);assert.equal(f.calls(),1);assert.equal((await f.repository.service.open(accepted.descriptor.runId)).store.status().attempts.length,1);}finally{f.close();}
});
