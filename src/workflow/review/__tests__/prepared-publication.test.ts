import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, hash } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { impactFixture } from '../design-review/__tests__/impact-fixtures.js';
import { CodePreparation } from '../code-preparation.js';
import { DesignPreparation } from '../design-preparation.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { preparationDigest, PreparedContextReader } from '../prepared-context.js';
import { HistoryBindingSession } from '../history-binding.js';
import type { PreparationHistory } from '../history-binding.js';
import { codeHistoryFeedback, designHistoryFeedback } from '../history-feedback.js';
import { validatePublicationProof, publicationEvidenceDigest } from '../publication-proof.js';
import { reviewWorkerCheckpoint } from '../../../daemon/threads/review-worker-contract.js';
import { publishTaskCheckpoint } from '../../code-review/task-review/publication.js';
import { publishDesignReview } from '../design-review/publication.js';
import { readTaskReviewHistory } from '../../code-review/task-review/history.js';
import { validateTaskBody, codeReviewPreservationDigest, mergePreparationHistory, mergeTaskSummary } from '../../code-review/task-review/record.js';
import { validatePermanentDesignReview } from '../design-review/history.js';
import { recordDesignAdmission, requireCurrentDesignApproval } from '../design-review/approval.js';
import { enforceCodeReviewGate } from '../../code-review/gate.js';
import { attributionIdentity, bindTaskFinalIdentities } from '../../code-review/task-review/attribution-binding.js';
import { completedSummary } from '../../code-review/task-review/summary.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';

import { runtime } from './prepared-publication-fixture.js';

