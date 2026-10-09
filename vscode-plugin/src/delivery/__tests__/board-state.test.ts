/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 / sc2 — the board state: one coherent snapshot, the load statuses, a stale board on failure, and the selection across refreshes. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { boardDownMessages, initialBoardState, INITIAL_SELECTION, reduceBoardState, statusView, type BoardEvent, type BoardState } from '../board-state.js';
import type { BoardDownMessage, StatusView } from '../board-protocol.js';
import type { DeliveryItem, DeliverySnapshot } from '../delivery-contract.js';
import type { DeliveryFailureKind } from '../delivery-client.js';
import { DISPLAY_LABELS } from '../labels.js';
import { item as fixtureItem, snapshot } from './board-fixtures.js';

/** The host clock the tests derive with: 30 s after the fixtures' takenAt. */
const NOW = '2026-10-09T10:00:30.000Z';

const item = (id: string, title: string, stage: string | null = 'scoped'): DeliveryItem => fixtureItem({ id, title, stage });

const arrived = (seq: number, s: DeliverySnapshot): BoardEvent => ({ type: 'snapshot-arrived', seq, result: { ok: true, value: s }, at: '2026-10-09T10:00:01.000Z' });
const failed = (seq: number, kind: DeliveryFailureKind, message: string, at = '2026-10-09T11:00:00.000Z'): BoardEvent =>
  ({ type: 'snapshot-arrived', seq, result: { ok: false, failure: { kind, message } }, at });

function run(events: readonly BoardEvent[], from: BoardState = initialBoardState()): BoardState {
  return events.reduce(reduceBoardState, from);
}

function statusOf(state: BoardState): StatusView {
  const first = boardDownMessages(state, DISPLAY_LABELS, {}, NOW)[0]?.payload;
  assert.ok(first !== undefined && first.type === 'status', 'the status message comes first');
  return first.status;
}

/** The board message's model, or null when no snapshot is shown. */
function boardOf(state: BoardState): Extract<BoardDownMessage, { type: 'board' }>['model'] | null {
  const m = boardDownMessages(state, DISPLAY_LABELS, {}, NOW).map(e => e.payload).find((p): p is Extract<BoardDownMessage, { type: 'board' }> => p.type === 'board');
  return m === undefined ? null : m.model;
}

/** Every card on the board, column by column. */
function itemsOf(state: BoardState): readonly string[] | null {
  const model = boardOf(state);
  return model === null ? null : model.columns.flatMap(c => c.cards.map(k => k.itemId));
}

test('an answer to a superseded refresh is dropped and nothing from it is applied', () => {
  const old = snapshot([item('a', 'Old')]);
  const fresh = snapshot([item('b', 'Fresh')]);
  const s = run([
    { type: 'refresh-requested', seq: 1 },
    { type: 'refresh-requested', seq: 2 },
    arrived(1, old),
  ]);
  assert.equal(s.status.state, 'loading', 'the seq-1 answer is not applied');
  assert.equal(s.status.state === 'loading' ? s.status.last : 'x', null);
  assert.equal(reduceBoardState(s, failed(1, 'read-failed', 'boom')), s, 'a superseded failure leaves state unchanged');

  const done = reduceBoardState(s, arrived(2, fresh));
  assert.equal(done.status.state, 'ready');
  assert.deepEqual(itemsOf(done), ['b']);
  assert.equal(reduceBoardState(done, arrived(1, old)), done, 'a late answer after the newest one is dropped too');
});

