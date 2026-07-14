/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic hash — the 16-char canonical identifier every workflow artifact
 * for an Epic carries.
 *
 * Layout of a filename:
 *
 *   DEF-<h16>                 the Epic's Define artifact
 *   HLD-<h16>                 the Epic's HLD (design.epic)
 *   LLD-<h16>-<storyId>       one LLD per Story (design.story)
 *   AMD-<h16>-<n>             one file per amendment (Phase E)
 *   TRK-<h16>-<workflow>-<n>  one file per tracker run (Phase F)
 *
 * `<h16>` is `sha256(defineRunId).slice(0, 16)` — computed once at
 * Define start-time from the deterministic runId the MCP handler
 * minted. Every downstream artifact for that Epic reuses the SAME
 * hash, so `grep -l 'a3f4b8c9d1e2f3a4' .insrc/artifacts/` returns
 * every file belonging to that Epic.
 *
 * The human-readable slug (derived from the Define's focus) lives in
 * `meta.epicSlug` for display. It does NOT appear in filenames.
 */

import { createHash } from 'node:crypto';

export const EPIC_HASH_LENGTH = 16;

/** Regex a valid epic hash matches. Kebab-safe hex. */
export const EPIC_HASH_RE = /^[0-9a-f]{16}$/;

/** Compute the canonical Epic hash from a Define workflow's runId. */
export function computeEpicHash(defineRunId: string): string {
	if (typeof defineRunId !== 'string' || defineRunId.length === 0) {
		throw new Error('computeEpicHash: defineRunId is empty');
	}
	return createHash('sha256').update(defineRunId).digest('hex').slice(0, EPIC_HASH_LENGTH);
}

/** Cheap type guard — used at CLI arg boundaries + IPC ingress. */
export function isEpicHash(v: unknown): v is string {
	return typeof v === 'string' && EPIC_HASH_RE.test(v);
}

/** Assert helper — throws with a consistent message when the arg
 *  isn't a 16-char lowercase hex string. */
export function assertEpicHash(v: unknown, label = 'epicHash'): asserts v is string {
	if (!isEpicHash(v)) {
		throw new Error(
			`${label}: expected a 16-char lowercase hex string (got ${
				typeof v === 'string' ? `'${v}'` : typeof v
			}). Every Epic-scoped artifact is keyed by its 16-char hash.`,
		);
	}
}
