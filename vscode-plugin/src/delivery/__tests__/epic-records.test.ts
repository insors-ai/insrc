/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261013cb09a32c:S001 — an epic's own records on its board, opened as a story's are:
 * the model, the record owner, the details memory with an epic selected, the webview's box,
 * and the host end to end.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ChatPanelChannel } from '../../chat/chat-panel.js';
import { createDeliveryBoardHost } from '../board-host.js';
import type { BoardDownMessage, Envelope, ScreenModel, StagesBody } from '../board-protocol.js';
import { boardDownMessages, currentItemId, initialBoardState, recordOwnerId, reduceBoardState, type BoardEvent, type BoardState, type NavIntent } from '../board-state.js';
import { buildItemDetails } from '../board-details.js';
import type { DeliveryResult } from '../delivery-client.js';
import type { DeliveryEvidenceRecord, DeliverySnapshot } from '../delivery-contract.js';
import { createDetailsMemory } from '../details-memory.js';
import { DISPLAY_LABELS } from '../labels.js';
import { evidence as ev, item, review, screensIn, snapshot as fixtureSnapshot } from './board-fixtures.js';
import { findAll, runScript, texts, type FakeEl } from './board-webview-harness.js';
import { flush } from './flush.js';

const EPIC = 'E20261009aaaaaaaa';
const STORY = `${EPIC}:S001`;
const BARE = 'E20261009bbbbbbbb';
const HLD_PATH = '/ws/docs/epics/board-E20261009aaaaaaaa/HLD.md';
const DEF_PATH = '/ws/docs/epics/board-E20261009aaaaaaaa/DEF.md';

/** An epic with a DEF and an HLD that open in the review pane, an amendment and a spec that are read-only, and two stories; an epic with no stories and no records; a standalone story. */
function epicSnapshot(takenAt = '2026-10-09T10:00:00.000Z'): DeliverySnapshot {
  return fixtureSnapshot([
    item({ id: EPIC, kind: 'epic', title: 'Board epic', childIds: [STORY, `${EPIC}:S002`], evidence: [
      ev('AMD-aaaaaaaa-1', 'AMD', { approval: { state: 'pending', at: null } }),
      ev('DEF-aaaaaaaa', 'DEF', { mdPath: DEF_PATH, openWith: 'review-view', approval: { state: 'approved', at: '2026-10-08T09:30:00.000Z' }, review: review() }),
      ev('HLD-aaaaaaaa', 'HLD', { mdPath: HLD_PATH, openWith: 'review-view', review: review() }),
      ev('SPEC-7777', 'SPEC'),
    ] }),
    item({ id: STORY, parentId: EPIC, title: 'Columns', stage: 'scoped', needsAttention: true, attentionReasons: ['pending-decision'],
      evidence: [ev('LLD-aaaaaaaa-s1', 'LLD', { mdPath: '/ws/docs/epics/board-E20261009aaaaaaaa/S001/LLD.md', openWith: 'review-view' })] }),
    item({ id: `${EPIC}:S002`, parentId: EPIC, title: 'Cards', stage: 'complete', evidence: [ev('BUILD-aaaaaaaa-s2', 'BUILD')] }),
    item({ id: BARE, kind: 'epic', title: 'Bare epic' }),
    item({ id: 'SA1', title: 'Loose', standalone: true, stage: 'scoped' }),
  ], { takenAt });
}

const NOW = '2026-10-09T10:00:30.000Z';
const nav = (intent: NavIntent): BoardEvent => ({ type: 'navigate', intent });
const arrived = (s: DeliverySnapshot): BoardEvent => ({ type: 'snapshot-arrived', seq: 1, result: { ok: true, value: s }, at: '2026-10-09T10:00:01.000Z' });
/** From nothing, the board first asks for its snapshot (seq 1), which the tests' arrived() answers. */
const run = (events: readonly BoardEvent[], from?: BoardState): BoardState =>
  events.reduce(reduceBoardState, from ?? reduceBoardState(initialBoardState(), { type: 'refresh-requested', seq: 1 }));
