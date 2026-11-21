/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of ReviewCheckpoint's exact field shape and
 * writeCheckpoint/readCheckpoint/finalizeAndCleanup's exact parameter/return
 * shapes. Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens a field's type, drops `readonly`, or makes an optional field required
 * fails the check.
 */

import type { ReviewCheckpoint } from '../checkpoint.js';
import { finalizeAndCleanup, readCheckpoint, writeCheckpoint } from '../checkpoint.js';

/** True iff A and B are the exact same type (distributes correctly over unions,
 *  unlike `A extends B ? B extends A ? true : false : false`). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// Exact-keys proof: fails to compile for ANY added or removed key, named anything.
const _checkpointKeysExact: Equal<keyof ReviewCheckpoint, 'reviewId' | 'lastCompletedUnit'> = true;
void _checkpointKeysExact;

// Exact-keys proof for the nested lastCompletedUnit, matching sc5's interfaceSketch exactly.
const _unitKeysExact: Equal<keyof ReviewCheckpoint['lastCompletedUnit'], 'kind' | 'ref'> = true;
void _unitKeysExact;

// writeCheckpoint's parameter-shape proof.
type WriteCheckpointParams = Parameters<typeof writeCheckpoint>;
const _writeCheckpointParamsExact: Equal<WriteCheckpointParams, [string, ReviewCheckpoint['lastCompletedUnit']]> = true;
void _writeCheckpointParamsExact;

// writeCheckpoint's return-shape proof.
type WriteCheckpointReturn = Awaited<ReturnType<typeof writeCheckpoint>>;
const _writeCheckpointReturnExact: Equal<WriteCheckpointReturn, void> = true;
void _writeCheckpointReturnExact;

// readCheckpoint's parameter-shape proof.
type ReadCheckpointParams = Parameters<typeof readCheckpoint>;
const _readCheckpointParamsExact: Equal<ReadCheckpointParams, [string]> = true;
void _readCheckpointParamsExact;

// readCheckpoint's return-shape proof: fails to compile if it ever drops the
// `| undefined` arm (the shape ac2's crash-safe resume depends on) or returns
// anything other than ReviewCheckpoint.
type ReadCheckpointReturn = Awaited<ReturnType<typeof readCheckpoint>>;
const _readCheckpointReturnExact: Equal<ReadCheckpointReturn, ReviewCheckpoint | undefined> = true;
void _readCheckpointReturnExact;

// finalizeAndCleanup's parameter-shape proof: fails to compile if it ever narrows
// finalOutput away from `unknown` (this Story does not own the shape of a round's output).
type FinalizeAndCleanupParams = Parameters<typeof finalizeAndCleanup>;
const _finalizeAndCleanupParamsExact: Equal<FinalizeAndCleanupParams, [string, unknown]> = true;
void _finalizeAndCleanupParamsExact;

// finalizeAndCleanup's return-shape proof.
type FinalizeAndCleanupReturn = Awaited<ReturnType<typeof finalizeAndCleanup>>;
const _finalizeAndCleanupReturnExact: Equal<FinalizeAndCleanupReturn, void> = true;
void _finalizeAndCleanupReturnExact;

export function positive(): void {
	const a: ReviewCheckpoint = { reviewId: 'review-1', lastCompletedUnit: { kind: 'round', ref: 1 } };
	const b: ReviewCheckpoint = { reviewId: 'review-1', lastCompletedUnit: { kind: 'task', ref: 't3' } };
	void a; void b;
}

export function negative(checkpoint: ReviewCheckpoint): void {
	// @ts-expect-error ReviewCheckpoint.reviewId is required
	const _c1: ReviewCheckpoint = { lastCompletedUnit: { kind: 'round', ref: 1 } };
	// @ts-expect-error ReviewCheckpoint.lastCompletedUnit is required
	const _c2: ReviewCheckpoint = { reviewId: 'review-1' };
	// @ts-expect-error ReviewCheckpoint has no field named "status"
	const _c3: ReviewCheckpoint = { reviewId: 'review-1', lastCompletedUnit: { kind: 'round', ref: 1 }, status: 'done' };
	// @ts-expect-error ReviewCheckpoint.reviewId is readonly
	checkpoint.reviewId = 'review-2';
	// @ts-expect-error ReviewCheckpoint.lastCompletedUnit is readonly
	checkpoint.lastCompletedUnit = { kind: 'task', ref: 't1' };
	// @ts-expect-error lastCompletedUnit.kind must be 'round' or 'task', not an arbitrary string
	const _c4: ReviewCheckpoint = { reviewId: 'review-1', lastCompletedUnit: { kind: 'phase', ref: 1 } };
	// @ts-expect-error lastCompletedUnit.ref must be number | string, not boolean
	const _c5: ReviewCheckpoint = { reviewId: 'review-1', lastCompletedUnit: { kind: 'round', ref: true } };
}
