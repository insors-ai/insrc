/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicationFixture } from './completion-fixtures.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { prepareCompletionPublication } from '../completion-publication.js';
import { completeInvestigationReview } from '../completion-receipt.js';
import { regenerateCodeReviewDocument,renderCodeReviewMd } from '../../rendering.js';
import { enforceCodeReviewGate } from '../../gate.js';
import { reviewedBuildFingerprint } from '../../build-freshness.js';
import { reviewRecordGap } from '../../record-validation.js';
import { authorPartyOf,reviewerPartyOf } from '../../../review/party.js';
const actor={id:'insrc:daemon',kind:'agent' as const,properties:{}};

test('Canonical investigation rendering regenerates without another content revision',async()=>{
 const f=await publicationFixture();try{
  const lifecycle=createRepoLifecycle(f.repo),deps={canonical:lifecycle.store,actor,current:async()=>({context:f.context,buildRecord:f.input.buildRecord})};
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input);
  const receipt=await completeInvestigationReview(f.store,f.leaseId,1,p.intentRef,f.context,deps);
  const before=await lifecycle.store.readHeadSnapshot(p.intent.artifactId),logs=(await lifecycle.history.log(p.intent.artifactId)).length;
  await assert.rejects(()=>regenerateCodeReviewDocument(lifecycle.store,p.intent.artifactId,async()=>{throw Error('render destination unavailable');}),/destination unavailable/);
  assert.equal(f.store.status().state,'completed');assert.equal(receipt.artifactRevision,1);
  let rendered='';const doc=await regenerateCodeReviewDocument(lifecycle.store,p.intent.artifactId,async value=>{rendered=value;});
  assert.equal(rendered,doc);assert.match(doc,/Investigation:\*\* source-only/);assert.ok(doc.includes(p.intent.checkpointDigest));assert.ok(doc.includes(p.intent.coverageRef));
  assert.equal(doc.includes('old\\n'),false);assert.equal(doc.includes('receiptRefs'),false);
  assert.deepEqual(await lifecycle.store.readHeadSnapshot(p.intent.artifactId),before);assert.equal((await lifecycle.history.log(p.intent.artifactId)).length,logs);
 }finally{f.cleanup();}
});
test('Legacy records independent approval overrides and unsupported versions retain explicit behavior',async()=>{
 const f=await publicationFixture();try{
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input),artifact=p.candidate;
  assert.notEqual(authorPartyOf(f.context.build.meta),reviewerPartyOf(artifact.meta));
  const {investigation:_,...body}=artifact.body;
  for(const mode of ['full','degraded'] as const){
   const legacy={...artifact,body:{...body,groundingMode:mode,verdict:mode==='degraded'?'warn' as const:'pass' as const}};
   assert.equal(reviewRecordGap(legacy),undefined);assert.match(renderCodeReviewMd(legacy),/Code review:/);
  }
  const jsonPath=join(f.repo,'.insrc','artifacts',`${p.intent.artifactId}.json`);
  const {mkdirSync}=await import('node:fs');mkdirSync(join(f.repo,'.insrc','artifacts'),{recursive:true});
  const build={...f.input.buildRecord,meta:{...f.input.buildRecord.meta,authoredBy:'controller'}};
  writeFileSync(join(f.repo,'.insrc','artifacts','BUILD-c32aa60534232f36-s1.json'),JSON.stringify(build));
  const blocked={...artifact,body:{...artifact.body,verdict:'block',counts:{high:1,med:0,low:0},dimensions:artifact.body.dimensions.map((d,i)=>i?d:{...d,findings:[{dimension:d.dimension,severity:'HIGH',location:'a.ts:1',message:'violation'}]})}};
  assert.equal(blocked.body.subject.buildFingerprint,reviewedBuildFingerprint(build));
  writeFileSync(jsonPath,JSON.stringify(blocked));
  assert.equal(enforceCodeReviewGate(f.repo,'c32aa60534232f36','s1',{enforce:true}).status,'blocked');
  assert.equal(enforceCodeReviewGate(f.repo,'c32aa60534232f36','s1',{enforce:true,overrideReview:'User accepts the risk'}).status,'overridden');
  const unsupported={...artifact,body:{...artifact.body,investigation:{...artifact.body.investigation!,version:2}}};
  writeFileSync(jsonPath,JSON.stringify(unsupported));const before=readFileSync(jsonPath,'utf8');
  const rejected=enforceCodeReviewGate(f.repo,'c32aa60534232f36','s1',{enforce:false,overrideReview:'Not a schema upgrade'});
  assert.equal(rejected.status,'blocked');assert.equal(readFileSync(jsonPath,'utf8'),before);
  assert.match(reviewRecordGap(unsupported)!,/Unsupported/);
 }finally{f.cleanup();}
});
