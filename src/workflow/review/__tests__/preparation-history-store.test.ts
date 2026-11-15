import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, open, rename } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { designFixture, admissionFixture } from '../design-review/__tests__/fixtures.js';
import { PreparationHistoryStore } from '../preparation-history-store.js';
import { withPreparationPersistence } from '../preparation-persistence.js';
import { writeReviewBytes } from '../../code-review/task-review/checkpoint.js';
import { loadStoredDesignCheckpoint, updateStoredDesignCheckpoint } from '../design-review/checkpoint.js';
import { preparationDigest } from '../prepared-context.js';
import { fixture } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { checkpointPath, loadStoredCheckpoint, updateStoredCodeCheckpoint } from '../../code-review/task-review/checkpoint.js';
import { ReviewProgressPersistence } from '../../code-review/task-review/progress-persistence.js';
import { ReviewProgressTracker } from '../../code-review/task-review/progress.js';
import { DesignReviewCoordinator } from '../design-review/coordinator.js';
import type { DesignUnitAssignment } from '../design-review/contracts.js';
import { qualifiedDesignProjection } from '../design-review/checkpoint.js';
import { setTimeout as pause } from 'node:timers/promises';
import { reviewJsonLimit } from '../../../config/review.js';
const writeCheckpoint=(path:string,bytes:string)=>writeReviewBytes(path,bytes,reviewJsonLimit());
import { loadPreparationCheckpointSnapshot } from '../preparation-checkpoint.js';

test('canonical code persistence preserves submitted packets and feedback through actual family read-modify-write calls', async t => {
 const f = await fixture(); t.after(() => f.cleanup());
 const input = f.checkpoint('canonical-code'), path = checkpointPath(f.repo, input.reviewId), key = { project: f.repo, family: 'code' as const, reviewId: input.reviewId };
 let commits = 0;
 const owner = await PreparationHistoryStore.open(key, { runtimeId: 'runtime-code', inputDigest: preparationDigest(input.attempts[0]!.submitted) }, {
  commit: async next => { commits++; await writeCheckpoint(path, JSON.stringify(next)); return next; }, observe: async () => {},
 });
 await withPreparationPersistence(owner, async () => {
  await updateStoredCodeCheckpoint(path, () => input);
  const before = await readFile(path, 'utf8');
  const observed = await loadStoredCheckpoint(path);
  assert.deepEqual(observed!.attempts[0]!.submitted, input.attempts[0]!.submitted);
  await updateStoredCodeCheckpoint(path, cp => { const a = cp!.attempts[0]!; a.header.activeTaskId = 't1'; return cp!; });
  assert.equal(await readFile(path, 'utf8'), before, 'active-task observation is operational, not a history boundary');
  assert.equal(commits, 1);
  assert.deepEqual((await owner.canonical())!.attempts[0]!['review-response'], input.attempts[0]!['review-response']);
  await updateStoredCodeCheckpoint(path, cp => { const a = cp!.attempts[0]!; if ('review-response' in a) a['review-response'].summary = 'Semantic publication summary'; return cp!; });
  assert.equal(commits, 2);
 });
});

test('private inactive handoff forces checkpoint rebind even when semantic input is unchanged', async t => {
 const f = designFixture(t), input = admissionFixture(f), key = { project: f.repo, family: 'design' as const, reviewId: input.reviewId };
 const oldRef = { runtimeId: 'old-runtime', inputDigest: preparationDigest(input.attempts[0]!.submitted) }, nextRef = { ...oldRef, runtimeId: 'next-runtime' };
 let commits = 0;
 const deps = { commit: async (cp: Parameters<import('../preparation-history-store.js').PreparationHistoryStoreDeps['commit']>[0]) => { commits++; await writeCheckpoint(f.path, JSON.stringify(cp)); return cp; }, observe: async () => {} };
 const old = await PreparationHistoryStore.open(key, oldRef, deps); await old.write(input);
 const prior = await loadPreparationCheckpointSnapshot(key);
 assert.ok(prior);
 await assert.rejects(PreparationHistoryStore.open(key, nextRef, deps), /binding mismatch/);
 await assert.rejects(PreparationHistoryStore.open(key, nextRef, deps, { checkpointDigest: 'f'.repeat(64), previousRuntime: oldRef, resetContext: false }), /binding mismatch/);
 const next = await PreparationHistoryStore.open(key, nextRef, deps, { checkpointDigest: prior.digest, previousRuntime: oldRef, resetContext: false });
 assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')).runtime, oldRef, 'opening grants no execution or writer shortcut');
 await next.write(input);
 assert.equal(commits, 2); assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')).runtime, nextRef);
 assert.deepEqual(await next.read(), input);
 await assert.rejects(old.read(), /fenced/);
});