test('prepared code publication preserves complete input and closed proof across failed render, warm retry and temp deletion', async t => {
 const f = await fixture(true), key = { project: f.repo, family: 'code' as const, reviewId: 'publication' };
 const limits = reviewPreparationLimits(join(f.repo, 'missing.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const cold = await CodePreparation.create(key, f.deps.sources, limits, capacity);
 let closed = false; t.after(async () => { if (!closed) await cold.close(); f.cleanup(); });
 const admitted = await cold.prepare(f.repo, key.reviewId, 1, undefined, 'daemon', cold.sources, { operation: 'resume', epicHash: hash });
 const source = await cold.seal(admitted), reader = await PreparedContextReader.open(source, limits, async () => {}, async e => { throw e; });
 const warm = await CodePreparation.reuse(key, reader, cold.sources, limits, capacity);
 const done = { ...f.checkpoint(), schemaVersion: 3 as const, runtime: { runtimeId: 'code-runtime', inputDigest: source.inputDigest } };
 const initial = structuredClone(done); initial.attempts[0]!['review-response'].tasks = []; delete initial.attempts[0]!.header.completedAt;
 const host = await runtime(source, initial); t.after(() => host.store.release(host.handle));
 const validate = codeHistoryFeedback(new Map([[1, admitted.prepared]]), cold.sources, async () => ({ publication: { artifactId: `CR-${hash}-s1`, preservationDigest: codeReviewPreservationDigest(await readTaskReviewHistory(f.repo, hash, 's1')) } }));
 const history = await HistoryBindingSession.open(source, initial, { authorize: async () => source, validate, limits, capacity, invalidateSource: async e => { throw e; } });
 await host.accept(history.latest()); done.attempts[0]!.header.status = 'passed'; await host.accept(await history.accept(done));
 const physical = cold.sourceMetrics()!.physicalQueries;
 const deps = { ...f.deps, sources: cold.sources, preparation: {
  preparePacket: warm.publicationPacket,
  authorize: (cp: PreparationHistory) => host.authorize(cp, history.latest()),
  save: async (cp: Parameters<typeof history.accept>[0]) => { await host.accept(await history.accept(cp)); },
 } };
 await assert.rejects(publishTaskCheckpoint(f.repo, hash, key.reviewId, { ...deps, renderWrite: () => { throw Error('render interruption'); } }), /render interruption/);
 const published = await publishTaskCheckpoint(f.repo, hash, key.reviewId, deps), revision = f.readRecord(published.jsonPath).meta.revision;
 await publishTaskCheckpoint(f.repo, hash, key.reviewId, deps);
 assert.equal(cold.sourceMetrics()!.physicalQueries, physical, 'warm publication never reconstructs pinned sources');
 const record = f.readRecord(published.jsonPath); assert.equal(record.meta.schemaVersion, 4); assert.equal(record.meta.revision, revision);
 assert.deepEqual(record.body.preparationHistories![0]!.checkpoint.attempts[0]!.submitted, f.packet);
 assert.equal(record.body.preparationHistories![0]!.proof.runtime.state, 'terminal');
 // Pure permanent-history merge: a later valid audit must not discard the
 // earlier runtime or permit its input to be rewritten under a fresh digest.
 const archive = structuredClone(record.body.preparationHistories![0]!), next = structuredClone(archive);
 const second = structuredClone(next.checkpoint.attempts[0]!); second.header.attempt = 2;
 assert.ok('review-response' in second);
 second.header.acceptedAttribution = second.header.acceptedAttribution!.map(row => ({ ...row, decision: { action: 'reassess', reason: 'New attempt' } }));
 second.header.attributionIdentity = attributionIdentity('accepted', second.header.finalScopeIdentity!, second.header.selectedTaskIds, second.submitted.tests.length,
  second.header.acceptedAttribution.map(row => ({ ...row, identity: second.header.taskScopeIdentities!.find(t => t.taskId === row.taskId)!.identity })));
 next.checkpoint.attempts.push(second); next.checkpoint.runtime.runtimeId = 'next-runtime';
 next.proof.runtime.runtimeId = 'next-runtime'; next.proof.runtime.attempt = 2;
 next.proof.binding.attempt = 2; next.proof.binding.generationId = preparationDigest('next-generation');
 next.proof.binding.bindingDigest = preparationDigest({ ...next.proof.binding, bindingDigest: '' });
 next.proof.runtime.checkpointBinding.historyBindingDigest = next.proof.binding.bindingDigest;
 next.proof.runtime.committedResultBoundary = { semanticSequence: next.proof.binding.semanticSequence, historyBindingDigest: next.proof.binding.bindingDigest };
 next.checkpoint.context = { generationId: next.proof.binding.generationId, manifestDigest: next.proof.manifestDigest, historyBindingDigest: next.proof.binding.bindingDigest };
 next.proof.evidenceDigest = publicationEvidenceDigest(next.checkpoint);
 const { preparationHistories, ...working } = record.body;
 assert.throws(() => mergeTaskSummary(record.body, completedSummary(admitted.prepared, second, key.reviewId)), /latest permanent attempt/, 'an old publisher cannot add uncovered attempts to a new capability');
 const merged = mergePreparationHistory({ ...mergeTaskSummary(working, completedSummary(admitted.prepared, second, key.reviewId)), preparationHistories: preparationHistories! }, next);
 assert.deepEqual(merged.preparationHistories![0]!.earlierProofs, [archive.proof]);
 const rewritten = structuredClone(merged); rewritten.preparationHistories![0]!.checkpoint.attempts[0]!.submitted.functionalSummary = 'rewritten old input';
 rewritten.preparationHistories![0]!.proof.evidenceDigest = publicationEvidenceDigest(rewritten.preparationHistories![0]!.checkpoint);
 assert.throws(() => validateTaskBody(rewritten), /proof/, 'old closed audit rejects prefix tampering even with a new current digest');
 assert.equal(enforceCodeReviewGate(f.repo, hash, 's1').status, 'pass');
 f.build.meta.authoredBy = 'daemon'; f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`, f.build);
 assert.equal(enforceCodeReviewGate(f.repo, hash, 's1').status, 'blocked', 'fresh author is never cached');
 await assert.rejects(publishTaskCheckpoint(f.repo, hash, key.reviewId, deps), /independent of current BUILD author/);
 f.build.meta.authoredBy = 'controller'; f.build.body.summary = 'Changed BUILD'; f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`, f.build);
 assert.equal(enforceCodeReviewGate(f.repo, hash, 's1').status, 'blocked', 'fresh BUILD is never cached');
 await assert.rejects(publishTaskCheckpoint(f.repo, hash, key.reviewId, deps), /Current BUILD differs/);
 const bad = structuredClone(record.body); bad.preparationHistories![0]!.checkpoint.attempts[0]!.submitted.functionalSummary = 'tampered';
 assert.throws(() => validateTaskBody(bad), /proof/);
 const mislabeled = { ...record, meta: { ...record.meta, schemaVersion: 2 } }; await writeFile(published.jsonPath, JSON.stringify(mislabeled));
 assert.equal(enforceCodeReviewGate(f.repo, hash, 's1').status, 'blocked', 'new proof cannot masquerade as old capability');
 await writeFile(published.jsonPath, JSON.stringify(record));
 await cold.close(); closed = true;
 await rm(join(f.repo, '.insrc/tmp'), { recursive: true, force: true });
 assert.deepEqual(await readTaskReviewHistory(f.repo, hash, 's1'), record.body, 'permanent read requires no temporary bytes');
});

test('prepared design publication emits capability three and retries one permanent full history without models or temporary context', async t => {
 const f = impactFixture(t), key = { project: f.repo, family: 'design' as const, reviewId: 'review-1' };
 const limits = reviewPreparationLimits(join(f.repo, 'missing.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const preparation = new DesignPreparation(key, 1, limits, capacity, f.checkpoint.submitted);
 preparation.prepare(f.repo, f.json); const source = await preparation.seal();
 const done = { ...f.checkpoint, schemaVersion: 3 as const, attempts: [f.baseline], runtime: { runtimeId: 'design-runtime', inputDigest: source.inputDigest } };
 const initial = structuredClone(done); initial.attempts[0]!.status = 'running'; initial.attempts[0]!.completedChunks = []; delete initial.attempts[0]!.report;
 const host = await runtime(source, initial); t.after(() => host.store.release(host.handle));
 const lifecycle = createRepoLifecycle(f.repo);
 await recordDesignAdmission({ ...f.checkpoint, attempts: [f.baseline] });
 const validate = designHistoryFeedback(async () => {
  const entry = (await lifecycle.history.log(f.id)).find(e => e.operation === 'review')!;
  const record = validatePermanentDesignReview(entry.outcome!.data, { project: f.repo, artifactId: f.id });
  return { publication: { artifactId: f.id, preservationDigest: record.preservationDigest } };
 });
 const history = await HistoryBindingSession.open(source, initial, { authorize: async () => source, validate, limits, capacity, invalidateSource: async e => { throw e; } });
 await host.accept(history.latest()); await host.accept(await history.accept(done));
 const cp = JSON.parse(await readFile(reviewWorkerCheckpoint(key), 'utf8')) as typeof done;
 const deps = { preparation: { authorize: (checkpoint: PreparationHistory) => host.authorize(checkpoint, history.latest()) } };
 const published = await publishDesignReview(cp, deps);
 assert.deepEqual(await publishDesignReview(cp, deps), published);
 cp.attempts[0]!.publication = published; await host.accept(await history.accept(cp));
 const log = await createRepoLifecycle(f.repo).history.log(f.id), reviews = log.filter(e => e.operation === 'review'); assert.equal(reviews.length, 1);
 const record = validatePermanentDesignReview(reviews[0]!.outcome!.data, { project: f.repo, artifactId: f.id });
 assert.ok((await requireCurrentDesignApproval(f.repo, await lifecycle.store.read(f.id), await lifecycle.history.log(f.id))).expectedHeadHash, 'approval reads current format-3 checkpoint without source reconstruction');
 assert.equal(record.schemaVersion, 3); assert.deepEqual(record.attempts[0]!.completedChunks, f.baseline.completedChunks);
 const bad = structuredClone(record); if (bad.schemaVersion === 3) bad.preparation.proof.runtime.resourceGuard.openLeases.push({ operationId: 'open', workerIncarnation: 'worker', kind: 'tool', openedAt: new Date().toISOString() });
 assert.throws(() => validatePermanentDesignReview(bad, { project: f.repo, artifactId: f.id }), /proof/);
 await rm(join(f.repo, '.insrc/tmp'), { recursive: true, force: true });
 assert.deepEqual(validatePermanentDesignReview(record, { project: f.repo, artifactId: f.id }), record);
 assert.ok((await requireCurrentDesignApproval(f.repo, await lifecycle.store.read(f.id), await lifecycle.history.log(f.id))).expectedHeadHash, 'permanent approval is independent of removed temp evidence');
 const rawHead = JSON.parse(await readFile(f.json, 'utf8')); rawHead.meta.authoredBy = 'daemon'; await writeFile(f.json, JSON.stringify(rawHead, null, 2) + '\n');
 await assert.rejects(requireCurrentDesignApproval(f.repo, await lifecycle.store.read(f.id), await lifecycle.history.log(f.id)), /independent|review|author/i);
});

test('permanent preparation proof refuses unknown capability', () => {
 assert.throws(() => validatePublicationProof({ schemaVersion: 99 }, {} as PreparationHistory, { project: '/repo', family: 'code', reviewId: 'x' }), /Unsupported/);
});

test('prepared code publication preserves an earlier qualified failure without promoting its retained scope headers to signoff', async t => {
 const f = await fixture(true), key = { project: f.repo, family: 'code' as const, reviewId: 'publication' };
 const failed = f.checkpoint(), first = failed.attempts[0]!;
 first.header.status = 'failed'; first['review-response'].tasks = []; first['review-response'].error = 'Original provider failure';
 await writeFile(reviewWorkerCheckpoint(key), JSON.stringify(failed));
 const limits = reviewPreparationLimits(join(f.repo, 'missing.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const cold = await CodePreparation.create(key, f.deps.sources, limits, capacity);
 t.after(async () => { await cold.close(); f.cleanup(); });
 const admitted = await cold.prepare(f.repo, key.reviewId, 2, f.packet, 'daemon', cold.sources, { operation: 'start', epicHash: hash });
 await bindTaskFinalIdentities(admitted, [{ taskId: 't1', changeIndexes: [0], testIndexes: [0], decision: { action: 'reassess', reason: 'Prior attempt failed' } }]);
 const source = await cold.seal(admitted), reader = await PreparedContextReader.open(source, limits, async () => {}, async e => { throw e; });
 const warm = await CodePreparation.reuse(key, reader, cold.sources, limits, capacity);
 const prior = await cold.publicationPacket(first.submitted, cold.sources, true, undefined, first.header.derived);
 const initial = { ...admitted.checkpoint, schemaVersion: 3 as const, runtime: { runtimeId: 'recovered-runtime', inputDigest: source.inputDigest } };
 const host = await runtime(source, initial); t.after(() => host.store.release(host.handle));
 const validate = codeHistoryFeedback(new Map([[1, prior], [2, admitted.prepared]]), cold.sources, async () => ({ publication: { artifactId: `CR-${hash}-s1`, preservationDigest: codeReviewPreservationDigest(await readTaskReviewHistory(f.repo, hash, 's1')) } }));
 const history = await HistoryBindingSession.open(source, initial, { authorize: async () => source, validate, limits, capacity, invalidateSource: async e => { throw e; } });
 await host.accept(history.latest());
 const complete = structuredClone(initial), last = complete.attempts.at(-1)!;
 last.header.status = 'passed'; last.header.completedAt = new Date().toISOString(); last['review-response'].tasks = [structuredClone(f.result)];
 await host.accept(await history.accept(complete)); const physical = cold.sourceMetrics()!.physicalQueries;
 const deps = { ...f.deps, sources: cold.sources, preparation: { preparePacket: warm.publicationPacket,
  authorize: (cp: PreparationHistory) => host.authorize(cp, history.latest()),
  save: async (cp: PreparationHistory) => { await host.accept(await history.accept(cp)); } } };
 const published = await publishTaskCheckpoint(f.repo, hash, key.reviewId, deps); await publishTaskCheckpoint(f.repo, hash, key.reviewId, deps);
 const body = await readTaskReviewHistory(f.repo, hash, 's1'); assert.equal(body.status, 'passed');
 assert.equal(f.readRecord(published.jsonPath).meta.schemaVersion, 4); assert.equal(cold.sourceMetrics()!.physicalQueries, physical);
 const summary = body.reviews.find(r => r.attempt === 1)!;
 assert.deepEqual(summary.failedAttempt, first); assert.equal(summary.finalScopeIdentity, undefined); assert.equal(summary.buildFingerprint, undefined);
 assert.ok(summary.failedAttempt!.header.finalScopeIdentity); assert.ok(summary.failedAttempt!.header.buildFingerprint);
 assert.deepEqual(body.preparationHistories![0]!.checkpoint.attempts[0], first);
 const tampered = structuredClone(body); delete tampered.reviews.find(r => r.attempt === 1)!.failedAttempt!.header.buildFingerprint;
 assert.throws(() => validateTaskBody(tampered), /history disagrees/);
});

test('publication bookkeeping errors do not change assessment authority and remain in the main phase audit',async t=>{
 const {publishedCleanupFixture}=await import('./prepared-publication-fixture.js');
 const {authorizePreparedCleanup}=await import('../cleanup-authorization.js');
 const {persistReviewRuntimeAudit,reviewRuntimeAudits}=await import('../runtime-audit.js');
 const f=await publishedCleanupFixture('code',t),first=await authorizePreparedCleanup(f.target,f.key,f.store);
 const cp=structuredClone(first.history),last=cp.attempts.at(-1)!;assert.ok('review-response'in last);
 const diagnostic='CR publication failed: interrupted rendering after permanent publication';last['review-response'].error=diagnostic;
 assert.equal(publicationEvidenceDigest(cp),first.proof.evidenceDigest);validatePublicationProof(first.proof,cp,f.key);
 assert.equal(last['review-response'].error,diagnostic,'normalization cannot mutate canonical diagnostics');
 await persistReviewRuntimeAudit(f.store,first.permanent.artifactId,f.key,{runtime:first.proof.runtime,checkpointRuntime:cp.runtime,checkpointDigest:preparationDigest(cp),context:cp.context!,publication:first.proof,publicationError:diagnostic});
 const audits=reviewRuntimeAudits(await f.store.history.log(first.permanent.artifactId),first.permanent.artifactId,f.key);
 assert.equal(audits.at(-1)!.publicationError,diagnostic);
 last['review-response'].error='Reviewer execution failed';assert.notEqual(publicationEvidenceDigest(cp),first.proof.evidenceDigest);
});
