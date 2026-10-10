/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The plugin's view of the daemon's delivery IPC contract (E1 s5, sc7):
 * workflow.delivery and workflow.deliveryEvidence. Type-only, imported by
 * relative path like docs-review-client.ts imports pending.ts, so a change to
 * the published types fails the plugin's own typecheck
 * (tsconfig.delivery-contract.json) instead of drifting. The six enum types
 * (stage, attention, notice, task result, approval, review verdict) are
 * re-exported for the board's display labels (E2 s1, sc4).
 */

import type {
	ApprovalState,
	AttentionReason,
	DeliveryError,
	DeliveryEvidenceEntry,
	DeliveryEvidenceRecord,
	DeliveryEvidenceRequest,
	DeliveryEvidenceResponse,
	DeliveryFeedback,
	DeliveryItem,
	DeliveryItemDescription,
	DeliveryRecorded,
	DeliverySize,
	DeliverySnapshot,
	DeliverySnapshotRequest,
	DeliverySnapshotResponse,
	DeliveryStage,
	NoticeCode,
	ReviewVerdict,
	TaskResult,
} from '../../../src/workflow/delivery/types.js';

export type {
	ApprovalState,
	AttentionReason,
	DeliveryError,
	DeliveryEvidenceEntry,
	DeliveryEvidenceRecord,
	DeliveryEvidenceRequest,
	DeliveryEvidenceResponse,
	DeliveryFeedback,
	DeliveryItem,
	DeliveryItemDescription,
	DeliveryRecorded,
	DeliverySize,
	DeliverySnapshot,
	DeliverySnapshotRequest,
	DeliverySnapshotResponse,
	DeliveryStage,
	NoticeCode,
	ReviewVerdict,
	TaskResult,
};

/** The IPC method each request goes to, with its request and response shapes. */
export interface DeliveryMethods {
	readonly 'workflow.delivery':         { readonly request: DeliverySnapshotRequest; readonly response: DeliverySnapshotResponse };
	readonly 'workflow.deliveryEvidence': { readonly request: DeliveryEvidenceRequest; readonly response: DeliveryEvidenceResponse };
}

/** The fields the plugin reads from a snapshot item; a renamed or removed field fails here. */
export type DeliveryItemView = Pick<DeliveryItem,
	'id' | 'kind' | 'title' | 'standalone' | 'sourceIds' | 'parentId' | 'childIds' | 'stage' | 'evidence' |
	'tasks' | 'validation' | 'storyLevelResult' | 'conflict' | 'correctsRef' | 'needsAttention' | 'attentionReasons' | 'notices' |
	'description' | 'feedback'>;

/**
 * Fails the contract typecheck when the view stops carrying what the item is about or its recorded feedback
 * (ISSUE-7224d0d4): a Pick of fewer keys still type-checks, so the keys are asserted here.
 */
type RequireKeys<T, K extends PropertyKey> = [K] extends [keyof T] ? true : never;
export const DELIVERY_ITEM_VIEW_CARRIES_DESCRIPTION_AND_FEEDBACK: RequireKeys<DeliveryItemView, 'description' | 'feedback'> = true;

/** The fields the plugin reads from an evidence entry to choose how to open it. */
export type DeliveryEvidenceView = Pick<DeliveryEvidenceEntry, 'artifactId' | 'kind' | 'mdPath' | 'openWith' | 'approval' | 'review'>;
