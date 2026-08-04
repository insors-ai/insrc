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
import { writeAtomic, buildArtifactPaths } from '../../storage.js';

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
	const tasks = rec.body.tasks ?? [];
	if (tasks.length > 0) {
		lines.push('', '## Tasks validated', '');
		for (const t of tasks) {
			const status = t.passed === true ? '✓' : t.passed === false ? '✗' : '·';
			lines.push(`- ${status} \`${t.id}\``);
		}
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
export function persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string } {
	const paths = buildArtifactPaths(repoPath, rec.meta.epicHash, rec.meta.storyId);
	const merged = mergeWithPrior(paths.json, rec);
	writeAtomic(paths.json, JSON.stringify(merged, null, 2) + '\n');
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
		...rec.meta,
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
