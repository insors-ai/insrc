/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import policy from '../../assets/node-runtime-policy.json' with { type: 'json' };
import { captureStopTarget } from '../../shared/daemon-process-client.js';
import { processIdentityState, requireProcessIdentity, sameProcess } from '../../shared/daemon-process.js';
import type { ProcessIdentity } from '../../shared/daemon-process.js';
import { acquireRunFileGuard } from '../../shared/daemon-run-files.js';
import { SourceInstallationStore, _setSourcePublicationFaultForTests } from '../../shared/source-installation.js';
import type { SourceSelection } from '../../shared/source-installation.js';
import { captureManagedReleasePin } from '../managed-release-staging.js';
import type { StagedReleasePin } from '../managed-release-staging.js';
import { LinuxSourceTransaction } from '../source-update-transaction.js';
import type { SourceActor, SourceTransactionHost, SourceUpgrade } from '../source-update-transaction.js';
import { sourceLinux } from './helpers/source-linux.js';

import { daemon, fixture, host, upgrade, startOriginal, stopFixture, request } from './helpers/source-transaction-fixture.js';
import type { Fixture } from './helpers/source-transaction-fixture.js';

const file = fileURLToPath(import.meta.url);
const project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));

if (process.env.INSRC_SOURCE_TRANSACTION_WORKER) {
 const { fixture: f, phase } = JSON.parse(process.env.INSRC_SOURCE_TRANSACTION_WORKER) as { fixture: Fixture; phase: string };
 const store = new SourceInstallationStore(f.root, f.logical), h = host(f,
  { failReady: ['rollback-required', 'rolled-back'].includes(phase) || phase.includes('prior'), unknownChildren: phase === 'recovery-required' });
 _setSourcePublicationFaultForTests(point => {
  const active = store.read().active;
  const checkpoint = phase === 'spawn-prior-recorded'
   ? active?.execution?.step === 'spawn-prior' && active.execution.restored !== null
   : phase === 'spawn-prior-unrecorded' ? active?.execution?.step === 'spawn-prior' && active.execution.restored === null
   : phase.startsWith('prior-ready') ? active?.execution?.step === 'prior-ready' : active?.phase === phase;
  if (point === 'after-rename' && checkpoint) process.exit(81);
 });
 await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
 process.exit(82);
} else {
 test('Linux original-process closure precedes selection and candidate start', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
  const f = await fixture(t), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
  const original = await startOriginal(f), before = store.read().selected;
  const failed = await new LinuxSourceTransaction(store, h.effects).update(async () => {
   await assert.rejects(new LinuxSourceTransaction(store, h.effects).exclusive(async () => {}), /guard/);
   throw new Error('fixture npm failed');
  });
  assert.equal(failed.decision, 'rolled-back'); assert.deepEqual(store.read().selected, before);
  assert.equal((await request(f.root, 'status')).pid, original.pid); assert.equal(h.events.includes('shutdown'), false);
  const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
  assert.equal(result.decision, 'committed'); assert.deepEqual(store.read().selected, f.candidate);
  assert.equal(store.read().active, null);
  assert.ok(h.events.indexOf('children-closed') < h.events.indexOf('stores-qualified'));
  assert.ok(h.events.indexOf('stores-qualified') < h.events.indexOf('start-candidate'));
  assert.notEqual((await request(f.root, 'status')).pid, original.pid);
  assert.equal(existsSync(join(f.root, 'daemon.run-files.guard')), false);
 }));

 test('Pre-cutover admission failures preserve the running incumbent', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
  for (const failure of ['capture', 'runtime', 'candidate-pin']) {
   const f = await fixture(t), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
   const original = await startOriginal(f);
   if (failure === 'capture') h.effects.capture = async () => { throw new Error('unverified incumbent ownership'); };
   if (failure === 'runtime') h.effects.verifyRuntime = async () => { throw new Error('runtime archive verification failed'); };
   if (failure === 'candidate-pin') writeFileSync(join(f.candidate.pin.root, 'out/daemon/index.js'), daemon + '\n// changed after staging\n');
   const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
   assert.equal(result.decision, 'rolled-back', result.detail);
   assert.equal(store.read().selected, null); assert.equal(store.read().active, null);
   assert.equal(store.read().outcome?.legacyRoute, undefined, 'unverified preparation must not become a retained legacy launch route');
   assert.equal((await request(f.root, 'status')).pid, original.pid, `${failure} must preserve the original running process`);
   assert.equal(h.events.includes('shutdown'), false, 'no shutdown is permitted before cutover intent');
   assert.equal(existsSync(join(f.root, 'store-owner')), true);
   await stopFixture(f);
  }
 }));

 test('Legacy restoration route survives later failures and settles under mutation exclusion', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
  const f = await fixture(t), store = new SourceInstallationStore(f.root, f.logical);
  await startOriginal(f);
  const failed = await new LinuxSourceTransaction(store, host(f, { failReady: true }).effects).update(async () => upgrade(f));
  assert.equal(failed.decision, 'rolled-back', failed.detail);
  const route = store.read().outcome?.legacyRoute; assert.ok(route);
  assert.deepEqual(route.prior, f.prior); assert.equal(store.read().selected, null);
  const preparation = await new LinuxSourceTransaction(store, host(f).effects).update(async () => { throw new Error('later download failed'); });
  assert.equal(preparation.decision, 'rolled-back');
  assert.deepEqual(store.read().outcome?.legacyRoute, route, 'preparation-only failures must preserve the qualified legacy route');
  for (const operation of ['start', 'stop', 'start', 'restart', 'stop'] as const) {
   const h = host(f, { handoff: true });
   let settled = false;
   h.effects.settled = async transaction => {
    assert.equal(transaction.phase, 'committed');
    assert.equal(store.read().active?.id, transaction.id, 'terminal ownership must remain recoverable until native commit');
    assert.equal(store.read().outcome?.transaction?.id, transaction.id);
    await delay(20);
    await assert.rejects(new LinuxSourceTransaction(store, host(f).effects).exclusive(async () => {}), /guard/,
     'async native ownership commit must retain the mutation lease');
    settled = true;
   };
   const previous = existsSync(join(f.root, 'daemon.pid')) ? Number(readFileSync(join(f.root, 'daemon.pid'), 'utf8')) : undefined;
   const result = await new LinuxSourceTransaction(store, h.effects).lifecycle(operation);
   assert.equal(result.decision, 'committed', result.detail); assert.equal(settled, true);
   assert.equal(store.read().selected, null, 'legacy routing must not fabricate source authorization for the recovered prior');
   assert.equal(store.read().active, null);
   assert.deepEqual(store.read().outcome?.legacyRoute?.prior, f.prior);
   if (operation === 'stop') assert.equal(existsSync(join(f.root, 'daemon.pid')), false);
   else {
    const pid = (await request(f.root, 'status')).pid;
    if (operation === 'start' && previous) assert.equal(pid, previous);
    else { assert.notEqual(pid, previous); assert.ok(h.events.includes('entry-guard-acquired')); }
   }
  }
 }));

 test('Interrupted cutover and failed readiness recover exact prior selection and running state', { timeout: 600_000 }, async t => sourceLinux(t, file, project, async () => {
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
  for (const point of ['before-rename', 'after-rename'] as const) {
   const f = await fixture(t), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
   await startOriginal(f); let injected = false;
   _setSourcePublicationFaultForTests(observed => {
    const current = store.read();
    if (!injected && observed === point && current.active?.execution?.step === 'select-candidate'
     && (point === 'before-rename' || current.active.phase === 'candidate-selected')) {
     injected = true; throw new Error('injected selection publication failure');
    }
   });
   const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
   _setSourcePublicationFaultForTests(); assert.equal(injected, true);
   assert.equal(result.decision, point === 'after-rename' ? 'committed' : 'rolled-back', result.detail);
   assert.deepEqual(store.read().selected, point === 'after-rename' ? f.candidate : null);
   await stopFixture(f);
  }
  for (const phase of ['reserved', 'staged', 'predecessor-exited', 'candidate-selected', 'candidate-ready', 'committed',
   'rollback-required', 'rolled-back', 'recovery-required', 'spawn-prior-unrecorded', 'spawn-prior-recorded', 'prior-ready', 'prior-ready-exited']) {
   const f = await fixture(t, phase === 'candidate-ready'), store = new SourceInstallationStore(f.root, f.logical);
   await startOriginal(f);
   const args = file.endsWith('.ts') ? ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), file] : [file];
   const worker = spawn(process.execPath, args, { env: { ...process.env, INSRC_SOURCE_TRANSACTION_WORKER: JSON.stringify({ fixture: f, phase }) }, stdio: ['ignore', 'pipe', 'pipe'] });
   let stderr = ''; worker.stderr.on('data', chunk => { stderr += chunk.toString(); });
   const [code] = await once(worker, 'close'); assert.equal(code, 81, stderr);
   const h = host(f), restored = store.read().active?.execution?.restored;
   if (phase === 'prior-ready-exited') {
    assert.ok(restored);
    const actor = await h.effects.recover(restored); assert.ok(actor);
    try { await actor.shutdown(); await actor.childrenClosed(); }
    finally { await actor.target.handle.close(); }
   }
   const result = await new LinuxSourceTransaction(store, h.effects).recover();
   if (phase === 'spawn-prior-unrecorded') {
    assert.equal(result?.decision, 'recovery-required', result?.detail);
    assert.equal(h.events.includes('start-prior'), false, 'unrecorded spawn must not be repeated');
    assert.equal(store.read().active?.execution?.restored, null);
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
 }));
