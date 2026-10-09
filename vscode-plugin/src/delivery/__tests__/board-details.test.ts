/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s4 — the item details model: task rows and their PLAN join, the stage reason, conflicts, evidence labels and notices. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DeliveryEvidenceEntry } from '../delivery-contract.js';
import { buildItemDetails, type PlanRead } from '../board-details.js';
import { DISPLAY_LABELS } from '../labels.js';
import { evidence as ev, item, snapshot } from './board-fixtures.js';

const NONE: PlanRead = { state: 'none' };

type Review = NonNullable<DeliveryEvidenceEntry['review']>;

function review(over: Partial<Review>): Review {
  return {
    verdict: 'pass', reviewedAt: '2026-10-09T08:00:00.000Z', reviewedBy: 'controller', counts: { high: 0, med: 0, low: 0 },
    override: null, resolvedFindings: 0, effectiveVerdict: 'pass', blocking: false, ...over,
  };
}

/** A story with three planned tasks (passed, failed, unrecorded) and one build-only task. */
function taskedSnapshot() {
  return snapshot([
    item({
      id: 'E1:S001', title: 'Columns', stage: 'build-recorded',
      childIds: ['E1:S001:T001', 'E1:S001:T002', 'E1:S001:T003', 'E1:S001:T004'],
      tasks: [
        { taskItemId: 'E1:S001:T001', result: 'passed', planned: true },
        { taskItemId: 'E1:S001:T002', result: 'failed', planned: true },
        { taskItemId: 'E1:S001:T003', result: 'unrecorded', planned: true },
        { taskItemId: 'E1:S001:T004', result: 'passed', planned: false },
      ],
      validation: { passed: 1, failed: 1, unrecorded: 1, unplanned: 1 },
    }),
    item({ id: 'E1:S001:T001', kind: 'task', parentId: 'E1:S001', title: 'Types', sourceIds: ['t1'] }),
    item({ id: 'E1:S001:T002', kind: 'task', parentId: 'E1:S001', title: 'Builder', sourceIds: ['t2'] }),
    item({ id: 'E1:S001:T003', kind: 'task', parentId: 'E1:S001', title: 'Host', sourceIds: ['t3'] }),
    item({ id: 'E1:S001:T004', kind: 'task', parentId: 'E1:S001', title: 'Hotfix', sourceIds: ['b1'] }),
  ]);
}

test('planned tasks show their dependencies and checks with Passed, Failed or Unrecorded, a build-only task is unplanned, and unrecorded tasks are counted apart', () => {
  const plan: PlanRead = { state: 'ok', tasks: [
    { id: 't1', dependsOn: [], acceptanceChecks: ['types compile'] },
    { id: 't2', dependsOn: ['t1'], acceptanceChecks: ['rows built'] },
    { id: 't3', dependsOn: ['t2', 't9'], acceptanceChecks: [] },
    { id: 't5', dependsOn: [], acceptanceChecks: ['no task item'] },
  ] };
  const d = buildItemDetails(taskedSnapshot(), 'E1:S001', plan, null, DISPLAY_LABELS)!;
  assert.deepEqual(d.tasks.map(t => [t.title, t.resultLabel, t.planned, t.dependsOn, t.acceptanceChecks]), [
    ['Types', 'Passed', true, [], ['types compile']],
    ['Builder', 'Failed', true, ['Types'], ['rows built']],
    ['Host', 'Unrecorded', true, ['Builder', 't9'], []],
    ['Hotfix', 'Unplanned', false, null, null],
  ]);
  assert.deepEqual(d.taskCounts, { passed: 1, failed: 1, unrecorded: 1, unplanned: 1 });

  for (const other of [NONE, { state: 'loading' } as const, { state: 'failed', message: 'timed out' } as const]) {
    const rows = buildItemDetails(taskedSnapshot(), 'E1:S001', other, null, DISPLAY_LABELS)!.tasks;
    assert.ok(rows.every(t => t.dependsOn === null && t.acceptanceChecks === null));
    assert.deepEqual(rows.map(t => t.resultLabel), ['Passed', 'Failed', 'Unrecorded', 'Unplanned']);
  }
  const failed = buildItemDetails(taskedSnapshot(), 'E1:S001', { state: 'failed', message: 'timed out' }, null, DISPLAY_LABELS)!;
  assert.equal(failed.planNotice, 'The plan could not be read: timed out');
  assert.equal(d.planNotice, null);
  assert.equal(buildItemDetails(taskedSnapshot(), 'missing', NONE, null, DISPLAY_LABELS), null);
});

