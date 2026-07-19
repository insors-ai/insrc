/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tracker ref resolver — the bridge that unifies EVERY identifier form
 * that names a workflow node into one `ResolvedRef`, by reading the
 * committed local artifacts under `<repoPath>/.insrc/artifacts/`
 * (DEF / LLD / PLAN JSON).
 *
 * Accepted identifier forms:
 *
 *   - tracker issue : `#9`, `9`, or `owner/repo#9`  (globally unique)
 *   - structural    : `s1/t3` (task) or `s1` (story) — needs epic scope
 *   - hierarchical  : canonical `E<…>:S001:T003` or slug
 *                     `E<…>-S001-T003` (any level; see `workflow/id.ts`)
 *
 * Disambiguation:
 *
 *   issue#  Scan every PLAN (`taskRefs`), LLD (`storyRef`) and DEF
 *           (`storyRefs` / `epicRef`) for the number; the level is the
 *           one it matched under. Issue numbers are globally unique so a
 *           number resolves to exactly one node.
 *   hierId  `hash8` + `date` locate the epic (the DEF whose `epicHash`
 *           starts with `hash8` AND whose `createdAt` UTC date equals
 *           `date`); the ordinals give the story/task labels.
 *   label   `s1/t3` / `s1` needs epic scope — resolvable only when the
 *           artifacts dir holds EXACTLY ONE epic; otherwise `null` (the
 *           caller must pass an issue# or a hierarchical id instead).
 *
 * Read-only, `node:fs` only.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACTS_DIR } from '../storage.js';
import {
	epicWorkflowId, ordinalToStoryId, ordinalToTaskId, parseWorkflowId,
	storyWorkflowId, taskWorkflowId, toCanonical, toSlug, type WorkflowId,
} from '../id.js';
import { issueNumber } from './refs.js';
import type { PlanTask } from '../artifacts/plan.js';

// ---------------------------------------------------------------------------
// Public record
// ---------------------------------------------------------------------------

export interface ResolvedRef {
	readonly level:      'epic' | 'story' | 'task';
	readonly epicHash:   string;
	readonly epicSlug:   string;
	readonly createdAt:  string;
	readonly storyId?:   string | undefined;
	readonly taskId?:    string | undefined;
	/** Canonical hierarchical id (see `toCanonical`). */
	readonly workflowId: string;
	/** Slug hierarchical id (see `toSlug`). */
	readonly slug:       string;
	/** The tracker issue ref (`owner/repo#N`) at the RESOLVED level:
	 *  task → its taskRef, story → its storyRef, epic → its epicRef. */
	readonly issueRef?:  string | undefined;
	readonly storyRef?:  string | undefined;
	readonly epicRef?:   string | undefined;
	/** The PlanTask, for a task-level ref. */
	readonly task?:      PlanTask | undefined;
}

// ---------------------------------------------------------------------------
// Filename shapes
// ---------------------------------------------------------------------------

const DEF_RE  = /^DEF-([0-9a-f]{16})\.json$/;
const LLD_RE  = /^LLD-([0-9a-f]{16})-(s\d+)\.json$/;
const PLAN_RE = /^PLAN-([0-9a-f]{16})-(s\d+)\.json$/;

// ---------------------------------------------------------------------------
// Minimal artifact reads
// ---------------------------------------------------------------------------

interface TrackerBlock {
	readonly epicRef?:   string;
	readonly storyRef?:  string;
	readonly storyRefs?: Readonly<Record<string, string>>;
	readonly taskRefs?:  Readonly<Record<string, string>>;
}

interface ArtifactShape {
	readonly meta?: {
		readonly epicHash?:  string;
		readonly epicSlug?:  string;
		readonly createdAt?: string;
		readonly storyId?:   string;
		readonly tracker?:   TrackerBlock;
	};
	readonly body?: { readonly tasks?: readonly PlanTask[] };
}

function artifactsDir(repoPath: string): string {
	return join(repoPath, ARTIFACTS_DIR);
}

function readArtifact(path: string): ArtifactShape | null {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as ArtifactShape;
	} catch {
		return null;
	}
}

function listFiles(dir: string): readonly string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

/** Every distinct epic hash present in the artifacts dir (from DEF files). */
function listEpicHashes(dir: string): readonly string[] {
	const hashes: string[] = [];
	for (const f of listFiles(dir)) {
		const m = DEF_RE.exec(f);
		if (m !== null) hashes.push(m[1]!);
	}
	return hashes;
}

