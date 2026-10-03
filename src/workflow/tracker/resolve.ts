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
	storyIdToOrdinal, storyWorkflowId, taskWorkflowId, toCanonical, toSlug,
	type WorkflowId,
} from '../id.js';
import { issueNumber } from './refs.js';
import type { PlanTask } from '../artifacts/plan.js';
import type { DefineStory } from '../artifacts/define.js';

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
/** A bugfix chain writes no DEF — its epic-level anchor is the ISSUE artifact,
 *  whose meta carries the same `epicSlug` + `createdAt` the hierarchical id
 *  needs. Consulted only where a DEF is absent, so DEF-bearing epics are
 *  unaffected. */
const ISSUE_RE = /^ISSUE-([0-9a-f]{16})\.json$/;
// Story ids come in two shapes: the epic route mints `s1`..`s9`, the
// standalone/bugfix route mints `S001`. Both must match, or a bugfix story is
// unresolvable by issue number.
const LLD_RE  = /^LLD-([0-9a-f]{16})-([sS]\d+)\.json$/;
const PLAN_RE = /^PLAN-([0-9a-f]{16})-([sS]\d+)\.json$/;

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
	readonly body?: {
		readonly tasks?:   readonly PlanTask[];
		/** A DEF declares its stories here. Added for the story-existence check
		 *  (S001/t2); an ISSUE has no analogue, which is why the check reads the
		 *  definition artifact's KIND rather than this field alone. */
		readonly stories?: readonly DefineStory[];
	};
}

/** The epic-level identity a hierarchical id is minted from, narrowed to the
 *  fields that must be present — so the builder reads them without assertions. */