test('the details give the daemon\'s stage reason and the records it cites', () => {
  const s = item({ id: 'E1:S002', title: 'Cards', stage: 'ready-plan-approved', reasonIds: ['LLD-x', 'PLAN-x'],
    sourceIds: ['s2', 'LLD-x'], parentId: 'E1', evidence: [ev('LLD-x', 'LLD'), ev('PLAN-x', 'PLAN')] });
  const withText = { ...s, stage: { ...s.stage!, reason: { text: 'The PLAN is approved; no build is recorded.', artifactIds: ['LLD-x', 'PLAN-x'] } } };
  const snap = snapshot([item({ id: 'E1', kind: 'epic', title: 'Board epic', childIds: ['E1:S002'] }), withText]);
  const d = buildItemDetails(snap, 'E1:S002', NONE, null, DISPLAY_LABELS)!;
  assert.equal(d.title, 'Cards');
  assert.equal(d.stageLabel, 'Ready · plan approved');
  assert.deepEqual(d.stageReason, { text: 'The PLAN is approved; no build is recorded.', artifactIds: ['LLD-x', 'PLAN-x'] });
  assert.deepEqual(d.sourceIds, ['s2', 'LLD-x']);
  assert.deepEqual(d.linked, [{ itemId: 'E1', title: 'Board epic', relation: 'parent' }]);
  assert.deepEqual(d.tasks, []);
  assert.equal(d.taskCounts, null);
  assert.equal(d.conflict, null);

  const epic = buildItemDetails(snap, 'E1', NONE, null, DISPLAY_LABELS)!;
  assert.equal(epic.stageLabel, null);
  assert.equal(epic.stageReason, null);
  assert.deepEqual(epic.linked, [{ itemId: 'E1:S002', title: 'Cards', relation: 'child' }]);
});

test('an approved build with failed tasks shows the approval, the failed rows and a sentence explaining the conflict', () => {
  const base = taskedSnapshot();
  const story = { ...base.items.find(i => i.id === 'E1:S001')!,
    evidence: [ev('BUILD-x', 'BUILD')], conflict: { failedTaskItemIds: ['E1:S001:T002'], storyLevelFailed: false } };
  const snap = snapshot([...base.items.filter(i => i.id !== 'E1:S001'), story]);
  const d = buildItemDetails(snap, 'E1:S001', NONE, null, DISPLAY_LABELS)!;
  assert.deepEqual(d.conflict, { headline: 'Two records disagree', text: 'The build is approved while 1 task result failed (Builder).' });
  assert.deepEqual(d.evidence.map(e => [e.artifactId, e.kindLabel, e.approvalLabel]), [['BUILD-x', 'BUILD', 'Approved']]);
  assert.deepEqual(d.tasks.filter(t => t.resultLabel === 'Failed').map(t => t.title), ['Builder']);

  const both = { ...story, conflict: { failedTaskItemIds: ['E1:S001:T002', 'E1:S001:T003'], storyLevelFailed: true } };
  const snap2 = snapshot([...base.items.filter(i => i.id !== 'E1:S001'), both]);
  assert.equal(buildItemDetails(snap2, 'E1:S001', NONE, null, DISPLAY_LABELS)!.conflict?.text,
    'The build is approved while 2 task results failed (Builder, Host) and the story-level result failed.');
});

