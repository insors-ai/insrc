import test from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import { impactFixture } from './impact-fixtures.js';
import { assessDesignResult, consolidateDesignReview } from '../results.js';
import { DesignResultSchema, designChunkResultSchema, DESIGN_ACCEPTED_LIMITATIONS } from '../contracts.js';
import { designFindingKey, effectiveDesignFindingOrigins } from '../provenance.js';
import { saveDesignCheckpoint, loadDesignCheckpoint } from '../checkpoint.js';
import { designPreservationDigest, designWorkflowDigest, validatePermanentDesignReview } from '../history.js';
import type { PermanentDesignReview } from '../history.js';

function permanent(t: Parameters<typeof impactFixture>[0]) {
 const f = impactFixture(t);
 f.checkpoint.attempts = [f.baseline];
 const record: PermanentDesignReview = {
  kind: 'design-chunk-review', schemaVersion: 1, reviewId: 'review-1', project: f.repo,
  artifactId: f.id, subject: f.prepared.subject, submitted: f.checkpoint.submitted,
  reviewer: f.prepared.subject.reviewer, attempts: [f.baseline], applicableAttempt: 1, status: 'passed',
  binding: { sourceRevision: { number: 1, contentHash: 'a'.repeat(64) },
   reviewedContentIdentity: f.baseline.baseline.contentIdentity,
   documentDigest: f.baseline.baseline.subjectFingerprints.document,
   workflowDigest: designWorkflowDigest(f.prepared.subject.workflow), author: 'controller' },
  preservationDigest: designPreservationDigest(f.checkpoint),
 };
 return { ...f, record, expected: { project: f.repo, artifactId: f.id } };
}
test('permanent payload validates exact history, party, binding, digest and version', t => {
 const f = permanent(t);
 assert.deepEqual(validatePermanentDesignReview(f.record, f.expected), f.record);
 for (const mutate of [
  (x: PermanentDesignReview) => { x.schemaVersion = 2 as 1; },
  (x: PermanentDesignReview) => { x.artifactId = 'LLD-bbbbbbbbbbbbbbbb-s1'; },
  (x: PermanentDesignReview) => { x.attempts = []; },
  (x: PermanentDesignReview) => { x.attempts[0]!.baseline.reviewedContent.document += 'tamper'; },
  (x: PermanentDesignReview) => { x.attempts[0]!.report!.counts.HIGH = 1; },
  (x: PermanentDesignReview) => { x.binding.author = x.reviewer; },
  (x: PermanentDesignReview) => { x.binding.workflowDigest = 'b'.repeat(64); },
 ]) { const changed = structuredClone(f.record); mutate(changed); assert.throws(() => validatePermanentDesignReview(changed, f.expected)); }
 const changed = structuredClone(f.checkpoint);
 changed.attempts[0]!.progress.sequence++;
 assert.equal(designPreservationDigest(changed), f.record.preservationDigest);
 changed.attempts[0]!.completedChunks[0]!.summary += 'meaningful';
 assert.notEqual(designPreservationDigest(changed), f.record.preservationDigest);
});
test('full and impact consolidation preserve 8194 limitations across checkpoint restart', async t => {
 const f = impactFixture(t);
 for (const r of f.baseline.completedChunks.slice(0, 2)) { r.limitations = Array.from({ length: 4097 }, (_, i) => 'limit-' + i); r.status = 'incomplete'; }
 f.baseline.status = 'incomplete';
 f.baseline.report = consolidateDesignReview('review-1', 1, f.prepared.subject, f.baseline.baseline.contentIdentity, f.plan, f.baseline.completedChunks);
 assert.equal(f.baseline.report.limitations.length, 8194);
 f.impact.mode = 'full'; f.impact.retainedCoverage = []; f.impact.directChunkIds = ['keep','edit'];
 f.current.plan = f.plan; f.current.impact = f.impact;
 f.current.completedChunks = structuredClone(f.baseline.completedChunks);
 f.current.status = 'incomplete';
 f.current.report = consolidateDesignReview('review-1', 2, f.prepared.subject, f.current.baseline.contentIdentity, f.plan, f.current.completedChunks, { impact: f.impact, attempts: [f.baseline, f.current] });
 assert.equal(f.current.report.limitations.length, 8194);
 f.checkpoint.attempts = [f.baseline, f.current];
 await saveDesignCheckpoint(f.repo, f.checkpoint);
 assert.equal((await loadDesignCheckpoint(f.repo, 'review-1'))!.attempts[1]!.report!.limitations.length, 8194);
});
test('impact consolidation carries more than 256 origins without weakening per-chunk findings', t => {
 const f = impactFixture(t);
 for (const [index, r] of f.baseline.completedChunks.slice(0, 2).entries()) {
  r.findings = Array.from({ length: 150 }, (_, i) => ({ id: `f-${index}-${i}`, severity: 'MED' as const, location: '/body/summary', message: 'Concern', evidenceReferences: [f.md] })); r.status = 'changes_requested';
 }
 f.baseline.status = 'changes_requested';
 f.baseline.report = consolidateDesignReview('review-1', 1, f.prepared.subject, f.baseline.baseline.contentIdentity, f.plan, f.baseline.completedChunks);
 const origins = effectiveDesignFindingOrigins([f.baseline], 1);
 assert.equal(origins.length, 300);
 f.impact.carriedFindingIds = origins.map(designFindingKey); f.current.plan = f.plan; f.current.impact = f.impact;
 f.current.completedChunks = structuredClone(f.baseline.completedChunks.filter(r => r.chunkId !== 'keep'));
 f.current.completedChunks[0]!.findings = []; f.current.completedChunks[0]!.status = 'passed';
 f.current.completedChunks[1]!.findingDecisions = origins.map(source => ({ source, action: 'carry', rationale: 'Still open', evidenceReferences: [f.md] }));
 const report = consolidateDesignReview('review-1', 2, f.prepared.subject, f.current.baseline.contentIdentity, f.plan, f.current.completedChunks, { impact: f.impact, attempts: [f.baseline, f.current] });
 assert.equal(report.impact!.effectiveFindingOrigins.length, 300); assert.equal(report.counts.MED, 300);
 const tooMany = structuredClone(f.baseline.completedChunks[0]!); tooMany.findings = Array.from({ length: 257 }, () => tooMany.findings[0]!);
 assert.equal(Value.Check(DesignResultSchema, tooMany), false);
});
test('host coverage diagnostics remain bounded without expanding model limitations', t => {
 const f = impactFixture(t), chunk = f.plan.chunks[1]!;
 const input = { ...f.baseline.completedChunks[1]!, status: 'incomplete', inspectedReferences: [], limitations: Array.from({ length: 8192 }, () => 'Unavailable') };
 const accepted = assessDesignResult(input, chunk, [], [f.md]);
 assert.ok(accepted.limitations.length > 8192); assert.ok(accepted.limitations.length <= DESIGN_ACCEPTED_LIMITATIONS);
 assert.equal(Value.Check(DesignResultSchema, accepted), true);
 assert.equal(Value.Check(designChunkResultSchema(chunk), accepted), false);
 assert.throws(() => assessDesignResult(accepted, chunk, [], [f.md]));
});

