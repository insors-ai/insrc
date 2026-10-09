/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s4 — the details memory on its own: one invalidation rule, applied only to kept states. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DeliveryResult } from '../delivery-client.js';
import type { DeliveryEvidenceRecord, DeliverySnapshot } from '../delivery-contract.js';
import { createDetailsMemory } from '../details-memory.js';
import { DISPLAY_LABELS } from '../labels.js';
import { evidence, item, snapshot } from './board-fixtures.js';
import { flush } from './flush.js';

function memorySetup() {
  const reads: { artifactId: string; resolve(r: DeliveryResult<DeliveryEvidenceRecord>): void }[] = [];
  const rerenders: string[] = [];
  const logs = { warn: [] as string[], error: [] as string[] };
  const memory = createDetailsMemory({
    client: { evidence: (artifactId) => new Promise(resolve => { reads.push({ artifactId, resolve }); }) },
    log: { warn: m => logs.warn.push(m), error: m => logs.error.push(m) },
    labels: DISPLAY_LABELS,
    rerender: what => rerenders.push(what),
  });
  return { memory, reads, rerenders, logs };
}

const snap = (takenAt: string): DeliverySnapshot => snapshot([
  item({ id: 'S1', evidence: [evidence('BUILD-x', 'BUILD'), evidence('PLAN-x', 'PLAN')] }),
  item({ id: 'S2', evidence: [evidence('BUILD-y', 'BUILD')] }),
], { takenAt });
const record = (artifactId: string, text: string): DeliveryResult<DeliveryEvidenceRecord> =>
  ({ ok: true, value: { artifactId, kind: 'BUILD', meta: {}, body: {}, renderedMarkdown: text } });

test('the details memory follows kept states only, and a new snapshot or selection supersedes the reads in flight', async () => {
  const { memory, reads, rerenders, logs } = memorySetup();
  const a = snap('2026-10-09T11:00:00.000Z');
  memory.kept(a, 'S1');
  assert.deepEqual(reads.map(r => r.artifactId), ['PLAN-x'], 'a kept story selection reads its PLAN once');
  memory.kept(a, 'S1');
  assert.equal(reads.length, 1);

  memory.openEvidence('S1', 'BUILD-x');
  reads[1]!.resolve(record('BUILD-x', '# Build'));
  await flush();
  assert.deepEqual(rerenders, ['record BUILD-x']);
  assert.deepEqual(memory.model(a, 'S1')!.openedRecord, { artifactId: 'BUILD-x', text: '# Build' });

  // Deriving a state that is never kept (model alone) changes nothing.
  assert.equal(memory.model(a, 'S2')!.openedRecord, null);
  assert.deepEqual(memory.model(a, 'S1')!.openedRecord, { artifactId: 'BUILD-x', text: '# Build' });
  const b = snap('2026-10-09T11:05:00.000Z');
  assert.equal(memory.model(b, 'S1')!.openedRecord, null, 'a snapshot not yet kept shows no record');
  assert.deepEqual(memory.model(a, 'S1')!.openedRecord, { artifactId: 'BUILD-x', text: '# Build' });

  // A new selection supersedes a read in flight, and clears the opened record.
  memory.openEvidence('S1', 'BUILD-x');
  memory.kept(a, 'S2');
  reads[2]!.resolve(record('BUILD-x', '# Late'));
  await flush();
  assert.deepEqual(rerenders, ['record BUILD-x'], 'the superseded answer is dropped');
  memory.kept(a, 'S1');
  assert.equal(memory.model(a, 'S1')!.openedRecord, null);

  // A new snapshot supersedes reads in flight and clears the PLAN reads.
  memory.openEvidence('S1', 'BUILD-x');
  memory.kept(b, 'S1');
  assert.deepEqual(reads.slice(3).map(r => r.artifactId), ['BUILD-x', 'PLAN-x'], 'the new snapshot reads the PLAN again');
  reads[3]!.resolve(record('BUILD-x', '# Old'));
  await flush();
  assert.equal(memory.model(b, 'S1')!.openedRecord, null);

  // An open naming anything but the kept selection's own record is ignored.
  memory.openEvidence('S2', 'BUILD-y');
  memory.openEvidence('S1', 'BUILD-y');
  assert.equal(logs.warn.filter(w => /not the selected item's evidence/.test(w)).length, 2);

  // Disposed: answers are dropped silently.
  memory.dispose();
  reads[0]!.resolve(record('PLAN-x', 'x'));
  reads[4]!.resolve(record('PLAN-x', 'x'));
  await flush();
  assert.deepEqual(rerenders, ['record BUILD-x']);
  assert.deepEqual(logs.error, []);
});
