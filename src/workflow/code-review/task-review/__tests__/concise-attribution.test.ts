/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './publication-fixture.js';
import { prepareReviewPacket, deriveTaskAssignments } from '../packet.js';
import { attributionPrompt } from '../assessment.js';
import { checkpointPath } from '../checkpoint.js';
import type { AdmittedReview } from '../execution.js';

test('attribution input size is independent of source, document, test-output and feedback body sizes', async () => {
 const f=await fixture(true,3);
 try {
  const prepared=await prepareReviewPacket(f.packet,f.deps.sources);
  const checkpoint=f.checkpoint('concise'),prior=checkpoint.attempts[0]!;
  const attempt={...structuredClone(prior),header:{...prior.header,attempt:2}};
  checkpoint.attempts.push(attempt);
  const review:AdmittedReview={prepared,checkpoint,attempt,path:checkpointPath(f.repo,'concise')};
  const before=attributionPrompt(prepared,f.repo,review);
  const large='DO_NOT_EMBED_BODY_'.repeat(100000);
  const packet={...prepared.packet,functionalSummary:large,tests:prepared.packet.tests.map(t=>({...t,cases:[large],executionDetails:large,command:large}))};
  const expanded={...prepared,packet,documents:{...prepared.documents,plan:large},tasks:prepared.tasks.map(t=>({...t,summary:large,acceptanceChecks:[large]})),
   changes:prepared.changes.map(c=>({...c,after:c.after?{...c.after,bytes:Buffer.from(large)}:null}))};
  prior['review-response'].summary=large;
  for(const result of prior['review-response'].tasks)result.summary=large;
  const after=attributionPrompt(expanded,f.repo,{...review,prepared:expanded});
  assert.equal(after,before,'bulk evidence stays out of attribution, without truncation');
  assert.ok(after.length<12000);
  assert.ok(!after.includes('DO_NOT_EMBED_BODY_'));
  assert.ok(after.includes(review.path));
  for(const doc of Object.values(packet.documents))assert.ok(after.includes(`${doc.commit}`)&&after.includes(doc.path));
  for(let index=0;index<expanded.changes.length;index++)assert.ok(after.includes(`"index":${index}`));
  assert.match(after,/"after":\[1,1\]/);
  assert.match(after,/"testIndexes|testIndexes/);
  assert.match(after,/sourceAttempt/);
  assert.match(after,/current checkout/);
 } finally {f.cleanup();}
});

test('concise attribution preserves complete change and test coverage validation',async()=>{
 const f=await fixture(true,3);
 try{
  const p=await prepareReviewPacket(f.packet,f.deps.sources);
  const rows=p.tasks.map(t=>({taskId:t.id,changeIndexes:p.changes.map((_,i)=>i),testIndexes:p.packet.tests.map((_,i)=>i)}));
  assert.equal(deriveTaskAssignments(p,rows).length,3);
  assert.throws(()=>deriveTaskAssignments(p,rows.map(r=>({...r,changeIndexes:[]}))),/change|coverage|attribution/i);
  assert.throws(()=>deriveTaskAssignments(p,rows.map(r=>({...r,testIndexes:[]}))),/test|coverage|attribution/i);
 }finally{f.cleanup();}
});
