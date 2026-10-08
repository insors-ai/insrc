/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * BUILD ledger records — the on-disk trace that a Story was built.
 *
 * Originally this held ONLY the standalone/Trivial tracking record (a Trivial
 * feature has no upstream artifact, so without it its only trace would be the
 * code diff). Story S001 (build-ledger-plan-driven-builds) GENERALIZES it: a
 * plan-driven story built through `insrc_build_step` now also gets a story-level
 * BUILD record — written at the validate phase, upsert-merged across the N
 * per-task validates — so the completion gate has a real record to approve
 * without a hand-back-fill. Both records are keyed identically to a normal BUILD
 * artifact (`buildArtifactPaths`) so `approveWorkflowTarget` finds them by the
 * `BUILD-` filename prefix. See `docs/plans/feature-triage-router.md` +
 * docs/plans/PLAN-build-ledger-plan-driven-builds-today-S001.md.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import { execFileSync } from 'node:child_process';

import { writeAtomic, artifactIdMarker, artifactJsonPath, buildArtifactId, buildArtifactPaths, buildRecordFolderArgs, inheritedStoryStandalone } from '../../storage.js';
import { changeLogBodyLines, feedbackBodyLines } from '../../artifacts/format/bindings.js';
import type { ChangeLog, FeedbackRecord } from '../../artifacts/provenance/types.js';

import { readTestRecord } from './test-record.js';

const log = getLogger('workflow:build-record');

/** One task recorded on a plan-driven BUILD record. `passed` is the validate
 *  verdict for that task (undefined until validated). */
export interface BuildRecordTask {
	readonly id:      string;
	readonly passed?: boolean | undefined;
}

/**
 * The story-level BUILD ledger record (S001 generalization). `standalone` is a
 * boolean: `true` for a Trivial standalone build, `false` for a plan-driven one.
 * The completion/rejection stamps are carried so an upsert can PRESERVE them —
 * `approveArtifactByJsonPath` writes `approvedAt` directly on this record's json,
 * and a later re-validate must never clobber a completed story.
 */
export interface BuildRecord {
	readonly meta: {
		readonly workflow:   'build';
		/**
		 * `true` for a standalone (bugfix / Small / Trivial) record, absent or false
		 * for a plan-driven one.
		 *
		 * OPTIONAL since t9: the shared validate persist serves BOTH routes and
		 * cannot know which one it is serving, so it now omits the key rather than
		 * asserting `false`. Omitting lets mergeWithPrior carry the prior value
		 * forward; on a first write with no prior the key is simply absent, which
		 * every reader already treats as false (they all test `=== true`).
		 */
		readonly standalone?: boolean | undefined;
		readonly sizeClass?: string | undefined;
		readonly triageRationale?: string | undefined;
		readonly epicHash:   string;
		readonly storyId:    string;
		readonly createdAt:  string;
		readonly updatedAt?: string | undefined;
		/** The party that wrote the code. Stamped by the build-step writers;
		 *  absent on older records, whose author is unknown. */
		readonly authoredBy?: 'controller' | 'daemon' | undefined;
		/** Written by the approval gate; preserved verbatim across an upsert. */
		readonly approvedAt?:     string | undefined;
		readonly rejectedAt?:     string | undefined;
		readonly rejectReason?:   string | undefined;
		readonly reviewOverride?: { readonly reason: string; readonly at: string } | undefined;
	};
	readonly body: {
		readonly focus?:       string | undefined;
		readonly producesLld?: boolean | undefined;
		/** Plan-driven provenance — the tasks validated for the Story. */
		readonly tasks?:       readonly BuildRecordTask[] | undefined;
		readonly commit?:      string | undefined;
		/** S002 (provenance/feedback): the file-level change-log of the build's
		 *  changed set, collected at the validate phase. Absent → no `## Changes`
		 *  section (omit-slot, byte-identity preserved for a no-change build). */
		readonly changeLog?:   ChangeLog | undefined;
		/** S002 (provenance/feedback): append-only, human-authored feedback on the
		 *  build's changed code (populated out-of-band via `appendFeedback`, never by
		 *  this writer). Absent → no `## Feedback` section (omit-slot). S003 starts
		 *  capturing build-cycle feedback into this same slot via `appendFeedback`. */
		readonly feedback?:    FeedbackRecord | undefined;
		/** S003 (harden-artifact-flows): an optional human-readable narrative
		 *  "what changed and why" for the build, distinct from the per-file
		 *  `changeLog`. Absent / empty → no `## Summary` section (omit-slot,
		 *  byte-identity preserved for a record that carries none — k4). */
		readonly summary?:     string | undefined;
		/** The link to the Story's test record (TESTS.md, repo-relative). A LINK
		 *  ONLY: it holds no totals and no results, so the build record cannot
		 *  disagree with the test record about a run. Written by the validate turn
		 *  when a test record exists on disk; carried forward by the merge.
		 *  Absent → no `**Tests:**` line (omit-slot, byte-identity preserved). */
		readonly testRecord?:  { readonly md: string } | undefined;
	};
}

