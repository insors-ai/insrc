import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fixture, hash } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { impactFixture } from '../design-review/__tests__/impact-fixtures.js';
import { CodePreparation } from '../code-preparation.js';
import { DesignPreparation } from '../design-preparation.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import type { ReadyContextReceipt } from '../prepared-context.js';
import { HistoryBindingSession, verifyHistoryBoundaryReceipt } from '../history-binding.js';
import type { PreparationHistory, HistoryBoundaryReceipt } from '../history-binding.js';
import { codeHistoryFeedback, designHistoryFeedback } from '../history-feedback.js';
import { publicationProof } from '../publication-proof.js';
import { ReviewRuntimeStore } from '../../../daemon/threads/review-runtime-store.js';
import { reviewWorkerCheckpoint } from '../../../daemon/threads/review-worker-contract.js';
import { publishTaskCheckpoint } from '../../code-review/task-review/publication.js';
import { publishDesignReview } from '../design-review/publication.js';
import { codeReviewPreservationDigest } from '../../code-review/task-review/record.js';
import { readTaskReviewHistory } from '../../code-review/task-review/history.js';
import { validatePermanentDesignReview } from '../design-review/history.js';
import { recordDesignAdmission } from '../design-review/approval.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { nextLifecycle } from '../../artifact-core/lifecycle.js';
import { buildArtifactId } from '../../storage.js';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';
import type { ReviewCleanupTarget } from '../cleanup-owner.js';
import { upgradePreparationHistory } from '../preparation-migration.js';

export async function runtime(source: ReadyContextReceipt, history: PreparationHistory) {
 const store = new ReviewRuntimeStore(), state: ReviewRuntime = { schemaVersion: 1, key: source.key, attempt: source.attempt,
  runtimeId: history.runtime.runtimeId, daemonEpoch: 'epoch', workerIncarnation: 'worker', sequence: 0,
  checkpointBinding: { inputDigest: source.inputDigest, semanticSequence: 0 }, state: 'initializing',
  resourceGuard: { daemonInstance: 'epoch', openLeases: [] },
  progress: { completedUnits: 0, totalUnits: null, observedAt: new Date().toISOString(), lastMeaningfulActivityAt: null } };
 const handle = await store.initialize(state); await mkdir(dirname(reviewWorkerCheckpoint(source.key)), { recursive: true });
 await writeFile(reviewWorkerCheckpoint(source.key), JSON.stringify(history)); await store.activate(handle);
 const accept = (receipt: HistoryBoundaryReceipt) => store.acceptHistory(handle, receipt, () => verifyHistoryBoundaryReceipt(receipt, source));
 const authorize = async (checkpoint: PreparationHistory, receipt: HistoryBoundaryReceipt) => publicationProof(
  await store.sealPublication(handle, receipt, () => verifyHistoryBoundaryReceipt(receipt, source), async () => {}), receipt, source, checkpoint);
 return { store, handle, accept, authorize };
}