/** The details callback the host gives: the real builder over the snapshot, with no plan and no opened record. */
const detailsFrom = (snap: DeliverySnapshot) => (id: string) => buildItemDetails(snap, id, { state: 'none' }, null, DISPLAY_LABELS);
function modelOf(state: BoardState, snap: DeliverySnapshot): ScreenModel {
  const screens = screensIn(boardDownMessages(state, DISPLAY_LABELS, NOW, detailsFrom(snap)).map(e => e.payload));
  assert.equal(screens.length, 1);
  return screens[0]!;
}
const stagesOf = (m: ScreenModel): StagesBody => { assert.equal(m.body.kind, 'stages'); return m.body as StagesBody; };

test("board state: an epic's board carries the epic's own records, built as a story's are, whatever the search and the needs-attention filter; a list screen carries none", () => {
  const snap = epicSnapshot();
  const onEpic = run([arrived(snap), nav({ type: 'open-epic', epicItemId: EPIC })]);
  const body = stagesOf(modelOf(onEpic, snap));
  assert.ok(body.epic !== null, "it is the epic's board");
  // The epic's id, and one row per record of the epic in the snapshot's order, built by the
  // same builder a story's Records table uses.
  const asAStorys = buildItemDetails(snap, EPIC, { state: 'none' }, null, DISPLAY_LABELS)!.evidence;
  assert.deepEqual(body.epicRecords, { itemId: EPIC, evidence: asAStorys, openedRecord: null });
  assert.deepEqual(body.epicRecords!.evidence.map(r => [r.artifactId, r.kindLabel, r.opensIn, r.approvalLabel, r.reviewLabel === null]), [
    ['AMD-aaaaaaaa-1', 'AMD', 'read-only', DISPLAY_LABELS.approval['pending'], true],
    ['DEF-aaaaaaaa', 'DEF', 'review-pane', DISPLAY_LABELS.approval['approved'], false],
    ['HLD-aaaaaaaa', 'HLD', 'review-pane', DISPLAY_LABELS.approval['approved'], false],
    ['SPEC-7777', 'SPEC', 'read-only', DISPLAY_LABELS.approval['approved'], true],
  ]);
  assert.equal(body.epicRecords!.evidence[1]!.approvedAt, '2026-10-08 09:30 UTC');
  // Not the stories' records.
  assert.ok(!body.epicRecords!.evidence.some(r => r.artifactId.startsWith('LLD-') || r.artifactId.startsWith('BUILD-')));

  // Whatever the filter: a search that matches one story, one that matches none, and needs-attention.
  for (const intent of [
    { type: 'set-search', search: 'Cards' }, { type: 'set-search', search: 'no such story' }, { type: 'set-attention', on: true },
  ] as const) {
    const filtered = stagesOf(modelOf(run([nav(intent)], onEpic), snap));
    assert.deepEqual(filtered.epicRecords, body.epicRecords, JSON.stringify(intent));
  }
  const none = stagesOf(modelOf(run([nav({ type: 'set-search', search: 'no such story' })], onEpic), snap));
  assert.ok(none.emptyPanel !== null, 'no story matches, and the records are still carried');

  // An epic with no stories and no records: an empty list, not null.
  const bare = stagesOf(modelOf(run([arrived(snap), nav({ type: 'open-epic', epicItemId: BARE })]), snap));
  assert.deepEqual(bare.epicRecords, { itemId: BARE, evidence: [], openedRecord: null });

  // The opened read-only record rides with them when the details carry one.
  const withOpened = screensIn(boardDownMessages(onEpic, DISPLAY_LABELS, NOW,
    id => buildItemDetails(snap, id, { state: 'none' }, { artifactId: 'SPEC-7777', text: '# Spec' }, DISPLAY_LABELS)).map(e => e.payload))[0]!;
  assert.deepEqual(stagesOf(withOpened).epicRecords!.openedRecord, { artifactId: 'SPEC-7777', text: '# Spec' });

  // A list screen carries none: All work, Standalone.
  assert.equal(stagesOf(modelOf(run([arrived(snap)]), snap)).epicRecords, null);
  assert.equal(stagesOf(modelOf(run([arrived(snap), nav({ type: 'set-view', view: 'standalone' })]), snap)).epicRecords, null);
});