/**
 * The Trivial standalone tracking record — a NARROWING of {@link BuildRecord}
 * (standalone:true + the standalone body). Kept as a distinct type so existing
 * callers (and the code-review subject that reads it) typecheck unchanged; a
 * value of this type is assignable to `BuildRecord`.
 */
export interface StandaloneBuildRecord {
	readonly meta: {
		readonly workflow:  'build';
		readonly standalone: true;
		readonly sizeClass:  string;
		readonly triageRationale?: string | undefined;
		readonly epicHash:   string;
		readonly storyId:    string;
		readonly createdAt:  string;
		readonly authoredBy?: 'controller' | 'daemon' | undefined;
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

/**
 * Render a BUILD ledger record — the ONE renderer, for every route.
 *
 * Replaces the former pair (a standalone renderer and a plan-driven one) selected
 * by `meta.standalone`. That dispatch was the defect: a standalone record whose
 * flag got flipped by the shared validate write silently lost its `## Scope`
 * while `body.focus` sat in the json, rendered by nothing.
 *
 * Every section is an OMIT-SLOT keyed on its OWN content, so no route can lose
 * content it carries. TWO parts always render — the title and the meta line — and
 * SEVEN are conditional: Commit, Scope, Triage rationale, Summary, Tasks
 * validated, Changes, Feedback. (The LLD's test strategy says "eight omit-slots";
 * it is seven, counted here rather than inherited.)
 *
 * The ordering is the union of both predecessors, and because no real record
 * carries sections from both groups interleaved, each predecessor's relative order
 * is preserved — which is what makes the byte-identity goldens hold.
 *
 * The TITLE keys on `meta.sizeClass`, not `meta.standalone`, because sizeClass is
 * immune to the validate flip. A record with a sizeClass is a standalone one
 * whatever the flag now says. When sizeClass is ABSENT the case is DEFINED rather
 * than interpolated: previously `${rec.meta.sizeClass}` rendered the literal
 * 'undefined' into the heading of any such record (BUILD-be8708a9cd20e286-S001 is
 * a committed example).
 */
export function renderBuildRecordMd(rec: BuildRecord): string {
	const lines: string[] = [];

	// --- always rendered: title + meta line ---
	const sizeClass = rec.meta.sizeClass;
	const kind = sizeClass !== undefined && sizeClass.length > 0
		? `standalone ${sizeClass}`
		: rec.meta.standalone ? 'standalone' : 'plan-driven';
	lines.push(`# Build (${kind}) — Story ${rec.meta.storyId}`);
	lines.push('');
	const bits: string[] = [];
	if (sizeClass !== undefined && sizeClass.length > 0) bits.push(`**Size class:** ${sizeClass}`);
	bits.push(`**Standalone:** ${rec.meta.standalone ? 'yes' : 'no'}`);
	bits.push(`**Created:** ${rec.meta.createdAt}`);
	if (rec.meta.updatedAt !== undefined) bits.push(`**Updated:** ${rec.meta.updatedAt}`);
	lines.push(bits.join('  ·  '));

	/** Push one omit-slot section: nothing at all unless it has content. */
	const section = (heading: string, content: readonly string[]): void => {
		if (content.length === 0) return;
		lines.push('', heading, '', ...content);
	};

	// --- the seven omit-slots, in the union order ---
	if (rec.body.commit !== undefined) lines.push('', `**Commit:** ${rec.body.commit}`);
	section('## Scope', rec.body.focus !== undefined && rec.body.focus.length > 0 ? [rec.body.focus] : []);
	section('## Triage rationale', rec.meta.triageRationale !== undefined ? [rec.meta.triageRationale] : []);
	const summary = rec.body.summary?.trim() ?? '';
	section('## Summary', summary.length > 0 ? [summary] : []);
	const tasks = rec.body.tasks ?? [];
	section('## Tasks validated', tasks.map(t => {
		const status = t.passed === true ? '✓' : t.passed === false ? '✗' : '·';
		return `- ${status} \`${t.id}\``;
	}));
	if (rec.body.testRecord !== undefined) {
		// BUILD.md and TESTS.md are filed in one folder, so the link is the file's name.
		const target = rec.body.testRecord.md.split('/').pop() ?? rec.body.testRecord.md;
		lines.push('', `**Tests:** [${target}](${target}) — what the gate ran for each Task, and what each test case did.`);
	}
	section('## Changes', changeLogBodyLines(rec.body.changeLog));
	section('## Feedback', feedbackBodyLines(rec.body.feedback));

	lines.push('');
	return lines.join('\n');
}

/**
 * Compatibility shim — DELEGATES to {@link renderBuildRecordMd} rather than
 * duplicating it. Retained because build-record.test.ts imports and calls it; it
 * is no longer a distinct rendering path.
 */
export function renderStandaloneBuildRecordMd(rec: StandaloneBuildRecord): string {
	return renderBuildRecordMd(rec as unknown as BuildRecord);
}

/**
 * Persist (upsert) a BUILD ledger record — the general writer. READS any
 * existing `BUILD-<epicHash>-<storyId>.json` and MERGES on top: unions
 * `body.tasks[]` by id (the new write's `passed` wins), preserves the original
 * `createdAt` + the approval/rejection stamps (never un-completing a story), and
 * refreshes `updatedAt`. A malformed / absent prior file fails OPEN to a fresh
 * write. Returns the written json + md paths (from `buildArtifactPaths`).
 *
 * The Trivial standalone path routes through here too via
 * {@link persistStandaloneBuildRecord}; its `standalone:true` records render via
 * the unchanged {@link renderStandaloneBuildRecordMd} so the Trivial output stays
 * byte-identical.
 */
/**
 * HEAD as a SHORT sha for `body.commit`, or `undefined` when it cannot be read.
 *
 * Short is deliberate and the opposite of the range base's choice (t5), for a
 * different reason: `body.commit` is a DISPLAYED reference a human reads in the
 * rendered record, where an abbreviation is the convention; a range BASE is a
 * machine boundary where an abbreviation could collide.
 *
 * `revParse` (git/helpers.ts) is the canonical short-sha reader and returns `''`
 * on failure, but it is ASYNC and this persist path is synchronous, so the same
 * contract is reproduced here: empty output is treated as ABSENT and the key is
 * omitted, never stored as an empty string. A falsy commit would render as an
 * empty `**Commit:**` line, which is worse than no line at all.
 */
export function headShortSha(repoPath: string): string | undefined {
	try {
		const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
			cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		return out.length > 0 ? out : undefined;
	} catch {
		return undefined;   // not a git repo, unborn HEAD, or git unavailable
	}
}

/** Paths a MERGED record occupies./** Paths a MERGED record occupies. The single derivation both the writer and the
 *  pre-persist lookup below use, so the two can never disagree about where a
 *  record lives. */
function pathsForMerged(repoPath: string, merged: BuildRecord): { md: string; json: string } {
	// The record's own flag, OR what the work item itself says. The flag alone was
	// not enough: a record written without it (any writer that could not resolve
	// the route) was filed under docs/epics/ even though its Story's LLD and ISSUE
	// sat under docs/standalone/, and every later re-render — an approval included —
	// put it back there. Reading the Story keeps the record beside its siblings
	// whatever its own meta carries. Only ever widens to standalone: an explicit
	// true on the record is never overridden.
	const standalone = merged.meta.standalone === true
		|| inheritedStoryStandalone(repoPath, merged.meta.epicHash, merged.meta.storyId) === true;
	const fa = buildRecordFolderArgs(repoPath, merged.meta.epicHash, merged.meta.storyId, standalone, merged.meta.createdAt);
	return buildArtifactPaths(repoPath, merged.meta.epicHash, merged.meta.storyId, fa.createdAtISO, fa.workItemKind, fa.epicSlug);
}

/**
 * The paths `persistBuildRecord(repoPath, rec)` WOULD write, computed without
 * writing anything.
 *
 * Needed because the change-set collector runs BEFORE the persist — so a writer
 * that wants to exclude the record's own files from its own change set cannot
 * simply use the persist's return value. It resolves the json path, runs the same
 * `mergeWithPrior` the writer will run (the md folder is anchored on the MERGED
 * `createdAt` and `standalone`, not the new write's), and derives both paths
 * through the same {@link pathsForMerged} the writer uses. Read-only.
 */
export function buildRecordPathsFor(repoPath: string, rec: BuildRecord): { md: string; json: string } {
	const jsonPath = artifactJsonPath(repoPath, buildArtifactId(rec.meta.epicHash, rec.meta.storyId));
	return pathsForMerged(repoPath, mergeWithPrior(jsonPath, rec));
}

export function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string } {
	// The json path is hash-flat (identity-free), so resolve + merge FIRST, then
	// key the nested md folder on the MERGED record. mergeWithPrior preserves the
	// original createdAt across an upsert, and for a Trivial standalone (no LLD)
	// the folder's E<date> anchor IS that createdAt — deriving it from the merged
	// record keeps a re-run in the SAME folder as the first build (and as the CR,
	// which reads the persisted createdAt) even across a UTC-midnight boundary.
	const jsonPath = artifactJsonPath(repoPath, buildArtifactId(rec.meta.epicHash, rec.meta.storyId));
	// `body.commit` is produced HERE rather than in either writer, so the two routes
	// cannot diverge: this is the one persist entry point both funnel through.
	//
	// It is HEAD AT PERSIST TIME, as the design specifies — so a re-persist
	// REFRESHES it rather than preserving the earlier value. That is deliberate but
	// easy to misread: the field says "the commit this record was written at", not
	// "the commit the Story's work first landed in". A caller that knows better can
	// supply `body.commit` explicitly and it wins for that write.
	const commit = rec.body.commit ?? headShortSha(repoPath);
	const withCommit: BuildRecord = commit !== undefined
		? { ...rec, body: { ...rec.body, commit } }
		: rec;
	const merged = mergeWithPrior(jsonPath, withCommit);
	writeAtomic(jsonPath, JSON.stringify(merged, null, 2) + '\n');
	const paths = pathsForMerged(repoPath, merged);
	// ONE renderer, every route — the former `meta.standalone` ternary is gone.
	// The id marker is prepended HERE, not in the renderer, so the renderer's
	// output (and every golden pinned on it) is unchanged. The md is named by
	// folder while the json is named by hash, so the marker is the only thing that
	// lets `jsonPathForMd` resolve this file back to its record — without it a
	// BUILD was the one artifact that could not be approved by its md path
	// (ISSUE-43d72766).
	const md = `${artifactIdMarker(buildArtifactId(merged.meta.epicHash, merged.meta.storyId))}\n\n${renderBuildRecordMd(merged)}`;
	writeAtomic(paths.md, md);
	return paths;
}

/** Persist the standalone (Trivial) BUILD record. Thin wrapper over
 *  {@link persistBuildRecord} (standalone:true) — the json + md output is
 *  byte-identical to before the S001 generalization. */
export function persistStandaloneBuildRecord(repoPath: string, rec: StandaloneBuildRecord): { md: string; json: string } {
	return persistBuildRecord(repoPath, rec);
}

/** Read the prior record for an upsert. Returns null on a missing OR malformed
 *  file (fail-open) — a corrupt prior never aborts the current write. */
function readPriorRecord(jsonPath: string): BuildRecord | null {
	try {
		const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as BuildRecord;
		if (typeof parsed?.meta?.epicHash === 'string' && typeof parsed?.meta?.storyId === 'string') {
			return parsed;
		}
		log.warn({ jsonPath }, 'persistBuildRecord: prior record has no epicHash/storyId; treating as absent (fail-open)');
		return null;
	} catch (err) {
		// An absent file is the normal fresh-write case — silent. Any OTHER
		// failure (a corrupt/unparseable prior) is the fail-open path worth a warn.
		if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
			log.warn({ jsonPath, err: err instanceof Error ? err.message : String(err) }, 'persistBuildRecord: prior record unreadable; treating as absent (fail-open)');
		}
		return null;
	}
}

