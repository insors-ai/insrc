/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { processIdentityState } from '../../shared/daemon-process.js';
import type { ProcessIdentity } from '../../shared/daemon-process.js';
import { SourceInstallationStore, _setSourcePublicationFaultForTests } from '../../shared/source-installation.js';
import { LinuxSourceTransaction } from '../source-update-transaction.js';
import { sourceLinux } from './helpers/source-linux.js';
import { fixture, host, upgrade, startOriginal, stopFixture, request } from './helpers/source-transaction-fixture.js';
import type { Fixture } from './helpers/source-transaction-fixture.js';

const file = fileURLToPath(import.meta.url);
const project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));

async function interruptController(f: Fixture, phase: string, mode: 'crash' | 'timeout'): Promise<void> {
 const store = new SourceInstallationStore(f.root, f.logical);
 const args = file.endsWith('.ts') ? ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), file] : [file];
 const deadline = new AbortController();
 // AbortSignal owns this directly spawned controller child. Daemon actors are
 // recovered only through the existing retained-capability host, never a PID signal.
 const worker = spawn(process.execPath, args, { env: { ...process.env, INSRC_SOURCE_TRANSACTION_WORKER: JSON.stringify({ fixture: f, phase, mode }) },
  signal: deadline.signal, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] });
 let stderr = '', spawnError: Error | undefined;
 worker.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
 worker.on('error', error => { spawnError = error; });
 const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => worker.once('close', (code, signal) => resolve({ code, signal })));
 try {
  if (mode === 'timeout') {
   const marker = join(f.root, 'paused-controller');
   for (let attempt = 0; attempt < 1000 && !existsSync(marker) && worker.exitCode === null && !spawnError; attempt++) await delay(10);
   assert.equal(existsSync(marker), true, `${phase}: controller did not reach its deadline checkpoint: ${stderr}`);
   const before = store.read(), owner = existsSync(join(f.root, 'store-owner')) ? readFileSync(join(f.root, 'store-owner'), 'utf8') : undefined;
   await assert.rejects(new LinuxSourceTransaction(store, host(f).effects).lifecycle('start'), /guard/);
   assert.deepEqual(store.read(), before, 'a competing lifecycle must not alter the reserved transaction');
   if (owner !== undefined) assert.equal(readFileSync(join(f.root, 'store-owner'), 'utf8'), owner);
   const timer = setTimeout(() => deadline.abort(new Error('fixture controller deadline expired')), 50);
   const result = await closed; clearTimeout(timer);
   assert.equal(result.signal, 'SIGKILL'); assert.equal(spawnError?.name, 'AbortError');
  } else assert.equal((await closed).code, 81, stderr);
 } finally {
  if (worker.exitCode === null && worker.signalCode === null) deadline.abort();
  await closed;
 }
}