test("board state: the record owner is the item of an item screen and the epic of an epic's board, and nothing on a list screen", () => {
  const snap = epicSnapshot();
  const start = run([arrived(snap)]);
  assert.equal(recordOwnerId(start.selection), null, 'All work');
  for (const view of ['standalone', 'epics', 'issues'] as const) {
    assert.equal(recordOwnerId(run([nav({ type: 'set-view', view })], start).selection), null, view);
  }
  const onEpic = run([nav({ type: 'open-epic', epicItemId: EPIC })], start);
  assert.equal(recordOwnerId(onEpic.selection), EPIC);
  assert.equal(currentItemId(onEpic.selection), null, 'currentItemId is as it was');
  const onStory = run([nav({ type: 'open-item', itemId: STORY })], onEpic);
  assert.equal(recordOwnerId(onStory.selection), STORY);
  assert.equal(currentItemId(onStory.selection), STORY);
  // Back to the epic's board, then to the list.
  const back = run([nav({ type: 'back' })], onStory);
  assert.equal(recordOwnerId(back.selection), EPIC);
  assert.equal(recordOwnerId(run([nav({ type: 'back' })], back).selection), null);
  // Another epic.
  assert.equal(recordOwnerId(run([nav({ type: 'open-epic', epicItemId: BARE })], start).selection), BARE);
});

test("board state: a story's screen and the list screens are built exactly as before", () => {
  const snap = epicSnapshot();
  const start = run([arrived(snap)]);
  // A story's screen: its details are what the builder gives, with its own records only, and no epicRecords key.
  const story = modelOf(run([nav({ type: 'open-epic', epicItemId: EPIC }), nav({ type: 'open-item', itemId: STORY })], start), snap);
  assert.equal(story.body.kind, 'story');
  const sb = story.body as Extract<ScreenModel['body'], { kind: 'story' }>;
  assert.deepEqual(sb.details, buildItemDetails(snap, STORY, { state: 'none' }, null, DISPLAY_LABELS));
  assert.deepEqual(sb.details.evidence.map(r => r.artifactId), ['LLD-aaaaaaaa-s1']);
  assert.ok(!('epicRecords' in sb));
  // The Epics and Issues lists carry no such key either.
  for (const view of ['epics', 'issues'] as const) {
    const m = modelOf(run([nav({ type: 'set-view', view })], start), snap);
    assert.equal(m.body.kind, view);
    assert.ok(!('epicRecords' in m.body), view);
  }
  // All work: the same sections and totals as the epic-free build, with the one new key set to null.
  const all = stagesOf(modelOf(start, snap));
  assert.equal(all.epic, null);
  assert.equal(all.epicRecords, null);
  assert.deepEqual(Object.keys(all).sort(), ['emptyPanel', 'epic', 'epicRecords', 'fold', 'kind', 'sections', 'showAll', 'totalsLabel']);
  // The epic's board apart from the new key: the same stories as before.
  const onEpic = stagesOf(modelOf(run([nav({ type: 'open-epic', epicItemId: EPIC })], start), snap));
  assert.deepEqual(onEpic.sections.flatMap(s => s.cards.map(c => c.itemId)).sort(), [STORY, `${EPIC}:S002`]);
});

// ---------------------------------------------------------------------------
// The details memory with an epic selected.
// ---------------------------------------------------------------------------

