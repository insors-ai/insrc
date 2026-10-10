/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 / sc2, ISSUE-348d4663 — the board state: one coherent snapshot, the load statuses, a stale board on failure, and the trail of screens. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { boardDownMessages, currentEntry, initialBoardState, reduceBoardState, statusView, TRAIL_LIMIT, type BoardEvent, type BoardState, type NavIntent } from '../board-state.js';
import type { ScreenModel, StagesBody, StatusView } from '../board-protocol.js';
import type { DeliveryItem, DeliverySnapshot } from '../delivery-contract.js';
import type { DeliveryFailureKind } from '../delivery-client.js';
import { selectionPanel } from '../board-model.js';
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

/** The details memory stand-in: no item screen in these tests reads a PLAN. */
const noDetails = () => null;

function statusOf(state: BoardState): StatusView {
  const first = boardDownMessages(state, DISPLAY_LABELS, NOW, noDetails)[0]?.payload;
  assert.ok(first !== undefined && first.type === 'status', 'the status message comes first');
  return first.status;
}

/** The screen message's model, or null when none is posted. */
function screenModelOf(state: BoardState, detailsOf: Parameters<typeof boardDownMessages>[3] = noDetails): ScreenModel | null {
  const msgs = boardDownMessages(state, DISPLAY_LABELS, NOW, detailsOf).map(e => e.payload);
  const screens = msgs.filter(p => p.type === 'screen');
  assert.ok(screens.length <= 1, 'at most one screen message');
  const m = screens[0];
  return m === undefined || m.type !== 'screen' ? null : m.model;
}

/** The board screen's body, or null when no board screen is posted. */
function boardOf(state: BoardState): StagesBody | null {
  const body = screenModelOf(state)?.body;
  return body === undefined || body.kind !== 'stages' ? null : body;
}

/** Every card on the board screen, section by section. */
function boardCardIds(state: BoardState): readonly string[] | null {
  const model = boardOf(state);
  return model === null ? null : model.sections.flatMap(c => c.cards.map(k => k.itemId));
}

const nav = (intent: NavIntent): BoardEvent => ({ type: 'navigate', intent });

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
  assert.deepEqual(boardCardIds(done), ['b']);
  assert.equal(reduceBoardState(done, arrived(1, old)), done, 'a late answer after the newest one is dropped too');
});

test('empty, unavailable, failed and partial snapshots each give their own status, a partial snapshot still lists every item, and a snapshot with no items but unreadable records is partial, not empty', () => {
  const empty = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([]))]);
  assert.equal(statusOf(empty).state, 'empty');
  assert.equal(boardCardIds(empty), null, 'an empty workspace posts no screen; its panel replaces it');

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
  assert.deepEqual(boardCardIds(partial), ['a', 'b'], 'every readable item is on the board');
  const sections = boardOf(partial)?.sections ?? [];
  assert.deepEqual(sections.filter(c => c.total > 0).map(c => c.label), [DISPLAY_LABELS.stage.scoped, DISPLAY_LABELS.stage.complete]);
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
  assert.deepEqual(boardCardIds(loading), ['a'], 'the last board stays visible while loading');

  const down = reduceBoardState(loading, failed(2, 'timed-out', 'the delivery read took longer than 30 s', '2026-10-09T11:22:33.000Z'));
  const v = statusOf(down);
  assert.equal(v.state, 'failed');
  assert.equal(v.stale, true);
  assert.equal(v.takenAt, '2026-10-09T10:00:00.000Z', 'the shown board is the last good one');
  assert.match(v.message ?? '', /2026-10-09T11:22:33\.000Z/);
  assert.match(v.message ?? '', /took longer than 30 s/);
  assert.deepEqual(boardCardIds(down), ['a']);

  const neverLoaded = statusOf(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'read-failed', 'bad')]));
  assert.equal(neverLoaded.stale, false, 'nothing to be stale without a last snapshot');
});