test('empty, unavailable, failed and partial snapshots each give their own status, a partial snapshot still lists every item, and a snapshot with no items but unreadable records is partial, not empty', () => {
  const empty = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([]))]);
  assert.equal(statusOf(empty).state, 'empty');
  assert.deepEqual(itemsOf(empty), []);

  assert.equal(statusOf(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'daemon-unavailable', 'daemon is not running')])).state, 'unavailable');
  assert.equal(statusOf(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'no-workspace', 'no folder')])).state, 'unavailable');
  assert.equal(statusOf(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'read-failed', 'bad store')])).state, 'failed');
  assert.equal(statusOf(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'timed-out', 'timed out')])).state, 'failed');

  const notice = { code: 'store-incomplete', message: 'The plans folder is missing.', itemIds: [], artifactIds: [], fileNames: [] } as unknown as DeliverySnapshot['notices'][number];
  const partial = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A'), item('b', 'B', 'complete')], { unreadableCount: 2, notices: [notice] }))]);
  const pv = statusOf(partial);
  assert.equal(pv.state, 'ready');
  assert.match(pv.partialNotice ?? '', /2 records could not be read/);
  assert.match(pv.partialNotice ?? '', /The plans folder is missing\./);
  assert.deepEqual(itemsOf(partial), ['a', 'b'], 'every readable item is on the board');
  const columns = boardOf(partial)?.columns ?? [];
  assert.deepEqual(columns.filter(c => c.total > 0).map(c => c.label), [DISPLAY_LABELS.stage.scoped, DISPLAY_LABELS.stage.complete]);
  // s1's assertion that an unlabelled stage shows its raw id is retired: s2 leaves such an item off the board
  // and logs it once per refresh (board-host.test.ts).

  const unreadableOnly = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([], { unreadableCount: 1 }))]);
  assert.equal(statusOf(unreadableOnly).state, 'ready', 'not empty: a record failed to load');
  assert.match(statusOf(unreadableOnly).partialNotice ?? '', /1 record could not be read/);
});

test('a failed refresh keeps the last snapshot as stale with the failure and its time', () => {
  const good = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A')]))]);
  const loading = reduceBoardState(good, { type: 'refresh-requested', seq: 2 });
  assert.equal(statusOf(loading).state, 'loading');
  assert.deepEqual(itemsOf(loading), ['a'], 'the last board stays visible while loading');

  const down = reduceBoardState(loading, failed(2, 'timed-out', 'the delivery read took longer than 30 s', '2026-10-09T11:22:33.000Z'));
  const v = statusOf(down);
  assert.equal(v.state, 'failed');
  assert.equal(v.stale, true);
  assert.equal(v.takenAt, '2026-10-09T10:00:00.000Z', 'the shown board is the last good one');
  assert.match(v.message ?? '', /2026-10-09T11:22:33\.000Z/);
  assert.match(v.message ?? '', /took longer than 30 s/);
  assert.deepEqual(itemsOf(down), ['a']);

  const neverLoaded = statusOf(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'read-failed', 'bad')]));
  assert.equal(neverLoaded.stale, false, 'nothing to be stale without a last snapshot');
});

test('a refresh keeps the selection, and clears a selected item that is gone with a notice', () => {
  const selection = { ...INITIAL_SELECTION, view: 'issues' as const, search: 'auth', needsAttentionOnly: true, selectedItemId: 'a', density: 'compact' as const };
  const s = run([
    { type: 'refresh-requested', seq: 1 },
    arrived(1, snapshot([item('a', 'A'), item('b', 'B')])),
    { type: 'selection-changed', selection },
  ]);
  assert.deepEqual(s.selection, selection, 'selection-changed changes only the selection');

  const kept = run([{ type: 'refresh-requested', seq: 2 }, arrived(2, snapshot([item('a', 'A2')]))], s);
  assert.deepEqual(kept.selection, selection);
  assert.equal(kept.selectionNotice, null);

  const gone = run([{ type: 'refresh-requested', seq: 3 }, arrived(3, snapshot([item('b', 'B')]))], kept);
  assert.deepEqual(gone.selection, { ...selection, selectedItemId: null });
  assert.match(gone.selectionNotice ?? '', /no longer in the board/);

  const failedRefresh = run([{ type: 'refresh-requested', seq: 4 }, failed(4, 'read-failed', 'x')], kept);
  assert.deepEqual(failedRefresh.selection, selection, 'a failed refresh does not touch the selection');
});