test('a rejected record reads Rejected, and the original review verdict is shown with any override', () => {
  const snap = snapshot([item({ id: 'S1', stage: 'design-plan', evidence: [
    ev('HLD-x', 'HLD', { approval: { state: 'rejected', at: null } }),
    ev('LLD-x', 'LLD', { approval: { state: 'pending', at: null }, review: review({ verdict: 'block', effectiveVerdict: 'pass', resolvedFindings: 2 }) }),
    ev('PLAN-x', 'PLAN', { review: review({ verdict: 'block', effectiveVerdict: 'block', override: { reason: 'accepted risk', at: null } }) }),
    ev('SPEC-x', 'SPEC', { review: review({ verdict: 'warn', effectiveVerdict: 'warn' }) }),
  ] })]);
  const d = buildItemDetails(snap, 'S1', NONE, null, DISPLAY_LABELS)!;
  assert.deepEqual(d.evidence.map(e => [e.artifactId, e.approvalLabel, e.reviewLabel, e.overrideLabel]), [
    ['HLD-x', 'Rejected', null, null],
    ['LLD-x', 'Pending', 'Review blocked (now Review passed)', null],
    ['PLAN-x', 'Approved', 'Review blocked', 'Overridden: accepted risk'],
    ['SPEC-x', 'Approved', 'Review warned', null],
  ]);
});

test('a code review with no build keeps its stage, lists the review-without-build notice and shows the review as evidence', () => {
  const notice = { code: 'review-without-build', message: 'CR-x has no BUILD record for this story.', itemIds: ['S1'], artifactIds: ['CR-x'], fileNames: [] };
  const snap = snapshot([item({ id: 'S1', stage: 'ready-plan-approved', notices: [notice] as never, evidence: [
    ev('CR-x', 'CR'),
    ev('LLD-x', 'LLD', { mdPath: 'docs/e/S001/LLD.md', openWith: 'review-view' }),
    ev('PLAN-x', 'PLAN', { mdPath: null, openWith: 'review-view' }),
  ] })]);
  const d = buildItemDetails(snap, 'S1', NONE, null, DISPLAY_LABELS)!;
  assert.equal(d.stageLabel, 'Ready · plan approved');
  assert.deepEqual(d.notices, ['Code review without a build record: CR-x has no BUILD record for this story.']);
  assert.deepEqual(d.evidence.map(e => [e.artifactId, e.kindLabel, e.opensIn]), [
    ['CR-x', 'CR', 'read-only'],
    ['LLD-x', 'LLD', 'review-pane'],
    ['PLAN-x', 'PLAN', 'read-only'],
  ]);

  const opened = { artifactId: 'CR-x', text: '# CR' };
  assert.deepEqual(buildItemDetails(snap, 'S1', NONE, opened, DISPLAY_LABELS)!.openedRecord, opened);
  assert.equal(buildItemDetails(snap, 'S1', NONE, { artifactId: 'BUILD-y', text: 'x' }, DISPLAY_LABELS)!.openedRecord, null);
});

/** A story on the given route with the given evidence; its stage carries the route. */
function routed(id: string, route: string, evidence: readonly DeliveryEvidenceEntry[], over: Record<string, unknown> = {}) {
  const base = item({ id, stage: 'design-plan', evidence: evidence as never, ...over });
  return { ...base, stage: { ...base.stage!, route } } as typeof base;
}
const chainOf = (snap: ReturnType<typeof snapshot>, id: string) =>
  buildItemDetails(snap, id, NONE, null, DISPLAY_LABELS)!.chain.map(r => [r.kind, r.status === 'recorded' ? r.artifactId : r.label]);

