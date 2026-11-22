/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SourceInstallationStore } from '../../shared/source-installation.js';
import { beginSourceUpdate, finishSourceUpdate, readSourceUpdateOutcome } from '../../shared/source-update-outcomes.js';
import { LinuxSourceTransaction } from '../source-update-transaction.js';
import { sourceLinux } from './helpers/source-linux.js';
import { fixture, host, upgrade, startOriginal } from './helpers/source-transaction-fixture.js';
const file = fileURLToPath(import.meta.url);
const project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));
test('Source update receipts retain update results and expose recovery-required under exclusion', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 const f = await fixture(t, true), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
 let settled = false;
 h.effects.settled = async () => { settled = true; assert.equal(readSourceUpdateOutcome(store), null); };
 h.effects.published = async (outcome, guard) => {
  assert.ok(settled); assert.equal(store.read().active?.id, outcome.id);
  await assert.rejects(new LinuxSourceTransaction(store, host(f).effects).exclusive(async () => {}), /guard/);
  finishSourceUpdate(store, outcome, guard);
 };
 const result = await new LinuxSourceTransaction(store, h.effects).update(async () => { throw Error('fixture install failed'); }, 'update', async (id, guard) => {
  beginSourceUpdate(store, id, guard); assert.equal(readSourceUpdateOutcome(store), null);
 });
 assert.equal(result.decision, 'rolled-back');
 const recorded = readSourceUpdateOutcome(store); assert.equal(recorded?.updateId, result.id); assert.equal(recorded?.state, 'failed');
 assert.equal(recorded?.decision, 'rolled-back'); assert.match(recorded?.error ?? '', /fixture install failed/);
 await new LinuxSourceTransaction(store, host(f).effects).lifecycle('stop');
 assert.deepEqual(readSourceUpdateOutcome(store), recorded);
 const path = join(f.root, 'source-lifecycle/update-outcomes', result.id + '.json'), bytes = readFileSync(path);
 try { writeFileSync(path, '{malformed'); assert.throws(() => readSourceUpdateOutcome(store)); }
 finally { writeFileSync(path, bytes); }
 await startOriginal(f);
 const uncertain = host(f, { unknownChildren: true });
 uncertain.effects.published = async (outcome, guard) => finishSourceUpdate(store, outcome, guard);
 const fenced = await new LinuxSourceTransaction(store, uncertain.effects).update(async () => upgrade(f), 'update', async (id, guard) => beginSourceUpdate(store, id, guard));
 assert.equal(fenced.decision, 'recovery-required'); assert.equal(store.read().active?.id, fenced.id);
 assert.equal(readSourceUpdateOutcome(store)?.decision, 'recovery-required');
 await assert.rejects(new LinuxSourceTransaction(store, host(f).effects).exclusive(async () => {}), /guard/);
}));
