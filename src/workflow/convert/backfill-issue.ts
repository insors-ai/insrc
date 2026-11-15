/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Backfill an ISSUE for each headless trivial build (ISSUE-c5b49ff953a9a295). Before that ISSUE, a Trivial build minted its own hash
 * and wrote only a BUILD record: no Define, ISSUE or LLD heads its work item, so nothing records what was asked and why, and its Story
 * could never be created on approval. This repair step writes the missing ISSUE (kind 'change') from the BUILD's own request text,
 * under the BUILD's hash and anchored at the BUILD's work-item time, so the BUILD's folder does not move. The ISSUE of an approved BUILD
 * is approved by the migration with the reason recorded; that of a BUILD not approved stays pending, for a person to approve with it.
 *
 * It runs before the units step, which needs the head to create the Story. Safe to run again: an ISSUE already written is not written
 * twice, and one left unapproved by a run that stopped is approved by the next.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { approvalStateOf } from '../artifact-core/approval-view.js';
import { ISSUE_SCHEMA_VERSION, renderIssueMarkdown, type IssueArtifact } from '../artifacts/issue.js';
import { issueArtifactId, issueArtifactPaths, writeArtifact, writeAtomic } from '../storage.js';
import { renderCitationBlock } from '../synthesizer.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import type { ConversionChange, ConversionDeps, RawHead, RepairRecorder } from './types.js';

/** The reason the migration's approval of a backfilled ISSUE records. */
export const BACKFILL_REASON = 'backfilled for a trivial build approved before ISSUE-c5b49ff953a9a295';

/** The run id a backfilled ISSUE carries, so a later run can tell it from one a person wrote. */
export const backfillRunId = (hash: string): string => `backfill-${hash}`;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const metaOf = (h: RawHead): Obj => (isObj(h.json) && isObj(h.json['meta']) ? h.json['meta'] : {});
const bodyOf = (h: RawHead): Obj => (isObj(h.json) && isObj(h.json['body']) ? h.json['body'] : {});
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined);
const BUILD_ID = /^BUILD-([0-9a-f]{16})-([sS]\d+)$/;

/** A headless trivial BUILD: the record the ISSUE is written from. */
interface Headless {
	readonly hash:     string;
	readonly build:    RawHead;
	readonly approved: boolean;
}

/** Whether the BUILD is a standalone Trivial build (no design): its own flags say so. */
function isTrivialStandalone(build: RawHead): boolean {
	const meta = metaOf(build);
	return meta['standalone'] === true && (meta['sizeClass'] === 'trivial' || bodyOf(build)['producesLld'] === false);
}

/** The headless trivial BUILDs: one per hash with no Define, ISSUE or LLD head (the lowest Story's BUILD when a hash has several). */
function headlessBuilds(heads: readonly RawHead[]): Headless[] {
	const ids = new Set(heads.map(h => h.artifactId));
	const lldHashes = new Set(heads.flatMap(h => { const m = /^LLD-([0-9a-f]{16})-/.exec(h.artifactId); return m === null ? [] : [m[1]!]; }));
	const byHash = new Map<string, RawHead>();
	for (const head of [...heads].sort((a, b) => (a.artifactId < b.artifactId ? -1 : 1))) {
		const m = BUILD_ID.exec(head.artifactId);
		if (m === null || byHash.has(m[1]!)) continue;
		const hash = m[1]!;
		if (ids.has(`DEF-${hash}`) || lldHashes.has(hash) || !isTrivialStandalone(head)) continue;
		byHash.set(hash, head);
	}
	return [...byHash].map(([hash, build]) => ({ hash, build, approved: approvalStateOf(metaOf(build)) === 'approved' }));
}

/** A backfilled ISSUE the migration still has to approve: written by an earlier run, its BUILD approved, itself not approved yet. */
function unapprovedBackfill(heads: readonly RawHead[], item: Headless): boolean {
	const issue = heads.find(h => h.artifactId === issueArtifactId(item.hash));
	return issue !== undefined && metaOf(issue)['runId'] === backfillRunId(item.hash) && item.approved && approvalStateOf(metaOf(issue)) !== 'approved';
}