type Hooks = { after(fn: () => void | Promise<void>): void };
function migrate(history: PreparationHistory, source: ReadyContextReceipt): PreparationHistory {
 const { runtime: ref, context: _context, ...old } = history;
 const historical = { ...old, schemaVersion: 2, attempts: old.attempts.map(a => ({ ...a, resourceGuard: { daemonInstance: 'historical-epoch', openLeases: [] } })) };
 return upgradePreparationHistory(historical, source.key, { schemaVersion: 1, key: source.key, attempt: source.attempt,
  runtimeId: ref.runtimeId, daemonEpoch: 'epoch', workerIncarnation: 'worker', sequence: 0, checkpointBinding: { inputDigest: ref.inputDigest, semanticSequence: 0 },
  state: 'initializing', resourceGuard: { daemonInstance: 'epoch', openLeases: [] }, progress: { completedUnits: 0, totalUnits: null, observedAt: new Date().toISOString(), lastMeaningfulActivityAt: null } });
}
export async function publishedCleanupFixture(family: 'code' | 'design', t: Hooks, options: { migrated?: boolean } = {}) {
 const actor = { id: 'person:test', kind: 'person' as const, properties: {} };
 if (family === 'code') {
  const f = await fixture(true), key = { project: f.repo, family, reviewId: 'publication' };
  const limits = reviewPreparationLimits(join(f.repo, 'missing.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
  const cold = await CodePreparation.create(key, f.deps.sources, limits, capacity);
  const admitted = await cold.prepare(f.repo, key.reviewId, 1, undefined, 'daemon', cold.sources, { operation: 'resume', epicHash: hash }), source = await cold.seal(admitted);
  const done: import('../preparation-checkpoint.js').CodePreparationCheckpoint = { ...f.checkpoint(), schemaVersion: 3 as const, runtime: { runtimeId: 'code-runtime', inputDigest: source.inputDigest } };
  let initial = structuredClone(done); const initialAttempt = initial.attempts[0]!; if (!('review-response' in initialAttempt)) throw Error('Qualified fixture required'); initialAttempt['review-response'].tasks = []; delete initialAttempt.header.completedAt;
  if (options.migrated) { initial = migrate(initial, source) as typeof initial; done.migration = initial.migration; }
  const host = await runtime(source, initial); t.after(() => { host.store.release(host.handle); f.cleanup(); });
  const validate = codeHistoryFeedback(new Map([[1, admitted.prepared]]), cold.sources, async () => ({ publication: { artifactId: `CR-${hash}-s1`, preservationDigest: codeReviewPreservationDigest(await readTaskReviewHistory(f.repo, hash, 's1')) } }));
  const history = await HistoryBindingSession.open(source, initial, { authorize: async () => source, validate, limits, capacity, invalidateSource: async e => { throw e; } });
  await host.accept(history.latest()); done.attempts[0]!.header.status = 'passed'; await host.accept(await history.accept(done));
  await publishTaskCheckpoint(f.repo, hash, key.reviewId, { ...f.deps, sources: cold.sources, preparation: { preparePacket: cold.publicationPacket,
   authorize: cp => host.authorize(cp, history.latest()), save: async cp => { await host.accept(await history.accept(cp)); } } });
  await cold.close();
  const store = f.deps.through.store!;
  await store.updateAndLog(buildArtifactId(hash, 's1'), actor, head => ({ next: { ...head, lifecycle: nextLifecycle(head, 'approve', actor, new Date().toISOString()) }, options: { operation: 'approve' } }));
  const target: ReviewCleanupTarget = { project: f.repo, family, epicHash: hash, storyId: 's1' };
  return { project: f.repo, key, target, store, host, source, approvalId: buildArtifactId(hash, 's1') };
 }
 const f = impactFixture(t), key = { project: f.repo, family, reviewId: 'review-1' };
 const limits = reviewPreparationLimits(join(f.repo, 'missing.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const preparation = new DesignPreparation(key, 1, limits, capacity, f.checkpoint.submitted); preparation.prepare(f.repo, f.json); const source = await preparation.seal();
 const done: import('../preparation-checkpoint.js').DesignPreparationCheckpoint = { ...f.checkpoint, schemaVersion: 3 as const, attempts: [f.baseline], runtime: { runtimeId: 'design-runtime', inputDigest: source.inputDigest } };
 let initial = structuredClone(done); const initialAttempt = initial.attempts[0]!; if (!('baseline' in initialAttempt)) throw Error('Qualified fixture required'); initialAttempt.status = 'running'; initialAttempt.completedChunks = []; delete initialAttempt.report;
 if (options.migrated) { initial = migrate(initial, source) as typeof initial; done.migration = initial.migration; }
 const host = await runtime(source, initial); t.after(() => host.store.release(host.handle));
 const lifecycle = createRepoLifecycle(f.repo); await recordDesignAdmission({ ...f.checkpoint, attempts: [f.baseline] });
 const validate = designHistoryFeedback(async () => {
  const entry = (await lifecycle.history.log(f.id)).find(e => e.operation === 'review')!, record = validatePermanentDesignReview(entry.outcome!.data, { project: f.repo, artifactId: f.id });
  return { publication: { artifactId: f.id, preservationDigest: record.preservationDigest } };
 });
 const history = await HistoryBindingSession.open(source, initial, { authorize: async () => source, validate, limits, capacity, invalidateSource: async e => { throw e; } });
 await host.accept(history.latest()); await host.accept(await history.accept(done));
 const current = JSON.parse(await readFile(reviewWorkerCheckpoint(key), 'utf8')) as typeof done;
 const currentAttempt = current.attempts[0]!; if (!('baseline' in currentAttempt)) throw Error('Qualified fixture required'); currentAttempt.publication = await publishDesignReview(current, { preparation: { authorize: checkpoint => host.authorize(checkpoint, history.latest()) } });
 await host.accept(await history.accept(current));
 await lifecycle.store.updateAndLog(f.id, actor, head => ({ next: { ...head, lifecycle: nextLifecycle(head, 'approve', actor, new Date().toISOString()) }, options: { operation: 'approve' } }));
 const target: ReviewCleanupTarget = { project: f.repo, family, artifactId: f.id };
 return { project: f.repo, key, target, store: lifecycle.store, host, source, approvalId: f.id };
}
