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

export interface DisplayLabels {
  readonly stage: Readonly<Record<DeliveryStage, string>>;
  readonly attention: Readonly<Record<AttentionReason, string>>;
  readonly notice: Readonly<Record<NoticeCode, string>>;
  readonly taskResult: Readonly<Record<TaskResult, string>>;
  readonly approval: Readonly<Record<ApprovalState, string>>;
  readonly reviewVerdict: Readonly<Record<ReviewVerdict, string>>;
  readonly unplanned: string;
}

/** The six stages in workflow order, the order the board shows its columns. */
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
};
