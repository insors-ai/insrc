import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

test('qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors', async () => {
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

test('repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first', async () => {
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

test('cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect', async () => {
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

test('unknown-actor-proof-blocks-install-retry-cleanup', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f);
    writeFileSync(s.record, canonicalJson({ schemaVersion: 1, identity: s.attempt.identity, absence: s.attempt.absence,
      actor: 'in-process-preparation', externalActors: 0 }), { mode: 0o600 });
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f), s.policy), { code: 'dependency-uncertain' });
    assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.offer.destination), false);
  } finally { await f.cleanup(); }
});

test('malformed-utf8-historical-policy-never-authorizes-cleanup', async () => {
  const f = await ollamaFixture();
  try {
    const s = await seed(f), bytes = readFileSync(s.record), offset = bytes.indexOf('fixtures/not-native-evidence.json');
    assert.ok(offset >= 0); bytes[offset] = 0xff; writeFileSync(s.record, bytes);
    await assert.rejects(cleanupOllamaInstallAttempt(f.location, retry(f)), { code: 'dependency-uncertain' });
    assert.equal(existsSync(s.stage), true); assert.equal(existsSync(s.record.replace(/\.json$/, '.retry.json')), false);
  } finally { await f.cleanup(); }
});

test('policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution', async () => {
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

test('replacement-free-lock-cannot-authorize-cleanup-of-original-actor', async () => {
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

test('late-settlement-records-true-outcome-and-completes-disposal-under-held-handle', async () => {
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

test('immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp', async () => {
  const f = await ollamaFixture(); const native = controlBinding();
  try {
    const s = await seed(f), lock = native.acquire(`${s.record}.lock`), target = join(dirname(s.record), 'publication-test.json');
    try {
      const from = `${target}.source`;
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

test('cleanup-deadline-retains-actor-until-close-and-retry-finishes-disposal', async () => {
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