/** Union two task lists by id — the `next` entry wins for a re-validated id
 *  (its `passed` is refreshed). Insertion order: prior tasks first, then any
 *  new ids. */
function mergeTasks(prior: readonly BuildRecordTask[] | undefined, next: readonly BuildRecordTask[] | undefined): readonly BuildRecordTask[] | undefined {
	if (prior === undefined && next === undefined) return undefined;
	const byId = new Map<string, BuildRecordTask>();
	for (const t of prior ?? []) byId.set(t.id, t);
	for (const t of next ?? []) byId.set(t.id, t);
	return [...byId.values()];
}

/**
 * A FIRST build record, when the Story already has a test record: take the test
 * record's `createdAt`, and its route flag when it is `true` and this write
 * states none.
 *
 * The gate writes a Story's test record before the judge, so on a first validate
 * turn it exists before any build record does. A Story with no other anchor (a
 * Trivial standalone build) has its folder dated by its record's `createdAt`; a
 * build record first written on a later day, or by another writer, would
 * otherwise date a second folder and be filed apart from its TESTS.md. Seeding
 * HERE, in the one merge every writer and `buildRecordPathsFor` go through,
 * keeps the two records in one folder whoever writes first.
 */
function seedFromTestRecord(jsonPath: string, rec: BuildRecord): BuildRecord {
	const tests = readTestRecord(repoPathOfArtifactJson(jsonPath), rec.meta.epicHash, rec.meta.storyId);
	if (tests === null) return rec;
	return {
		...rec,
		meta: {
			...rec.meta,
			createdAt: tests.meta.createdAt,
			...(tests.meta.standalone === true && rec.meta.standalone === undefined ? { standalone: true } : {}),
		},
	};
}