if (process.env.INSRC_SOURCE_TRANSACTION_WORKER) {
 const { fixture: f, phase, mode } = JSON.parse(process.env.INSRC_SOURCE_TRANSACTION_WORKER) as { fixture: Fixture; phase: string; mode?: 'crash' | 'timeout' };
 const store = new SourceInstallationStore(f.root, f.logical), h = host(f,
  { failReady: ['rollback-required', 'rolled-back'].includes(phase) || phase.includes('prior'), unknownChildren: phase === 'recovery-required' });
 const interrupt = (): never => {
  if (mode === 'timeout') {
   writeFileSync(join(f.root, 'paused-controller'), phase, { mode: 0o600, flush: true });
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
  process.exit(81);
 };
 if (phase.endsWith('created-unrecorded')) {
  const start = h.effects.start;
  h.effects.start = (pin, guard, record, grant) => start(pin, guard, actor => {
   if ((phase.startsWith('spawn-prior') && pin.commit === f.prior.commit)
    || (phase.startsWith('spawn-candidate') && pin.commit === f.candidate.pin.commit)) {
    // Sideband evidence for the test's closure assertion, never transaction authority.
    const { pid, startedAt, commandLine } = actor.target;
    writeFileSync(join(f.root, 'unrecorded-actor.json'), JSON.stringify({ pid, startedAt, commandLine }), { mode: 0o600, flush: true });
    interrupt();
   }
   record(actor);
  }, grant);
 }
 _setSourcePublicationFaultForTests(point => {
  const active = store.read().active;
  const checkpoint = phase === 'spawn-prior-recorded'
   ? active?.execution?.step === 'spawn-prior' && active.execution.restored !== null
   : phase === 'spawn-prior-unrecorded' ? active?.execution?.step === 'spawn-prior' && active.execution.restored === null
   : phase === 'spawn-candidate-recorded' ? active?.execution?.step === 'spawn-candidate' && active.execution.candidate !== null
   : phase === 'spawn-candidate-unrecorded' ? active?.execution?.step === 'spawn-candidate' && active.execution.candidate === null
   : phase.startsWith('prior-ready') ? active?.execution?.step === 'prior-ready' : active?.phase === phase;
  if (point === 'after-rename' && checkpoint) interrupt();
 });
 await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
 process.exit(82);
} else {
 test('Every transaction phase crash/timeout and concurrent mutation preserves single daemon ownership', { timeout: 1_200_000 }, async t => sourceLinux(t, file, project, async () => {
  for (const selected of [false, true]) {
   const f = await fixture(t, selected), store = new SourceInstallationStore(f.root, f.logical), h = host(f, { failReady: true });
   await startOriginal(f);
   const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
   assert.equal(result.decision, 'rolled-back', result.detail); assert.deepEqual(store.read().selected, f.initial);
   assert.ok(h.events.indexOf('start-candidate') < h.events.indexOf('start-prior'));
   assert.equal(store.read().active, null); await stopFixture(f);
  }
  // Interrupt real controller processes after durable checkpoints. The replacement controller
  // reclaims only a dead owner's guard and captures exact actors through the real Linux broker.
  for (const point of ['file-synced', 'before-rename', 'after-rename', 'directory-synced'] as const) {
   const f = await fixture(t), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
   await startOriginal(f); let injected = false;
   _setSourcePublicationFaultForTests(observed => {
    const current = store.read();
    if (!injected && observed === point && current.active?.execution?.step === 'select-candidate'
     && (['file-synced', 'before-rename'].includes(point) || current.active.phase === 'candidate-selected')) {
     injected = true; throw new Error('injected selection publication failure');
    }
   });
   const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
   _setSourcePublicationFaultForTests(); assert.equal(injected, true);
   assert.equal(result.decision, ['after-rename', 'directory-synced'].includes(point) ? 'committed' : 'rolled-back', result.detail);
   assert.deepEqual(store.read().selected, ['after-rename', 'directory-synced'].includes(point) ? f.candidate : null);
   await stopFixture(f);
  }
  for (const mode of ['crash', 'timeout'] as const) for (const phase of ['reserved', 'staged', 'predecessor-exited', 'candidate-selected',
   'spawn-candidate-unrecorded', 'spawn-candidate-created-unrecorded', 'spawn-candidate-recorded', 'candidate-ready', 'committed',
   'rollback-required', 'rolled-back', 'recovery-required', 'spawn-prior-unrecorded', 'spawn-prior-created-unrecorded',
   'spawn-prior-recorded', 'prior-ready', 'prior-ready-exited']) {
   const f = await fixture(t, phase === 'candidate-ready'), store = new SourceInstallationStore(f.root, f.logical);
   await startOriginal(f);
   await interruptController(f, phase, mode);
   const h = host(f), restored = store.read().active?.execution?.restored;
   if (phase === 'prior-ready-exited') {
    assert.ok(restored);
    const actor = await h.effects.recover(restored); assert.ok(actor);
    try { await actor.shutdown(); await actor.childrenClosed(); }
    finally { await actor.target.handle.close(); }
   }
   const result = await new LinuxSourceTransaction(store, h.effects).recover();
   if (phase.endsWith('unrecorded')) {
    assert.equal(result?.decision, 'recovery-required', result?.detail);
    assert.equal(h.events.includes('start-prior'), false, 'unrecorded spawn must not be repeated');
    const execution = store.read().active?.execution;
    assert.equal(phase.startsWith('spawn-candidate') ? execution?.candidate : execution?.restored, null);
    await assert.rejects(new LinuxSourceTransaction(store, host(f).effects).lifecycle('start'), /guard/);
    if (phase.endsWith('created-unrecorded')) {
     const actor = JSON.parse(readFileSync(join(f.root, 'unrecorded-actor.json'), 'utf8')) as ProcessIdentity;
     for (let attempt = 0; attempt < 500 && processIdentityState(actor) === 'same'; attempt++) await delay(10);
     await h.effects.proveClosed(actor);
     assert.equal(existsSync(join(f.root, 'store-owner')), false, 'ungranted actors must never own stores');
    }
    continue;
   }
   assert.equal(result?.decision, phase === 'committed' ? 'committed' : 'rolled-back', result?.detail);
   assert.deepEqual(store.read().selected, phase === 'committed' ? f.candidate : f.initial);
   assert.equal(store.read().active, null);
   const status = await request(f.root, 'status'); assert.ok(status);
   if (phase === 'prior-ready') assert.equal(status.pid, restored?.pid, 'already-restored running prior must be preserved');
   if (phase === 'prior-ready-exited') assert.notEqual(status.pid, restored?.pid, 'closed restored prior must be restarted');
   await stopFixture(f);
  }
  // A stop refusal must retain the real original and fence all competing starts.
  const refused = await fixture(t), refusedStore = new SourceInstallationStore(refused.root, refused.logical), refusingHost = host(refused);
  const original = await startOriginal(refused), capture = refusingHost.effects.capture;
  refusingHost.effects.capture = async (selected, prior) => {
   const actor = await capture(selected, prior); assert.ok(actor);
   return { ...actor, shutdown: async () => { throw new Error('fixture stop refused'); } };
  };
  const refusal = await new LinuxSourceTransaction(refusedStore, refusingHost.effects).update(async () => upgrade(refused));
  assert.equal(refusal.decision, 'recovery-required', refusal.detail);
  assert.equal((await request(refused.root, 'status')).pid, original.pid);
  assert.equal(refusingHost.events.some(event => event === 'start-candidate' || event === 'start-prior'), false);
  await assert.rejects(new LinuxSourceTransaction(refusedStore, host(refused).effects).lifecycle('restart'), /guard/);

  // Model a reused PID's different start stamp using a real live candidate.
  // Never claim that the operating system actually wrapped/reused its PID here.
  const replacement = await fixture(t), replacementStore = new SourceInstallationStore(replacement.root, replacement.logical);
  await startOriginal(replacement);
  await interruptController(replacement, 'candidate-ready', 'crash');
  const state = replacementStore.read(), actual = state.active!.execution!.candidate!;
  assert.equal(processIdentityState(actual), 'same');
  replacementStore.update(state.generation, current => ({ ...current, active: { ...current.active!,
   execution: { ...current.active!.execution!, candidate: { ...actual, startedAt: `${actual.startedAt}:different-incarnation` } } } }));
  const replacementHost = host(replacement);
  const preserved = await new LinuxSourceTransaction(replacementStore, replacementHost.effects).recover();
  assert.equal(preserved?.decision, 'recovery-required', preserved?.detail);
  assert.equal((await request(replacement.root, 'status')).pid, actual.pid);
  assert.equal(processIdentityState(actual), 'same');
  assert.equal(replacementHost.events.some(event => event === 'shutdown' || event.startsWith('start-')), false);
  await assert.rejects(new LinuxSourceTransaction(replacementStore, host(replacement).effects).lifecycle('start'), /guard/);

  const idle = await fixture(t), idleStore = new SourceInstallationStore(idle.root, idle.logical), idleHost = host(idle);
  const idleResult = await new LinuxSourceTransaction(idleStore, idleHost.effects).update(async () => upgrade(idle));
  assert.equal(idleResult.decision, 'committed'); assert.equal(idleHost.events.includes('start-candidate'), false);
  assert.deepEqual(idleStore.read().selected, idle.candidate);
  for (const operation of ['start', 'start', 'restart', 'stop', 'restart', 'stop'] as const) {
   const previous = existsSync(join(idle.root, 'daemon.pid')) ? Number(readFileSync(join(idle.root, 'daemon.pid'), 'utf8')) : undefined;
   const result = await new LinuxSourceTransaction(idleStore, idleHost.effects).lifecycle(operation);
   assert.equal(result.decision, 'committed', result.detail);
   assert.deepEqual(idleStore.read().selected, idle.candidate);
   if (operation === 'stop') assert.equal(existsSync(join(idle.root, 'store-owner')), false);
   else {
    const current = (await request(idle.root, 'status')).pid;
    if (operation === 'start' && previous) assert.equal(current, previous, 'already-running start must not restart');
    if (operation === 'restart') assert.notEqual(current, previous, 'restart must start even when previously stopped');
   }
  }
  assert.equal(idleStore.read().retainedSelections.length, 1, 'same release is retained once across ordinary lifecycle actions');
  const uncertain = await fixture(t), uncertainStore = new SourceInstallationStore(uncertain.root, uncertain.logical);
  await startOriginal(uncertain);
  const fenced = await new LinuxSourceTransaction(uncertainStore, host(uncertain, { unknownChildren: true }).effects).update(async () => upgrade(uncertain));
  assert.equal(fenced.decision, 'recovery-required'); assert.equal(uncertainStore.read().selected, null);
  await assert.rejects(new LinuxSourceTransaction(uncertainStore, host(uncertain).effects).exclusive(async () => {}), /guard/);
  const replaced = await fixture(t), replacedStore = new SourceInstallationStore(replaced.root, replaced.logical);
  const lease = replacedStore.acquireLifecycleGuard('mutation');
  const parent = join(replaced.root, 'source-lifecycle');
  renameSync(parent, `${parent}-retained`); mkdirSync(parent, { mode: 0o700 });
  writeFileSync(join(parent, 'sentinel'), 'preserved');
  assert.throws(() => lease.assertOwned(), /replaced/);
  assert.throws(() => lease.release(), /replaced/);
  assert.equal(readFileSync(join(parent, 'sentinel'), 'utf8'), 'preserved');
 }, { timeoutMs: 480_000 }));
}
