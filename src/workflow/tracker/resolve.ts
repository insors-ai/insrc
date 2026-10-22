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
 *   - artifact id   : any id `ArtifactIds.parse` reads (`EPIC-<h>`, `STORY-<h>-s1`,
 *                     `TASK-<h>-s1-t3`, `LLD-<h>-s1`, ...; see `workflow/artifact-ids.ts`).
 *                     A work-item id (`E<date><hash8>:S001`) and an uppercase label
 *                     are not ids and resolve to null.
 *
 * Disambiguation:
 *
 *   issue#  Scan every PLAN (`taskRefs`), LLD (`storyRef`) and DEF
 *           (`storyRefs` / `epicRef`) for the number; the level is the
 *           one it matched under. Issue numbers are globally unique so a
 *           number resolves to exactly one node.
 *   artifact id  The id names the work item by its epic hash (a SPEC or ISSUE id
 *           carries a shorter hash, matched as a prefix of exactly one present
 *           work item) and carries the story and task labels directly.
 *   label   `s1/t3` / `s1` needs epic scope — resolvable only when the
 *           artifacts dir holds EXACTLY ONE epic; otherwise `null` (the
 *           caller must pass an issue# or a hierarchical id instead).
 *
 * Read-only, `node:fs` only.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACTS_DIR, readEpicDefinitionCore, type TrackerBlock } from '../storage.js';
import { ArtifactIds, type ArtifactKey } from '../artifact-ids.js';
import { issueNumber } from './refs.js';
import { taskHeadsIn } from '../tasks/lookup.js';
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
	/** The artifact id of the resolved node: `EPIC-<h>`, `STORY-<h>-s1` or `TASK-<h>-s1-t3`. */
	readonly workflowId: string;
	/** The locator-facing name of the same node. It holds the same artifact id, so a
	 *  `WorkItemRef.slug` round-trips through `resolveWorkflowRef`. */
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
// Every route mints the lowercase `s<n>` story id; an uppercase file name is not an artifact until the s9 conversion.
const LLD_RE  = /^LLD-([0-9a-f]{16})-(s\d+)\.json$/;
const TASK_RE = /^TASK-([0-9a-f]{16})-(s\d+)-t\d+\.json$/;

// ---------------------------------------------------------------------------
// Minimal artifact reads
// ---------------------------------------------------------------------------


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

/** One work item present in the artifacts dir, and whether only an LLD heads it. */
interface EpicHead {
	readonly hash:       string;
	/** True when the work item has an LLD and neither a DEF nor an ISSUE. */
	readonly lldHeaded:  boolean;
}

/** Every distinct work item present in the artifacts dir — from DEF files, plus
 *  ISSUE files for a bugfix chain, which writes no DEF, plus (ISSUE-c00559b7)
 *  LLD files for a standalone feature, which writes neither. Without a pass a
 *  work item is INVISIBLE here, so `resolveByLabel`/`resolveByHier` find no hash
 *  and refuse before `buildRef` is ever reached. DEF hashes come first, then
 *  ISSUE, then LLD-only, and a hash is listed once, so ordering + membership are
 *  unchanged for every DEF- or ISSUE-bearing work item. */
function listEpicHeads(dir: string): readonly EpicHead[] {
	const heads: EpicHead[] = [];
	const seen = new Set<string>();
	const files = listFiles(dir);
	for (const [re, lldHeaded] of [[DEF_RE, false], [ISSUE_RE, false], [LLD_RE, true]] as const) {
		for (const f of files) {
			const m = re.exec(f);
			if (m !== null && !seen.has(m[1]!)) { seen.add(m[1]!); heads.push({ hash: m[1]!, lldHeaded }); }
		}
	}
	return heads;
}

function listEpicHashes(dir: string): readonly string[] {
	return listEpicHeads(dir).map(h => h.hash);
}

// ---------------------------------------------------------------------------
// Builder — (epicHash, storyId?, taskId?) → ResolvedRef
// ---------------------------------------------------------------------------

