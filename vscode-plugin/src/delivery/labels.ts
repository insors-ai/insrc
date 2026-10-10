/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's display labels (E2 s1, sc4): one text label for every
 * stage id and every signal the daemon publishes, so colour is never the only
 * carrier of a state and every view uses the same words. Each table is an
 * exhaustive Record over its union, so a new member without a label fails to
 * compile. Pure data; vscode-free.
 */

import type {
  ApprovalState,
  AttentionReason,
  DeliveryStage,
  NoticeCode,
  ReviewVerdict,
  TaskResult,
} from './delivery-contract.js';
import type { ItemTab, ListView } from './board-protocol.js';

export interface DisplayLabels {
  readonly stage: Readonly<Record<DeliveryStage, string>>;
  readonly attention: Readonly<Record<AttentionReason, string>>;
  readonly notice: Readonly<Record<NoticeCode, string>>;
  readonly taskResult: Readonly<Record<TaskResult, string>>;
  readonly approval: Readonly<Record<ApprovalState, string>>;
  readonly reviewVerdict: Readonly<Record<ReviewVerdict, string>>;
  readonly unplanned: string;
  /** The artifact chain's row for an expected record that does not exist. */
  readonly chain: { readonly notRecorded: string };
  /** The heading of the details' validation-conflict warning. */
  readonly conflictHeadline: string;
  /** The title of the panel shown when a view's selection matches nothing. */
  readonly noMatchesTitle: string;
  readonly noMatchesText: string;
  /** The panel of an issue view over a board that has no issues at all (nothing is filtered out). */
  readonly noIssuesTitle: string;
  readonly noIssuesText: string;
  /** The four views, as the view control and the breadcrumb name them. */
  readonly views: Readonly<Record<ListView, string>>;
  /** The story screen's tabs: the long label, and the short one a narrow pane uses. */
  readonly itemTabs: Readonly<Record<ItemTab, { readonly long: string; readonly short: string }>>;
  readonly needsAttention: string;
  /** An empty stage section's summary text. */
  readonly nothingAtStage: string;
  /** The one section the empty stages fold into in a narrow pane. */
  readonly otherStages: string;
}

/** A label from the table, or the code itself when the daemon publishes one this build does not know. */
export function labelOf<K extends string>(table: Readonly<Record<K, string>>, code: K): string {
  return Object.hasOwn(table, code) ? table[code] : String(code);
}

/** The tone of each approval state; a state this build does not know is neutral. */
const APPROVAL_TONES: Readonly<Record<ApprovalState, 'success' | 'warning' | 'danger'>> = { approved: 'success', pending: 'warning', rejected: 'danger' };
export function approvalTone(state: ApprovalState): 'success' | 'warning' | 'danger' | 'neutral' {
  return Object.hasOwn(APPROVAL_TONES, state) ? APPROVAL_TONES[state] : 'neutral';
}

/** The tone of a recorded task result: Passed success, Failed danger, Unrecorded (or a result this build does not know) neutral. */
export function taskResultTone(result: TaskResult): 'success' | 'danger' | 'neutral' {
  return result === 'passed' ? 'success' : result === 'failed' ? 'danger' : 'neutral';
}

/** The tone of an effective review verdict as a card shows it: pass success, warn warning, a block that no longer blocks neutral. */
export function verdictTone(verdict: ReviewVerdict): 'success' | 'warning' | 'neutral' {
  return verdict === 'pass' ? 'success' : verdict === 'warn' ? 'warning' : 'neutral';
}

/** The six stages in workflow order, the order the board shows its stage sections. */
export const STAGE_ORDER: readonly DeliveryStage[] = [
  'scoped',
  'design-plan',
  'ready-design-approved',
  'ready-plan-approved',
  'build-recorded',
  'complete',
];

export const DISPLAY_LABELS: DisplayLabels = {
  stage: {
    'scoped': 'Scoped',
    'design-plan': 'Design & plan',
    'ready-design-approved': 'Ready · design approved',
    'ready-plan-approved': 'Ready · plan approved',
    'build-recorded': 'Build recorded',
    'complete': 'Complete',
  },
  attention: {
    'pending-decision': 'Pending decision',
    'rejected': 'Rejected',
    'review-blocked': 'Review blocked',
    'validation-failed': 'Validation failed',
    'validation-conflict': 'Validation conflict',
  },
  notice: {
    'record-unreadable': 'Unreadable record',
    'identity-ambiguous': 'Ambiguous identity',
    'unresolved-parent': 'Unresolved parent',
    'identity-anchor-missing': 'Identity anchor missing',
    'unattached-spec': 'Unattached spec',
    'unknown-route': 'Unknown route',
    'review-without-build': 'Code review without a build record',
    'unplanned-task': 'Unplanned task',
    'validation-conflict': 'Validation conflict',
    'incomplete-evidence': 'Incomplete evidence',
    'review-currency-unknown': 'Review currency unknown',
    'base-predates-extension': 'Framing predates an extension',
  },
  taskResult: {
    'passed': 'Passed',
    'failed': 'Failed',
    'unrecorded': 'Unrecorded',
  },
  approval: {
    'approved': 'Approved',
    'rejected': 'Rejected',
    'pending': 'Pending',
  },
  reviewVerdict: {
    'pass': 'Review passed',
    'warn': 'Review warned',
    'block': 'Review blocked',
  },
  unplanned: 'Unplanned',
  chain: { notRecorded: 'Not recorded' },
  conflictHeadline: 'Two records disagree',
  noMatchesTitle: 'Nothing matches this view',
  noMatchesText: 'Work exists, but none matches the current search, scope and attention filter.',
  noIssuesTitle: 'No issues on the board',
  noIssuesText: 'There are no issues on the board.',
  views: { all: 'All work', epics: 'Epics', standalone: 'Standalone', issues: 'Issues' },
  itemTabs: {
    overview: { long: 'Overview & tasks', short: 'Overview' },
    evidence: { long: 'Workflow evidence', short: 'Evidence' },
    linked: { long: 'Linked work', short: 'Linked' },
  },
  needsAttention: 'Needs attention',
  nothingAtStage: 'nothing at this stage',
  otherStages: 'Other stages · 0 matching',
};
