import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, access, unlink, readdir, mkdir, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { publishedCleanupFixture } from './prepared-publication-fixture.js';
import { cleanupPreparedReview, preparedCleanupDirectory } from '../cleanup-claim.js';
import { reviewWorkerCheckpoint } from '../../../daemon/threads/review-worker-contract.js';
import { reviewRuntimePath } from '../../../daemon/threads/review-runtime-store.js';
import { contextRoot, preparationDigest } from '../prepared-context.js';
import { bytesDigest } from '../cleanup-claim-files.js';
import { RegistryReviewSources } from '../../code-review/task-review/sources.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { authorizePreparedCleanup } from '../cleanup-authorization.js';
import { artifactJsonPath } from '../../storage.js';
import { ThreadServices } from '../../../daemon/threads/main-services.js';
import { startWorker } from '../../../daemon/threads/workers.js';

const absent = async (path: string) => { await assert.rejects(access(path), { code: 'ENOENT' }); };

for (const family of ['code', 'design'] as const) {
 test(`migrated ${family} history passes feedback publication and cleanup with its complete migration proof`, async t => {
  const f = await publishedCleanupFixture(family, t, { migrated: true });
  const permanent = await authorizePreparedCleanup(f.target, f.key, f.store);
  assert.equal(permanent.history.migration?.guards.length, 1);
  assert.equal(permanent.history.migration?.sourceVersion, 2);
  let sources = 0, models = 0;
  for (const name of ['commit', 'file', 'objects', 'objectInventory'] as const) t.mock.method(RegistryReviewSources.prototype, name, async () => { sources++; throw Error('No source reconstruction'); });
  t.mock.method(CliProvider.prototype, 'runReviewSession', async () => { models++; throw Error('No model replay'); });
  const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {} });
  assert.deepEqual(result.errors, []);
  await absent(reviewWorkerCheckpoint(f.key));
  assert.deepEqual((await authorizePreparedCleanup(f.target, f.key, f.store)).history.migration, permanent.history.migration);
  assert.equal(sources, 0); assert.equal(models, 0);
 });
 test(`prepared ${family} cleanup preserves permanent evidence and deletes exact private claims without Git or model calls`, async t => {
  const f = await publishedCleanupFixture(family, t), permanent = await authorizePreparedCleanup(f.target, f.key, f.store), closedRuntime = JSON.parse(await readFile(reviewRuntimePath(f.key), 'utf8'));
  let sourceCalls = 0, modelCalls = 0, released = 0, historyReads = 0;
  const read = f.store.readWithHistory.bind(f.store);
  t.mock.method(f.store, 'readWithHistory', async id => { historyReads++; return read(id); });
  for (const name of ['commit', 'file', 'isAncestor', 'pathChanges', 'changedRanges', 'objectInventory', 'objects'] as const) t.mock.method(RegistryReviewSources.prototype, name, async () => { sourceCalls++; throw Error('Cleanup cannot reconstruct sources'); });
  t.mock.method(CliProvider.prototype, 'runReviewSession', async () => { modelCalls++; throw Error('Cleanup cannot call a reviewer'); });
  const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {}, onDeleted: () => { released++; } });
  assert.deepEqual(result.errors, []); assert.deepEqual(result.retained, []); assert.deepEqual(result.deleted, [reviewWorkerCheckpoint(f.key)]);
  assert.ok(historyReads <= 4, 'complete history qualification is constant per cleanup, never repeated per context file');
  const audit = (await f.store.history.log(permanent.permanent.artifactId)).find(e => (e.outcome?.data as { kind?: unknown } | undefined)?.kind === 'review-cleanup-claim')!.outcome!.data as { runtime: unknown };
  assert.deepEqual(audit.runtime, closedRuntime, 'the final closed operational audit survives removal of the runtime file');
  for (const path of [reviewWorkerCheckpoint(f.key), reviewRuntimePath(f.key), contextRoot(f.key), preparedCleanupDirectory(f.key)]) await absent(path);
  assert.deepEqual(await authorizePreparedCleanup(f.target, f.key, f.store), permanent);
  assert.equal(sourceCalls, 0); assert.equal(modelCalls, 0); assert.equal(released, 1);
 });

 test(`prepared ${family} cleanup resumes every claim rename unlink and fsync boundary using only permanent proof`, { timeout: 180000 }, async t => {
  const probe = await publishedCleanupFixture(family, t), boundaries: string[] = [];
  const complete = await cleanupPreparedReview(probe.target, probe.key, { store: probe.store, contexts: async () => [probe.source], assertIdle: async () => {}, boundary: stage => { boundaries.push(stage); } });
  assert.deepEqual(complete.errors, []); assert.ok(boundaries.some(stage => stage === 'unlink.claim.after'));
  assert.ok(boundaries.some(stage => stage === 'claim.roots.after')); assert.ok(boundaries.some(stage => stage === 'fsync.after'));
  for (const [index, expected] of boundaries.entries()) await t.test(`boundary ${index + 1}: ${expected}`, async child => {
   const f = await publishedCleanupFixture(family, child); let seen = 0, failed = false, sourceCalls = 0, modelCalls = 0;
   for (const name of ['commit', 'file', 'isAncestor', 'pathChanges', 'changedRanges', 'objectInventory', 'objects'] as const) child.mock.method(RegistryReviewSources.prototype, name, async () => { sourceCalls++; throw Error('No cleanup source reconstruction'); });
   child.mock.method(CliProvider.prototype, 'runReviewSession', async () => { modelCalls++; throw Error('No cleanup model calls'); });
   const interrupted = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {}, boundary: stage => {
    if (seen++ === index) { failed = true; assert.equal(stage, expected); throw Error(`Simulated crash at ${stage}`); }
   } });
   assert.ok(failed, 'the requested physical boundary was exercised'); assert.ok(interrupted.errors.length);
   const retry = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {} });
   assert.deepEqual(retry.errors, [], JSON.stringify({ index, expected, interrupted, retry })); assert.deepEqual(retry.retained, []);
   for (const path of [reviewWorkerCheckpoint(f.key), reviewRuntimePath(f.key), contextRoot(f.key), preparedCleanupDirectory(f.key)]) await absent(path);
   assert.equal(sourceCalls, 0); assert.equal(modelCalls, 0);
  });
  t.diagnostic(`${family}: ${boundaries.length} physical fault boundaries resumed without Git or model calls`);
 });

 test(`prepared ${family} cleanup refuses arbitrary missing runtime, changed approval and active context ownership`, async t => {
  const f = await publishedCleanupFixture(family, t), checkpoint = await readFile(reviewWorkerCheckpoint(f.key)), runtime = await readFile(reviewRuntimePath(f.key));
  const busy = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => { throw Error('Context remains borrowed'); } });
  assert.match(busy.errors.join(), /borrowed/); assert.deepEqual(await readFile(reviewWorkerCheckpoint(f.key)), checkpoint);
  await unlink(reviewRuntimePath(f.key));
  const missing = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {} });
  assert.ok(missing.errors.length); assert.deepEqual(await readFile(reviewWorkerCheckpoint(f.key)), checkpoint);
  await writeFile(reviewRuntimePath(f.key), runtime);
  const path = artifactJsonPath(f.project, f.approvalId), approved = JSON.parse(await readFile(path, 'utf8')); approved.meta.lifecycle.status = 'draft'; await writeFile(path, JSON.stringify(approved));
  const unapproved = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {} });
  assert.match(unapproved.errors.join(), /approval/); assert.deepEqual(await readFile(reviewWorkerCheckpoint(f.key)), checkpoint);
 });

 test(`prepared ${family} cleanup retains public replacements and fences changed private evidence`, async t => {
  const f = await publishedCleanupFixture(family, t), publicPath = reviewWorkerCheckpoint(f.key);
  const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {}, boundary: async (stage, path) => {
   if (stage === 'rename.after' && path === join(preparedCleanupDirectory(f.key), 'checkpoint.json')) await writeFile(publicPath, 'public replacement');
  } });
  assert.deepEqual(result.errors, []); assert.equal(await readFile(publicPath, 'utf8'), 'public replacement'); assert.ok(result.retained.includes(publicPath));
  const g = await publishedCleanupFixture(family, t);
  const changed = await cleanupPreparedReview(g.target, g.key, { store: g.store, contexts: async () => [g.source], assertIdle: async () => {}, boundary: async (stage, path) => {
   if (stage === 'unlink.before' && path.endsWith('/runtime.json')) await writeFile(path, 'changed private runtime');
  } });
  assert.match(changed.errors.join(), /changed|replaced/); assert.equal(await readFile(join(preparedCleanupDirectory(g.key), 'runtime.json'), 'utf8'), 'changed private runtime');
  assert.ok((await readdir(preparedCleanupDirectory(g.key))).includes('claim.json'));
 });

 test(`prepared ${family} cleanup finishes final-claim crash recovery while retaining all public replacements`, async t => {
  const f = await publishedCleanupFixture(family, t), directory = preparedCleanupDirectory(f.key), checkpoint = reviewWorkerCheckpoint(f.key), runtime = reviewRuntimePath(f.key), context = contextRoot(f.key);
  let replaced = false, released = 0;
  const interrupted = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {}, onDeleted: () => { released++; }, boundary: async (stage, path) => {
   if (!replaced && stage === 'rename.after' && path === join(directory, 'checkpoint.json')) {
    replaced = true; await writeFile(checkpoint, 'unrelated public checkpoint'); await writeFile(runtime, 'unrelated public runtime');
    await mkdir(context); await writeFile(join(context, 'user-notes.txt'), 'unrelated public context');
   }
   if (stage === 'unlink.claim.after') throw Error('Crash after final claim deletion');
  } });
  assert.ok(replaced); assert.match(interrupted.errors.join(), /Crash after final claim/); await absent(join(directory, 'claim.json'));
  let qualifications = 0, sources = 0, models = 0;
  for (const name of ['commit', 'file', 'objectInventory', 'objects'] as const) t.mock.method(RegistryReviewSources.prototype, name, async () => { sources++; throw Error('No source reconstruction'); });
  t.mock.method(CliProvider.prototype, 'runReviewSession', async () => { models++; throw Error('No model during final cleanup recovery'); });
  for (let replay = 0; replay < 2; replay++) {
   const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => { qualifications++; throw Error('Public replacements are not review input'); }, assertIdle: async () => {}, onDeleted: () => { released++; } });
   assert.deepEqual(result.errors, []); assert.deepEqual([...result.retained].sort(), [checkpoint, runtime, context].sort());
   await absent(directory);
  }
  assert.equal(await readFile(checkpoint, 'utf8'), 'unrelated public checkpoint'); assert.equal(await readFile(runtime, 'utf8'), 'unrelated public runtime');
  assert.equal(await readFile(join(context, 'user-notes.txt'), 'utf8'), 'unrelated public context');
  assert.equal(released, 0); assert.equal(qualifications, 0); assert.equal(sources, 0); assert.equal(models, 0);
 });

 test(`prepared ${family} cleanup rechecks approval at deletion and rejects edited claim paths or digests`, async t => {
  const f = await publishedCleanupFixture(family, t), path = artifactJsonPath(f.project, f.approvalId), approved = await readFile(path);
  let revoked = false;
  const first = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {}, boundary: async stage => {
   if (stage === 'unlink.before' && !revoked) { revoked = true; const raw = JSON.parse(approved.toString('utf8')); raw.meta.lifecycle.status = 'draft'; await writeFile(path, JSON.stringify(raw)); }
  } });
  assert.ok(revoked); assert.match(first.errors.join(), /approval|evidence changed/);
  await access(join(preparedCleanupDirectory(f.key), 'checkpoint.json')); await access(join(preparedCleanupDirectory(f.key), 'runtime.json'));
  await writeFile(path, approved);
  assert.deepEqual((await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {} })).errors, []);
  for (const change of ['path', 'digest']) await t.test(change, async child => {
   const g = await publishedCleanupFixture(family, child);
   await cleanupPreparedReview(g.target, g.key, { store: g.store, contexts: async () => [g.source], assertIdle: async () => {}, boundary: stage => { if (stage === 'claim.roots.after') throw Error('Paused before deletion'); } });
   const file = join(preparedCleanupDirectory(g.key), 'claim.json'), claim = JSON.parse(await readFile(file, 'utf8'));
   if (change === 'path') claim.deletions[0].relativePath = '../../outside'; else claim.deletions[0].contentDigest = 'f'.repeat(64);
   await writeFile(file, JSON.stringify(claim)); const outside = join(g.project, 'outside'); await writeFile(outside, 'keep');
   const retry = await cleanupPreparedReview(g.target, g.key, { store: g.store, contexts: async () => [g.source], assertIdle: async () => {} });
   assert.ok(retry.errors.length); assert.equal(await readFile(outside, 'utf8'), 'keep');
   await access(join(preparedCleanupDirectory(g.key), 'checkpoint.json')); await access(join(preparedCleanupDirectory(g.key), 'runtime.json'));
  });
 });

 test(`prepared ${family} cleanup never treats pre-existing unrelated context files or self-declared generations as owned`, async t => {
  for (const location of ['root', 'generation', 'self-declared']) await t.test(location, async child => {
   const f = await publishedCleanupFixture(family, child), original = await readFile(reviewWorkerCheckpoint(f.key)), root = contextRoot(f.key);
   let path: string;
   if (location === 'root') path = join(root, 'user-notes.txt');
   else if (location === 'generation') path = join(root, f.source.generationId, `${bytesDigest('unrelated content must survive')}.data`);
   else {
    const id = 'e'.repeat(64), directory = join(root, id); await mkdir(directory);
    const manifest = JSON.parse(await readFile(join(root, f.source.generationId, 'manifest.json'), 'utf8')); manifest.generationId = id; manifest.manifestDigest = preparationDigest({ ...manifest, manifestDigest: '' });
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)); path = join(directory, 'user-notes.txt');
   }
   await writeFile(path, 'unrelated content must survive');
   const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {} });
   assert.match(result.errors.join(), /Unowned/); assert.equal(await readFile(path, 'utf8'), 'unrelated content must survive');
   assert.deepEqual(await readFile(reviewWorkerCheckpoint(f.key)), original); await access(reviewRuntimePath(f.key));
   await absent(join(preparedCleanupDirectory(f.key), 'claim.json'));
  });
 });

 test(`prepared ${family} cleanup promotes a verified temporary claim after actual worker death before rename`, async t => {
  const f = await publishedCleanupFixture(family, t), services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'fixture' }));
  const started = await startWorker(services, 'prepared-claim-test', '__tests__/helpers/prepared-cleanup-worker', { workerData: { role: 'review', key: f.key, target: f.target, source: f.source, hold: 'claim' }, transferList: [] });
  try {
   const held = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Claim writer did not reach rename')), 10000);
    started.worker.on('message', raw => { if (raw?.paused) { clearTimeout(timer); resolve(); } else if (raw?.error) { clearTimeout(timer); reject(Error(raw.error)); } });
   });
   started.worker.postMessage({ method: 'cleanup' }); await held;
   const directory = preparedCleanupDirectory(f.key), names = await readdir(directory); assert.equal(names.length, 1); assert.match(names[0]!, /^claim\.json\..+\.tmp$/);
   await absent(join(directory, 'claim.json')); await access(reviewWorkerCheckpoint(f.key)); await access(reviewRuntimePath(f.key));
   await started.worker.terminate(); await started.reclaimed; started.disconnect();
   let qualifications = 0;
   for (const fault of ['link.claim.after', 'unlink.orphan.after']) {
    let failed = false;
    const interrupted = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => { qualifications++; throw Error('Recovered claims must not reconstruct context'); }, assertIdle: async () => {}, boundary: stage => {
     if (stage === fault) { failed = true; throw Error(`Recovery interrupted after ${stage}`); }
    } });
    assert.ok(failed); assert.ok(interrupted.errors.length);
   }
   const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => { qualifications++; throw Error('Recovered claims must not reconstruct context'); }, assertIdle: async () => {} });
   assert.deepEqual(result.errors, []); assert.deepEqual(result.retained, []); assert.equal(qualifications, 0);
   for (const path of [reviewWorkerCheckpoint(f.key), reviewRuntimePath(f.key), contextRoot(f.key), directory]) await absent(path);
  } finally { await started.worker.terminate(); await started.reclaimed; started.disconnect(); }
 });

 test(`prepared ${family} cleanup recovers hard-killed claim writes without losing fragments or rebuilding sources`, async t => {
  for (const mode of ['full', 'partial', 'empty']) await t.test(mode, async child => {
   const f = await publishedCleanupFixture(family, child), services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'fixture' }));
   const started = await startWorker(services, 'prepared-write-test', '__tests__/helpers/prepared-cleanup-worker', { workerData: { role: 'review', key: f.key, target: f.target, source: f.source, hold: 'write' }, transferList: [] });
   try {
    const held = new Promise<{ path: string }>((resolve, reject) => {
     const timer = setTimeout(() => reject(Error('Claim writer did not reach file fsync')), 10000);
     started.worker.on('message', raw => { if (raw?.paused) { clearTimeout(timer); resolve(raw); } else if (raw?.error) { clearTimeout(timer); reject(Error(raw.error)); } });
    });
    started.worker.postMessage({ method: 'cleanup' }); const point = await held, complete = await readFile(point.path);
    // Reproduce a torn/empty asynchronous write while its real worker is held
    // before file fsync; terminate it so no finally cleanup can run.
    if (mode !== 'full') await truncate(point.path, mode === 'empty' ? 0 : Math.floor(complete.length / 2));
    const fragment = await readFile(point.path); await started.worker.terminate(); await started.reclaimed; started.disconnect();
    let qualifications = 0, sources = 0, models = 0;
    child.mock.method(CliProvider.prototype, 'runReviewSession', async () => { models++; throw Error('No reviewer during write recovery'); });
    for (const name of ['commit', 'file', 'objectInventory', 'objects'] as const) child.mock.method(RegistryReviewSources.prototype, name, async () => { sources++; throw Error('No native source reconstruction'); });
    const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => { qualifications++; return [f.source]; }, assertIdle: async () => {} });
    assert.deepEqual(result.errors, []); assert.equal(qualifications, mode === 'full' ? 0 : 1); assert.equal(sources, 0); assert.equal(models, 0);
    if (mode === 'full') assert.deepEqual(result.retained, []);
    else { assert.equal(result.retained.length, 1); assert.deepEqual(await readFile(result.retained[0]!), fragment, 'incomplete claim bytes are quarantined, never deleted'); }
    for (const path of [reviewWorkerCheckpoint(f.key), reviewRuntimePath(f.key), contextRoot(f.key), preparedCleanupDirectory(f.key)]) await absent(path);
   } finally { await started.worker.terminate(); await started.reclaimed; started.disconnect(); }
  });
 });

 test(`prepared ${family} cleanup resumes after actual worker termination with runtime removed and checkpoint retained`, async t => {
  const f = await publishedCleanupFixture(family, t), services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'fixture' }));
  const started = await startWorker(services, 'prepared-cleanup-test', '__tests__/helpers/prepared-cleanup-worker', { workerData: { role: 'review', key: f.key, target: f.target, source: f.source }, transferList: [] });
  try {
   const held = new Promise<{ threadId: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Cleanup worker did not reach the real runtime deletion barrier')), 10000);
    started.worker.on('message', raw => { if (raw?.paused) { clearTimeout(timer); resolve(raw); } else if (raw?.error) { clearTimeout(timer); reject(Error(raw.error)); } });
   });
   started.worker.postMessage({ method: 'cleanup' }); assert.ok((await held).threadId > 0);
   await absent(join(preparedCleanupDirectory(f.key), 'runtime.json')); await access(join(preparedCleanupDirectory(f.key), 'checkpoint.json'));
   await started.worker.terminate(); await started.reclaimed; started.disconnect();
   let modelCalls = 0, sourceCalls = 0;
   t.mock.method(CliProvider.prototype, 'runReviewSession', async () => { modelCalls++; throw Error('No reviewer during cleanup recovery'); });
   for (const name of ['commit', 'file', 'objectInventory', 'objects'] as const) t.mock.method(RegistryReviewSources.prototype, name, async () => { sourceCalls++; throw Error('No sources during cleanup recovery'); });
   const result = await cleanupPreparedReview(f.target, f.key, { store: f.store, contexts: async () => [f.source], assertIdle: async () => {} });
   assert.deepEqual(result.errors, []); assert.deepEqual(result.retained, []); await absent(preparedCleanupDirectory(f.key));
   assert.equal(modelCalls, 0); assert.equal(sourceCalls, 0);
  } finally { await started.worker.terminate(); await started.reclaimed; started.disconnect(); }
 });
}
