/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { completedInvestigationFixture } from './completion-fixtures.js';
import { adaptInvestigationReview } from '../completion-artifact.js';
import { foldCounts, foldVerdict, validateArtifact, validateReviewMode } from '../../record-validation.js';
import { reviewedBuildFingerprint } from '../../build-freshness.js';
import type { CompletionArtifactInput } from '../completion-artifact.js';

async function artifactFixture(){
 const f=await completedInvestigationFixture();
 const input:CompletionArtifactInput={view:f.view,context:f.context,linkage:{version:1,sourceMode:'source-only',operationId:'operation-1',
  runId:f.manifest.runId,subjectDigest:f.manifest.subjectDigest,policyDigest:f.manifest.policyDigest,checkpointDigest:f.view.state.checkpoint,
  coverageRef:'coverage-1',coverageDigest:'a'.repeat(64)},repoPath:f.repo,epicHash:'c32aa60534232f36',storyId:'s1',
  buildRecord:{meta:{revision:1},body:{commit:f.basis.subject.build.sourceCommit}},createdAt:'2026-10-29T12:00:00Z',model:'fixture'};
 return {...f,input};
}
test('Canonical investigation adaptation preserves finding identity severity and confidence',async()=>{
 const f=await artifactFixture();try{
  const row=f.view.state.ledger.coverage[0]!;
  const findings=(['HIGH','MED','LOW'] as const).map((severity,i)=>({findingId:`finding-${i}`,criterion:f.basis.criteria[i]!.id,severity,
   confidence:i===1?'observation' as const:'breach' as const,evidenceIds:row.evidenceIds,expectationRefs:[row.requirementRef],message:`Finding ${i}`}));
  const view={...f.view,state:{...f.view.state,ledger:{...f.view.state.ledger,findings,coverage:f.view.state.ledger.coverage.map(r=>r===row?{...r,disposition:'finding' as const,findingIds:findings.map(x=>x.findingId)}:r)}}};
  const artifact=await adaptInvestigationReview({...f.input,view});
  assert.equal(artifact.body.verdict,'block');assert.deepEqual(artifact.body.counts,{high:1,med:1,low:1});
  const adapted=artifact.body.dimensions.flatMap(d=>d.findings);
  for(const [i,original] of findings.entries()){
   const actual=adapted[i]!;assert.equal(actual.findingId,original.findingId);assert.equal(actual.dimension,original.criterion);
   assert.equal(actual.severity,original.severity);assert.equal(actual.confidence,original.confidence);
   assert.deepEqual(actual.evidenceIds,original.evidenceIds);assert.deepEqual(actual.expectationRefs,original.expectationRefs);assert.equal(actual.location,'a.ts:1');
  }
  assert.equal(artifact.meta.reviewedBy,'daemon');assert.equal(artifact.body.subject.buildRevision,1);
  assert.equal(artifact.body.subject.buildFingerprint,reviewedBuildFingerprint(f.input.buildRecord));
  assert.equal('ledger' in artifact.body,false);assert.equal('evidence' in artifact.body,false);
  await assert.rejects(()=>adaptInvestigationReview({...f.input,linkage:{...f.input.linkage,checkpointDigest:'0'.repeat(64)}}));
  await assert.rejects(()=>adaptInvestigationReview({...f.input,epicHash:'foreign'}));
 }finally{f.cleanup();}
});
test('Investigation mode parity and legacy full degraded verdict compatibility',async()=>{
 const f=await artifactFixture();try{
  const a=await adaptInvestigationReview(f.input),b=await adaptInvestigationReview({...f.input,linkage:{...f.input.linkage,sourceMode:'indexed-impact'}});
  assert.equal(a.body.verdict,'pass');assert.deepEqual(a.body.counts,b.body.counts);assert.equal(a.body.verdict,b.body.verdict);
  assert.equal(foldVerdict({high:0,med:1,low:0}),'warn');assert.equal(foldVerdict({high:0,med:0,low:1}),'pass');
  const {investigation:_,...body}=a.body;
  for(const groundingMode of ['full','degraded'] as const){
   const counts=foldCounts(body.dimensions),legacy={...a,body:{...body,groundingMode,counts,verdict:foldVerdict(counts,groundingMode==='degraded')}};
   assert.equal(validateArtifact(legacy,legacy.body.dimensions.map(d=>d.dimension)),null);
   assert.equal(legacy.body.verdict,groundingMode==='degraded'?'warn':'pass');
  }
  assert.match(validateReviewMode({...a.body,investigation:{...a.body.investigation!,version:2 as 1}})!,/Unsupported/);
  const {coverageRef:__,...missing}=a.body.investigation!;
  assert.ok(validateReviewMode({...a.body,investigation:missing as typeof a.body.investigation}));
 }finally{f.cleanup();}
});
