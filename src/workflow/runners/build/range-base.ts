/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-93081bff91ae5108 / S001 / t6 — resolving a Story's range base.
 *
 * The base is the start of the Story's COMMITTED range: `base..HEAD` is what the
 * Story changed. It exists because the implement prompt mandates committing
 * before the validate phase runs, so a working-tree-only derivation sees an empty
 * tree exactly when the change set matters.
 *
 * ONE resolver, used by BOTH writers (the validate phase and the completion-time
 * writer), so the two can never disagree about a Story's base.
 *
 * Resolution order, and why:
 *
 *   1. The STAMPED base on the Story's upstream artifact (`meta.rangeBase`,
 *      written at approval). Independent of whether anyone remembered to commit
 *      the artifact, which is the whole point.
 *   2. The commit that INTRODUCED that artifact, found with
 *      `git log --diff-filter=A`. Covers the records written before the stamp
 *      existed, and reproduces the method used by hand to repair bfe98ff7's s4
 *      record.
 *   3. Nothing. LOG and return undefined, which the collector turns into an EMPTY
 *      change set.
 *
 * Step 3 is a DELIBERATE divergence from the shipped code-review grounding chain,
 * which falls back to `HEAD^` and then to git's empty-tree object. A populated
 * wrong answer is worse than an honest absence: `HEAD^` would silently describe
 * "the last commit" as "what this Story changed". This resolver never substitutes
 * a different range, and it never throws — a build must not fail because its
 * provenance could not be derived.
 *
 * A TRIVIAL-route build legitimately reaches step 3: it has no plan and no LLD,
 * so there is no upstream to stamp or to locate. Empty is the specified outcome
 * there, not a failure.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
// Type-only: shares t5's single declaration of `meta.rangeBase` without creating
// a runtime dependency on the approval gate (erased at compile).
import type { ApprovableArtifactMeta } from '../../gates.js';
import { ARTIFACTS_DIR, lldArtifactId, planArtifactId } from '../../storage.js';

const log = getLogger('workflow:build:range-base');

/** The upstream artifacts a build may be anchored on, in precedence order: the
 *  PLAN for a planned Story, the LLD for a standalone (Small) one. */
function upstreamIds(epicHash: string, storyId: string): readonly string[] {
	return [planArtifactId(epicHash, storyId), lldArtifactId(epicHash, storyId)];
}

/** `meta.rangeBase` off an artifact, or undefined when absent/unreadable. */
function stampedBase(repoPath: string, artifactId: string): string | undefined {
	const p = join(repoPath, ARTIFACTS_DIR, `${artifactId}.json`);
	if (!existsSync(p)) return undefined;
	try {
		const meta = (JSON.parse(readFileSync(p, 'utf8')) as { meta?: ApprovableArtifactMeta }).meta;
		const base = meta?.rangeBase;
		return typeof base === 'string' && base.length > 0 ? base : undefined;
	} catch {
		return undefined;
	}
}

/** The commit that ADDED a path, or undefined when the path was never committed
 *  (or git is unavailable). Never throws. */
function introducingCommit(repoPath: string, relPath: string): string | undefined {
	try {
		const out = execFileSync(
			'git', ['log', '--diff-filter=A', '--format=%H', '-1', '--', relPath],
			{ cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
		).trim();
		return /^[0-9a-f]{40}$/.test(out) ? out : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Resolve the Story's range base, or `undefined` when it genuinely cannot be
 * established. Synchronous and read-only; never throws.
 */
export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): string | undefined {
	if (epicHash.length === 0 || storyId.length === 0) return undefined;
	const ids = upstreamIds(epicHash, storyId);

	// 1. The stamped base — preferred, because it does not depend on the artifact
	//    having been committed.
	for (const id of ids) {
		const base = stampedBase(repoPath, id);
		if (base !== undefined) return base;
	}

	// 2. The commit that introduced the upstream artifact. Note this is the base
	//    ITSELF, not its parent: `base..HEAD` excludes base, and the Story's work
	//    lands AFTER the artifact was committed.
	for (const id of ids) {
		const base = introducingCommit(repoPath, `${ARTIFACTS_DIR}/${id}.json`);
		if (base !== undefined) return base;
	}

	// 3. Neither. The only trace a caller gets, since nothing throws.
	log.warn(
		{ repoPath, epicHash, storyId },
		'resolveStoryRangeBase: no stamped base and no introducing commit; the change set will derive from the working tree only',
	);
	return undefined;
}
