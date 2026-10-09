/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s3 — the epic rollup and the issue view: grouping, completion counts, standalone work, parents, fix stories and agreement with the board. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBoardViewModel } from '../board-model.js';
import { INITIAL_SELECTION, type BoardSelection } from '../board-state.js';
import { buildEpicRollup, buildIssueView } from '../board-views.js';
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

const issues = (snap: ReturnType<typeof snapshot>, s: Partial<BoardSelection> = {}) => buildIssueView(snap, sel(s), DISPLAY_LABELS);
const unresolved = (id: string) => ({ code: 'unresolved-parent', message: `issue ${id} corrects 'gone-slug', which is not in the store`, itemIds: [id], artifactIds: [], fileNames: [], attention: true });

test('an issue links to the story it corrects, and an issue with an unresolved parent is listed with its notice', () => {
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'build-recorded', title: 'Columns' }),
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Columns overflow', correctsRef: { resolvedItemId: 'E1:S001' } as never }),
    item({ id: 'I2', kind: 'issue', standalone: true, stage: 'scoped', title: 'Lost parent', needsAttention: true,
      correctsRef: { slug: 'gone-slug', resolvedItemId: null } as never, notices: [unresolved('I2')] as never }),
    item({ id: 'I3', kind: 'issue', standalone: true, stage: 'scoped', title: 'Epic-level fix', correctsRef: { resolvedItemId: 'E1' } as never }),
    item({ id: 'I4', kind: 'issue', standalone: true, stage: 'scoped', title: 'Dangling', correctsRef: { resolvedItemId: 'E9:S001' } as never }),
    item({ id: 'I5', kind: 'issue', standalone: true, stage: 'scoped', title: 'No parent named' }),
  ]);
  const m = issues(snap, { selectedItemId: 'I1' });
  const by = (id: string) => m.issues.find(e => e.card.itemId === id)!;
  assert.deepEqual(m.issues.map(e => e.card.itemId), ['I1', 'I2', 'I3', 'I4', 'I5'], 'every issue is listed, in snapshot order');

  assert.deepEqual(by('I1').parent, { itemId: 'E1:S001', kind: 'story', title: 'Columns', stageLabel: 'Build recorded' });
  assert.equal(by('I1').parentNotice, null);
  assert.equal(by('I1').stageLabel, 'Design & plan');

  assert.equal(by('I2').parent, null, 'still listed, with no link');
  assert.equal(by('I2').parentNotice, "issue I2 corrects 'gone-slug', which is not in the store");

  assert.deepEqual(by('I3').parent, { itemId: 'E1', kind: 'epic', title: 'Board epic', stageLabel: null });
  assert.deepEqual([by('I4').parent, by('I4').parentNotice], [null, 'Parent not on the board'], 'a recorded parent missing from the snapshot');
  assert.deepEqual([by('I5').parent, by('I5').parentNotice], [null, null], 'an issue that names no parent');

  assert.deepEqual(m.totals, { issues: 5, needsAttention: 1 });
  assert.equal(m.selectedItemId, 'I1');
  assert.equal(m.emptySelection, false);
  assert.equal(issues(snap, { search: 'nothing like this' }).emptySelection, true);
});

