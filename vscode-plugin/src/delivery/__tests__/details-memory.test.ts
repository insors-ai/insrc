/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s4, ISSUE-348d4663 — the details memory: one invalidation rule, applied only to kept states, and following the item screen the host shows. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ChatPanelChannel } from '../../chat/chat-panel.js';
import { createDeliveryBoardHost } from '../board-host.js';
import type { BoardDownMessage, Envelope } from '../board-protocol.js';
import type { DeliveryResult } from '../delivery-client.js';
import type { DeliveryEvidenceRecord, DeliverySnapshot } from '../delivery-contract.js';
import { createDetailsMemory } from '../details-memory.js';
import { DISPLAY_LABELS } from '../labels.js';
import { announcementsIn as announced, evidence, item, screensIn as screens, snapshot } from './board-fixtures.js';
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

/** The board host over a fake channel, with a client whose evidence reads stay outstanding until answered. */
function hostSetup(snap: DeliverySnapshot) {
  const posted: BoardDownMessage[] = [];
  const logs = { warn: [] as string[], error: [] as string[] };
  const reads: { artifactId: string; resolve(r: DeliveryResult<DeliveryEvidenceRecord>): void }[] = [];
  let send: (raw: unknown) => void = () => {};
  const channel: ChatPanelChannel = {
    setHtml() {}, reveal() {}, dispose() {}, onDidDispose() {},
    postMessage(m) { posted.push((m as Envelope<BoardDownMessage>).payload); },
    onMessage(l) { send = l; },
  };
  const host = createDeliveryBoardHost({
    createPanel: () => channel,
    client: { snapshot: async () => ({ ok: true, value: snap }), evidence: (artifactId) => new Promise(resolve => { reads.push({ artifactId, resolve }); }) },
    logger: { warn: m => logs.warn.push(m), error: m => logs.error.push(m) },
    now: () => '2026-10-09T12:00:00.000Z',
    genNonce: () => 'N',
  });
  return { host, posted, logs, reads, up: (payload: unknown) => send({ v: 1, payload }) };
}


test('the memory is told null once the item screen is left', async () => {
  const board = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E1:S001', parentId: 'E1', title: 'Columns', evidence: [evidence('PLAN-x', 'PLAN')] }),
  ]);
  const { host, posted, reads, up } = hostSetup(board);
  host.open();
  await flush();
  assert.deepEqual(reads, [], 'no item screen, no PLAN read');

  up({ type: 'open-item', itemId: 'E1:S001' });
  assert.deepEqual(reads.map(r => r.artifactId), ['PLAN-x'], 'the memory was told the story: it reads its PLAN');
  assert.equal(screens(posted).at(-1)?.body.kind, 'story');

  up({ type: 'back' });
  const shown = screens(posted).length;
  assert.equal(screens(posted).at(-1)?.body.kind, 'stages', 'Back shows the board again, and nothing of the story');

  // The PLAN answers after the reader left: the memory follows no item, so nothing is re-posted.
  reads[0]!.resolve({ ok: true, value: { artifactId: 'PLAN-x', kind: 'PLAN', meta: {}, body: { tasks: [] }, renderedMarkdown: null } });
  await flush();
  assert.equal(screens(posted).length, shown, 'a late PLAN answer does not bring the story back');

  up({ type: 'open-evidence', itemId: 'E1:S001', artifactId: 'PLAN-x' });
  assert.equal(reads.length, 1, 'an open naming the story left is refused');
  host.dispose();
});

test('the host checks the ids it is sent and announces each screen change once', async () => {
  const board = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E1:S001', parentId: 'E1', title: 'Columns', stage: 'design-plan' }),
    item({ id: 'E1:S001:T001', kind: 'task', parentId: 'E1:S001' }),
  ]);
  const { host, posted, logs, up } = hostSetup(board);
  host.open();
  await flush();
  const before = posted.length;
  up({ type: 'open-epic', epicItemId: 'E9' });
  up({ type: 'open-item', itemId: 'E1:S001:T001' });
  up({ type: 'open-item', itemId: 'nope' });
  up({ type: 'open-epic', epicItemId: 'E1:S001' });
  assert.equal(posted.length, before, 'nothing is posted for an id that is not on the board, or not openable');
  assert.equal(logs.warn.filter(w => /not on the board/.test(w)).length, 4);

  const start = announced(posted).length;
  up({ type: 'set-view', view: 'epics' });
  up({ type: 'open-item', itemId: 'E1' });   // an epic id opens the epic's board
  up({ type: 'open-item', itemId: 'E1:S001' });
  up({ type: 'open-item', itemId: 'E1:S001' });   // the current screen again: no change, no announcement
  up({ type: 'set-item-tab', tab: 'evidence' });
  up({ type: 'back' });
  up({ type: 'go-to-crumb', index: 0 });
  up({ type: 'set-search', search: 'col' });
  assert.deepEqual(announced(posted).slice(start), [
    'Showing Epics', 'Epic: Board epic', 'Opened: Columns \u00b7 Design & plan', 'Back to Board epic', 'Back to Epics',
  ]);
  host.dispose();
});
