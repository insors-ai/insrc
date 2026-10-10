/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E2 s3, ISSUE-348d4663 — the Epics and Issues screens' bodies: one row per epic over its whole scope, the epic
 * membership rule, completion counts, issues in stage order with their parents and fix stories, and agreement with the
 * board screens.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBoardViewModel, type MatchFilter } from '../board-model.js';
import type { StagesBody } from '../board-protocol.js';
import { attentionLabel, buildEpicRollup, buildIssueView, epicRowOf, issueEntries } from '../board-views.js';
import { DISPLAY_LABELS, STAGE_ORDER } from '../labels.js';
import { item, snapshot } from './board-fixtures.js';

type Snap = ReturnType<typeof snapshot>;
const ALL: MatchFilter = { scope: { kind: 'all' }, search: '', needsAttentionOnly: false };
const filter = (f: Partial<MatchFilter> = {}): MatchFilter => ({ ...ALL, ...f });
const rollup = (snap: Snap, f: { search?: string; needsAttentionOnly?: boolean } = {}) =>
  buildEpicRollup(snap, { search: f.search ?? '', needsAttentionOnly: f.needsAttentionOnly ?? false }, DISPLAY_LABELS);
const issues = (snap: Snap, f: Partial<MatchFilter> = {}) => buildIssueView(snap, filter(f), DISPLAY_LABELS);
const board = (snap: Snap, f: Partial<MatchFilter> = {}): StagesBody => buildBoardViewModel(snap, filter(f), {}, DISPLAY_LABELS);
const cardsOf = (m: StagesBody) => m.sections.flatMap(sec => sec.cards);
const epicOf = (snap: Snap, id: string) => snap.items.find(i => i.id === id)!;

/** Three epics: E1 with five stories (two complete), E2 with one complete story, E3 empty. */
function epicsSnapshot(): Snap {
  return snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E2', kind: 'epic', title: 'Rollup epic' }),
    item({ id: 'E3', kind: 'epic', title: 'Empty epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete', title: 'Columns' }),
    item({ id: 'E1:S002', parentId: 'E1', stage: 'build-recorded', title: 'Cards', needsAttention: true }),
    item({ id: 'E1:S003', parentId: 'E1', stage: 'complete', title: 'Filters' }),
    item({ id: 'E1:S004', parentId: 'E1', stage: 'scoped', title: 'Paging' }),
    item({ id: 'E1:S005', parentId: 'E1', stage: 'build-recorded', title: 'Badges' }),
    item({ id: 'E2:S001', parentId: 'E2', stage: 'complete', title: 'Counts' }),
  ]);
}

test('an epic with five stories, two complete, reads 2 of 5 stories complete, and every epic is a row in snapshot order', () => {
  const m = rollup(epicsSnapshot());
  assert.equal(m.kind, 'epics');
  assert.deepEqual(m.rows.map(e => [e.title, e.completionLabel]), [
    ['Board epic', '2 of 5 stories complete'], ['Rollup epic', '1 of 1 story complete'], ['Empty epic', '0 of 0 stories complete'],
  ]);
  const e1 = m.rows[0]!;
  assert.deepEqual([e1.storiesComplete, e1.storiesTotal, e1.issueCount, e1.total, e1.attentionCount], [2, 5, 0, 5, 1]);
  assert.equal(m.totalsLabel, '3 epics · completion counts stories at Complete');
  assert.equal(m.emptyPanel, null);
});

test('a standalone issue correcting a story of an epic counts towards no epic, and the epic\'s Epics row equals its board header', () => {
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete' }),
    item({ id: 'E1:S002', parentId: 'E1', stage: 'scoped', needsAttention: true }),
    item({ id: 'SA1', standalone: true, stage: 'complete', title: 'Loose story' }),
    // Standalone, and corrects a story in E1: on Standalone and Issues, never on E1's board or in E1's row.
    item({ id: 'IS2', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Fix columns', correctsRef: { resolvedItemId: 'E1:S001' } as never, needsAttention: true }),
    // Not standalone, corrects E1: part of E1.
    item({ id: 'IS3', kind: 'issue', standalone: false, stage: 'design-plan', correctsRef: { resolvedItemId: 'E1' } as never }),
  ]);
  const row = rollup(snap).rows.find(r => r.epicItemId === 'E1')!;
  assert.deepEqual([row.completionLabel, row.issueCount, row.total, row.attentionCount], ['1 of 2 stories complete', 1, 3, 1]);

  const e1Board = board(snap, { scope: { kind: 'epic', epicItemId: 'E1' } });
  assert.deepEqual(cardsOf(e1Board).map(c => c.itemId).sort(), ['E1:S001', 'E1:S002', 'IS3'], 'IS2 is not on E1\'s board');
  assert.deepEqual(epicRowOf(snap, epicOf(snap, 'E1'), DISPLAY_LABELS), row, 'the header and the row are the same numbers');
  assert.equal(row.total, cardsOf(e1Board).length);

  assert.deepEqual(cardsOf(board(snap, { scope: { kind: 'standalone' } })).map(c => c.itemId).sort(), ['IS2', 'SA1']);
  assert.deepEqual(issueEntries(issues(snap)).map(e => e.card.itemId).sort(), ['IS2', 'IS3']);
});

