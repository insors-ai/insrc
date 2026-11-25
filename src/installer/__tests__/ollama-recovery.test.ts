import { privateRuntimeTest } from './_private-runtime-test.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createDependencyRetryContext } from '../dependency-context.js';
import { cleanupOllamaInstallAttempt } from '../ollama-recovery.js';
import { closedOllamaAttempts, prepareOllama } from '../ollama-prepare.js';
import { controlBinding } from '../native.js';
import { dependencyAttemptIdentity } from '../ollama-policy.js';
import { acceptedOllamaPolicy, closurePath, dependencyLockIdentity, ensureDependencyDirectory, parseBoundOllamaAttempt, writeDependencyRecord } from '../ollama-records.js';
import type { OllamaAttempt } from '../ollama-records.js';
import { canonicalJson } from '../release-descriptor.js';
import { ollamaFixture, qualifyFixturePolicy } from './_ollama-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

type Fixture = Awaited<ReturnType<typeof ollamaFixture>>;
function retry(f: Fixture, signal?: AbortSignal) {
  return createDependencyRetryContext(f.location, f.target.os, { ...f.context('a'.repeat(64), signal) });
}
async function seed(f: Fixture) {
  const { policy, offer } = await f.input(), context = f.context(), identity = dependencyAttemptIdentity(f.location, policy, offer, context);
  for (const path of [`deps/ollama/.attempts/${identity.operationId}`, identity.stageRelativePath]) ensureDependencyDirectory(f.location, path, context.assertCurrent);
  const record = join(f.home, identity.recordRelativePath), stage = join(f.home, identity.stageRelativePath), handle = controlBinding().acquire(`${record}.lock`);
  const attempt: OllamaAttempt = { schemaVersion: 2, identity, absence: offer.absence, actor: 'in-process-preparation', externalActors: 0,
    policy, lockProtocol: 'in-process-native-v1', lockIdentity: dependencyLockIdentity(`${record}.lock`) };
  try { writeDependencyRecord(f.location, handle, record, attempt); writeFileSync(join(stage, 'payload.download'), 'partial', { mode: 0o600 }); }
  finally { controlBinding().close(handle); }
  return { record, stage, attempt, policy, offer };
}
async function waitFor(predicate: () => boolean): Promise<void> {
  const ends = performance.now() + 5000;
  while (!predicate()) { assert.ok(performance.now() < ends, 'owned completion did not arrive'); await delay(10); }
}

