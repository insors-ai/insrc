/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s3 — the epic rollup and the issue view: grouping, completion counts, standalone work, parents, fix stories and agreement with the board. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBoardViewModel } from '../board-model.js';
import { INITIAL_SELECTION, type BoardSelection } from '../board-state.js';
import { buildEpicRollup } from '../board-views.js';
import { DISPLAY_LABELS } from '../labels.js';
import { item, snapshot } from './board-fixtures.js';

const sel = (s: Partial<BoardSelection> = {}): BoardSelection => ({ ...INITIAL_SELECTION, ...s });
const rollup = (snap: ReturnType<typeof snapshot>, s: Partial<BoardSelection> = {}) => buildEpicRollup(snap, sel(s), DISPLAY_LABELS);

/** Two epics: E1 with five stories (two complete) and an issue, E2 with one complete story. */
function epicsSnapshot() {
  return snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E2', kind: 'epic', title: 'Rollup epic' }),
    item({ id: 'E3', kind: 'epic', title: 'Empty epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete', title: 'Columns' }),
    item({ id: 'E1:S002', parentId: 'E1', stage: 'build-recorded', title: 'Cards' }),
    item({ id: 'E1:S003', parentId: 'E1', stage: 'complete', title: 'Filters' }),
    item({ id: 'E1:S004', parentId: 'E1', stage: 'scoped', title: 'Paging' }),
    item({ id: 'E1:S005', parentId: 'E1', stage: 'build-recorded', title: 'Badges' }),
    item({ id: 'E2:S001', parentId: 'E2', stage: 'complete', title: 'Counts' }),
  ]);
}

test('an epic with five stories, two complete, reads 2 of 5 stories complete and groups its stories by stage', () => {
  const m = rollup(epicsSnapshot(), { selectedItemId: 'E1:S002' });
  const e1 = m.epics.find(e => e.epicItemId === 'E1')!;
  assert.equal(e1.completionLabel, '2 of 5 stories complete');
  assert.deepEqual([e1.storiesComplete, e1.storiesTotal, e1.issueCount, e1.total], [2, 5, 0, 5]);
  assert.deepEqual(e1.stages.map(g => [g.label, g.cards.map(c => c.itemId)]), [
    ['Scoped', ['E1:S004']],
    ['Build recorded', ['E1:S002', 'E1:S005']],
    ['Complete', ['E1:S001', 'E1:S003']],
  ], 'non-empty stages only, in workflow order, cards in snapshot order');
  assert.equal(m.epics.find(e => e.epicItemId === 'E2')!.completionLabel, '1 of 1 story complete');
  assert.deepEqual(m.epics.map(e => [e.title, e.completionLabel]), [
    ['Board epic', '2 of 5 stories complete'], ['Rollup epic', '1 of 1 story complete'], ['Empty epic', '0 of 0 stories complete'],
  ], 'with nothing narrowing the selection every epic is listed, in snapshot order');
  assert.equal(m.selectedItemId, 'E1:S002');
  assert.equal(m.emptySelection, false);

  // A search lists only the epics with a match; the scoped epic is listed even with none.
  const searched = rollup(epicsSnapshot(), { search: 'count' });
  assert.deepEqual(searched.epics.map(e => e.epicItemId), ['E2']);
  const scopedNone = rollup(epicsSnapshot(), { scope: { kind: 'epic', epicItemId: 'E1' }, search: 'count' });
  assert.deepEqual(scopedNone.epics.map(e => [e.epicItemId, e.completionLabel]), [['E1', '0 of 0 stories complete']]);
  assert.equal(scopedNone.emptySelection, true, 'cards exist but none match');

  for (const s of [{}, { search: 'card' }, { scope: { kind: 'epic' as const, epicItemId: 'E1' } }, { needsAttentionOnly: true }]) {
    assert.equal(rollup(epicsSnapshot(), s).totals.items, buildBoardViewModel(epicsSnapshot(), sel(s), {}, DISPLAY_LABELS).totals.items);
  }
});

test('standalone stories and issues sit in their own group and count towards no epic', () => {
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete' }),
    item({ id: 'E1:S002', parentId: 'E1', stage: 'scoped' }),
    item({ id: 'SA1', standalone: true, stage: 'complete', title: 'Loose story' }),
    item({ id: 'IS1', kind: 'issue', standalone: true, stage: 'scoped', title: 'Loose issue' }),
    // A standalone issue that corrects a story in E1: the board's epic scope still finds it, the rollup does not count it.
    item({ id: 'IS2', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Fix columns', correctsRef: { resolvedItemId: 'E1:S001' } as never }),
    // A non-standalone issue correcting E1 counts in E1's issues.
    item({ id: 'IS3', kind: 'issue', standalone: false, stage: 'design-plan', correctsRef: { resolvedItemId: 'E1' } as never }),
  ]);
  const m = rollup(snap);
  const e1 = m.epics.find(e => e.epicItemId === 'E1')!;
  assert.deepEqual([e1.completionLabel, e1.issueCount, e1.total], ['1 of 2 stories complete', 1, 3]);
  assert.deepEqual(e1.stages.flatMap(g => g.cards.map(c => c.itemId)).sort(), ['E1:S001', 'E1:S002', 'IS3']);

  const own = m.notInEpic;
  assert.equal(own.epicItemId, null);
  assert.equal(own.title, 'Not in an epic');
  assert.deepEqual(own.stages.flatMap(g => g.cards.map(c => c.itemId)).sort(), ['IS1', 'IS2', 'SA1']);
  assert.deepEqual([own.completionLabel, own.issueCount], ['1 of 1 story complete', 2]);
  assert.equal(m.totals.items, e1.total + own.total, 'every match is in exactly one group');
  assert.equal(m.totals.items, buildBoardViewModel(snap, sel(), {}, DISPLAY_LABELS).totals.items);

  // Under the board's epic scope the standalone issue still matches (s2's epicOf), but it stays out of E1's counts.
  const scoped = rollup(snap, { scope: { kind: 'epic', epicItemId: 'E1' } });
  assert.deepEqual(scoped.notInEpic.stages.flatMap(g => g.cards.map(c => c.itemId)), ['IS2']);
  assert.equal(scoped.epics.find(e => e.epicItemId === 'E1')!.issueCount, 1);
  assert.equal(scoped.totals.items, buildBoardViewModel(snap, sel({ scope: { kind: 'epic', epicItemId: 'E1' } }), {}, DISPLAY_LABELS).totals.items);
});