test('statusView panel kinds \u2014 empty, unavailable, refresh-failed (stale with a shown snapshot, retry action), partial with affected entries from store notices and the unreadable count; freshnessLabel phrasing and NaN fallback', () => {
  const at = (state: BoardState, now = NOW) => statusView(state.status, now);
  const loaded = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A')]))]);

  // Freshness: phrased against the host clock; the fixtures' takenAt is 10:00:00.
  assert.equal(at(initialBoardState()).freshnessLabel, null, 'no snapshot shown, no freshness line');
  assert.equal(at(loaded, '2026-10-09T10:00:59.000Z').freshnessLabel, 'Updated just now');
  assert.equal(at(loaded, '2026-10-09T10:01:00.000Z').freshnessLabel, 'Updated 1 minute ago');
  assert.equal(at(loaded, '2026-10-09T10:59:00.000Z').freshnessLabel, 'Updated 59 minutes ago');
  assert.equal(at(loaded, '2026-10-09T12:00:00.000Z').freshnessLabel, 'Updated 2026-10-09 10:00 UTC');
  assert.equal(at(loaded, 'not a time').freshnessLabel, 'Updated 2026-10-09T10:00:00.000Z', 'an unparseable clock shows the raw takenAt');
  const oddTaken = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A')], { takenAt: 'sometime' }))]);
  assert.equal(at(oddTaken).freshnessLabel, 'Updated sometime', 'an unparseable takenAt is shown as recorded, with no throw');

  // Panels.
  assert.equal(at(loaded).panel, null, 'a complete snapshot needs no panel');
  const empty = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([]))]);
  assert.deepEqual(at(empty).panel, {
    kind: 'empty', title: 'No work items yet', text: 'The workspace was read successfully. No epic, story or issue records were found.',
    action: null, stale: false, affected: [],
  });

  const down = at(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'daemon-unavailable', 'daemon is not running')])).panel!;
  assert.deepEqual([down.kind, down.title, down.text, down.action, down.stale], ['unavailable', 'The delivery board is unavailable', 'daemon is not running', 'retry', false]);
  const firstFail = at(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'read-failed', 'bad store')])).panel!;
  assert.deepEqual([firstFail.kind, firstFail.title, firstFail.stale], ['refresh-failed', 'The refresh failed', false], 'no board to fall back on');
  const staleFail = at(run([{ type: 'refresh-requested', seq: 2 }, failed(2, 'timed-out', 'took too long')], loaded)).panel!;
  assert.deepEqual([staleFail.kind, staleFail.title, staleFail.action, staleFail.stale], ['refresh-failed', 'Showing the last successful snapshot', 'retry', true]);
  assert.equal(staleFail.text, 'The refresh failed: took too long. Your board and selection are preserved.');

  const notice = { code: 'store-incomplete', message: 'PLAN-x could not be parsed.', itemIds: [], artifactIds: ['PLAN-x'], fileNames: [] } as unknown as DeliverySnapshot['notices'][number];
  const partial = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A')], { unreadableCount: 2, notices: [notice] }))]);
  assert.deepEqual(at(partial).panel, {
    kind: 'partial', title: 'Some evidence could not be read', text: 'Every readable item is shown; counts may not cover every record.',
    action: null, stale: false,
    affected: [{ artifactIds: [], text: '2 records could not be read.' }, { artifactIds: ['PLAN-x'], text: 'PLAN-x could not be parsed.' }],
  });
});

test('boardDownMessages with now keeps status first and the selected view\'s model second', () => {
  const loaded = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A')]))]);
  for (const view of ['board', 'epics', 'issues'] as const) {
    const msgs = boardDownMessages({ ...loaded, selection: { ...loaded.selection, view } }, DISPLAY_LABELS, {}, NOW).map(e => e.payload.type);
    assert.deepEqual(msgs, ['status', view]);
  }
  const first = boardDownMessages(loaded, DISPLAY_LABELS, {}, NOW)[0]!.payload;
  assert.ok(first.type === 'status');
  assert.equal(first.status.freshnessLabel, 'Updated just now', 'the status is phrased against the clock it is given');
  assert.deepEqual(boardDownMessages(initialBoardState(), DISPLAY_LABELS, {}, NOW).map(e => e.payload.type), ['status'], 'no snapshot, status only');
});