test('details memory: with an epic selected, one of its records opens in the review pane when it has a path and is read and kept otherwise; a record of another item is refused; no plan is read for an epic', async () => {
  const reads: { artifactId: string; resolve(r: DeliveryResult<DeliveryEvidenceRecord>): void }[] = [];
  const rerenders: string[] = [];
  const warns: string[] = [];
  const opened: { artifactId: string; mdPath: string }[] = [];
  const memory = createDetailsMemory({
    client: { evidence: (artifactId) => new Promise(resolve => { reads.push({ artifactId, resolve }); }) },
    log: { warn: m => warns.push(m), error: () => {} },
    labels: DISPLAY_LABELS,
    reviewPane: { openArtifact: t => { opened.push({ ...t }); } },
    rerender: what => rerenders.push(what),
  });
  const snap = epicSnapshot();
  memory.kept(snap, EPIC);
  assert.deepEqual(reads, [], 'no plan is read for an epic');

  // A record with a path that opens in review: handed to the review pane, not read by the board.
  memory.openEvidence(EPIC, 'HLD-aaaaaaaa');
  memory.openEvidence(EPIC, 'DEF-aaaaaaaa');
  assert.deepEqual(opened, [{ artifactId: 'HLD-aaaaaaaa', mdPath: HLD_PATH }, { artifactId: 'DEF-aaaaaaaa', mdPath: DEF_PATH }]);
  assert.deepEqual(reads, []);

  // A read-only record: read from the daemon and kept as the epic's opened record.
  memory.openEvidence(EPIC, 'AMD-aaaaaaaa-1');
  assert.deepEqual(reads.map(r => r.artifactId), ['AMD-aaaaaaaa-1']);
  assert.equal(memory.model(snap, EPIC)!.openedRecord, null, 'not yet');
  reads[0]!.resolve({ ok: true, value: { artifactId: 'AMD-aaaaaaaa-1', kind: 'AMD', meta: {}, body: {}, renderedMarkdown: '# Amendment 1' } });
  await flush();
  assert.deepEqual(memory.model(snap, EPIC)!.openedRecord, { artifactId: 'AMD-aaaaaaaa-1', text: '# Amendment 1' });
  assert.deepEqual(rerenders, ['record AMD-aaaaaaaa-1']);
  // It belongs to the epic: another item's details do not carry it.
  assert.equal(memory.model(snap, STORY)!.openedRecord, null);

  // Refused: a story's record while the epic is selected, a record nobody has, and the epic's
  // record named for another item.
  const before = { opened: opened.length, reads: reads.length };
  memory.openEvidence(EPIC, 'LLD-aaaaaaaa-s1');
  memory.openEvidence(EPIC, 'HLD-zzzzzzzz');
  memory.openEvidence(STORY, 'HLD-aaaaaaaa');
  memory.openEvidence(BARE, 'HLD-aaaaaaaa');
  assert.deepEqual({ opened: opened.length, reads: reads.length }, before);
  assert.equal(warns.length, 4);

  // A read-only record that cannot be read says why.
  memory.openEvidence(EPIC, 'SPEC-7777');
  reads.at(-1)!.resolve({ ok: false, failure: { kind: 'read-failed', message: 'unreadable' } });
  await flush();
  assert.deepEqual(memory.model(snap, EPIC)!.openedRecord, { artifactId: 'SPEC-7777', text: 'Could not read SPEC-7777: unreadable' });

  // The selection moves to a story: the epic's opened record is dropped, and the epic's records no longer open.
  memory.kept(snap, STORY);
  assert.equal(memory.model(snap, EPIC)!.openedRecord, null);
  memory.openEvidence(EPIC, 'HLD-aaaaaaaa');
  assert.equal(opened.length, before.opened, 'refused once the epic is not the selection');
  // Without a review pane a record with a path is read like any other.
  const plain: string[] = [];
  const noPane = createDetailsMemory({
    client: { evidence: (artifactId) => new Promise(() => { plain.push(artifactId); }) },
    log: { warn: () => {}, error: () => {} }, labels: DISPLAY_LABELS, rerender: () => {},
  });
  noPane.kept(snap, EPIC);
  noPane.openEvidence(EPIC, 'HLD-aaaaaaaa');
  assert.deepEqual(plain, ['HLD-aaaaaaaa']);
});

// ---------------------------------------------------------------------------
// The webview and the host.
// ---------------------------------------------------------------------------