for (const replacement of ['in-place', 'rename'] as const) test(`canonical persistence fences ${replacement} replacement between validated readback and stamp adoption`, async t => {
 const f = designFixture(t), input = admissionFixture(f), key = { project: f.repo, family: 'design' as const, reviewId: input.reviewId };
 const sample = await open(f.json, 'r'), prototype = Object.getPrototypeOf(sample), stat = prototype.stat; await sample.close();
 let armed = false, calls = 0, observations = 0;
 const owner = await PreparationHistoryStore.open(key, { runtimeId: 'race-runtime', inputDigest: preparationDigest(input.attempts[0]!.submitted) }, {
  commit: async cp => { await writeCheckpoint(f.path, JSON.stringify(cp)); armed = true; return cp; }, observe: async () => { observations++; },
 });
 t.mock.method(prototype, 'stat', async function(this: FileHandle, ...args: unknown[]) {
  const result = await stat.apply(this, args);
  if (armed && ++calls === 2) {
   armed = false; const foreign = JSON.parse(await readFile(f.path, 'utf8')); foreign.attempts[0].submitted.artifactPath += '.foreign';
   if (replacement === 'in-place') await writeFile(f.path, JSON.stringify(foreign));
   else { await writeFile(f.path + '.replacement', JSON.stringify(foreign)); await rename(f.path + '.replacement', f.path); }
  }
  return result;
 });
 await assert.rejects(owner.write(input), /replaced during validated read/);
 await assert.rejects(owner.read(), /fenced/);
 assert.match(JSON.parse(await readFile(f.path, 'utf8')).attempts[0].submitted.artifactPath, /\.foreign$/);
 assert.equal(observations, 0);
});

test('actual code progress producer sends only bounded observations without reading or saving full history', async t => {
 const f = await fixture(); t.after(() => f.cleanup());
 const input = f.checkpoint('hot-code'), path = checkpointPath(f.repo, input.reviewId), key = { project: f.repo, family: 'code' as const, reviewId: input.reviewId };
 let commits = 0, observations = 0, bytes = 0;
 const owner = await PreparationHistoryStore.open(key, { runtimeId: 'hot-runtime', inputDigest: preparationDigest(input.attempts[0]!.submitted) }, {
  commit: async cp => { commits++; await writeCheckpoint(path, JSON.stringify(cp)); return cp; },
  observe: async value => { observations++; bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(value))); assert.ok(!('attempts' in value)); },
 });
 await owner.write(input); const before = await readFile(path, 'utf8'); observations = 0;
 const attempt = input.attempts[0]!, tracker = new ReviewProgressTracker(); tracker.phase('task_review', attempt['review-response'].tasks.length);
 const persistence = new ReviewProgressPersistence(attempt, tracker, { checkpointPath: path, serial: work => work(), save: async () => { throw Error('Full family save forbidden for hot progress'); } });
 t.after(() => persistence.stop());
 t.mock.method(owner, 'read', async () => { throw Error('Full family read forbidden for hot progress'); });
 t.mock.method(owner, 'write', async () => { throw Error('Full semantic boundary forbidden for hot progress'); });
 const sample = await open(path, 'r'), prototype = Object.getPrototypeOf(sample), stat = prototype.stat; await sample.close();
 let fullReads = 0;
 t.mock.method(prototype, 'stat', async function(this: FileHandle, ...args: unknown[]) { fullReads++; return stat.apply(this, args); });
 await withPreparationPersistence(owner, async () => {
  for (let i = 0; i < 50; i++) { tracker.phase('task_review'); persistence.request(true); await persistence.settled(); }
 });
 assert.equal(persistence.warning, undefined); assert.equal(observations, 50); assert.equal(commits, 1); assert.equal(fullReads, 0);
 assert.ok(bytes < 2048); assert.equal(await readFile(path, 'utf8'), before);
});

