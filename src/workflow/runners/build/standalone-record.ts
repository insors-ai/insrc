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
 * `BUILD-` filename prefix. See `plans/feature-triage-router.md` +
 * docs/plans/PLAN-build-ledger-plan-driven-builds-today-S001.md.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { getLogger } from '../../../shared/logger.js';
import { execFileSync } from 'node:child_process';

import { writeAtomic, artifactJsonPath, buildArtifactId, buildArtifactPaths, buildRecordFolderArgs } from '../../storage.js';
import { changeLogBodyLines, feedbackBodyLines } from '../../artifacts/format/bindings.js';
import type { ChangeLog, FeedbackRecord } from '../../artifacts/provenance/types.js';

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
		readonly standalone: boolean;
		readonly sizeClass?: string | undefined;
		readonly triageRationale?: string | undefined;
		readonly epicHash:   string;
		readonly storyId:    string;
		readonly createdAt:  string;
		readonly updatedAt?: string | undefined;
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

/** Render the ORIGINAL standalone/Trivial markdown — kept byte-identical so the
 *  Trivial ledger entry does not churn after the S001 generalization. */
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

/** Render the plan-driven BUILD record markdown (standalone:false) — a
 *  human-readable ledger entry listing the validated tasks + commit. */
export function renderPlanBuildRecordMd(rec: BuildRecord): string {
	const lines: string[] = [];
	lines.push(`# Build (plan-driven) — Story ${rec.meta.storyId}`);
	lines.push('');
	const bits = ['**Standalone:** no', `**Created:** ${rec.meta.createdAt}`];
	if (rec.meta.updatedAt !== undefined) bits.push(`**Updated:** ${rec.meta.updatedAt}`);
	lines.push(bits.join('  ·  '));
	if (rec.body.commit !== undefined) {
		lines.push('', `**Commit:** ${rec.body.commit}`);
	}
	// S003: an optional narrative change summary, reader-first (before the task
	// list). Omit-slot: the heading is pushed only for a non-empty (trimmed)
	// summary, mirroring the `## Changes`/`## Feedback` sections below, so a record
	// without a summary renders byte-identically to the pre-S003 output (k4).
	const summary = rec.body.summary?.trim() ?? '';
	if (summary.length > 0) {
		lines.push('', '## Summary', '', summary);
	}
	const tasks = rec.body.tasks ?? [];
	if (tasks.length > 0) {
		lines.push('', '## Tasks validated', '');
		for (const t of tasks) {
			const status = t.passed === true ? '✓' : t.passed === false ? '✗' : '·';
			lines.push(`- ${status} \`${t.id}\``);
		}
	}
	// S002: the file-level change-log and any out-of-band feedback — each an
	// omit-slot section (heading pushed only when the binding yields content), so
	// a build with neither renders byte-identically to the pre-S002 output.
	const changeLines = changeLogBodyLines(rec.body.changeLog);
	if (changeLines.length > 0) {
		lines.push('', '## Changes', '', ...changeLines);
	}
	const feedbackLines = feedbackBodyLines(rec.body.feedback);
	if (feedbackLines.length > 0) {
		lines.push('', '## Feedback', '', ...feedbackLines);
	}
	lines.push('');
	return lines.join('\n');
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
function headShortSha(repoPath: string): string | undefined {
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
	const fa = buildRecordFolderArgs(repoPath, merged.meta.epicHash, merged.meta.storyId, merged.meta.standalone, merged.meta.createdAt);
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
	const md = merged.meta.standalone
		? renderStandaloneBuildRecordMd(merged as unknown as StandaloneBuildRecord)
		: renderPlanBuildRecordMd(merged);
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

/** Merge a new record on top of any prior on-disk record (the upsert core).
 *  Prior `createdAt` + completion/rejection stamps win; tasks union; everything
 *  else takes the new write. */
function mergeWithPrior(jsonPath: string, rec: BuildRecord): BuildRecord {
	const prior = readPriorRecord(jsonPath);
	if (prior === null) return rec;
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