interface FakeChannel extends ChatPanelChannel {
  readonly posted: Envelope<BoardDownMessage>[];
  send(raw: unknown): void;
}
function fakeChannel(): FakeChannel {
  let onMsg: ((m: unknown) => void) | undefined;
  const ch: FakeChannel = {
    posted: [],
    setHtml() {},
    postMessage(m) { ch.posted.push(m as Envelope<BoardDownMessage>); },
    onMessage(l) { onMsg = l; },
    onDidDispose() {},
    reveal() {},
    dispose() {},
    send(raw) { onMsg?.(raw); },
  };
  return ch;
}
/** A host over a fake channel and the real webview script over a fake DOM, with every daemon read answered by the test. */
async function liveBoard(snap: DeliverySnapshot) {
  const ch = fakeChannel();
  const snapshots: { resolve(r: DeliveryResult<DeliverySnapshot>): void }[] = [];
  const evidence: { artifactId: string; resolve(r: DeliveryResult<DeliveryEvidenceRecord>): void }[] = [];
  const opened: { artifactId: string; mdPath: string }[] = [];
  const host = createDeliveryBoardHost({
    createPanel: () => ch,
    client: {
      snapshot: () => new Promise(resolve => { snapshots.push({ resolve }); }),
      evidence: (artifactId) => new Promise(resolve => { evidence.push({ artifactId, resolve }); }),
    },
    logger: { warn: () => {}, error: () => {} },
    now: () => '2026-10-09T12:00:00.000Z',
    genNonce: () => 'N0NCE',
    reviewPane: { openArtifact: (t: { artifactId: string; mdPath: string }) => { opened.push({ artifactId: t.artifactId, mdPath: t.mdPath }); } },
  });
  host.open();
  snapshots[0]!.resolve({ ok: true, value: snap });
  await flush();
  const w = runScript();
  let delivered = 0;
  const pump = () => { for (; delivered < ch.posted.length; delivered++) w.deliver(ch.posted[delivered]); };
  pump();
  w.posted.length = 0;
  /** Send what the script posted since the last call to the host, then deliver the host's answers. */
  const relay = () => { for (const m of w.posted.splice(0)) ch.send(m); pump(); };
  const go = (payload: unknown) => { ch.send({ v: 1, payload }); pump(); };
  const lastBody = () => screensIn(ch.posted.map(e => e.payload)).at(-1)!.body;
  return { ch, w, evidence, opened, snapshots, relay, go, pump, lastBody, main: w.el['main']! };
}
const withClass = (root: FakeEl, cls: string): FakeEl[] => findAll(root, e => (e.attrs['class'] ?? '').split(' ').includes(cls));
const recordRows = (box: FakeEl): FakeEl[] => findAll(box, e => e.tag === 'tr' && e.attrs['data-artifact-id'] !== undefined);
const rowButton = (row: FakeEl): FakeEl => findAll(row, e => e.tag === 'button')[0]!;
const order = (root: FakeEl): string[] => findAll(root, e => ['epic-records', 'count-line', 'panel'].some(c => (e.attrs['class'] ?? '').split(' ').includes(c)) || e.tag === 'details')
  .map(e => (e.tag === 'details' ? 'stage' : (e.attrs['class'] ?? '').split(' ').find(c => ['epic-records', 'count-line', 'panel'].includes(c))!));