/** A loaded board: two epics, stories, a standalone story and issues. */
function loadedBoard(): BoardState {
  return run([{ type: 'refresh-requested', seq: 1 }, arrived(1, trailSnapshot())]);
}

function trailSnapshot(extra: DeliveryItem[] = []): DeliverySnapshot {
  return snapshot([
    fixtureItem({ id: 'E20261009aaaaaaaa', kind: 'epic', title: 'Board epic' }),
    fixtureItem({ id: 'E20261009aaaaaaaa:S001', parentId: 'E20261009aaaaaaaa', title: 'Columns', stage: 'complete' }),
    fixtureItem({ id: 'E20261009aaaaaaaa:S002', parentId: 'E20261009aaaaaaaa', title: 'Cards', stage: 'scoped', needsAttention: true }),
    fixtureItem({ id: 'E20261009bbbbbbbb', kind: 'epic', title: 'Other epic' }),
    fixtureItem({ id: 'E20261009bbbbbbbb:S001', parentId: 'E20261009bbbbbbbb', title: 'Counts', stage: 'design-plan' }),
    fixtureItem({ id: 'H1234abcd5678ef00', kind: 'issue', title: 'Overflow', standalone: true, stage: 'design-plan',
      correctsRef: { resolvedItemId: 'E20261009aaaaaaaa:S001' } as never }),
    fixtureItem({ id: 'SA1', title: 'Loose', standalone: true, stage: 'scoped' }),
    ...extra,
  ]);
}

const EPIC = 'E20261009aaaaaaaa';
const STORY = 'E20261009aaaaaaaa:S001';
const ISSUE = 'H1234abcd5678ef00';
const screenKind = (s: BoardState) => currentEntry(s.selection).screen;

test('set-view from a story screen resets the trail to one root and keeps only the attention flag', () => {
  const deep = run([nav({ type: 'set-attention', on: true }), nav({ type: 'set-view', view: 'epics' }), nav({ type: 'open-epic', epicItemId: EPIC }),
    nav({ type: 'set-search', search: 'col' }), nav({ type: 'open-item', itemId: STORY })], loadedBoard());
  assert.equal(deep.selection.trail.length, 3);
  assert.deepEqual(screenKind(deep), { kind: 'item', itemId: STORY, tab: 'overview' });

  const reset = reduceBoardState(deep, nav({ type: 'set-view', view: 'standalone' }));
  assert.equal(reset.selection.trail.length, 1, 'one root entry: the story screen is gone');
  const root = reset.selection.trail[0]!;
  assert.deepEqual([root.screen, root.search, root.needsAttentionOnly, root.paging, root.openedId], [{ kind: 'list', view: 'standalone' }, '', true, {}, null]);
  assert.ok(root.id > Math.max(...deep.selection.trail.map(e => e.id)), 'a new entry id');
  assert.equal(reset.restored, false);

  assert.equal(reduceBoardState(reset, nav({ type: 'set-view', view: 'standalone' })), reset, 'the current single root again is a no-op');
  assert.notEqual(reduceBoardState(reset, nav({ type: 'set-view', view: 'all' })), reset);
});