test('the Epics body filters rows by epic title or id and by attention, with whole-epic counts, and a search matching no epic gives the no-matches panel', () => {
  const snap = epicsSnapshot();
  // A search matches epic titles and ids, not the stories inside; the counts stay whole.
  const byTitle = rollup(snap, { search: '  ROLLUP ' });
  assert.deepEqual(byTitle.rows.map(r => [r.epicItemId, r.total]), [['E2', 1]]);
  assert.equal(byTitle.totalsLabel, '1 epic · completion counts stories at Complete');
  assert.deepEqual(rollup(snap, { search: 'e3' }).rows.map(r => r.epicItemId), ['E3'], 'ids are searched');
  assert.deepEqual(rollup(snap, { search: 'paging' }).rows, [], 'a story title alone does not list its epic');

  const attention = rollup(snap, { needsAttentionOnly: true });
  assert.deepEqual(attention.rows.map(r => [r.epicItemId, r.total, r.attentionCount]), [['E1', 5, 1]], 'only epics with something needing attention, counted whole');

  const none = rollup(snap, { search: 'nothing like this' });
  assert.deepEqual(none.emptyPanel, { kind: 'no-matches', title: DISPLAY_LABELS.noMatchesTitle, text: DISPLAY_LABELS.noMatchesText, action: 'clear-filters', stale: false, affected: [], placement: 'body' });
  assert.equal(rollup(snapshot([item({ id: 'S1', standalone: true })])).emptyPanel, null, 'no epics at all is not a failed search');
});

test('epic rows count the planned tasks of the epic\'s stories and an issue\'s count separately', () => {
  const planned = (n: number, unplanned = 0) => [
    ...Array.from({ length: n }, (_, i) => ({ taskItemId: `t${i}`, result: 'unrecorded', planned: true })),
    ...Array.from({ length: unplanned }, (_, i) => ({ taskItemId: `u${i}`, result: 'passed', planned: false })),
  ] as never;
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E2', kind: 'epic', title: 'Quiet epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete', tasks: planned(3, 1) }),
    item({ id: 'E1:S002', parentId: 'E1', stage: 'design-plan', tasks: planned(2), needsAttention: true }),
    item({ id: 'I1', kind: 'issue', correctsRef: { resolvedItemId: 'E1' } as never, stage: 'scoped', tasks: planned(4), needsAttention: true }),
    item({ id: 'SA1', standalone: true, stage: 'scoped', tasks: planned(1) }),
  ]);
  const [e1, e2] = rollup(snap).rows;
  assert.deepEqual(
    [e1!.storiesTotal, e1!.storiesComplete, e1!.taskCount, e1!.issueCount, e1!.total, e1!.attentionCount],
    [2, 1, 5, 1, 3, 2],
    'tasks count the planned tasks of the stories only (3 + 2), not unplanned tasks or an issue\'s tasks');
  assert.deepEqual([e2!.total, e2!.taskCount, e2!.attentionLabel], [0, 0, 'No open gates']);
});

test('attentionLabel is \'No open gates\' at 0, \'1 needs attention\' at 1, \'N need attention\' otherwise', () => {
  assert.equal(attentionLabel(0), 'No open gates');
  assert.equal(attentionLabel(1), '1 needs attention');
  assert.equal(attentionLabel(3), '3 need attention');
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic' }),
    item({ id: 'E1:S001', parentId: 'E1', needsAttention: true }),
    item({ id: 'E1:S002', parentId: 'E1', needsAttention: true }),
    item({ id: 'E2', kind: 'epic' }),
    item({ id: 'E2:S001', parentId: 'E2', needsAttention: true }),
    item({ id: 'E3', kind: 'epic' }),
  ]);
  assert.deepEqual(rollup(snap).rows.map(r => [r.attentionLabel, r.attentionTone]), [
    ['2 need attention', 'warning'], ['1 needs attention', 'warning'], ['No open gates', 'success'],
  ]);
});