test("board webview: an epic's board shows its records table above the totals, also when no story matches; a row's button sends open-evidence with the epic's id; an opened read-only record is shown under the table; an epic with no records says so; record text is set as text", async () => {
  const b = await liveBoard(epicSnapshot());
  // All work: no records box.
  assert.equal(withClass(b.main, 'epic-records').length, 0);

  b.go({ type: 'open-epic', epicItemId: EPIC });
  const boxes = withClass(b.main, 'epic-records');
  assert.equal(boxes.length, 1, 'one records box on the epic\'s board');
  const box = boxes[0]!;
  // Above the totals line and the stages.
  const seen = order(b.main);
  assert.equal(seen[0], 'epic-records');
  assert.equal(seen[1], 'count-line');
  assert.ok(seen.indexOf('stage') > 1, 'the stage sections follow');
  // The table: a label, the four columns, one row per record with its state and its button.
  assert.ok(texts(box).includes('Records'));
  assert.deepEqual(findAll(box, e => e.tag === 'th').map(h => h.textContent), ['Record', 'Approval', 'Review', '']);
  const rows = recordRows(box);
  assert.deepEqual(rows.map(r => r.attrs['data-artifact-id']), ['AMD-aaaaaaaa-1', 'DEF-aaaaaaaa', 'HLD-aaaaaaaa', 'SPEC-7777']);
  assert.deepEqual(rows.map(r => rowButton(r).textContent), ['Open read-only', 'Open in review', 'Open in review', 'Open read-only']);
  assert.ok(texts(rows[1]!).includes(DISPLAY_LABELS.approval['approved']!));
  assert.ok(texts(rows[1]!).some(t => t.includes('2026-10-08 09:30 UTC')), 'when it was approved');
  assert.ok(texts(rows[0]!).includes(DISPLAY_LABELS.approval['pending']!));
  assert.equal(withClass(box, 'opened-record').length, 0, 'nothing opened yet');

  // A row's button sends open-evidence with the EPIC's id.
  b.w.posted.length = 0;
  rowButton(rows[2]!).listeners['click']!();
  assert.deepEqual((b.w.posted as Array<{ payload: unknown }>).map(m => m.payload), [{ type: 'open-evidence', itemId: EPIC, artifactId: 'HLD-aaaaaaaa' }]);
  b.relay();
  assert.deepEqual(b.opened, [{ artifactId: 'HLD-aaaaaaaa', mdPath: HLD_PATH }], 'and the host hands it to the review pane');

  // A read-only record: read by the host, then shown under the table.
  rowButton(recordRows(withClass(b.main, 'epic-records')[0]!)[0]!).listeners['click']!();
  b.relay();
  assert.deepEqual(b.evidence.map(e => e.artifactId), ['AMD-aaaaaaaa-1']);
  b.evidence[0]!.resolve({ ok: true, value: { artifactId: 'AMD-aaaaaaaa-1', kind: 'AMD', meta: {}, body: {}, renderedMarkdown: '# Amendment <b>one</b>' } });
  await flush();
  b.pump();
  const after = withClass(b.main, 'epic-records')[0]!;
  const pre = withClass(after, 'opened-record');
  assert.equal(pre.length, 1);
  assert.equal(pre[0]!.tag, 'pre');
  assert.equal(pre[0]!.textContent, '# Amendment <b>one</b>', 'the record\'s text, as text');
  assert.ok(texts(after).includes('Record AMD-aaaaaaaa-1'));
  const kids = after.children.map(c => (c.attrs['class'] ?? c.tag));
  assert.ok(kids.indexOf('table-wrap') < kids.findIndex(k => k.split(' ').includes('opened-record')), 'under the table');
  assert.equal(findAll(after, e => e.tag === 'b' && e.textContent === 'one').length, 0, 'no element was made from the text');

  // No story matches the search: the no-matches panel is shown and the records are still there, above it.
  b.go({ type: 'set-search', search: 'no such story' });
  const filtered = order(b.main);
  assert.equal(filtered[0], 'epic-records');
  assert.ok(filtered.includes('panel'), 'the no-matches panel');
  assert.ok(!filtered.includes('stage'));
  assert.equal(recordRows(withClass(b.main, 'epic-records')[0]!).length, 4);
  b.go({ type: 'clear-filters' });

  // An epic with no records says so.
  b.go({ type: 'back' });
  b.go({ type: 'open-epic', epicItemId: BARE });
  const bare = withClass(b.main, 'epic-records');
  assert.equal(bare.length, 1);
  assert.ok(texts(bare[0]!).includes('No records yet.'));
  assert.equal(recordRows(bare[0]!).length, 0);

  // A story's Workflow evidence tab is drawn as before: its own records, no epic box.
  b.go({ type: 'open-item', itemId: STORY });
  b.go({ type: 'set-item-tab', tab: 'evidence' });
  assert.equal(withClass(b.main, 'epic-records').length, 0);
  assert.deepEqual(recordRows(b.main).map(r => r.attrs['data-artifact-id']), ['LLD-aaaaaaaa-s1']);
});