test('Source update admission precedes preparation and unchanged observation preserves running selection', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 const f = await fixture(t, true), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
 await startOriginal(f);
 const originalPid = readFileSync(join(f.root, 'daemon.pid'), 'utf8'), order: string[] = [];
 const receipt = { ...f.initial!.source, sequence: 2, tagObject: 'c'.repeat(40) };
 const result = await new LinuxSourceTransaction(store, h.effects).update(async selected => {
  order.push('prepare'); assert.deepEqual(selected, f.initial); return { unchanged: receipt };
 }, 'update', async id => {
  order.push('admitted'); assert.equal(store.read().active?.id, id); assert.equal(store.read().active?.phase, 'reserved');
  await assert.rejects(new LinuxSourceTransaction(store, host(f).effects).exclusive(async () => {}), /guard/);
 });
 assert.equal(result.decision, 'committed'); assert.deepEqual(order, ['admitted', 'prepare']);
 assert.deepEqual(store.read().selected, f.initial); assert.equal(store.read().active, null);
 assert.equal(readFileSync(join(f.root, 'daemon.pid'), 'utf8'), originalPid);
 assert.equal(store.read().sourceReleases[0]?.sequence, 2); assert.deepEqual(h.events, ['runtime-verified']);
 assert.equal(result.transaction?.execution, undefined, 'an observation must not fabricate a same-release update pair');
 let prepared = false;
 const cancelled = await new LinuxSourceTransaction(store, h.effects).update(async () => {
  prepared = true; return { unchanged: receipt };
 }, 'update', async () => { throw Error('reply not acknowledged'); });
 assert.equal(prepared, false); assert.equal(cancelled.decision, 'rolled-back');
 assert.equal(readFileSync(join(f.root, 'daemon.pid'), 'utf8'), originalPid);
 const invalidPair = await new LinuxSourceTransaction(store, h.effects).update(async () => ({
  prior: f.initial!.pin, candidate: f.initial!, compatibility: { prior: f.initial!.compatibility, candidate: f.initial!.compatibility },
 }));
 assert.equal(invalidPair.decision, 'rolled-back'); assert.match(invalidPair.detail, /distinct pinned releases/);
 assert.equal(readFileSync(join(f.root, 'daemon.pid'), 'utf8'), originalPid);
}));

}