// ---------------------------------------------------------------------------
// Builder — (epicHash, storyId?, taskId?) → ResolvedRef
// ---------------------------------------------------------------------------

/** Assemble a `ResolvedRef` for a located node. Returns null when the
 *  epic's DEF artifact is missing (its slug + createdAt are required to
 *  mint the hierarchical id). */
function buildRef(dir: string, epicHash: string, storyId?: string, taskId?: string): ResolvedRef | null {
	const def = readArtifact(join(dir, `DEF-${epicHash}.json`));
	const dmeta = def?.meta;
	if (dmeta === undefined || typeof dmeta.epicSlug !== 'string' || typeof dmeta.createdAt !== 'string') {
		return null;
	}
	const epicSlug  = dmeta.epicSlug;
	const createdAt = dmeta.createdAt;
	const defTracker = dmeta.tracker;

	// Mint the hierarchical ids. A bad createdAt (can't form a UTC date)
	// makes the node unaddressable → null.
	let wfid: WorkflowId;
	try {
		wfid = taskId !== undefined
			? taskWorkflowId(epicHash, createdAt, storyId!, taskId)
			: storyId !== undefined
				? storyWorkflowId(epicHash, createdAt, storyId)
				: epicWorkflowId(epicHash, createdAt);
	} catch {
		return null;
	}

	const epicRef = defTracker?.epicRef ?? readTrackerBlock(join(dir, `HLD-${epicHash}.json`))?.epicRef;

	let storyRef: string | undefined;
	if (storyId !== undefined) {
		storyRef = readTrackerBlock(join(dir, `LLD-${epicHash}-${storyId}.json`))?.storyRef
			?? defTracker?.storyRefs?.[storyId];
	}

	let taskRef: string | undefined;
	let task: PlanTask | undefined;
	if (taskId !== undefined && storyId !== undefined) {
		const plan = readArtifact(join(dir, `PLAN-${epicHash}-${storyId}.json`));
		taskRef = plan?.meta?.tracker?.taskRefs?.[taskId];
		task = plan?.body?.tasks?.find(t => t.id === taskId);
	}

	const level: ResolvedRef['level'] = taskId !== undefined ? 'task' : storyId !== undefined ? 'story' : 'epic';
	const issueRef = level === 'task' ? taskRef : level === 'story' ? storyRef : epicRef;

	return {
		level,
		epicHash,
		epicSlug,
		createdAt,
		...(storyId !== undefined ? { storyId } : {}),
		...(taskId  !== undefined ? { taskId }  : {}),
		workflowId: toCanonical(wfid),
		slug:       toSlug(wfid),
		...(issueRef !== undefined ? { issueRef } : {}),
		...(storyRef !== undefined ? { storyRef } : {}),
		...(epicRef  !== undefined ? { epicRef }  : {}),
		...(task     !== undefined ? { task }     : {}),
	};
}

function readTrackerBlock(path: string): TrackerBlock | undefined {
	return readArtifact(path)?.meta?.tracker;
}

// ---------------------------------------------------------------------------
// Per-form resolution
// ---------------------------------------------------------------------------

/** issue# → node. Scans tasks (PLAN), then stories (LLD + DEF storyRefs),
 *  then epics (DEF / HLD epicRef). */
function resolveByIssue(dir: string, number: string): ResolvedRef | null {
	const files = listFiles(dir);

	// Tasks (globally unique numbers live here most densely).
	for (const f of files) {
		const m = PLAN_RE.exec(f);
		if (m === null) continue;
		const epicHash = m[1]!;
		const storyId  = m[2]!;
		const taskRefs = readArtifact(join(dir, f))?.meta?.tracker?.taskRefs ?? {};
		for (const [taskId, ref] of Object.entries(taskRefs)) {
			if (refNumber(ref) === number) return buildRef(dir, epicHash, storyId, taskId);
		}
	}

	// Stories — LLD storyRef.
	for (const f of files) {
		const m = LLD_RE.exec(f);
		if (m === null) continue;
		const epicHash = m[1]!;
		const storyId  = m[2]!;
		const storyRef = readArtifact(join(dir, f))?.meta?.tracker?.storyRef;
		if (storyRef !== undefined && refNumber(storyRef) === number) return buildRef(dir, epicHash, storyId);
	}

	// Stories + epics — the DEF aggregate (storyRefs) and epicRef.
	for (const f of files) {
		const m = DEF_RE.exec(f);
		if (m === null) continue;
		const epicHash = m[1]!;
		const tracker  = readArtifact(join(dir, f))?.meta?.tracker;
		const storyRefs = tracker?.storyRefs ?? {};
		for (const [storyId, ref] of Object.entries(storyRefs)) {
			if (refNumber(ref) === number) return buildRef(dir, epicHash, storyId);
		}
		if (tracker?.epicRef !== undefined && refNumber(tracker.epicRef) === number) {
			return buildRef(dir, epicHash);
		}
	}

	return null;
}