test('an epic row\'s compactId is the epic\'s compact id', () => {
  const snap = snapshot([
    item({ id: 'E20261009abcdef01', kind: 'epic', title: 'Canonical epic' }),
    item({ id: 'Hfedcba9876543210', kind: 'epic', title: 'Fallback epic' }),
  ]);
  assert.deepEqual(rollup(snap).rows.map(r => [r.epicItemId, r.compactId]), [
    ['E20261009abcdef01', 'ABCDEF01'], ['Hfedcba9876543210', 'FEDCBA98'],
  ]);
});

const unresolved = (id: string) => ({ code: 'unresolved-parent', message: `issue ${id} corrects 'gone-slug', which is not in the store`, itemIds: [id], artifactIds: [], fileNames: [], attention: true });

test('the Issues body lists issues in stage order with their parent, parent notice and fix stories', () => {
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'build-recorded', title: 'Columns' }),
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Columns overflow', correctsRef: { resolvedItemId: 'E1:S001' } as never,
      childIds: ['I1:S001', 'I1:S002', 'I1:T009', 'I1:S404'] }),
    item({ id: 'I1:S001', parentId: 'I1', stage: 'complete', title: 'Index the titles' }),
    item({ id: 'I1:S002', parentId: 'I1', stage: 'design-plan', title: 'Debounce the input' }),
    item({ id: 'I1:T009', kind: 'task', parentId: 'I1' }),
    item({ id: 'I2', kind: 'issue', standalone: true, stage: 'scoped', title: 'Lost parent', needsAttention: true,
      correctsRef: { slug: 'gone-slug', resolvedItemId: null } as never, notices: [unresolved('I2')] as never }),
    item({ id: 'I3', kind: 'issue', standalone: true, stage: 'complete', title: 'Epic-level fix', correctsRef: { resolvedItemId: 'E1' } as never }),
    item({ id: 'I4', kind: 'issue', standalone: true, stage: 'scoped', title: 'Dangling', correctsRef: { resolvedItemId: 'E9:S001' } as never }),
    item({ id: 'I5', kind: 'issue', standalone: true, stage: 'design-plan', title: 'No parent named' }),
  ]);
  const m = issues(snap);
  assert.equal(m.kind, 'issues');
  assert.deepEqual(issueEntries(m).map(e => e.card.itemId), ['I2', 'I4', 'I1', 'I5', 'I3'], 'stage order, then snapshot order within a stage');
  const by = (id: string) => issueEntries(m).find(e => e.card.itemId === id)!;

  assert.deepEqual(by('I1').parent, { itemId: 'E1:S001', kind: 'story', title: 'Columns', stageLabel: 'Build recorded' });
  assert.deepEqual([by('I1').parentNotice, by('I1').stageLabel], [null, 'Design & plan']);
  assert.deepEqual(by('I1').fixStories, [
    { itemId: 'I1:S001', kind: 'story', title: 'Index the titles', stageLabel: 'Complete' },
    { itemId: 'I1:S002', kind: 'story', title: 'Debounce the input', stageLabel: 'Design & plan' },
  ], 'each fix story with its own stage; tasks and missing ids are skipped');
  assert.deepEqual([by('I2').parent, by('I2').parentNotice], [null, "issue I2 corrects 'gone-slug', which is not in the store"], 'still listed, with its notice');
  assert.deepEqual(by('I3').parent, { itemId: 'E1', kind: 'epic', title: 'Board epic', stageLabel: null });
  assert.deepEqual([by('I4').parent, by('I4').parentNotice], [null, 'Parent not on the board']);
  assert.deepEqual([by('I5').parent, by('I5').parentNotice, by('I5').fixStories], [null, null, []]);

  assert.equal(m.totalsLabel, '5 issues · 1 needs attention');
  assert.equal(issues(snap, { needsAttentionOnly: true }).totalsLabel, '1 of 5 issues needs attention');
  assert.deepEqual(issueEntries(issues(snap, { search: 'columns' })).map(e => e.card.itemId), ['I1'], 'the fix stories do not match the search themselves');
  assert.equal(m.emptyPanel, null);
  assert.equal(issues(snap, { search: 'nothing like this' }).emptyPanel?.kind, 'no-matches');
  assert.deepEqual(issues(snapshot([item({ id: 'S1' })])).emptyPanel,
    { kind: 'no-issues', title: DISPLAY_LABELS.noIssuesTitle, text: DISPLAY_LABELS.noIssuesText, action: null, stale: false, affected: [], placement: 'body' },
    'a board with no issues says so, with no Clear filters');
});

