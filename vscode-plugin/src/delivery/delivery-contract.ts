/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The plugin's view of the daemon's delivery IPC contract (E1 s5, sc7):
 * workflow.delivery and workflow.deliveryEvidence. Type-only, imported by
 * relative path like docs-review-client.ts imports pending.ts, so a change to
 * the published types fails the plugin's own typecheck
 * (tsconfig.delivery-contract.json) instead of drifting.
 */

import type {
	DeliveryError,
	DeliveryEvidenceEntry,
	DeliveryEvidenceRecord,
	DeliveryEvidenceRequest,
	DeliveryEvidenceResponse,
	DeliveryItem,
	DeliverySnapshot,
	DeliverySnapshotRequest,
	DeliverySnapshotResponse,
} from '../../../src/workflow/delivery/types.js';

export type {
	DeliveryError,
	DeliveryEvidenceEntry,
	DeliveryEvidenceRecord,
	DeliveryEvidenceRequest,
	DeliveryEvidenceResponse,
	DeliveryItem,
	DeliverySnapshot,
	DeliverySnapshotRequest,
	DeliverySnapshotResponse,
};

/** The IPC method each request goes to, with its request and response shapes. */
export interface DeliveryMethods {
	readonly 'workflow.delivery':         { readonly request: DeliverySnapshotRequest; readonly response: DeliverySnapshotResponse };
	readonly 'workflow.deliveryEvidence': { readonly request: DeliveryEvidenceRequest; readonly response: DeliveryEvidenceResponse };
}

/** The fields the plugin reads from a snapshot item; a renamed or removed field fails here. */
export type DeliveryItemView = Pick<DeliveryItem,
	'id' | 'kind' | 'title' | 'parentId' | 'childIds' | 'stage' | 'evidence' | 'needsAttention' | 'attentionReasons' | 'notices'>;

/** The fields the plugin reads from an evidence entry to choose how to open it. */
export type DeliveryEvidenceView = Pick<DeliveryEvidenceEntry, 'artifactId' | 'kind' | 'mdPath' | 'openWith' | 'approval' | 'review'>;
