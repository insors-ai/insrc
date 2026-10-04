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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
// Type-only: shares t5's single declaration of `meta.rangeBase` without creating
// a runtime dependency on the approval gate (erased at compile).
import type { ApprovableArtifactMeta } from '../../gates.js';
import { ARTIFACTS_DIR, buildArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';

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

// ---------------------------------------------------------------------------
// Stamping (ISSUE-5f7a7cb95b643ae5 S001/t4)
// ---------------------------------------------------------------------------

/** What {@link stampBuildStart} did. */
export type StampOutcome =
	/** The file now holds HEAD's full sha. */
	| 'stamped'
	/** A valid stamp exists and was left alone. */
	| 'kept'
	/** No valid stamp, and the BUILD record shows unfinished work — HEAD may
	 *  already contain that work, so nothing was written. */
	| 'skipped-work-exists'
	/** HEAD could not be resolved, or the file could not be written. */
	| 'not-written';

/** What the stamper needs to know about a Story's BUILD record. */
interface BuildFacts {
	/** A record json is on disk, readable or not. */
	readonly exists:     boolean;
	/** The record could not be parsed into the shape below. */
	readonly unreadable: boolean;
	readonly approvedAt: string | undefined;
	readonly tasks:      ReadonlyArray<{ readonly id: string; readonly passed: boolean }>;
}

/** Read the BUILD record DIRECTLY (as `stampedBase` reads an upstream artifact)
 *  rather than through the gates module: gates imports the completion writer,
 *  which imports this file, so a runtime import here would be a cycle. */
function readBuildFacts(repoPath: string, epicHash: string, storyId: string): BuildFacts {
	const p = join(repoPath, ARTIFACTS_DIR, `${buildArtifactId(epicHash, storyId)}.json`);
	if (!existsSync(p)) return { exists: false, unreadable: false, approvedAt: undefined, tasks: [] };
	try {
		const parsed = JSON.parse(readFileSync(p, 'utf8')) as { meta?: { approvedAt?: unknown }; body?: { tasks?: unknown } };
		const approvedAt = typeof parsed.meta?.approvedAt === 'string' && parsed.meta.approvedAt.length > 0 ? parsed.meta.approvedAt : undefined;
		const rawTasks = parsed.body?.tasks;
		if (rawTasks !== undefined && !Array.isArray(rawTasks)) return { exists: true, unreadable: true, approvedAt, tasks: [] };
		const tasks: Array<{ id: string; passed: boolean }> = [];
		for (const t of rawTasks ?? []) {
			const id = (t as { id?: unknown } | null)?.id;
			if (typeof id !== 'string') return { exists: true, unreadable: true, approvedAt, tasks: [] };
			// `passed` is optional on the record; only a literal true counts.
			tasks.push({ id, passed: (t as { passed?: unknown }).passed === true });
		}
		return { exists: true, unreadable: false, approvedAt, tasks };
	} catch {
		return { exists: true, unreadable: true, approvedAt: undefined, tasks: [] };
	}
}

/** The Story's plan task ids: `none` when it has no PLAN (a standalone build),
 *  `unreadable` when a PLAN json exists but cannot be read into task ids. */
function readPlanTaskIds(repoPath: string, epicHash: string, storyId: string): readonly string[] | 'none' | 'unreadable' {
	const p = join(repoPath, ARTIFACTS_DIR, `${planArtifactId(epicHash, storyId)}.json`);
	if (!existsSync(p)) return 'none';
	try {
		const tasks = (JSON.parse(readFileSync(p, 'utf8')) as { body?: { tasks?: unknown } }).body?.tasks;
		if (!Array.isArray(tasks)) return 'unreadable';
		const ids: string[] = [];
		for (const t of tasks) {
			const id = (t as { id?: unknown } | null)?.id;
			if (typeof id !== 'string') return 'unreadable';
			ids.push(id);
		}
		return ids;
	} catch {
		return 'unreadable';
	}
}

/**
 * Whether the Story's build is FINISHED: the ONE test both stamping branches use.
 *
 * Approval alone is not enough. The batch approval sweep approves every
 * unapproved BUILD record under an epic, including one whose Story has validated
 * one task of several, or whose task failed — so `approvedAt` can precede the end
 * of the build. FINISHED therefore also requires that the record shows the work
 * done: at least one task, every task passed, and the plan covered.
 *
 * Coverage is satisfied by every plan task id being recorded, OR by a recorded
 * task whose id is the storyId: that is what the standalone validate route
 * records, and it validates the Story as a whole. Plan task ids are the bare
 * `tN` form and can never equal a storyId, so the two cannot be confused.
 *
 * Every doubt resolves to NOT finished, which keeps the base where it is. The
 * cost of a false negative is a rebuild that lists too much; the cost of a false
 * positive is a base moved onto the Story's own commits, which drops its files.
 */
function isFinished(facts: BuildFacts, plan: readonly string[] | 'none' | 'unreadable', storyId: string): boolean {
	if (!facts.exists || facts.unreadable) return false;
	if (facts.approvedAt === undefined) return false;
	if (facts.tasks.length === 0) return false;
	if (!facts.tasks.every(t => t.passed)) return false;
	if (plan === 'unreadable') return false;
	if (plan === 'none') return true;
	const recorded = new Set(facts.tasks.map(t => t.id));
	return recorded.has(storyId) || plan.every(id => recorded.has(id));
}

/** HEAD's full sha, or undefined when there is no HEAD (no commits, not a repo). */
function headFullSha(repoPath: string): string | undefined {
	try {
		const out = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		return SHA40.test(out) ? out : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Record where a Story's build starts. Called by the implement phase on every
 * admitted route; synchronous, never throws, and never touches an artifact
 * record. Its caller treats it as fail-open: no outcome blocks a build.
 *
 *   Valid stamp present → replaced only when the build is FINISHED and was
 *     approved AFTER the stamp was taken (a rebuild); otherwise `kept`. A retry,
 *     the next task, or an approval that arrives mid-build all keep it.
 *   No valid stamp → nothing is written when the record has a task and the build
 *     is not FINISHED, approved or not: HEAD may already hold that work. With no
 *     record, a task-less record, or a FINISHED build, HEAD is stamped.
 *
 * So no state in which the record shows unfinished work puts HEAD in the stamp.
 * A record that exists but cannot be read counts as unfinished work.
 */
export function stampBuildStart(repoPath: string, epicHash: string, storyId: string): StampOutcome {
	try {
		if (epicHash.length === 0 || storyId.length === 0) return 'not-written';
		const read  = readBuildStart(repoPath, epicHash, storyId);
		const facts = readBuildFacts(repoPath, epicHash, storyId);
		const finished = isFinished(facts, readPlanTaskIds(repoPath, epicHash, storyId), storyId);

		if (read.kind === 'valid') {
			// A NaN on either side compares false, so an unparseable approvedAt keeps.
			const rebuilt = finished && Date.parse(facts.approvedAt ?? '') > Date.parse(read.stamp.stampedAt);
			if (!rebuilt) return 'kept';
		} else {
			const showsWork = facts.unreadable || facts.tasks.length > 0;
			if (showsWork && !finished) return 'skipped-work-exists';
		}

		const head = headFullSha(repoPath);
		if (head === undefined) {
			log.warn({ repoPath, epicHash, storyId }, 'stampBuildStart: HEAD could not be resolved; no build-start file written');
			return 'not-written';
		}
		const stamp: BuildStartStamp = { epicHash, storyId, rangeBase: head, stampedAt: new Date().toISOString() };
		const abs = join(repoPath, buildStartRelPath(epicHash, storyId));
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, JSON.stringify(stamp, null, 2) + '\n');
		return 'stamped';
	} catch (err) {
		log.warn(
			{ repoPath, epicHash, storyId, path: buildStartRelPath(epicHash, storyId), err: err instanceof Error ? err.message : String(err) },
			'stampBuildStart: could not write the build-start file',
		);
		return 'not-written';
	}
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