test('chain rows per route \u2014 full-chain story shows DEF/HLD from its epic plus LLD/PLAN/BUILD; small story has no PLAN row; small-bugfix has ISSUE and BUILD only; trivial has BUILD only; unknown lists recorded kinds only; a missing expected kind is \'Not recorded\'; two BUILDs give two rows', () => {
  const snap = snapshot([
    item({ id: 'E1', kind: 'epic', title: 'Epic', evidence: [ev('DEF-e', 'DEF'), ev('HLD-e', 'HLD')] as never }),
    routed('E1:S001', 'full-chain', [ev('LLD-a', 'LLD'), ev('PLAN-a', 'PLAN', { approval: { state: 'pending', at: null } })], { parentId: 'E1' }),
    routed('F1', 'feature', [ev('LLD-f', 'LLD')], { standalone: true }),
    routed('SM1', 'small', [ev('LLD-s', 'LLD')], { standalone: true }),
    routed('SB1', 'small-bugfix', [ev('ISSUE-b', 'ISSUE')], { kind: 'issue', standalone: true }),
    routed('ZB1', 'sized-bugfix', [ev('ISSUE-z', 'ISSUE'), ev('LLD-z', 'LLD')], { kind: 'issue', standalone: true }),
    routed('TR1', 'trivial', [ev('BUILD-t2', 'BUILD'), ev('BUILD-t1', 'BUILD')], { standalone: true }),
    routed('UN1', 'unknown', [ev('PLAN-u', 'PLAN')], { standalone: true }),
  ]);
  assert.deepEqual(chainOf(snap, 'E1:S001'), [['DEF', 'DEF-e'], ['HLD', 'HLD-e'], ['LLD', 'LLD-a'], ['PLAN', 'PLAN-a'], ['BUILD', 'Not recorded']],
    "DEF and HLD come from the epic's evidence; a missing BUILD is Not recorded");
  const full = buildItemDetails(snap, 'E1:S001', NONE, null, DISPLAY_LABELS)!.chain;
  assert.deepEqual(full.map(r => [r.label, r.tone]), [['Approved', 'success'], ['Approved', 'success'], ['Approved', 'success'], ['Pending', 'warning'], ['Not recorded', 'neutral']]);
  assert.deepEqual(chainOf(snap, 'F1'), [['LLD', 'LLD-f'], ['PLAN', 'Not recorded'], ['BUILD', 'Not recorded']]);
  assert.deepEqual(chainOf(snap, 'SM1'), [['LLD', 'LLD-s'], ['BUILD', 'Not recorded']], 'a small story has no PLAN row');
  assert.deepEqual(chainOf(snap, 'SB1'), [['ISSUE', 'ISSUE-b'], ['BUILD', 'Not recorded']], 'a small bugfix has ISSUE and BUILD only');
  assert.deepEqual(chainOf(snap, 'ZB1'), [['ISSUE', 'ISSUE-z'], ['LLD', 'LLD-z'], ['PLAN', 'Not recorded'], ['BUILD', 'Not recorded']]);
  assert.deepEqual(chainOf(snap, 'TR1'), [['BUILD', 'BUILD-t1'], ['BUILD', 'BUILD-t2']], 'trivial: BUILD only, two BUILDs give two rows in artifactId order');
  assert.deepEqual(chainOf(snap, 'UN1'), [['PLAN', 'PLAN-u']], 'unknown lists recorded kinds only and never claims a record is missing');
});

test('a story with CR, SPEC, EXT and AMD evidence gets a chain without those kinds, they remain in Records, and buildItemDetails does not throw', () => {
  const snap = snapshot([routed('S1', 'full-chain', [
    ev('AMD-x', 'AMD'), ev('CR-x', 'CR'), ev('EXT-x', 'EXT'), ev('LLD-x', 'LLD'), ev('SPEC-x', 'SPEC'),
  ], { standalone: true })]);
  const d = buildItemDetails(snap, 'S1', NONE, null, DISPLAY_LABELS)!;
  assert.deepEqual(d.chain.map(r => r.kind), ['DEF', 'HLD', 'LLD', 'PLAN', 'BUILD']);
  assert.deepEqual(d.chain.filter(r => r.status === 'recorded').map(r => r.artifactId), ['LLD-x']);
  assert.deepEqual(d.evidence.map(e => e.artifactId), ['AMD-x', 'CR-x', 'EXT-x', 'LLD-x', 'SPEC-x'], 'every record stays in Records');
});

