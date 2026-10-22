/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The planner: every change the conversion would make, computed from the stored files without writing anything (a preview is
 * this and nothing else). It refuses a tree the conversion must not start from, reads each file raw, lists what it cannot use as
 * problems, computes the before-snapshot with `legacyDeliveryView`, and runs the rules it is given. The head-migration rule is
 * built in; the others (renames, stamps, amendments, feedback, units, Tasks) are `PlanRule`s that the conversion supplies.
 *
 * The same tree always gives an equal plan, and a converted tree (the marker is at version 2) gives an empty one. Apply
 * recomputes the plan and compares it with the one it was given (`plansEqual`).
 */

import { execFileSync } from 'node:child_process';

import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import { History } from '../artifact-core/history.js';
import { RepoSchemaGate } from '../artifact-core/repo-schema.js';
import type { TrackerPort } from '../tracker/port.js';
import { backfillHead } from './backfill.js';
import { legacyDeliveryView } from './legacy-view.js';
import { readRawHeads } from './raw-heads.js';
import { ConversionRefused, ConversionUnreadable } from './types.js';
import type {
	ConversionChange, ConversionPlan, ConversionProblem, ConversionRule, ConversionUnmapped, LegacyAttachComment, ProseReference, RawHead,
} from './types.js';

/** The order the applier runs the rules in, which is also the order a plan lists its changes. */
export const RULE_ORDER: readonly ConversionRule[] = [
	'rename-id', 'stamp-epic-created-at', 'convert-amendment', 'convert-feedback', 'migrate-head',
	'create-epic', 'create-story', 'create-tasks', 'move-binding', 'move-story-history', 'relabel-issue',
];

/** What a rule sees: the heads as read, the repository, and the optional tracker. */
export interface PlanContext {
	readonly repo:     string;
	readonly heads:    readonly RawHead[];
	readonly tracker?: TrackerPort | undefined;
}

/** What a rule adds to the plan. */
export interface RulePlan {
	readonly changes?:              readonly ConversionChange[] | undefined;
	readonly renames?:              readonly { readonly from: string; readonly to: string }[] | undefined;
	readonly unmapped?:             readonly ConversionUnmapped[] | undefined;
	readonly problems?:             readonly ConversionProblem[] | undefined;
	readonly proseReferences?:      readonly ProseReference[] | undefined;
	readonly unboundReviews?:       readonly string[] | undefined;
	readonly legacyAttachComments?: readonly LegacyAttachComment[] | undefined;
}

export type PlanRule = (ctx: PlanContext) => Promise<RulePlan> | RulePlan;

export interface PlanOptions {
	readonly tracker?: TrackerPort | undefined;
	/** The rules beyond the built-in head migration. */
	readonly rules?:   readonly PlanRule[] | undefined;
	/** A rerun of an apply that stopped part-way: the tree is expected to hold the earlier run's changes, so it is not required to be clean. */
	readonly resume?:  boolean | undefined;
}

const PROTECTED_PATHS = ['.insrc/artifacts', 'docs/epics'] as const;