/** The work item's identity (slug + creation anchor) for hierarchical-id
 *  minting, taken from the same head storage's {@link readEpicDefinitionCore}
 *  selects: the DEF, else the ISSUE a bugfix chain writes, else the LLD of a
 *  standalone feature (ISSUE-c00559b7). The head ORDER lives only there, so the
 *  resolver and folder naming cannot disagree about which artifact heads a work
 *  item. Null when there is no head or it lacks a slug or anchor. */
function readEpicIdentity(dir: string, epicHash: string): EpicIdentity | null {
	const head = readEpicDefinitionCore(repoPathOf(dir), epicHash);
	if (head.epicSlug === undefined || head.createdAt === undefined) return null;
	return { epicSlug: head.epicSlug, createdAt: head.createdAt, tracker: head.tracker };
}

/** The repo root an artifacts dir belongs to (the inverse of {@link artifactsDir}). */
function repoPathOf(dir: string): string {
	return join(dir, ...ARTIFACTS_DIR.split('/').map(() => '..'));
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
 *  Because {@link readArtifact} yields null on a malformed file, the rule is
 *  first-READABLE-wins: a corrupt DEF falls through to the ISSUE rather than
 *  aborting. readEpicIdentity cannot be reused here: it returns only
 *  {epicSlug, createdAt, tracker}, and the story-existence check needs the BODY.
 *
 *  Deliberately DEF/ISSUE only, unlike readEpicIdentity (ISSUE-c00559b7): this
 *  read serves story DECLARATIONS, and an LLD-headed work item's story is
 *  already proven by the `artifact` evidence clause, so it needs no declaration.
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

/** Path to a story-scoped artifact (`LLD` / `PLAN`): the file is named with the lowercase story. */
function storyArtifactPath(dir: string, prefix: 'LLD' | 'PLAN', epicHash: string, storyId: string): string {
	return join(dir, `${prefix}-${epicHash}-${storyId}.json`);
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
function storyEvidence(dir: string, epicHash: string, storyId: string): StoryEvidence | null {
	for (const prefix of ['LLD', 'PLAN'] as const) {
		if (existsSync(storyArtifactPath(dir, prefix, epicHash, storyId))) return 'artifact';
	}

	const def = readEpicDefinition(dir, epicHash);
	if (def === null) return null;
	// An ISSUE declares no story list — the bugfix route is one story at ordinal 1.
	if (def.kind === 'issue') return storyId === 's1' ? 'implied' : null;
	for (const story of def.artifact.body?.stories ?? []) {
		if (story.id === storyId) return 'declared';
	}
	return null;
}

/** Whether the story exists at all — any evidence will do. */
function storyExists(dir: string, epicHash: string, storyId: string): boolean {
	return storyEvidence(dir, epicHash, storyId) !== null;
}

/** Assemble a `ResolvedRef` for a located node. Returns null when the work
 *  item's head (DEF, ISSUE or LLD) yields no slug + createdAt (both are
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
	// An anchor that is not a date cannot place the work item's folder: the node is unaddressable.
	if (Number.isNaN(Date.parse(createdAt))) return null;
	const defTracker = dmeta.tracker;

	// Mint the artifact id. A key that is not a valid id (an uppercase story) makes the node unaddressable → null.
	// A Task that has its own artifact is found by its number, else by the plan row it was made from; the row id is what the
	// plan and the build record call it, the artifact's own id names the node.
	const head = taskId !== undefined && storyId !== undefined
		? taskHeadsIn(dir, epicHash, storyId).filter(h => h.status !== 'withdrawn').find(h => h.number === taskId.toLowerCase())
			?? taskHeadsIn(dir, epicHash, storyId).filter(h => h.status !== 'withdrawn').find(h => h.planTaskId === taskId)
		: undefined;
	const rowId = head?.planTaskId ?? taskId;
	let workflowId: string;
	try {
		workflowId = taskId !== undefined
			? ArtifactIds.make({ kind: 'TASK', epicHash, story: storyId, task: head?.number ?? taskId })
			: storyId !== undefined
				? ArtifactIds.make({ kind: 'STORY', epicHash, story: storyId })
				: ArtifactIds.make({ kind: 'EPIC', epicHash });
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
		// the issue is the Task artifact's binding
		taskRef = head?.issue;
		task = plan?.body?.tasks?.find(t => t.id === (rowId ?? taskId));
	}

	const level: ResolvedRef['level'] = taskId !== undefined ? 'task' : storyId !== undefined ? 'story' : 'epic';
	const issueRef = level === 'task' ? taskRef : level === 'story' ? storyRef : epicRef;

	return {
		level,
		epicHash,
		epicSlug,
		createdAt,
		...(storyId !== undefined ? { storyId } : {}),
		...(rowId   !== undefined ? { taskId: rowId } : {}),
		workflowId,
		slug:       workflowId,
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

/** issue# → node. Scans the Task artifacts, then stories (LLD + DEF storyRefs),
 *  then epics (DEF / HLD epicRef). */
function resolveByIssue(dir: string, number: string): ResolvedRef | null {
	const files = listFiles(dir);

	// Tasks with their own artifact: the issue on the Task's binding (a withdrawn Task's issue is closed and is not a match).
	for (const f of files) {
		const m = TASK_RE.exec(f);
		if (m === null) continue;
		const head = taskHeadsIn(dir, m[1]!, m[2]!).find(h => h.id === f.slice(0, -'.json'.length));
		if (head !== undefined && head.status !== 'withdrawn' && head.issue !== undefined && refNumber(head.issue) === number) return buildRef(dir, m[1]!, m[2]!, head.number);
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

/** artifact id → node. The id's hash locates the work item (a shorter SPEC or ISSUE hash must match exactly one);
 *  its story and task parts give the labels. */
function resolveByKey(dir: string, key: ArtifactKey): ResolvedRef | null {
	const matches = listEpicHashes(dir).filter(h => h === key.epicHash || (key.epicHash.length < 16 && h.startsWith(key.epicHash)));
	if (matches.length !== 1) return null;
	return buildRef(dir, matches[0]!, key.story, key.task);
}

/** label `s1/t3` / `s1` → node. Requires a single-epic artifacts dir, OR a
 *  caller-provided `epicHash` scope that uniquely names a present epic. */
function resolveByLabel(dir: string, storyId: string, taskId?: string, epicHash?: string): ResolvedRef | null {
	const heads = listEpicHeads(dir);
	const hashes = heads.map(h => h.hash);
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
	// ISSUE-c00559b7 — a work item headed only by an LLD (a standalone feature)
	// competes in a THIRD tier, below both: whenever a DEF- or ISSUE-anchored work
	// item evidences the label, the answer is exactly what it was before LLD heads
	// existed. Such an item is always reachable by its epicHash or hierarchical id.
	const candidates: { readonly hash: string; readonly evidence: StoryEvidence; readonly lldHeaded: boolean }[] = [];
	for (const h of heads) {
		const evidence = storyEvidence(dir, h.hash, storyId);
		if (evidence !== null) candidates.push({ hash: h.hash, evidence, lldHeaded: h.lldHeaded });
	}
	const tiers: readonly ((c: typeof candidates[number]) => boolean)[] = [
		c => !c.lldHeaded && EXPLICIT_EVIDENCE.has(c.evidence),
		c => !c.lldHeaded && !EXPLICIT_EVIDENCE.has(c.evidence),
		c => c.lldHeaded,
	];
	for (const inTier of tiers) {
		const tier = candidates.filter(inTier);
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
export function resolveWorkflowRef(repoPath: string, identifier: string, opts?: { readonly epicHash?: string | undefined }): ResolvedRef | null {
	if (typeof identifier !== 'string' || identifier.length === 0) return null;
	const id = identifier.trim();
	const dir = artifactsDir(repoPath);
	if (!existsSync(dir)) return null;

	// 1) Artifact id.
	const key = ArtifactIds.parse(id);
	if (key !== undefined) return resolveByKey(dir, key);

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

/** issue number → the artifact id of the node it names (or null). */
export function workflowIdForIssue(repoPath: string, issueNumber: number | string): string | null {
	const r = resolveWorkflowRef(repoPath, `#${issueNumber}`);
	return r?.workflowId ?? null;
}

/** artifact id → the tracker issue ref at that level (or null). */
export function issueForWorkflowId(repoPath: string, workflowId: string): string | null {
	const r = resolveWorkflowRef(repoPath, workflowId);
	return r?.issueRef ?? null;
}