test('open-epic and open-item push entries with new ids and record the opener, and the trail is capped at 20 keeping the root', () => {
  const start = run([nav({ type: 'set-view', view: 'epics' })], loadedBoard());
  const atEpic = reduceBoardState(start, nav({ type: 'open-epic', epicItemId: EPIC }));
  assert.deepEqual(atEpic.selection.trail.map(e => e.screen.kind), ['list', 'epic']);
  assert.equal(atEpic.selection.trail[0]!.openedId, EPIC, 'the Epics screen remembers the row it opened');
  assert.equal(reduceBoardState(atEpic, nav({ type: 'open-epic', epicItemId: EPIC })), atEpic, 'opening the current epic again is a no-op');

  const atStory = reduceBoardState(atEpic, nav({ type: 'open-item', itemId: STORY }));
  assert.equal(atStory.selection.trail[1]!.openedId, STORY);
  assert.equal(reduceBoardState(atStory, nav({ type: 'open-item', itemId: STORY })), atStory, 'opening the current item again is a no-op');
  const ids = atStory.selection.trail.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length);

  // Back then open again: the new entry never reuses a popped id.
  const again = run([nav({ type: 'back' }), nav({ type: 'open-item', itemId: STORY })], atStory);
  assert.ok(currentEntry(again.selection).id > currentEntry(atStory.selection).id);

  // Following links back and forth: the trail keeps the root and the newest entries.
  let s = atStory;
  for (let i = 0; i < 30; i++) s = reduceBoardState(s, nav({ type: 'open-item', itemId: i % 2 === 0 ? ISSUE : STORY }));
  assert.equal(s.selection.trail.length, TRAIL_LIMIT);
  assert.deepEqual(s.selection.trail[0]!.screen, { kind: 'list', view: 'epics' }, 'the root survives the cap');
  const capped = s.selection.trail.map(e => e.id);
  assert.deepEqual([...capped].sort((a, b) => a - b), capped, 'ids keep increasing');
});

test('back and go-to-crumb restore the earlier entry with its own search, attention and paging', () => {
  const s = run([
    nav({ type: 'set-view', view: 'all' }), nav({ type: 'set-search', search: 'o' }), nav({ type: 'show-more', stage: 'scoped' }),
    nav({ type: 'set-attention', on: true }), nav({ type: 'show-more', stage: 'complete' }),
    nav({ type: 'open-item', itemId: STORY }), nav({ type: 'set-item-tab', tab: 'evidence' }),
    nav({ type: 'open-item', itemId: ISSUE }),
  ], loadedBoard());
  const root = s.selection.trail[0]!;
  assert.deepEqual([root.search, root.needsAttentionOnly, root.paging, root.openedId], ['o', true, { complete: 100 }, STORY],
    'a filter change resets the entry\'s paging; later paging is kept');

  const back = reduceBoardState(s, nav({ type: 'back' }));
  assert.deepEqual(screenKind(back), { kind: 'item', itemId: STORY, tab: 'evidence' }, 'the story screen comes back on the tab the reader left');
  assert.equal(back.restored, true);
  const home = reduceBoardState(s, nav({ type: 'go-to-crumb', index: 0 }));
  assert.equal(home.selection.trail.length, 1);
  assert.deepEqual(currentEntry(home.selection), root, 'the root comes back exactly as it was left');
  assert.equal(home.restored, true);

  for (const bad of [-1, 2, 7, 0.5]) assert.equal(reduceBoardState(s, nav({ type: 'go-to-crumb', index: bad })), s, `index ${bad}`);
  const atRoot = loadedBoard();
  assert.equal(reduceBoardState(atRoot, nav({ type: 'back' })), atRoot, 'back on a root screen');
  assert.equal(reduceBoardState(atRoot, nav({ type: 'go-to-crumb', index: 0 })), atRoot, 'the current screen\'s own crumb');
  assert.equal(reduceBoardState(home, nav({ type: 'set-search', search: 'x' })).restored, false, 'a filter change is not a return');
});

