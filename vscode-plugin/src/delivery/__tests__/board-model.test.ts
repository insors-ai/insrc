/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s2 / sc5 — the board view model: columns, placement, scope, search, attention, counts, paging and determinism. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARD_PAGE_SIZE, buildBoardViewModel, showMore, unknownStages, type BoardPaging } from '../board-model.js';
import type { BoardViewModel } from '../board-protocol.js';
import { INITIAL_SELECTION, type BoardSelection } from '../board-state.js';
import { DISPLAY_LABELS, STAGE_ORDER } from '../labels.js';
import { item, snapshot } from './board-fixtures.js';

const build = (snap: ReturnType<typeof snapshot>, selection: Partial<BoardSelection> = {}, paging: BoardPaging = {}): BoardViewModel =>
  buildBoardViewModel(snap, { ...INITIAL_SELECTION, ...selection }, paging, DISPLAY_LABELS);

const cardIds = (m: BoardViewModel): string[][] => m.columns.map(c => c.cards.map(k => k.itemId));

/** Every column's counts agree with its cards, and the totals agree with the columns. */
function assertCountsAgree(m: BoardViewModel): void {
  for (const c of m.columns) {
    assert.equal(c.total, c.cards.length + c.hiddenCount, `${c.stage}: total = shown + hidden`);
  }
  assert.equal(m.totals.items, m.columns.reduce((n, c) => n + c.total, 0), 'totals.items sums the columns');
}

test('six columns in workflow order hold every story and issue exactly once, in the column the snapshot assigns', () => {
  const items = [
    item({ id: 'E1', kind: 'epic', title: 'Epic one' }),
    ...STAGE_ORDER.flatMap((stage, i) => [
      item({ id: `E1:S00${i}`, kind: 'story', parentId: 'E1', stage }),
      item({ id: `I00${i}`, kind: 'issue', stage }),
    ]),
    item({ id: 'E1:S000:T001', kind: 'task', parentId: 'E1:S000' }),
    item({ id: 'S-nostage', kind: 'story', stage: null }),
  ];
  const m = build(snapshot(items));
  assert.deepEqual(m.columns.map(c => c.label), ['Scoped', 'Design & plan', 'Ready · design approved', 'Ready · plan approved', 'Build recorded', 'Complete']);
  assert.deepEqual(m.columns.map(c => c.stage), [...STAGE_ORDER]);
  STAGE_ORDER.forEach((stage, i) => assert.deepEqual(cardIds(m)[i], [`E1:S00${i}`, `I00${i}`].sort(), stage));
  const all = cardIds(m).flat();
  assert.equal(new Set(all).size, all.length, 'no card appears twice');
  assert.equal(all.length, 12, 'epics, tasks and stage-less items are not cards');
  assertCountsAgree(m);
  assert.deepEqual(m.scopeOptions, [{ epicItemId: 'E1', title: 'Epic one' }]);
  assert.equal(m.emptySelection, false);
});