test('an issue with two fix stories lists each as its own child with its own stage', () => {
  const snap = snapshot([
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'build-recorded', title: 'Search is slow', childIds: ['I1:S001', 'I1:S002', 'I1:T009', 'I1:S404'] }),
    item({ id: 'I1:S001', parentId: 'I1', stage: 'complete', title: 'Index the titles' }),
    item({ id: 'I1:S002', parentId: 'I1', stage: 'design-plan', title: 'Debounce the input' }),
    item({ id: 'I1:T009', kind: 'task', parentId: 'I1' }),
    item({ id: 'I2', kind: 'issue', standalone: true, stage: 'scoped', title: 'No fix yet' }),
  ]);
  const m = issues(snap, { search: 'slow' });
  assert.deepEqual(m.issues.map(e => e.card.itemId), ['I1'], 'the fix stories do not match the search themselves');
  assert.deepEqual(m.issues[0]!.fixStories, [
    { itemId: 'I1:S001', kind: 'story', title: 'Index the titles', stageLabel: 'Complete' },
    { itemId: 'I1:S002', kind: 'story', title: 'Debounce the input', stageLabel: 'Design & plan' },
  ], 'each fix story is its own entry with its own stage; tasks and missing ids are skipped');
  assert.deepEqual(issues(snap).issues.find(e => e.card.itemId === 'I2')!.fixStories, []);

  // A board with no issues at all is not an empty selection; a search that misses every issue is.
  const noIssues = snapshot([item({ id: 'S1' })]);
  assert.deepEqual([issues(noIssues).issues.length, issues(noIssues).emptySelection], [0, false]);
  assert.equal(issues(snap, { search: 'nothing like this' }).emptySelection, true);

  const board = buildBoardViewModel(snap, sel({ search: 'slow' }), {}, DISPLAY_LABELS);
  assert.equal(m.totals.issues, board.columns.flatMap(c => c.cards).filter(c => c.kind === 'issue').length, 'the board shows the same issue cards');
});

test('with a search and an epic scope, the rollup and issue view count the same matches as the board', () => {
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E2', kind: 'epic', title: 'Other epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete', title: 'Board columns' }),
    item({ id: 'E1:S002', parentId: 'E1', stage: 'scoped', title: 'Board cards', needsAttention: true }),
    item({ id: 'E1:S003', parentId: 'E1', stage: 'scoped', title: 'Paging' }),
    item({ id: 'E2:S001', parentId: 'E2', stage: 'scoped', title: 'Board counts' }),
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Board overflow', correctsRef: { resolvedItemId: 'E1:S001' } as never }),
    item({ id: 'I2', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Board elsewhere', correctsRef: { resolvedItemId: 'E2:S001' } as never }),
  ]);
  for (const s of [
    { search: 'board' },
    { scope: { kind: 'epic' as const, epicItemId: 'E1' } },
    { scope: { kind: 'epic' as const, epicItemId: 'E1' }, search: 'board' },
    { scope: { kind: 'epic' as const, epicItemId: 'E1' }, search: 'board', needsAttentionOnly: true },
  ]) {
    const board = buildBoardViewModel(snap, sel(s), {}, DISPLAY_LABELS);
    const cards = board.columns.flatMap(c => c.cards);
    const r = rollup(snap, s);
    const v = issues(snap, s);
    assert.equal(r.totals.items, board.totals.items, JSON.stringify(s));
    assert.equal(r.totals.needsAttention, board.totals.needsAttention, JSON.stringify(s));
    assert.deepEqual([...r.epics, r.notInEpic].flatMap(g => g.stages.flatMap(st => st.cards.map(c => c.itemId))).sort(), cards.map(c => c.itemId).sort());
    assert.deepEqual(v.issues.map(e => e.card.itemId), cards.filter(c => c.kind === 'issue').map(c => c.itemId), JSON.stringify(s));
  }
  // The scoped, searched selection: 'board' also matches E1's title, so all three E1 stories match, plus the
  // issue correcting one of them (which counts in 'Not in an epic', being standalone).
  const r = rollup(snap, { scope: { kind: 'epic', epicItemId: 'E1' }, search: 'board' });
  assert.deepEqual(r.epics.map(e => [e.epicItemId, e.completionLabel]), [['E1', '1 of 3 stories complete']]);
  assert.deepEqual(r.notInEpic.stages.flatMap(g => g.cards.map(c => c.itemId)), ['I1']);
  assert.deepEqual(issues(snap, { scope: { kind: 'epic', epicItemId: 'E1' }, search: 'board' }).issues.map(e => e.card.itemId), ['I1']);
});