interface EpicIdentity {
	readonly epicSlug:  string;
	readonly createdAt: string;
	readonly tracker?:  TrackerBlock | undefined;
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

/** Every distinct epic hash present in the artifacts dir — from DEF files, plus
 *  ISSUE files for a bugfix chain, which writes no DEF. Without the ISSUE pass a
 *  bugfix epic is INVISIBLE here, so `resolveByLabel`/`resolveByHier` find zero
 *  hashes and refuse before `buildRef` is ever reached. DEF hashes come first and
 *  a hash present as both is listed once, so ordering + membership are unchanged
 *  for every DEF-bearing epic. */
function listEpicHashes(dir: string): readonly string[] {
	const hashes: string[] = [];
	const seen = new Set<string>();
	const files = listFiles(dir);
	for (const f of files) {
		const m = DEF_RE.exec(f);
		if (m !== null && !seen.has(m[1]!)) { seen.add(m[1]!); hashes.push(m[1]!); }
	}
	for (const f of files) {
		const m = ISSUE_RE.exec(f);
		if (m !== null && !seen.has(m[1]!)) { seen.add(m[1]!); hashes.push(m[1]!); }
	}
	return hashes;
}

// ---------------------------------------------------------------------------
// Builder — (epicHash, storyId?, taskId?) → ResolvedRef
// ---------------------------------------------------------------------------

/** The epic's identity (slug + creation anchor) for hierarchical-id minting.
 *  Prefers the DEF; falls back to the ISSUE artifact a bugfix chain writes
 *  instead. Deterministic by construction — the DEF is consulted FIRST and wins
 *  outright whenever it is usable, so the resolver never has to choose between
 *  two anchors that both exist. */
function readEpicIdentity(dir: string, epicHash: string): EpicIdentity | null {
	for (const name of [`DEF-${epicHash}.json`, `ISSUE-${epicHash}.json`]) {
		const meta = readArtifact(join(dir, name))?.meta;
		if (meta !== undefined && typeof meta.epicSlug === 'string' && typeof meta.createdAt === 'string') {
			return { epicSlug: meta.epicSlug, createdAt: meta.createdAt, tracker: meta.tracker };
		}
	}
	return null;
}

/** The epic's DEFINITION artifact plus which kind it turned out to be.
 *
 *  An ISSUE **is** a DEF — the epic-level definition artifact, formerly named
 *  DEF — so both kinds answer the same question and the read ORDER is the only
 *  thing that distinguishes them. That is why `kind` is derived from which read
 *  succeeded rather than from any field: reaching the ISSUE means this epic has
 *  no usable DEF. `meta.standalone` is deliberately NOT consulted; it describes
 *  the ROUTE, not the artifact kind (an LLD carries it both ways). */
interface EpicDefinition {
	readonly kind:     'def' | 'issue';
	readonly artifact: ArtifactShape;
}

/** Read the epic's definition artifact: `DEF-<hash>.json` first, then
 *  `ISSUE-<hash>.json`. Returns null when neither is readable.
 *
 *  The order is COPIED FROM {@link readEpicIdentity}, not newly decided, so the
 *  two readers can never disagree about which artifact defines an epic — and
 *  because {@link readArtifact} yields null on a malformed file, the rule is
 *  first-READABLE-wins: a corrupt DEF falls through to the ISSUE rather than
 *  aborting. readEpicIdentity itself cannot be reused here: it returns only
 *  {epicSlug, createdAt, tracker}, and the story-existence check needs the BODY.
 *
 *  Consumed by {@link storyExists} (S001/t3) to decide whether a named story
 *  exists. Never throws. */
export function readEpicDefinition(dir: string, epicHash: string): EpicDefinition | null {
	for (const [kind, name] of [
		['def',   `DEF-${epicHash}.json`],
		['issue', `ISSUE-${epicHash}.json`],
	] as const) {
		const artifact = readArtifact(join(dir, name));
		if (artifact !== null) return { kind, artifact };
	}
	return null;
}

/** Path to a story-scoped artifact (`LLD` / `PLAN`), tolerant of the two story-id
 *  spellings in play: the epic route names files `-s1.json`, the standalone/bugfix
 *  route names them `-S001.json`, and the hierarchical id form always yields the
 *  lowercase label. The exact name is tried FIRST — so every existing lookup keeps
 *  its current single-stat fast path — and only on a miss does it scan for a
 *  sibling whose story segment denotes the same ORDINAL. */
function storyArtifactPath(dir: string, prefix: 'LLD' | 'PLAN', epicHash: string, storyId: string, files?: readonly string[]): string {
	const exact = join(dir, `${prefix}-${epicHash}-${storyId}.json`);
	if (existsSync(exact)) return exact;
	let want: number;
	try { want = storyIdToOrdinal(storyId); } catch { return exact; }
	const re = prefix === 'LLD' ? LLD_RE : PLAN_RE;
	for (const f of files ?? listFiles(dir)) {
		const m = re.exec(f);
		if (m === null || m[1] !== epicHash) continue;
		try { if (storyIdToOrdinal(m[2]!) === want) return join(dir, f); } catch { continue; }
	}
	return exact;   // unchanged miss — callers treat a bad path as "absent"
}

/** HOW an epic evidences a story.
 *
 *    `artifact` — a story-scoped LLD or PLAN exists for the ordinal.
 *    `declared` — the epic's DEF names the story in `body.stories`.
 *    `implied`  — an ISSUE-anchored epic, which declares no story list at all,
 *                 is taken to have exactly one story at ordinal 1 by the
 *                 standalone/bugfix convention.
 *
 *  These are three KINDS but only TWO ranks. `artifact` and `declared` are both
 *  EXPLICIT — something on disk names this story — and {@link resolveByLabel}
 *  treats them as ONE tier; it does not prefer a built story over a merely
 *  declared one. `implied` ranks below both, because every bugfix epic in a repo
 *  satisfies it identically and so it can never single one out.
 *
 *  Whether `artifact` should outrank `declared` is an open question, deliberately
 *  not decided here: it would change which epic wins when one has built the story
 *  and another has only defined it, and no requirement calls for that today. */
type StoryEvidence = 'artifact' | 'declared' | 'implied';

/** Evidence ranks that count as explicit, i.e. outrank the bare convention. */
const EXPLICIT_EVIDENCE: ReadonlySet<StoryEvidence> = new Set<StoryEvidence>(['artifact', 'declared']);

/** Whether `storyId` names a story that actually EXISTS under `epicHash`.
 *
 *  Two independent clauses, either of which suffices:
 *
 *    1. a story-scoped artifact (LLD or PLAN) resolves for the ordinal, via the
 *       existing {@link storyArtifactPath} — so the two story-id spellings and
 *       the ordinal-scan fallback are inherited rather than reimplemented;
 *    2. the epic's definition artifact DECLARES it — a DEF through
 *       `body.stories`, an ISSUE as exactly one story at ordinal 1 (the
 *       documented standalone/bugfix convention).
 *
 *  Clause 1 is evaluated FIRST and without reading the definition artifact, so
 *  degradation is PER-CLAUSE: a corrupt or absent DEF never disqualifies an
 *  epic whose LLD for the story is intact. Clause 2 covers the inverse window —
 *  a story declared by a Define (or a just-approved bugfix) that has no LLD and
 *  no PLAN yet.
 *
 *  Never throws: an unparseable story label is a refusal, not an exception,
 *  because no consumer of this module has a handler. */
function storyEvidence(dir: string, epicHash: string, storyId: string, files?: readonly string[]): StoryEvidence | null {
	let want: number;
	try { want = storyIdToOrdinal(storyId); } catch { return null; }

	for (const prefix of ['LLD', 'PLAN'] as const) {
		if (existsSync(storyArtifactPath(dir, prefix, epicHash, storyId, files))) return 'artifact';
	}

	const def = readEpicDefinition(dir, epicHash);
	if (def === null) return null;
	// An ISSUE declares no story list — the bugfix route is one story at ordinal 1.
	if (def.kind === 'issue') return want === 1 ? 'implied' : null;
	for (const story of def.artifact.body?.stories ?? []) {
		try { if (storyIdToOrdinal(story.id) === want) return 'declared'; } catch { continue; }
	}
	return null;
}

/** Whether the story exists at all — any evidence will do. */
function storyExists(dir: string, epicHash: string, storyId: string): boolean {
	return storyEvidence(dir, epicHash, storyId) !== null;
}

/** Assemble a `ResolvedRef` for a located node. Returns null when NEITHER the
 *  epic's DEF nor its ISSUE artifact yields a slug + createdAt (both are
 *  required to mint the hierarchical id). */
function buildRef(dir: string, epicHash: string, storyId?: string, taskId?: string): ResolvedRef | null {
	const dmeta = readEpicIdentity(dir, epicHash);
	if (dmeta === null) {
		return null;
	}

	// No dummy refs: a story-or-task-level reference is minted only for a story
	// that EXISTS. Gated on `storyId` being supplied, so epic-level calls — and
	// resolveByIssue's epic sub-case — are entirely unaffected. Deliberately NOT
	// extended to `taskId`: an unknown task leaves `task` absent, as before.
	if (storyId !== undefined && !storyExists(dir, epicHash, storyId)) {
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
		storyRef = readTrackerBlock(storyArtifactPath(dir, 'LLD', epicHash, storyId))?.storyRef
			?? defTracker?.storyRefs?.[storyId];
	}

	let taskRef: string | undefined;
	let task: PlanTask | undefined;
	if (taskId !== undefined && storyId !== undefined) {
		const plan = readArtifact(storyArtifactPath(dir, 'PLAN', epicHash, storyId));
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
		const createdAt = readEpicIdentity(dir, h)?.createdAt;
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

/** label `s1/t3` / `s1` → node. Requires a single-epic artifacts dir, OR a
 *  caller-provided `epicHash` scope that uniquely names a present epic. */
function resolveByLabel(dir: string, storyId: string, taskId?: string, epicHash?: string): ResolvedRef | null {
	const hashes = listEpicHashes(dir);
	if (epicHash !== undefined) {
		// Scoped: prefix-match the provided hash against the present epics
		// (mirroring resolveByHier's `hash8` startsWith match). Exactly one
		// match resolves via buildRef; zero or >1 matches → null (refuse to
		// guess — the caller must pass a longer/full hash).
		const matches = hashes.filter(h => h.startsWith(epicHash));
		if (matches.length !== 1) return null;
		return buildRef(dir, matches[0]!, storyId, taskId);
	}
	// Unscoped: attempt a reference per candidate epic and keep the ones that
	// actually RESOLVE. COUNTING epics was the defect — a second epic that does
	// not contain the label made an otherwise unambiguous label unresolvable,
	// which is what surfaced once a bugfix ISSUE became a visible epic peer.
	//
	// Candidate selection and reference construction are deliberately the SAME
	// operation: a candidate qualifies precisely because buildRef succeeded for
	// it, so t3's story verification IS the containment test and there is no
	// second notion of "contains the story" that could drift out of sync.
	//
	// Genuine ambiguity still refuses: two epics that BOTH evidence the label
	// yield two references and the caller must disambiguate with an issue#,
	// a hierarchical id, or an explicit epicHash scope.
	//
	// Candidates are TIERED by how strongly the epic evidences the story,
	// because the three evidence ranks are not equally informative. Every
	// ISSUE-anchored epic `implies` a story at ordinal 1, so a flat count would
	// make a bare `s1` ambiguous in any repo holding two bugfixes — and would
	// let an unrelated bugfix shadow a DEF epic that actually ships s1. Explicit
	// evidence therefore wins outright when it is unique; the convention is
	// consulted only when nothing explicit answers.
	// Candidacy is decided by EVIDENCE ALONE, and only the winner is built.
	// Building every candidate first would cost a handful of file reads per epic
	// to construct references that are then discarded — and it would let an epic
	// with real evidence but unusable identity vanish from the tally, silently
	// turning genuine ambiguity into a confident answer. Evidence decides who
	// competes; a winner that cannot be built is a refusal, not a hand-off to
	// the runner-up.
	// The directory listing is read ONCE and reused across every candidate.
	// storyArtifactPath falls back to a listing scan whenever the exact filename
	// misses, which is the common case here, so without this the whole artifacts
	// dir was re-read twice per epic.
	const files = listFiles(dir);
	const candidates: { readonly hash: string; readonly evidence: StoryEvidence }[] = [];
	for (const h of hashes) {
		const evidence = storyEvidence(dir, h, storyId, files);
		if (evidence !== null) candidates.push({ hash: h, evidence });
	}
	for (const explicit of [true, false]) {
		const tier = candidates.filter(c => EXPLICIT_EVIDENCE.has(c.evidence) === explicit);
		// A tie WITHIN a tier is genuine ambiguity and refuses outright — it must
		// not fall through to a weaker tier and be resolved by accident.
		if (tier.length > 1) return null;
		if (tier.length === 1) return buildRef(dir, tier[0]!.hash, storyId, taskId);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Identifier-form matchers
// ---------------------------------------------------------------------------

const OWNER_REPO_ISSUE_RE = /^([^/#\s]+)\/([^/#\s]+)#(\d+)$/;
const BARE_ISSUE_RE       = /^#?(\d+)$/;
// Accepts BOTH story-id shapes, matching LLD_RE/PLAN_RE: `s1/t3` from the epic
// route and `S001/t3` from the standalone/bugfix route. Lowercase-only here made
// the bugfix route's own story id an unparseable target.
const LABEL_RE            = /^([sS]\d+)(?:\/(t\d+))?$/;

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
export function resolveWorkflowRef(repoPath: string, identifier: string, opts?: { readonly epicHash?: string | undefined }): ResolvedRef | null {
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
	if (label !== null) return resolveByLabel(dir, label[1]!, label[2] ?? undefined, opts?.epicHash);

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
