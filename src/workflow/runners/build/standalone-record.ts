/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Standalone BUILD tracking record — the ledger entry for a triage-routed
 * TRIVIAL change.
 *
 * A Trivial feature has no upstream artifact (no DEF/HLD/LLD/plan), so without
 * this its only trace would be the code diff — invisible to the "every feature
 * is tracked" invariant. A Small build is already tracked by its standalone
 * LLD; a Trivial build has nothing but this. The record captures the triage
 * decision + scope at admission time, keyed identically to a normal BUILD
 * artifact (`buildArtifactPaths`). See `plans/feature-triage-router.md`.
 */

import { createHash } from 'node:crypto';

import { writeAtomic, buildArtifactPaths } from '../../storage.js';

export interface StandaloneBuildRecord {
	readonly meta: {
		readonly workflow:  'build';
		readonly standalone: true;
		readonly sizeClass:  string;
		readonly triageRationale?: string | undefined;
		readonly epicHash:   string;
		readonly storyId:    string;
		readonly createdAt:  string;
	};
	readonly body: {
		readonly focus:       string;
		readonly producesLld: boolean;
	};
}

/** Derive a stable 16-char-hex standalone identity from a scope statement, so a
 *  Trivial build with no caller-provided epicHash keys deterministically. */
export function standaloneEpicHashFromFocus(focus: string): string {
	return createHash('sha256').update(focus).digest('hex').slice(0, 16);
}

/** Render a minimal markdown for the record (human-readable ledger entry). */
export function renderStandaloneBuildRecordMd(rec: StandaloneBuildRecord): string {
	return [
		`# Build (standalone ${rec.meta.sizeClass}) — Story ${rec.meta.storyId}`,
		'',
		`**Size class:** ${rec.meta.sizeClass}  ·  **Standalone:** yes  ·  **Created:** ${rec.meta.createdAt}`,
		'',
		'## Scope',
		'',
		rec.body.focus,
		...(rec.meta.triageRationale !== undefined
			? ['', '## Triage rationale', '', rec.meta.triageRationale]
			: []),
		'',
	].join('\n');
}

/** Persist the standalone BUILD record (json + md) via `buildArtifactPaths`. */
export function persistStandaloneBuildRecord(repoPath: string, rec: StandaloneBuildRecord): { md: string; json: string } {
	const paths = buildArtifactPaths(repoPath, rec.meta.epicHash, rec.meta.storyId);
	writeAtomic(paths.json, JSON.stringify(rec, null, 2) + '\n');
	writeAtomic(paths.md, renderStandaloneBuildRecordMd(rec));
	return paths;
}