test('filter intents are ignored on an item screen, and a refresh that removes the item truncates the trail with a notice', () => {
  const atStory = run([nav({ type: 'set-view', view: 'epics' }), nav({ type: 'open-epic', epicItemId: EPIC }), nav({ type: 'open-item', itemId: STORY })], loadedBoard());
  for (const intent of [{ type: 'set-search', search: 'x' }, { type: 'set-attention', on: true }, { type: 'clear-filters' }, { type: 'show-more', stage: 'scoped' }] as const) {
    assert.equal(reduceBoardState(atStory, nav(intent)), atStory, intent.type);
  }
  assert.equal(reduceBoardState(atStory, nav({ type: 'set-item-tab', tab: 'overview' })), atStory, 'the tab already shown');

  // The story goes away: the trail falls back to the epic's board.
  const noStory = trailSnapshot().items.filter(i => i.id !== STORY);
  const cut = run([{ type: 'refresh-requested', seq: 2 }, arrived(2, snapshot(noStory))], atStory);
  assert.deepEqual(cut.selection.trail.map(e => e.screen.kind), ['list', 'epic']);
  assert.equal(cut.selectionNotice, 'What you were viewing is no longer on the board.');
  assert.equal(cut.restored, true);

  // The epic goes too: back to Epics.
  const noEpic = noStory.filter(i => !i.id.startsWith(EPIC));
  const cut2 = run([{ type: 'refresh-requested', seq: 3 }, arrived(3, snapshot(noEpic))], atStory);
  assert.deepEqual(cut2.selection.trail.map(e => e.screen.kind), ['list']);

  // A refresh that keeps everything changes nothing in the trail and clears the notice.
  const kept = run([{ type: 'refresh-requested', seq: 2 }, arrived(2, trailSnapshot())], atStory);
  assert.deepEqual([kept.selection.trail, kept.selectionNotice], [atStory.selection.trail, null]);
  const failedRefresh = run([{ type: 'refresh-requested', seq: 2 }, failed(2, 'read-failed', 'x')], atStory);
  assert.deepEqual(failedRefresh.selection, atStory.selection, 'a failed refresh does not touch the trail');
  assert.deepEqual(reduceBoardState(atStory, { type: 'set-density', density: 'compact' }).selection.trail, atStory.selection.trail);
});