test('actual design controller activity updates bounded ownership and progress without traversing full history', async t => {
 const f = designFixture(t, 'daemon'), key = { project: f.repo, family: 'design' as const, reviewId: f.checkpoint.reviewId };
 const abort = new AbortController(), controller = { id: 'hot-design-controller', signal: abort.signal };
 let commits = 0, observations = 0, bytes = 0;
 const owner = await PreparationHistoryStore.open(key, { runtimeId: 'hot-design-runtime', inputDigest: preparationDigest(f.checkpoint.submitted) }, {
  commit: async cp => { commits++; await writeCheckpoint(f.path, JSON.stringify(cp)); return cp; },
  observe: async value => { observations++; bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(value))); assert.ok(!('attempts' in value)); },
 });
 const coordinator = new DesignReviewCoordinator({
  provider: () => { throw Error('No provider for controller review'); },
  load: async (project, id) => { const cp = await loadStoredDesignCheckpoint(project, id); return cp && qualifiedDesignProjection(cp); },
 });
 await withPreparationPersistence(owner, async () => {
  await coordinator.start({ phase: 'start', repo: f.repo, reviewId: key.reviewId, attempt: 1, artifactPath: f.json }, { owner: controller });
  let assignment: DesignUnitAssignment | null = null;
  for (let i = 0; i < 100 && !assignment; i++) {
   assignment = (await coordinator.exchange({ phase: 'assignment', repo: f.repo, reviewId: key.reviewId, attempt: 1 }, controller) as { assignment: DesignUnitAssignment | null }).assignment;
   if (!assignment) await pause(5);
  }
  assert.ok(assignment);
  const before = await readFile(f.path, 'utf8'), semanticCommits = commits, originalClone = globalThis.structuredClone;
  const clone = t.mock.method(globalThis, 'structuredClone', ((value: unknown, options?: StructuredSerializeOptions) => {
   if (value && typeof value === 'object' && 'attempts' in value) throw Error('Full history clone during hot activity');
   return originalClone(value, options);
  }) as typeof structuredClone);
  try {
   for (let sequence = 1; sequence <= 30; sequence++) await coordinator.exchange({ phase: 'activity', repo: f.repo, reviewId: key.reviewId, attempt: 1, executionId: assignment.executionId, sequence,
    event: { sessionId: 'design-events', sequence, kind: sequence === 1 ? 'session_started' : 'model_output' } }, controller);
   assert.equal(commits, semanticCommits); assert.equal(await readFile(f.path, 'utf8'), before);
   assert.ok(observations >= 30); assert.ok(bytes < 4096);
  } finally {
   clone.mock.restore(); abort.abort();
   for (let i = 0; i < 100 && coordinator.isActive(f.repo, key.reviewId); i++) await pause(5);
  }
  const canonical = await owner.canonical(), last = canonical!.attempts.at(-1)!;
  assert.ok(!('header' in last)); assert.equal(last.status, 'interrupted');
 });
});