function git(repo: string, args: readonly string[]): { ok: boolean; out: string } {
	try { return { ok: true, out: execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
	catch (err) { return { ok: false, out: String((err as { stderr?: unknown }).stderr ?? (err as Error).message) }; }
}

/** Refuses a repository that is mid-merge or has uncommitted changes under the artifacts and the epics' documents. */
export function assertCleanTree(repo: string): void {
	if (!git(repo, ['rev-parse', '--git-dir']).ok) throw new ConversionRefused(`${repo} is not a git repository, so the conversion cannot be reverted with one commit`);
	if (git(repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).ok) throw new ConversionRefused('a merge is in progress: commit or abort it before converting');
	const status = git(repo, ['status', '--porcelain', '--untracked-files=all', '--', ...PROTECTED_PATHS]);
	if (!status.ok) throw new ConversionRefused(`git status failed: ${status.out.trim()}`);
	const dirty = status.out.split('\n').filter(l => l.trim().length > 0).map(l => l.slice(3));
	if (dirty.length > 0) throw new ConversionRefused(`uncommitted changes under ${PROTECTED_PATHS.join(' and ')}: commit or stash them first (${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? `, and ${dirty.length - 5} more` : ''})`, dirty);
}

const EMPTY_PLAN: ConversionPlan = {
	changes: [], renames: [], unmapped: [], problems: [], proseReferences: [], unboundReviews: [], legacyAttachComments: [], snapshot: [],
};

const NO_LIFECYCLE_HEAD = (head: RawHead): boolean => {
	const json = head.json as { meta?: Record<string, unknown> };
	return json.meta === undefined || typeof json.meta !== 'object';
};

/** The built-in rule: every head that has no lifecycle or still carries a legacy field is migrated. */
async function migrateHeads(ctx: PlanContext): Promise<RulePlan> {
	const history = new History(new FileSidecarStore(ctx.repo));
	const changes: ConversionChange[] = [];
	const problems: ConversionProblem[] = [];
	const unbound: string[] = [];
	for (const head of ctx.heads) {
		if (NO_LIFECYCLE_HEAD(head)) continue; // a flat amendment is converted by its own rule
		let hasLog = false;
		try { hasLog = (await history.log(head.artifactId)).length > 0; } catch { hasLog = false; } // an id the model refuses (S001) has no log
		try {
			const out = backfillHead({ head, hasLog, now: '1970-01-01T00:00:00.000Z', actor: { id: 'insrc:migration', kind: 'system', properties: {} } });
			const meta = (head.json as { meta: Record<string, unknown> }).meta;
			if (out.legacyFields.length > 0 || meta['lifecycle'] === undefined) {
				changes.push({ rule: 'migrate-head', artifactId: head.artifactId, detail: out.legacyFields.length > 0 ? `strip ${[...out.legacyFields].sort().join(', ')}` : 'add the envelope and lifecycle' });
			}
			if (out.unboundReview) unbound.push(head.artifactId);
		} catch (err) {
			if (!(err instanceof ConversionUnreadable)) throw err;
			problems.push({ file: `.insrc/artifacts/${head.artifactId}.json`, reason: err.message });
		}
	}
	return { changes, problems, unboundReviews: unbound };
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export async function planConversion(repo: string, options: PlanOptions = {}): Promise<ConversionPlan> {
	let version: number;
	try { version = RepoSchemaGate.read(repo).version; }
	catch (err) { throw new ConversionRefused(`the repository marker cannot be read: ${(err as Error).message}`); }
	if (version >= 2) return EMPTY_PLAN;
	if (options.resume !== true) assertCleanTree(repo);

	const read = readRawHeads(repo);
	const ctx: PlanContext = { repo, heads: read.heads, tracker: options.tracker };
	const parts: RulePlan[] = [{ problems: read.problems }, await migrateHeads(ctx)];
	for (const rule of options.rules ?? []) parts.push(await rule(ctx));

	const changes = parts.flatMap(p => p.changes ?? []).sort((a, b) =>
		RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) || byText(a.artifactId, b.artifactId) || byText(a.detail, b.detail));
	return {
		changes,
		renames:              parts.flatMap(p => p.renames ?? []).sort((a, b) => byText(a.from, b.from)),
		unmapped:             parts.flatMap(p => p.unmapped ?? []).sort((a, b) => byText(a.artifactId, b.artifactId) || byText(a.entryId, b.entryId) || byText(a.field, b.field)),
		problems:             parts.flatMap(p => p.problems ?? []).sort((a, b) => byText(a.file, b.file) || byText(a.reason, b.reason)),
		proseReferences:      parts.flatMap(p => p.proseReferences ?? []).sort((a, b) => byText(a.file, b.file) || byText(a.oldId, b.oldId)),
		unboundReviews:       parts.flatMap(p => p.unboundReviews ?? []).sort(byText),
		legacyAttachComments: parts.flatMap(p => p.legacyAttachComments ?? []).sort((a, b) => byText(a.issue, b.issue) || byText(a.commentId, b.commentId)),
		snapshot:             legacyDeliveryView(read.heads),
	};
}

/** Whether two plans are the same plan: what apply checks before it writes anything. */
export function plansEqual(a: ConversionPlan, b: ConversionPlan): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