test('every screen message carries a breadcrumb that follows the trail and a back label naming where Back goes', () => {
  const crumbs = (s: BoardState) => screenModelOf(s, id => ({ itemId: id }) as never)!.crumbs.map(c => [c.label, c.index]);
  const back = (s: BoardState) => screenModelOf(s, id => ({ itemId: id }) as never)!.back?.label ?? null;

  const home = loadedBoard();
  const homeScreen = screenModelOf(home)!;
  assert.deepEqual(crumbs(home), [['Delivery', 0]]);
  assert.deepEqual([homeScreen.back, homeScreen.title, homeScreen.filters?.views, homeScreen.filters?.view, homeScreen.filters?.searchPlaceholder],
    [null, 'All work', true, 'all', 'Search titles, ids, epics']);
  assert.equal(homeScreen.body.kind, 'stages');

  const epics = run([nav({ type: 'set-view', view: 'epics' })], home);
  assert.deepEqual(crumbs(epics), [['Delivery', 0], ['Epics', 0]]);
  assert.equal(screenModelOf(epics)!.body.kind, 'epics');
  const epic = run([nav({ type: 'open-epic', epicItemId: EPIC })], epics);
  const epicScreen = screenModelOf(epic)!;
  assert.deepEqual(crumbs(epic), [['Delivery', 0], ['Epics', 0], ['Board epic', 1]]);
  assert.deepEqual([epicScreen.back?.label, epicScreen.title, epicScreen.filters?.views, epicScreen.filters?.searchPlaceholder], ['← Epics', 'Board epic', false, 'Search this epic']);
  assert.ok(epicScreen.body.kind === 'stages' && epicScreen.body.epic?.epicItemId === EPIC, 'the epic board carries the epic\'s own row');

  const story = run([nav({ type: 'open-item', itemId: STORY })], epic);
  const storyScreen = screenModelOf(story, id => ({ itemId: id }) as never)!;
  assert.deepEqual(crumbs(story), [['Delivery', 0], ['Epics', 0], ['Board epic', 1], ['S001', 2]]);
  assert.deepEqual([storyScreen.back?.label, storyScreen.title, storyScreen.filters, storyScreen.focusItemId], ['← Back to epic', 'Columns', null, null]);
  assert.ok(storyScreen.body.kind === 'story' && storyScreen.body.tab === 'overview' && storyScreen.body.epic?.epicItemId === EPIC);

  const issue = run([nav({ type: 'open-item', itemId: ISSUE })], story);
  assert.deepEqual(crumbs(issue).at(-1), ['1234ABCD', 3]);
  assert.equal(back(issue), '← Back to S001');
  const issueBody = screenModelOf(issue, id => ({ itemId: id }) as never)!.body;
  assert.ok(issueBody.kind === 'issue' && issueBody.entry.parent?.itemId === STORY);

  const returned = run([nav({ type: 'back' }), nav({ type: 'back' })], issue);
  const returnedScreen = screenModelOf(returned)!;
  assert.deepEqual([returnedScreen.restored, returnedScreen.focusItemId], [true, STORY], 'Back focuses the card that opened the story');

  const fromIssues = run([nav({ type: 'set-view', view: 'issues' }), nav({ type: 'set-attention', on: true }), nav({ type: 'open-item', itemId: ISSUE })], home);
  assert.deepEqual(crumbs(fromIssues), [['Delivery', 0], ['Issues', 0], ['Needs attention', 0], ['1234ABCD', 1]]);
  assert.equal(back(fromIssues), '← Issues');
  const standaloneStory = run([nav({ type: 'set-view', view: 'standalone' }), nav({ type: 'open-item', itemId: 'SA1' })], home);
  assert.equal(back(standaloneStory), '← Standalone');
  const loose = screenModelOf(standaloneStory, id => ({ itemId: id }) as never)!.body;
  assert.ok(loose.kind === 'story' && loose.epic === null, 'a standalone story has no epic');

  // Status first, then exactly one screen; status alone with no snapshot or an empty workspace.
  assert.deepEqual(boardDownMessages(home, DISPLAY_LABELS, NOW, noDetails).map(e => e.payload.type), ['status', 'screen']);
  assert.deepEqual(boardDownMessages(initialBoardState(), DISPLAY_LABELS, NOW, noDetails).map(e => e.payload.type), ['status']);
  const empty = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([]))]);
  assert.deepEqual(boardDownMessages(empty, DISPLAY_LABELS, NOW, noDetails).map(e => e.payload.type), ['status']);
  const first = boardDownMessages(home, DISPLAY_LABELS, NOW, noDetails)[0]!.payload;
  assert.ok(first.type === 'status' && first.status.freshnessLabel === 'Updated just now', 'the status is phrased against the clock it is given');
});

test('statusView places empty and snapshot-less failures in the body and stale failures and partial evidence in the banner', () => {
  const placement = (state: BoardState): string | undefined => statusView(state.status, NOW).panel?.placement;
  const loaded = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A')]))]);

  assert.equal(placement(run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([]))])), 'body', 'empty replaces the screen');
  assert.equal(placement(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'daemon-unavailable', 'down')])), 'body', 'unavailable with no snapshot');
  assert.equal(placement(run([{ type: 'refresh-requested', seq: 1 }, failed(1, 'read-failed', 'bad')])), 'body', 'a first refresh that failed');
  assert.equal(placement(run([{ type: 'refresh-requested', seq: 2 }, failed(2, 'timed-out', 'slow')], loaded)), 'banner', 'a failure over a stale board');
  assert.equal(placement(run([{ type: 'refresh-requested', seq: 2 }, failed(2, 'daemon-unavailable', 'down')], loaded)), 'banner', 'unavailable over a stale board');
  const partial = run([{ type: 'refresh-requested', seq: 1 }, arrived(1, snapshot([item('a', 'A')], { unreadableCount: 1 }))]);
  assert.equal(placement(partial), 'banner', 'partial evidence');
  assert.equal(selectionPanel('no-matches', DISPLAY_LABELS).placement, 'body');
  assert.equal(selectionPanel('no-issues', DISPLAY_LABELS).placement, 'body');
});
