/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * "Effective HLD" — the base HLD artifact with every approved
 * amendment applied in approvedAt order. This is what downstream
 * workflows read; the raw base is never returned directly by the
 * public gate helpers.
 *
 * The effective hash is stable — `computeHldEffectiveHash(baseRunId,
 * amendmentIds)` is deterministic — so LLDs anchored to a
 * particular effective state can detect drift by re-computing and
 * comparing.
 */

import { computeHldEffectiveHash } from '../artifacts/lld.js';
import type { HldArtifact } from '../artifacts/hld.js';

import { applyAmendments } from './applier.js';
import { listApprovedAmendments } from './store.js';

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** Given a base HLD artifact + its Epic hash, return the effective
 *  HLD: base + every approved amendment applied in approvedAt order.
 *
 *  The meta of the returned artifact stays anchored to the BASE
 *  runId; only `body` reflects the amendments. That way LLDs read
 *  the base + can re-derive the same body deterministically from
 *  the amendment set. */
export function getEffectiveHld(
	repoPath:     string,
	epicHash:     string,
	baseArtifact: HldArtifact,
): HldArtifact {
	const amendments = listApprovedAmendments(repoPath, epicHash);
	if (amendments.length === 0) return baseArtifact;
	return {
		...baseArtifact,
		body: applyAmendments(baseArtifact.body, amendments),
	};
}

/** Compute the current effective hash for the Epic. Reads the
 *  approved-amendment list from disk. */
export function getEffectiveHash(
	repoPath:     string,
	epicHash:     string,
	baseArtifact: HldArtifact,
): string {
	const amendments = listApprovedAmendments(repoPath, epicHash);
	return computeHldEffectiveHash(baseArtifact.meta.runId, amendments.map(a => a.id));
}

// Re-exports so callers only need to import from this module.
export { applyAmendments, computeHldEffectiveHash };
