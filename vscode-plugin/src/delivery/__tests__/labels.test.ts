/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 / sc4 — the board's display labels cover every published state, in text. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  ApprovalState,
  AttentionReason,
  DeliveryStage,
  NoticeCode,
  ReviewVerdict,
  TaskResult,
} from '../delivery-contract.js';
import { DISPLAY_LABELS, STAGE_ORDER } from '../labels.js';

// Exhaustive member lists: each Record fails to compile if its union gains or loses a member.
const STAGES: Record<DeliveryStage, true> = {
  'scoped': true, 'design-plan': true, 'ready-design-approved': true,
  'ready-plan-approved': true, 'build-recorded': true, 'complete': true,
};
const ATTENTION: Record<AttentionReason, true> = {
  'pending-decision': true, 'rejected': true, 'review-blocked': true,
  'validation-failed': true, 'validation-conflict': true,
};
const NOTICES: Record<NoticeCode, true> = {
  'record-unreadable': true, 'identity-ambiguous': true, 'unresolved-parent': true,
  'identity-anchor-missing': true, 'unattached-spec': true, 'unknown-route': true,
  'review-without-build': true, 'unplanned-task': true, 'validation-conflict': true,
  'incomplete-evidence': true, 'review-currency-unknown': true, 'base-predates-extension': true,
};
const RESULTS: Record<TaskResult, true> = { 'passed': true, 'failed': true, 'unrecorded': true };
const APPROVALS: Record<ApprovalState, true> = { 'approved': true, 'rejected': true, 'pending': true };
const VERDICTS: Record<ReviewVerdict, true> = { 'pass': true, 'warn': true, 'block': true };

function assertLabelled(name: string, members: Record<string, true>, labels: Readonly<Record<string, string>>): void {
  assert.deepEqual(Object.keys(labels).sort(), Object.keys(members).sort(), `${name}: exactly one label per member`);
  for (const [member, label] of Object.entries(labels)) {
    assert.ok(label.trim().length > 0, `${name}.${member} has a non-empty label`);
  }
}

test('every stage, attention reason, notice code, task result, approval state and review verdict has a display label', () => {
  assertLabelled('stage', STAGES, DISPLAY_LABELS.stage);
  assertLabelled('attention', ATTENTION, DISPLAY_LABELS.attention);
  assertLabelled('notice', NOTICES, DISPLAY_LABELS.notice);
  assertLabelled('taskResult', RESULTS, DISPLAY_LABELS.taskResult);
  assertLabelled('approval', APPROVALS, DISPLAY_LABELS.approval);
  assertLabelled('reviewVerdict', VERDICTS, DISPLAY_LABELS.reviewVerdict);
  assert.equal(DISPLAY_LABELS.unplanned, 'Unplanned');
});

test('the six stage labels read in workflow order', () => {
  assert.deepEqual(
    STAGE_ORDER.map(s => DISPLAY_LABELS.stage[s]),
    ['Scoped', 'Design & plan', 'Ready · design approved', 'Ready · plan approved', 'Build recorded', 'Complete'],
  );
  assert.deepEqual([...STAGE_ORDER].sort(), Object.keys(STAGES).sort(), 'STAGE_ORDER lists every stage once');
});

test('DISPLAY_LABELS carries chain.notRecorded, conflictHeadline and noMatchesTitle', () => {
  assert.equal(DISPLAY_LABELS.chain.notRecorded, 'Not recorded');
  assert.equal(DISPLAY_LABELS.conflictHeadline, 'Two records disagree');
  assert.equal(DISPLAY_LABELS.noMatchesTitle, 'Nothing matches this view');
  for (const k of ['noMatchesText', 'noIssuesTitle', 'noIssuesText'] as const) assert.ok(DISPLAY_LABELS[k].length > 0, k);
});

test('DISPLAY_LABELS carries the view, item-tab, attention and stage-section labels', () => {
  assert.deepEqual(DISPLAY_LABELS.views, { all: 'All work', epics: 'Epics', standalone: 'Standalone', issues: 'Issues' });
  assert.deepEqual(DISPLAY_LABELS.itemTabs, {
    overview: { long: 'Overview & tasks', short: 'Overview' },
    evidence: { long: 'Workflow evidence', short: 'Evidence' },
    linked: { long: 'Linked work', short: 'Linked' },
  });
  assert.equal(DISPLAY_LABELS.needsAttention, 'Needs attention');
  assert.equal(DISPLAY_LABELS.nothingAtStage, 'nothing at this stage');
  assert.equal(DISPLAY_LABELS.otherStages, 'Other stages · 0 matching');
});