test('canonical design persistence routes existing family writers to format three and keeps observer churn out of full history', async t => {
 const f = designFixture(t), key = { project: f.repo, family: 'design' as const, reviewId: f.checkpoint.reviewId };
 const input = admissionFixture(f), reference = { runtimeId: 'runtime-1', inputDigest: preparationDigest(input.attempts[0]!.submitted) };
 let commits = 0, observations = 0;
 const owner = await PreparationHistoryStore.open(key, reference, {
  commit: async cp => { commits++; await writeCheckpoint(f.path, JSON.stringify(cp) + '\n'); return cp; },
  observe: async () => { observations++; },
 });
 await withPreparationPersistence(owner, async () => {
  await updateStoredDesignCheckpoint(f.repo, key.reviewId, () => input);
  const original = await readFile(f.path, 'utf8');
  for (let sequence = 1; sequence <= 30; sequence++) await updateStoredDesignCheckpoint(f.repo, key.reviewId, current => {
   assert.equal(current!.schemaVersion, 2, 'existing coordinator receives semantic projection');
   const next = structuredClone(current!); next.attempts[0]!.progress.sequence = sequence; return next;
  });
  const current = await loadStoredDesignCheckpoint(f.repo, key.reviewId);
  assert.equal(current!.attempts[0]!.progress.sequence, 30);
  assert.equal(await readFile(f.path, 'utf8'), original);
  assert.equal(commits, 1); assert.equal(observations, 31);
  const canonical = await owner.canonical();
  assert.equal(canonical!.schemaVersion, 3); assert.deepEqual(canonical!.runtime, reference);
 });
});

test('canonical persistence fences external replacements and refuses embedded native writers or foreign paths', async t => {
 const f = designFixture(t), key = { project: f.repo, family: 'design' as const, reviewId: f.checkpoint.reviewId };
 const input = admissionFixture(f), reference = { runtimeId: 'runtime-1', inputDigest: preparationDigest(input.attempts[0]!.submitted) };
 const deps = { commit: async (cp: Parameters<import('../preparation-history-store.js').PreparationHistoryStoreDeps['commit']>[0]) => { await writeCheckpoint(f.path, JSON.stringify(cp)); return cp; }, observe: async () => {} };
 const owner = await PreparationHistoryStore.open(key, reference, deps);
 await owner.write(input);
 await writeFile(f.path, JSON.stringify(await owner.canonical()) + '\n');
 await assert.rejects(owner.read(), /external replacement/);
 const live = await PreparationHistoryStore.open(key, reference, deps);
 await withPreparationPersistence(live, async () => {
  await assert.rejects(loadStoredDesignCheckpoint(f.repo, 'foreign'), /Foreign/);
 });
 const guardWriter = structuredClone(input);
 guardWriter.attempts[0]!.resourceGuard = { daemonInstance: 'forbidden', openLeases: [] };
 await assert.rejects(live.write(guardWriter), /Embedded native guard/);
 await assert.rejects(live.read(), /fenced/);
 assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')).runtime, reference);
});

test('bounded observations cannot advance accepted results or replace a design execution owner', async t => {
 const f = designFixture(t), key = { project: f.repo, family: 'design' as const, reviewId: f.checkpoint.reviewId };
 const input = structuredClone(f.checkpoint); input.attempts[0]!.current = { kind: 'planning', executionId: 'pinned-execution', sequence: 1, issuedAt: '2026-11-15T00:00:00.000Z' };
 let updates = 0;
 const deps = { commit: async (cp: Parameters<import('../preparation-history-store.js').PreparationHistoryStoreDeps['commit']>[0]) => { await writeCheckpoint(f.path, JSON.stringify(cp)); return cp; }, observe: async () => { updates++; } };
 const ref = { runtimeId: 'pinned-runtime', inputDigest: preparationDigest(input.submitted) }, owner = await PreparationHistoryStore.open(key, ref, deps);
 await owner.write(input); const before = await readFile(f.path, 'utf8'); updates = 0;
 await assert.rejects(owner.observe({ family: 'design', attempt: 1, progress: { ...input.attempts[0]!.progress, completedChunks: 1 }, current: input.attempts[0]!.current! }), /completed design work/);
 const requalified = await PreparationHistoryStore.open(key, ref, deps);
 await assert.rejects(requalified.observe({ family: 'design', attempt: 1, progress: input.attempts[0]!.progress, current: { ...input.attempts[0]!.current!, executionId: 'foreign-execution' } }), /execution ownership/);
 assert.equal(updates, 0); assert.equal(await readFile(f.path, 'utf8'), before);
});