test('with an epic scope and a search, cards, hidden counts, column totals and totals agree, and clearing both restores the full set', () => {
  const items = [
    item({ id: 'EA', kind: 'epic', title: 'Alpha epic' }),
    item({ id: 'EB', kind: 'epic', title: null }),
    // 60 build-recorded stories under EA: 20 match "board", 40 do not.
    ...Array.from({ length: 60 }, (_, n) => item({
      id: `EA:S${String(n).padStart(3, '0')}`, parentId: 'EA', stage: 'build-recorded',
      title: n % 3 === 0 ? `Board story ${n}` : `Other story ${n}`, needsAttention: n % 2 === 0,
    })),
    item({ id: 'EB:S001', parentId: 'EB', title: 'Board in B', stage: 'scoped' }),
    item({ id: 'ISS1', kind: 'issue', title: 'Fix it', correctsRef: { resolvedItemId: 'EA:S001' }, stage: 'design-plan' }),
    item({ id: 'ISS2', kind: 'issue', title: 'Epic-level fix', correctsRef: { resolvedItemId: 'EB' }, stage: 'design-plan' }),
    item({ id: 'SA1', standalone: true, title: 'Loose board work', sourceIds: ['S007', 's7'], stage: 'complete' }),
  ];
  const snap = snapshot(items);
  const full = build(snap);
  assertCountsAgree(full);
  assert.equal(full.totals.items, 64);
  const br = full.columns.find(c => c.stage === 'build-recorded')!;
  assert.deepEqual([br.total, br.cards.length, br.hiddenCount], [60, BOARD_PAGE_SIZE, 10], 'counts include cards behind show-more');

  const scoped = build(snap, { scope: { kind: 'epic', epicItemId: 'EA' }, search: '  BOARD ' });
  assertCountsAgree(scoped);
  assert.equal(scoped.totals.items, 20, 'the trimmed, case-insensitive search matches only the 20 "Board" stories under EA');
  assert.ok(cardIds(scoped).flat().every(id => id.startsWith('EA:')));
  assert.equal(scoped.totals.needsAttention, scoped.columns.flatMap(c => c.cards).filter(c => c.needsAttention).length);

  // The issue joins its epic through the story it corrects; the epic title is searchable.
  assert.deepEqual(cardIds(build(snap, { scope: { kind: 'epic', epicItemId: 'EA' }, search: 'alpha' }))[1], ['ISS1']);
  assert.deepEqual(cardIds(build(snap, { scope: { kind: 'epic', epicItemId: 'EB' } })).flat(), ['EB:S001', 'ISS2']);
  assert.deepEqual(cardIds(build(snap, { scope: { kind: 'standalone' } })).flat(), ['SA1']);
  assert.deepEqual(cardIds(build(snap, { search: 's7' })).flat(), ['SA1'], 'source ids are searched');
  assert.deepEqual(cardIds(build(snap, { search: '(<b>' })).flat(), [], 'markup and regex characters are plain text');
  const attention = build(snap, { needsAttentionOnly: true });
  assert.equal(attention.totals.items, 30);
  assert.equal(attention.totals.needsAttention, 30);

  assert.equal(build(snap, { scope: { kind: 'epic', epicItemId: 'gone' } }).emptySelection, true, 'a missing epic matches nothing');
  assert.deepEqual(full.scopeOptions, [{ epicItemId: 'EA', title: 'Alpha epic' }, { epicItemId: 'EB', title: 'EB' }]);

  const cleared = build(snap, { scope: { kind: 'all' }, search: '' });
  assert.deepEqual(cleared, full, 'clearing scope and search restores the full set');

  const more = build(snap, {}, showMore({}, 'build-recorded'));
  const br2 = more.columns.find(c => c.stage === 'build-recorded')!;
  assert.deepEqual([br2.cards.length, br2.hiddenCount], [60, 0]);
  assert.deepEqual(showMore(showMore({}, 'complete'), 'complete'), { complete: 3 * BOARD_PAGE_SIZE });
});

test('the same snapshot and filters give an identical model, including items with equal timestamps', () => {
  const at = '2026-10-09T09:00:00.000Z';
  const items = ['S3', 'S1', 'S2', 'S5', 'S4'].map(id => item({ id, stage: 'ready-plan-approved', evidence: [{ approval: { state: 'approved', at } }] as never }));
  const a = snapshot(items);
  const b = snapshot([...items].reverse());
  const selection = { search: 's', needsAttentionOnly: false };
  assert.deepEqual(build(a, selection), build(b, selection));
  assert.deepEqual(build(a, selection), build(a, selection));
  assert.deepEqual(cardIds(build(a, selection))[3], ['S1', 'S2', 'S3', 'S4', 'S5'], 'snapshot (id) order, not arrival or time');
});

test('unknownStages counts every stage id outside the six, and those items are in no column', () => {
  const snap = snapshot([
    item({ id: 'A', stage: 'shipped' }),
    item({ id: 'B', kind: 'issue', stage: 'shipped' }),
    item({ id: 'C', stage: 'archived' }),
    item({ id: 'D', stage: 'complete' }),
    item({ id: 'E', kind: 'epic' }),
  ]);
  assert.deepEqual([...unknownStages(snap)], [['archived', 1], ['shipped', 2]]);
  const m = build(snap);
  assert.deepEqual(cardIds(m).flat(), ['D']);
  assert.equal(m.totals.items, 1);
  assertCountsAgree(m);
  assert.equal(unknownStages(snapshot([item({ id: 'X', stage: 'scoped' })])).size, 0);
});
