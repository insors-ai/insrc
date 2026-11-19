/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The round-driver's own shapes (HLD sc1, owned by this Story). RoundDriverHooks
 * is the only thing legitimately differing per review type -- the grounding call,
 * checkpoint granularity, and an optional nested security pass -- everything else
 * about running a round is identical regardless of reviewKind.
 */

import type { ReviewTargets } from '../artifact-core/types.js';

export type ReviewKind = 'design' | 'code';

/** The per-review-type hook set runReviewRound consumes. F is left generic so
 *  this Story does not own Finding's shape (that is the taxonomy Story's contract). */
export interface RoundDriverHooks<F = unknown> {
	readonly reviewKind:             ReviewKind;
	readonly checkpointGranularity:  'round' | 'task';
	ground(targets: ReviewTargets, round: number): Promise<readonly F[]>;
	security?: (targets: ReviewTargets, round: number) => Promise<readonly F[]>;
}

/** One round's self-contained finding set, with any nested security pass's
 *  findings merged in -- never a separate channel, never a third reviewKind. */
export interface RoundResult<F = unknown> {
	readonly round:    number;
	readonly findings: readonly F[];
}
