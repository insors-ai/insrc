/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What a reader of a raw head (a parsed `{ meta, body }`) takes from `meta.lifecycle`: whether the artifact was approved or rejected, the time
 * of its approval, and its review. For the readers that work on the parsed JSON and cannot wait for the store (pending, chain,
 * admission, the content view); the store's own readers decode the same part with `decodeArtifactHead`.
 *
 * A head with no lifecycle reads as pending: the legacy stamps (`approvedAt`, `rejectedAt`) say nothing here, because the
 * conversion removes them.
 */

export type ApprovalState = 'approved' | 'rejected' | 'pending';

/** The statuses of an artifact that was approved and is still approved or has moved on. */
export const APPROVED_OR_BEYOND: readonly string[] = ['approved', 'in-signoff', 'changes-requested', 'signed-off', 'completed'];

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The `lifecycle` object of a head's meta, or undefined. */
export function lifecycleOfMeta(meta: unknown): Obj | undefined {
	const lifecycle = isObj(meta) ? meta['lifecycle'] : undefined;
	return isObj(lifecycle) ? lifecycle : undefined;
}

/** Approved when the status is approved or beyond, rejected when it is rejected, otherwise pending. */
export function approvalStateOf(meta: unknown): ApprovalState {
	const status = lifecycleOfMeta(meta)?.['status'];
	if (typeof status !== 'string') return 'pending';
	return APPROVED_OR_BEYOND.includes(status) ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
}

/** The time of the approval a lifecycle records, when the artifact is approved. */
export function approvedAtOf(meta: unknown): string | undefined {
	if (approvalStateOf(meta) !== 'approved') return undefined;
	const approval = lifecycleOfMeta(meta)?.['approval'];
	const at = isObj(approval) ? approval['at'] : undefined;
	return typeof at === 'string' && at.length > 0 ? at : undefined;
}

/** The lifecycle review of a head (verdict, counts, party, time, report Reference), or undefined. */
export function lifecycleReviewOf(meta: unknown): Obj | undefined {
	const review = lifecycleOfMeta(meta)?.['review'];
	return isObj(review) ? review : undefined;
}