/** The repair rule: one change per headless trivial BUILD whose ISSUE is missing, or written and not yet approved by the migration. */
export const backfillIssueRule: PlanRule = (ctx): RulePlan => {
	const have = new Set(ctx.heads.map(h => h.artifactId));
	const changes: ConversionChange[] = [];
	for (const item of headlessBuilds(ctx.heads)) {
		const id = issueArtifactId(item.hash);
		if (!have.has(id)) {
			changes.push({ rule: 'backfill-issue', artifactId: id, detail: `from ${item.build.artifactId}, ${item.approved ? 'approved by the migration' : 'left pending: the BUILD is not approved'}` });
		} else if (unapprovedBackfill(ctx.heads, item)) {
			changes.push({ rule: 'backfill-issue', artifactId: id, detail: `approve: written from ${item.build.artifactId} by an earlier run` });
		}
	}
	return { changes };
};

/** The first line of the focus, as the ISSUE's title. */
const titleOf = (focus: string): string => focus.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? focus;

/** The ISSUE a headless BUILD's request text records, under the BUILD's hash and anchored at its work-item time. */
export function backfilledIssue(repo: string, item: Headless): IssueArtifact {
	const meta = metaOf(item.build);
	const body = bodyOf(item.build);
	const focus = text(body['focus']) ?? `Trivial build ${item.build.artifactId} (its request text was not recorded)`;
	const anchor = text(meta['epicCreatedAt']) ?? text(meta['createdAt']);
	if (anchor === undefined) throw new Error(`${item.build.artifactId} carries no creation time to anchor its ISSUE`);
	return {
		meta: {
			workflow: 'issue', runId: backfillRunId(item.hash), repoPath: repo, createdAt: anchor, epicCreatedAt: anchor,
			attribution: { outputs: [] }, elapsedMs: 0, repoIndexedAt: null, schemaVersion: ISSUE_SCHEMA_VERSION,
			issueHash: item.hash, ...(text(meta['epicSlug']) !== undefined ? { epicSlug: text(meta['epicSlug'])! } : {}),
			standalone: true, magnitude: 'small', kind: 'change', parentRef: null,
		},
		body: {
			title:        titleOf(focus),
			reproduction: focus,
			rootCause:    text(meta['triageRationale']) ?? 'not recorded',
			fixIntent:    text(body['summary']) ?? focus,
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: item.build.artifactId }],
	};
}

export interface BackfillResult {
	readonly written:  readonly string[];
	readonly approved: readonly string[];
}

/** Test seam: called before each ISSUE is written, so a test can stop the run part-way. */
export interface BackfillSeams {
	readonly beforeWrite?: ((issueId: string) => void) | undefined;
}

/** Write the missing ISSUEs and approve those of approved BUILDs. Safe to run again. */
export async function applyBackfillIssues(repo: string, deps: ConversionDeps & { readonly service: LifecycleService }, record: RepairRecorder, seams: BackfillSeams = {}): Promise<BackfillResult> {
	const written: string[] = [];
	const approved: string[] = [];
	const heads = readRawHeads(repo).heads;
	for (const item of headlessBuilds(heads)) {
		const id = issueArtifactId(item.hash);
		const issue = backfilledIssue(repo, item);
		const paths = issueArtifactPaths(repo, item.hash, issue.meta.epicCreatedAt!, 'standalone', issue.meta.epicSlug);
		if (!existsSync(paths.json)) {
			seams.beforeWrite?.(id);
			mkdirSync(dirname(paths.md), { recursive: true });
			writeAtomic(paths.md, renderIssueMarkdown(issue) + renderCitationBlock(issue.citations));
			writeArtifact(paths.json, issue, 'content');
			// the store reports the approval's own head write as 'head'; this is the write of the ISSUE itself
			record(id, 'backfilled');
			written.push(id);
		} else if (!unapprovedBackfill(readRawHeads(repo).heads, item)) {
			continue;
		}
		if (item.approved) {
			await deps.service.apply(id, 'approve', deps.actor, { override: { reason: BACKFILL_REASON } });
			approved.push(id);
		}
	}
	return { written, approved };
}