/** hierId → node. `hash8` + `date` locate the epic; ordinals give labels. */
function resolveByHier(dir: string, wfid: WorkflowId): ResolvedRef | null {
	let epicHash: string | undefined;
	for (const h of listEpicHashes(dir)) {
		if (!h.startsWith(wfid.hash8)) continue;
		const createdAt = readArtifact(join(dir, `DEF-${h}.json`))?.meta?.createdAt;
		if (typeof createdAt !== 'string') continue;
		let d: WorkflowId;
		try { d = epicWorkflowId(h, createdAt); } catch { continue; }
		if (d.date === wfid.date) { epicHash = h; break; }
	}
	if (epicHash === undefined) return null;
	const storyId = wfid.story !== undefined ? ordinalToStoryId(wfid.story) : undefined;
	const taskId  = wfid.task  !== undefined ? ordinalToTaskId(wfid.task)   : undefined;
	return buildRef(dir, epicHash, storyId, taskId);
}

/** label `s1/t3` / `s1` → node. Requires a single-epic artifacts dir. */
function resolveByLabel(dir: string, storyId: string, taskId?: string): ResolvedRef | null {
	const hashes = listEpicHashes(dir);
	if (hashes.length !== 1) return null;   // ambiguous — needs an issue# or hierId
	return buildRef(dir, hashes[0]!, storyId, taskId);
}

// ---------------------------------------------------------------------------
// Identifier-form matchers
// ---------------------------------------------------------------------------

const OWNER_REPO_ISSUE_RE = /^([^/#\s]+)\/([^/#\s]+)#(\d+)$/;
const BARE_ISSUE_RE       = /^#?(\d+)$/;
const LABEL_RE            = /^(s\d+)(?:\/(t\d+))?$/;

/** `owner/repo#N` → `N`. */
function refNumber(ref: string): string {
	try { return issueNumber(ref); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/** Resolve ANY identifier form → a unified `ResolvedRef`, or null when it
 *  can't be located (unknown form, missing artifact, or an ambiguous
 *  label in a multi-epic dir). */
export function resolveWorkflowRef(repoPath: string, identifier: string): ResolvedRef | null {
	if (typeof identifier !== 'string' || identifier.length === 0) return null;
	const id = identifier.trim();
	const dir = artifactsDir(repoPath);
	if (!existsSync(dir)) return null;

	// 1) Hierarchical id (canonical or slug).
	const wfid = parseWorkflowId(id);
	if (wfid !== null) return resolveByHier(dir, wfid);

	// 2) Tracker issue — owner/repo#N.
	const ownerRepo = OWNER_REPO_ISSUE_RE.exec(id);
	if (ownerRepo !== null) return resolveByIssue(dir, ownerRepo[3]!);

	// 3) Tracker issue — #N or N.
	const bare = BARE_ISSUE_RE.exec(id);
	if (bare !== null) return resolveByIssue(dir, bare[1]!);

	// 4) Structural label — s1/t3 or s1.
	const label = LABEL_RE.exec(id);
	if (label !== null) return resolveByLabel(dir, label[1]!, label[2] ?? undefined);

	return null;
}

// ---------------------------------------------------------------------------
// Tiny both-way helpers (tracker/build convenience)
// ---------------------------------------------------------------------------

/** issue number → canonical hierarchical id (or null). */
export function workflowIdForIssue(repoPath: string, issueNumber: number | string): string | null {
	const r = resolveWorkflowRef(repoPath, `#${issueNumber}`);
	return r?.workflowId ?? null;
}

/** hierarchical id → the tracker issue ref at that level (or null). */
export function issueForWorkflowId(repoPath: string, workflowId: string): string | null {
	const r = resolveWorkflowRef(repoPath, workflowId);
	return r?.issueRef ?? null;
}