test("board host: on an epic's board open-evidence for the epic's HLD opens the review pane with its path, and for an amendment reads it and re-renders the board with its text; moving to a story or back to a list clears the opened record", async () => {
  const b = await liveBoard(epicSnapshot());
  const records = () => { const body = b.lastBody(); return body.kind === 'stages' ? body.epicRecords : undefined; };

  // On All work nothing of the epic can be opened: there is no selection.
  b.go({ type: 'open-evidence', itemId: EPIC, artifactId: 'HLD-aaaaaaaa' });
  assert.deepEqual(b.opened, []);

  b.go({ type: 'open-epic', epicItemId: EPIC });
  assert.equal(records()!.openedRecord, null);
  // The HLD: to the review pane, with the snapshot's id and path; the board reads nothing.
  b.go({ type: 'open-evidence', itemId: EPIC, artifactId: 'HLD-aaaaaaaa' });
  assert.deepEqual(b.opened, [{ artifactId: 'HLD-aaaaaaaa', mdPath: HLD_PATH }]);
  assert.equal(b.evidence.length, 0);
  // A story's record is not the epic's: refused while the epic's board is on show.
  b.go({ type: 'open-evidence', itemId: EPIC, artifactId: 'LLD-aaaaaaaa-s1' });
  b.go({ type: 'open-evidence', itemId: STORY, artifactId: 'LLD-aaaaaaaa-s1' });
  assert.equal(b.opened.length, 1);

  // The amendment: read, and the board is re-rendered with its text.
  const screensBefore = screensIn(b.ch.posted.map(e => e.payload)).length;
  b.go({ type: 'open-evidence', itemId: EPIC, artifactId: 'AMD-aaaaaaaa-1' });
  assert.deepEqual(b.evidence.map(e => e.artifactId), ['AMD-aaaaaaaa-1']);
  b.evidence[0]!.resolve({ ok: true, value: { artifactId: 'AMD-aaaaaaaa-1', kind: 'AMD', meta: {}, body: {}, renderedMarkdown: '# Amendment 1' } });
  await flush();
  assert.ok(screensIn(b.ch.posted.map(e => e.payload)).length > screensBefore, 're-rendered');
  assert.deepEqual(records()!.openedRecord, { artifactId: 'AMD-aaaaaaaa-1', text: '# Amendment 1' });
  // Opening the HLD in the pane leaves the read-only record where it is.
  b.go({ type: 'open-evidence', itemId: EPIC, artifactId: 'HLD-aaaaaaaa' });
  assert.equal(b.opened.length, 2);
  // A filter change on the epic's board keeps it: the selection has not changed.
  b.go({ type: 'set-attention', on: true });
  assert.deepEqual(records()!.openedRecord, { artifactId: 'AMD-aaaaaaaa-1', text: '# Amendment 1' });
  b.go({ type: 'set-attention', on: false });

  // Moving to a story clears it; coming back shows the table with nothing opened.
  b.go({ type: 'open-item', itemId: STORY });
  assert.equal(b.lastBody().kind, 'story');
  b.go({ type: 'back' });
  assert.equal(records()!.openedRecord, null);
  // And back to a list: opened again on the epic, then cleared by leaving.
  b.go({ type: 'open-evidence', itemId: EPIC, artifactId: 'SPEC-7777' });
  b.evidence.at(-1)!.resolve({ ok: true, value: { artifactId: 'SPEC-7777', kind: 'SPEC', meta: {}, body: {}, renderedMarkdown: '# Spec' } });
  await flush();
  assert.deepEqual(records()!.openedRecord, { artifactId: 'SPEC-7777', text: '# Spec' });
  b.go({ type: 'back' });
  assert.equal(records(), null, 'a list screen carries no epic records');
  b.go({ type: 'open-epic', epicItemId: EPIC });
  assert.equal(records()!.openedRecord, null);

  // A read still in flight when the reader leaves is dropped.
  b.go({ type: 'open-evidence', itemId: EPIC, artifactId: 'AMD-aaaaaaaa-1' });
  const late = b.evidence.at(-1)!;
  b.go({ type: 'open-item', itemId: STORY });
  late.resolve({ ok: true, value: { artifactId: 'AMD-aaaaaaaa-1', kind: 'AMD', meta: {}, body: {}, renderedMarkdown: '# late' } });
  await flush();
  b.go({ type: 'back' });
  assert.equal(records()!.openedRecord, null);
});
