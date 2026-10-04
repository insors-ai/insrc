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
 *
 * ISSUE-5f7a7cb95b643ae5 — step 0, the BUILD-START file. The approval-time stamp
 * is taken once per approval, so Stories approved in one sweep shared a base and a
 * later Story's range swallowed its siblings' commits. A per-Story file under
 * `.insrc/build-start/`, written when that Story's build begins, is consulted
 * FIRST. It is deliberately not an artifact: it sits outside `.insrc/artifacts`,
 * carries no artifact id, and the approval sweep cannot see it. Steps 1-3 are
 * untouched, so a Story with no such file resolves exactly as before.
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

/** Where build-start files live — a sibling of the artifact store, not inside it. */
const BUILD_START_DIR = '.insrc/build-start';

/** Repo-relative path of a Story's build-start file. The ONE place the path is
 *  formed: the reader here, the stamper, and the BUILD writers (which exclude it
 *  from their change sets) all call this, so they cannot drift apart. `storyId` is
 *  used verbatim, exactly as the BUILD record's id uses it. */
export function buildStartRelPath(epicHash: string, storyId: string): string {
	return `${BUILD_START_DIR}/${epicHash}-${storyId}.json`;
}

/** The content of a build-start file. Plain json so a person can write or correct
 *  one by hand; any file with these four fields that passes {@link readBuildStart}
 *  is accepted, whoever wrote it. */
export interface BuildStartStamp {
	readonly epicHash:  string;
	readonly storyId:   string;
	/** Full 40-hex sha of the commit the Story's build started from. */
	readonly rangeBase: string;
	/** ISO time the stamp was taken. */
	readonly stampedAt: string;
}

/** `absent` and `invalid` are kept apart because callers treat them differently
 *  in their logs, and because only `invalid` is worth a warning. */
export type BuildStartRead =
	| { readonly kind: 'absent' }
	| { readonly kind: 'invalid'; readonly reason: string }
	| { readonly kind: 'valid'; readonly stamp: BuildStartStamp };

const SHA40 = /^[0-9a-f]{40}$/;

/** Whether `sha` names a commit this repository still has. Never throws. */
function commitExists(repoPath: string, sha: string): boolean {
	try {
		execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repoPath, stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

/**
 * Read a Story's build-start file. The single reader shared by the resolver and
 * the stamper, so the two agree on what counts as a usable stamp. Never throws.
 *
 * A stamp is VALID only when all four fields are present and well-formed, it
 * names THIS Story, and its commit still exists. Anything else is `invalid` with
 * a reason — a stamp that cannot be trusted must not supply a range base.
 */
export function readBuildStart(repoPath: string, epicHash: string, storyId: string): BuildStartRead {
	const p = join(repoPath, buildStartRelPath(epicHash, storyId));
	if (!existsSync(p)) return { kind: 'absent' };
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(p, 'utf8'));
	} catch (err) {
		return { kind: 'invalid', reason: `unreadable or not json: ${err instanceof Error ? err.message : String(err)}` };
	}
	if (typeof parsed !== 'object' || parsed === null) return { kind: 'invalid', reason: 'not a json object' };
	const o = parsed as Record<string, unknown>;
	if (o['epicHash'] !== epicHash || o['storyId'] !== storyId) return { kind: 'invalid', reason: 'names a different Story' };
	const rangeBase = o['rangeBase'];
	if (typeof rangeBase !== 'string' || !SHA40.test(rangeBase)) return { kind: 'invalid', reason: 'rangeBase is not a 40-hex sha' };
	const stampedAt = o['stampedAt'];
	if (typeof stampedAt !== 'string' || Number.isNaN(Date.parse(stampedAt))) return { kind: 'invalid', reason: 'stampedAt is not a time' };
	if (!commitExists(repoPath, rangeBase)) return { kind: 'invalid', reason: 'rangeBase names a commit this repository does not have' };
	return { kind: 'valid', stamp: { epicHash, storyId, rangeBase, stampedAt } };
}

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
		return SHA40.test(out) ? out : undefined;
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

	// 0. The Story's own build-start file. An invalid one is IGNORED, not fatal:
	//    resolution carries on with the steps below, which is what this Story
	//    resolved to before the file existed.
	const start = readBuildStart(repoPath, epicHash, storyId);
	if (start.kind === 'valid') return start.stamp.rangeBase;
	if (start.kind === 'invalid') {
		log.warn(
			{ repoPath, epicHash, storyId, reason: start.reason },
			'resolveStoryRangeBase: ignoring an invalid build-start file; resolving from the upstream artifact instead',
		);
	}

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