test('conflict is { headline: \'Two records disagree\', text } exactly when item.conflict is set', () => {
  const snap = snapshot([
    item({ id: 'S1', stage: 'complete', conflict: { failedTaskItemIds: [], storyLevelFailed: true } as never }),
    item({ id: 'S2', stage: 'complete' }),
  ]);
  assert.deepEqual(buildItemDetails(snap, 'S1', NONE, null, DISPLAY_LABELS)!.conflict,
    { headline: 'Two records disagree', text: 'The build is approved while the story-level result failed.' });
  assert.equal(buildItemDetails(snap, 'S2', NONE, null, DISPLAY_LABELS)!.conflict, null);
});

test('kicker, chips and TaskRowView.resultTone', () => {
  const base = taskedSnapshot();
  const story = { ...base.items.find(i => i.id === 'E1:S001')!, id: 'E20261009abcdef01:S001' };
  const snap = snapshot([...base.items.filter(i => i.id !== 'E1:S001'), story,
    item({ id: 'E20261009abcdef01', kind: 'epic', title: 'Epic' })]);
  const d = buildItemDetails(snap, 'E20261009abcdef01:S001', NONE, null, DISPLAY_LABELS)!;
  assert.equal(d.kicker, 'STORY \u00b7 ABCDEF01 / S001');
  assert.deepEqual(d.chips.slice(0, 2), [
    { kind: 'stage', label: 'Build recorded', tone: 'neutral' },
    { kind: 'tasks', label: '1/3 tasks passed', tone: 'danger' },
  ], 'the stage pill, then the task summary (danger while a task failed)');
  assert.deepEqual(d.chips.slice(2).map(c => c.label), ['Validation failed'], 'then the card badges');
  assert.deepEqual(d.tasks.map(t => [t.resultLabel, t.resultTone]), [
    ['Passed', 'success'], ['Failed', 'danger'], ['Unrecorded', 'neutral'], ['Unplanned', 'neutral'],
  ]);
  assert.equal(buildItemDetails(snap, 'E20261009abcdef01', NONE, null, DISPLAY_LABELS)!.kicker, 'EPIC \u00b7 ABCDEF01');
  assert.deepEqual(buildItemDetails(snap, 'E20261009abcdef01', NONE, null, DISPLAY_LABELS)!.chips, [], 'an epic has no stage, tasks or badges');
});

test('the chain takes DEF and HLD only from a parent epic, and ISSUE only from a parent issue', () => {
  const snap = snapshot([
    item({ id: 'I1', kind: 'issue', standalone: true, evidence: [ev('ISSUE-i', 'ISSUE'), ev('DEF-stray', 'DEF'), ev('HLD-stray', 'HLD')] as never }),
    routed('I1:S001', 'sized-bugfix', [ev('LLD-f', 'LLD')], { parentId: 'I1' }),
    item({ id: 'E1', kind: 'epic', evidence: [ev('DEF-e', 'DEF'), ev('HLD-e', 'HLD'), ev('ISSUE-stray', 'ISSUE')] as never }),
    routed('E1:S001', 'full-chain', [ev('LLD-a', 'LLD')], { parentId: 'E1' }),
  ]);
  assert.deepEqual(chainOf(snap, 'I1:S001'), [['ISSUE', 'ISSUE-i'], ['LLD', 'LLD-f'], ['PLAN', 'Not recorded'], ['BUILD', 'Not recorded']],
    "a fix story shows its issue's ISSUE, never DEF or HLD from the issue");
  assert.deepEqual(chainOf(snap, 'E1:S001'), [['DEF', 'DEF-e'], ['HLD', 'HLD-e'], ['LLD', 'LLD-a'], ['PLAN', 'Not recorded'], ['BUILD', 'Not recorded']],
    "an epic story shows its epic's DEF and HLD, never an ISSUE recorded on the epic");
});