/** `<repo>/.insrc/artifacts/<id>.json` → `<repo>`. */
function repoPathOfArtifactJson(jsonPath: string): string {
	return dirname(dirname(dirname(jsonPath)));
}

/** Merge a new record on top of any prior on-disk record (the upsert core).
 *  Prior `createdAt` + completion/rejection stamps win; tasks union; everything
 *  else takes the new write. */
function mergeWithPrior(jsonPath: string, rec: BuildRecord): BuildRecord {
	const prior = readPriorRecord(jsonPath);
	if (prior === null) return seedFromTestRecord(jsonPath, rec);
	const tasks = mergeTasks(prior.body.tasks, rec.body.tasks);
	const meta: BuildRecord['meta'] = {
		// Prior FIRST, mirroring the body merge below: a later write must not
		// REMOVE meta the record already carried. Without this spread the rule is
		// "everything the new write omits is deleted", which silently erased
		// sizeClass + triageRationale on every standalone record the validate
		// phase touched (it sends neither). The new write still wins on every
		// field it DOES supply, because it is spread second.
		...prior.meta,
		...rec.meta,
		// From here down, PRIOR deliberately wins — the opposite of the rule
		// above, and not to be flattened into it.
		createdAt: prior.meta.createdAt,
		// Completion/rejection stamps: prior wins — a later validate must never
		// clobber a completed (or rejected) story.
		...(prior.meta.approvedAt     !== undefined ? { approvedAt:     prior.meta.approvedAt     } : {}),
		...(prior.meta.rejectedAt     !== undefined ? { rejectedAt:     prior.meta.rejectedAt     } : {}),
		...(prior.meta.rejectReason   !== undefined ? { rejectReason:   prior.meta.rejectReason   } : {}),
		...(prior.meta.reviewOverride !== undefined ? { reviewOverride: prior.meta.reviewOverride } : {}),
	};
	const body: BuildRecord['body'] = {
		...prior.body,
		...rec.body,
		...(tasks !== undefined ? { tasks } : {}),
	};
	return { meta, body };
}