test('permanent history validates unfinished full prefixes before any report exists',t=>{
 const f=permanent(t),old=structuredClone(f.baseline),last=structuredClone(f.baseline);
 old.status='interrupted';delete old.report;old.completedChunks=old.completedChunks.slice(0,1);
 last.number=2;last.report!.attempt=2;f.record.attempts=[old,last];f.record.applicableAttempt=2;
 const seal=(r:PermanentDesignReview)=>{r.preservationDigest=designPreservationDigest({...f.checkpoint,attempts:r.attempts});return r;};
 assert.doesNotThrow(()=>validatePermanentDesignReview(seal(f.record),f.expected));
 for(const mutate of [
  (r:PermanentDesignReview)=>{delete r.attempts[0]!.plan;},
  (r:PermanentDesignReview)=>{r.attempts[0]!.plan!.coverage=[];},
  (r:PermanentDesignReview)=>{r.attempts[0]!.completedChunks[0]!.chunkId='edit';},
  (r:PermanentDesignReview)=>{r.attempts[0]!.completedChunks[0]!.inspectedReferences=[];},
  (r:PermanentDesignReview)=>{r.attempts[0]!.completedChunks[0]!.findings=[{id:'unreported',severity:'MED',location:'/body/summary',message:'Concern',evidenceReferences:[f.md]}];},
 ]){const r=structuredClone(f.record);mutate(r);assert.throws(()=>validatePermanentDesignReview(seal(r),f.expected));}
});
test('permanent history validates unfinished impact selection provenance and accepted prefixes',t=>{
 const f=permanent(t),partial=f.current,last=structuredClone(f.baseline);
 partial.plan=f.plan;partial.impact=f.impact;partial.status='failed';partial.completedChunks=[structuredClone(f.baseline.completedChunks[1]!)];
 last.number=3;last.report!.attempt=3;f.record.attempts=[f.baseline,partial,last];f.record.applicableAttempt=3;
 const seal=(r:PermanentDesignReview)=>{r.preservationDigest=designPreservationDigest({...f.checkpoint,attempts:r.attempts});return r;};
 assert.doesNotThrow(()=>validatePermanentDesignReview(seal(f.record),f.expected));
 for(const mutate of [
  (r:PermanentDesignReview)=>{r.attempts[1]!.impact!.retainedCoverage[0]!.fromAttempt=2;},
  (r:PermanentDesignReview)=>{r.attempts[1]!.impact!.directChunkIds=[];},
  (r:PermanentDesignReview)=>{r.attempts[1]!.completedChunks[0]!.chunkId='keep';},
  (r:PermanentDesignReview)=>{r.attempts[1]!.completedChunks[0]!.inspectedReferences=[];},
 ]){const r=structuredClone(f.record);mutate(r);assert.throws(()=>validatePermanentDesignReview(seal(r),f.expected));}
});