test('with a search and a scope, the Issues list holds the same issues as the board screen', () => {
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Board epic' }),
    item({ id: 'E1:S001', parentId: 'E1', stage: 'complete', title: 'Board columns' }),
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Board overflow', correctsRef: { resolvedItemId: 'E1:S001' } as never }),
    item({ id: 'I2', kind: 'issue', stage: 'design-plan', title: 'Board elsewhere', correctsRef: { resolvedItemId: 'E1:S001' } as never, needsAttention: true }),
  ]);
  for (const f of [{}, { search: 'board' }, { scope: { kind: 'epic' as const, epicItemId: 'E1' } }, { needsAttentionOnly: true }, { scope: { kind: 'standalone' as const } }]) {
    const fromBoard = cardsOf(board(snap, f)).filter(c => c.kind === 'issue').map(c => c.itemId).sort();
    assert.deepEqual(issueEntries(issues(snap, f)).map(e => e.card.itemId).sort(), fromBoard, JSON.stringify(f));
  }
});

test('the Issues body groups issues into stage sections with the board screens\' defaults and fold', () => {
  const snap = snapshot([
    item({ id: 'S1', stage: 'design-plan', title: 'A story' }),
    item({ id: 'I1', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Planned fix' }),
    item({ id: 'I2', kind: 'issue', standalone: true, stage: 'scoped', title: 'New defect', needsAttention: true }),
    item({ id: 'I3', kind: 'issue', standalone: true, stage: 'complete', title: 'Done fix', needsAttention: true }),
    item({ id: 'I4', kind: 'issue', standalone: true, stage: 'design-plan', title: 'Second planned fix' }),
  ]);
  const m = issues(snap);
  assert.deepEqual(m.sections.map(sec => sec.stage), [...STAGE_ORDER], 'six sections in stage order');
  for (const sec of m.sections) for (const e of sec.issues) assert.equal(snap.items.find(i => i.id === e.card.itemId)?.stage?.stage, sec.stage, 'each issue sits in its own stage');
  assert.deepEqual(issueEntries(m).map(e => e.card.itemId).sort(), ['I1', 'I2', 'I3', 'I4'], 'every issue exactly once; stories are not issues');
  const design = m.sections.find(sec => sec.stage === 'design-plan')!;
  assert.deepEqual(design.issues.map(e => e.card.itemId), ['I1', 'I4'], 'snapshot order within a stage');

  // The same defaults, hints and fold as the board screen holding the same issues.
  const onlyIssues = snapshot(snap.items.filter(i => i.kind === 'issue'));
  for (const attention of [false, true]) {
    const b = board(onlyIssues, { needsAttentionOnly: attention });
    const im = issues(snap, { needsAttentionOnly: attention });
    assert.deepEqual(im.sections.map(sec => [sec.stage, sec.label, sec.total, sec.attentionCount, sec.defaultOpen, sec.emptyText, sec.hint]),
      b.sections.map(sec => [sec.stage, sec.label, sec.total, sec.attentionCount, sec.defaultOpen, sec.emptyText, sec.hint]), `attention ${attention}`);
    assert.deepEqual(im.fold, b.fold, `fold, attention ${attention}`);
    assert.equal(im.showAll, attention);
  }
  const complete = m.sections.find(sec => sec.stage === 'complete')!;
  assert.deepEqual([complete.defaultOpen, complete.hint], [false, '1 needs attention'], 'Complete starts closed with its hint');
  const empty = m.sections.find(sec => sec.stage === 'build-recorded')!;
  assert.deepEqual([empty.defaultOpen, empty.emptyText, empty.issues], [false, DISPLAY_LABELS.nothingAtStage, []]);
  assert.match(issues(snap, { needsAttentionOnly: true }).fold.text, /stages have nothing needing attention/);
});