privateRuntimeTest(import.meta.url, 'qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f), lock = controlBinding().acquire(`${s.record}.lock`);
    try {
      await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f)), { code: 'dependency-uncertain' });
      assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.record.replace(/\.json$/, '.retry.json')), false);
    } finally { controlBinding().close(lock); }
    for (const change of [{ externalActors: 1 }, { actor: 'external-preparation' }, { lockProtocol: 'inherited-handle' }, { schemaVersion: 1, policy: undefined, lockProtocol: undefined, lockIdentity: undefined }]) {
      const altered = { ...s.attempt, ...change };
      writeFileSync(s.record, canonicalJson(altered), { mode: 0o600 });
      await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f)), { code: 'dependency-uncertain' });
      assert.equal(existsSync(join(s.stage, 'payload.download')), true);
    }
    writeFileSync(s.record, canonicalJson(s.attempt), { mode: 0o600 });
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, f.context()), { code: 'dependency-context-invalid' });
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, { ...retry(f) }), { code: 'dependency-context-invalid' });
    await cleanupOllamaInstallAttempt(f.location, retry(f));
    assert.equal(existsSync(s.stage), false); assert.equal((await closedOllamaAttempts(f.location)).length, 1);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f), temporary = `${s.record}.${randomUUID()}.tmp`;
    writeFileSync(temporary, 'interrupted record write', { mode: 0o600 });
    const changed = structuredClone(s.policy); changed.limits.fileBytes--;
    await cleanupOllamaInstallAttempt(f.location, retry(f), changed);
    assert.equal(existsSync(s.stage), false); assert.equal(existsSync(temporary), false);
    assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
    assert.equal(existsSync(s.offer.destination), false);
    const plan = readFileSync(s.record.replace(/\.json$/, '.retry.json'));
    await cleanupOllamaInstallAttempt(f.location, retry(f), changed);
    assert.deepEqual(readFileSync(s.record.replace(/\.json$/, '.retry.json')), plan);
    assert.equal((await closedOllamaAttempts(f.location)).length, 1);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f), abort = new AbortController();
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f, abort.signal), undefined,
      { beforeDisposal: async () => { abort.abort(); } }), { code: 'dependency-uncertain' });
    assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.offer.destination), false);
    assert.equal(existsSync(s.record.replace(/\.json$/, '.retry-done.json')), false);
    await cleanupOllamaInstallAttempt(f.location, retry(f));
    assert.equal(existsSync(s.stage), false);
    assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'unknown-actor-proof-blocks-install-retry-cleanup', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f);
    writeFileSync(s.record, canonicalJson({ schemaVersion: 1, identity: s.attempt.identity, absence: s.attempt.absence,
      actor: 'in-process-preparation', externalActors: 0 }), { mode: 0o600 });
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f), s.policy), { code: 'dependency-uncertain' });
    assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.offer.destination), false);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'malformed-utf8-historical-policy-never-authorizes-cleanup', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f), bytes = readFileSync(s.record), offset = bytes.indexOf('fixtures/not-native-evidence.json');
    assert.ok(offset >= 0); bytes[offset] = 0xff; writeFileSync(s.record, bytes);
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f)), { code: 'dependency-uncertain' });
    assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.record.replace(/\.json$/, '.retry.json')), false);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution', async () => {
  const f = await ollamaFixture();
  try {
    const { policy, offer } = await f.input();
    await prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck, transport: f.transport });
    const id = dependencyAttemptIdentity(f.location, policy, offer, f.context()), record = join(f.home, id.recordRelativePath);
    const original = parseBoundOllamaAttempt(f.location, JSON.parse(readFileSync(record, 'utf8')));
    const different = structuredClone(policy); different.limits.fileBytes--; const changed = qualifyFixturePolicy(different); f.setPolicy(changed);
    assert.equal(acceptedOllamaPolicy(original, changed).limits.fileBytes, policy.limits.fileBytes);
    const inode = lstatSync(join(offer.destination, policy.layout.executable)).ino;
    const report = await (await import('../dependencies.js')).dependencyPort(f.target, f.location, f.options).inspect(f.location);
    assert.equal(report.ollama, 'installed-not-running');
    await cleanupOllamaInstallAttempt(f.location, retry(f), changed);
    assert.equal(lstatSync(join(offer.destination, policy.layout.executable)).ino, inode);
    const { policy: _policy, lockProtocol: _protocol, lockIdentity: _identity, ...legacy } = original as Extract<OllamaAttempt, { schemaVersion: 2 }>;
    assert.throws(() => acceptedOllamaPolicy({ ...legacy, schemaVersion: 1 }, changed), { code: 'dependency-uncertain' });
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'replacement-free-lock-cannot-authorize-cleanup-of-original-actor', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f), original = `${s.record}.lock`, moved = `${original}.preserved`;
    renameSync(original, moved); const replacement = controlBinding().acquire(original); controlBinding().close(replacement);
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f)), { code: 'dependency-uncertain' });
    assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.record.replace(/\.json$/, '.retry.json')), false);
    unlinkSync(original); renameSync(moved, original);
    await cleanupOllamaInstallAttempt(f.location, retry(f)); assert.equal(existsSync(s.stage), false);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'late-settlement-records-true-outcome-and-completes-disposal-under-held-handle', async () => {
  const f = await ollamaFixture(), abort = new AbortController(); let release!: () => void, started!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; }), entered = new Promise<void>(resolve => { started = resolve; });
  try {
    const { policy, offer } = await f.input(), context = f.context('a'.repeat(64), abort.signal);
    const id = dependencyAttemptIdentity(f.location, policy, offer, context), record = join(f.home, id.recordRelativePath);
    const work = prepareOllama(f.location, policy, offer, context, { recheck: f.recheck, transport: f.transport, cleanupMs: 150,
      async beforeFiniteClose() { started(); await waiting; throw new Error('late real failure'); } });
    await entered; abort.abort(); await assert.rejects(work, { code: 'dependency-uncertain' });
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f)), { code: 'dependency-uncertain' });
    release(); await waitFor(() => existsSync(record.replace(/\.json$/, '.disposed.json')));
    assert.equal(JSON.parse(readFileSync(closurePath(record), 'utf8')).outcome, 'failed');
    assert.equal((await closedOllamaAttempts(f.location)).length, 1); assert.equal(existsSync(offer.destination), false);
  } finally { release(); await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp', async () => {
  const f = await ollamaFixture(); const native = controlBinding();
  try {
    const s = await seed(f), lock = native.acquire(`${s.record}.lock`), target = join(dirname(s.record), 'publication-test.json');
    try {
      const from = `${target}.source`;
      writeFileSync(from, 'first publication', { mode: 0o600 }); native.publishDirectory(lock, from, target);
      assert.equal(readFileSync(target, 'utf8'), 'first publication'); assert.equal(existsSync(from), false); unlinkSync(target);
      writeFileSync(target, 'incumbent', { mode: 0o600 }); writeFileSync(from, 'candidate', { mode: 0o600 });
      assert.throws(() => native.publishDirectory(lock, from, target), { code: 'candidate-exists' });
      assert.equal(readFileSync(target, 'utf8'), 'incumbent'); assert.equal(readFileSync(from, 'utf8'), 'candidate');
      unlinkSync(target); unlinkSync(from); native.close(lock);
      assert.throws(() => writeDependencyRecord(f.location, lock, target, { test: true }), { code: 'dependency-uncertain' });
      assert.equal(existsSync(target), false);
      assert.equal(readdirSync(dirname(s.record)).some(n => n.endsWith('.tmp')), false);
    } finally { native.close(lock); }
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'native-preparation-lock-is-not-inherited-by-live-exec-child', async () => {
  const f = await ollamaFixture(), children: ChildProcess[] = [];
  let handle: object | undefined;
  try {
    const s = await seed(f); handle = controlBinding().acquire(`${s.record}.lock`);
    const child = spawnFixture(process.execPath, ['--input-type=module', '-e',
      'process.on("message",()=>process.disconnect());process.send("ready");'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child); child.stderr!.resume();
    const ready = once(child, 'message'); await ready;
    controlBinding().close(handle); handle = undefined;
    // With an inherited flock/handle this would remain busy until child exit.
    const acquired = controlBinding().acquire(`${s.record}.lock`); controlBinding().close(acquired);
    assert.equal(child.exitCode, null); assert.equal(child.connected, true);
    const closed = once(child, 'close'); child.send('close'); assert.deepEqual(await closed, [0, null]);
  } finally { if (handle) controlBinding().close(handle); await stopOwnedChildren(children); await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'retry-reconciles-interruption-at-every-stage-disposal-boundary', async () => {
  for (const boundary of [0, 1, 2, 'after-stage'] as const) {
    const f = await ollamaFixture();
    try {
      const s = await seed(f); writeFileSync(join(s.stage, 'extra.download'), 'partial', { mode: 0o600 }); let removes = 0;
      await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f), undefined, {
        async beforeRemove() { if (boundary === removes++) throw new Error('injected disposal interruption'); },
        async afterRemoval() { if (boundary === 'after-stage') throw new Error('injected completion interruption'); },
      }), { code: 'dependency-uncertain' });
      assert.equal(existsSync(s.record.replace(/\.json$/, '.retry-done.json')), false);
      assert.equal(existsSync(s.offer.destination), false);
      const intent = JSON.parse(readFileSync(s.record.replace(/\.json$/, '.cleanup.json'), 'utf8'));
      assert.equal(intent.purpose, 'private-stage-disposal');
      await cleanupOllamaInstallAttempt(f.location, retry(f));
      assert.equal(existsSync(s.stage), false); assert.equal((await closedOllamaAttempts(f.location)).length, 1);
    } finally { await f.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'temporary-disposal-intent-survives-unlink-completion-crash-gap', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f), temporary = `${s.record}.${randomUUID()}.tmp`;
    writeFileSync(temporary, 'interrupted', { mode: 0o600 });
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f), undefined,
      { async afterTemporaryRemoval() { throw new Error('interrupted after unlink'); } }), { code: 'dependency-uncertain' });
    assert.equal(existsSync(temporary), false);
    const names = readdirSync(dirname(s.record)), intent = names.find(n => /\.retry-temp-[a-f0-9]{64}\.json$/.test(n));
    assert.ok(intent); assert.equal(existsSync(join(dirname(s.record), intent.replace(/\.json$/, '.done.json'))), false);
    assert.equal(JSON.parse(readFileSync(join(dirname(s.record), intent), 'utf8')).purpose, 'temporary-record-disposal');
    await assert.rejects(closedOllamaAttempts(f.location), { code: 'dependency-uncertain' });
    let downloads = 0;
    const fresh = () => prepareOllama(f.location, s.policy, s.offer, f.context('b'.repeat(64)),
      { recheck: f.recheck, transport: async () => { downloads++; return f.transport(); } });
    await assert.rejects(fresh(), { code: 'dependency-uncertain' });
    assert.equal(downloads, 0); assert.equal(existsSync(s.offer.destination), false);
    await cleanupOllamaInstallAttempt(f.location, retry(f));
    assert.equal(existsSync(join(dirname(s.record), intent.replace(/\.json$/, '.done.json'))), true);
    assert.equal((await closedOllamaAttempts(f.location)).length, 1);
    await fresh(); assert.equal(downloads, 1); assert.equal(existsSync(s.offer.destination), true);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'malformed-or-incomplete-retry-journals-block-fresh-preparation', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f); await cleanupOllamaInstallAttempt(f.location, retry(f));
    let downloads = 0;
    for (const suffix of ['retry', 'retry-done']) {
      const file = s.record.replace(/\.json$/, `.${suffix}.json`), original = readFileSync(file);
      for (const value of ['{incomplete', canonicalJson({ ...JSON.parse(original.toString('utf8')), identitySha256: '0'.repeat(64) })]) {
        writeFileSync(file, value);
        await assert.rejects(closedOllamaAttempts(f.location), { code: 'dependency-uncertain' });
        await assert.rejects(prepareOllama(f.location, s.policy, s.offer, f.context('b'.repeat(64)),
          { recheck: f.recheck, transport: async () => { downloads++; return f.transport(); } }), { code: 'dependency-uncertain' });
        assert.equal(downloads, 0); assert.equal(existsSync(s.offer.destination), false);
        writeFileSync(file, original);
      }
    }
    assert.equal((await closedOllamaAttempts(f.location)).length, 1);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'cleanup-deadline-retains-actor-until-close-and-retry-finishes-disposal', async () => {
  const f = await ollamaFixture(); let release!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  try {
    const s = await seed(f);
    const work = cleanupOllamaInstallAttempt(f.location, retry(f), undefined, { cleanupMs: 100,
      beforeDisposal: async () => { entered(); await paused; } });
    await started; await assert.rejects(work, { code: 'dependency-uncertain' });
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f)), { code: 'dependency-uncertain' });
    assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.record.replace(/\.json$/, '.retry-done.json')), false);
    release(); await waitFor(() => {
      try { const lock = controlBinding().acquire(`${s.record}.lock`); controlBinding().close(lock); return true; } catch { return false; }
    });
    await cleanupOllamaInstallAttempt(f.location, retry(f)); assert.equal(existsSync(s.stage), false);
  } finally { release(); await f.cleanup(); }
});
