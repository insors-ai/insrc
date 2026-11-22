/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { SourceInstallationStore } from '../../shared/source-installation.js';
import { LinuxSourceTransaction } from '../source-update-transaction.js';
import { sourceLinux } from './helpers/source-linux.js';
import { daemon, fixture, host, upgrade, startOriginal, stopFixture, request } from './helpers/source-transaction-fixture.js';

const file = fileURLToPath(import.meta.url);
const project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));


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
