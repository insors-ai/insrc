/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `body.feedback` becomes sidecar lines. For each head the `Feedback` lines (through `convertLegacyFeedback`, ids kept) and the
 * log entry of each review-decision batch are appended BEFORE the head's migration write, which is the one step that strips
 * `body.feedback`. A crash after the append and before the write therefore loses nothing: the head still holds the entries,
 * and the rerun finds the lines already there by id and appends nothing twice.
 *
 * A comment with no text cannot be a feedback line (a feedback line needs text); it is reported as unmapped, not dropped silently.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { convertLegacyFeedback, legacyBatchOutcomes } from '../artifact-core/feedback-convert.js';
import type { ConvertedFeedback } from '../artifact-core/feedback-convert.js';
import type { Actor, ChangeLogEntry } from '../artifact-core/types.js';
import type { FeedbackEntry } from '../artifacts/provenance/types.js';
import { ARTIFACT_ID_MARKER_RE } from '../storage.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import type { ConversionChange, ConversionDeps, ConversionUnmapped, RawHead } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const LEGACY_ACTOR: Actor = { id: 'legacy:unknown', kind: 'person', properties: {} };

/** Artifact id to the repo-relative path of its rendered markdown, read from the marker each document carries. */
export function ownDocuments(repo: string): ReadonlyMap<string, string> {
	const out = new Map<string, string>();
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir).sort()) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) { walk(p); continue; }
			if (!name.endsWith('.md')) continue;
			const marker = ARTIFACT_ID_MARKER_RE.exec(readFileSync(p, 'utf8').slice(0, 512));
			if (marker?.[1] !== undefined && !out.has(marker[1])) out.set(marker[1], relative(repo, p));
		}
	};
	for (const root of ['docs/epics', 'docs/standalone']) if (existsSync(join(repo, root))) walk(join(repo, root));
	return out;
}

/** The legacy entries of a head, in the order they were made; empty when it has none. */
function legacyEntries(head: RawHead): FeedbackEntry[] {
	const body = isObj(head.json) && isObj(head.json['body']) ? head.json['body'] : undefined;
	const list = body?.['feedback'];
	if (!Array.isArray(list)) return [];
	return (list as unknown[]).filter((e): e is FeedbackEntry => isObj(e) && typeof e['id'] === 'string' && typeof e['comment'] === 'string')
		.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : a.id < b.id ? -1 : 1));
}

interface Conversion { readonly converted: ConvertedFeedback[]; readonly unmapped: ConversionUnmapped[] }

function convertAll(head: RawHead, docs: ReadonlyMap<string, string>): Conversion {
	const converted: ConvertedFeedback[] = [];
	const unmapped: ConversionUnmapped[] = [];
	for (const entry of legacyEntries(head)) {
		if (entry.comment.trim().length === 0) {
			unmapped.push({ artifactId: head.artifactId, entryId: entry.id, field: 'comment', value: '', reason: 'the comment has no text, so it cannot be a feedback line' });
			continue;
		}
		const c = convertLegacyFeedback(entry, docs.get(head.artifactId));
		converted.push(c);
		for (const u of c.unmapped) unmapped.push({ ...u, artifactId: head.artifactId, entryId: entry.id });
	}
	return { converted, unmapped };
}

/** Id of the log entry that records the decision of a batch; stable across runs. */
export const batchEntryId = (artifactId: string, batchId: string): string => `migrated-${artifactId}-batch-${batchId}`;

function batchEntries(artifactId: string, c: Conversion): ChangeLogEntry[] {
	return legacyBatchOutcomes(c.converted).map(({ batchId, outcome }) => {
		const times = c.converted.filter(x => x.feedback.batchId === batchId).map(x => x.feedback.timestamp).sort();
		return {
			id: batchEntryId(artifactId, batchId), actor: LEGACY_ACTOR, timestamp: times[0] ?? '', operation: 'review' as const,
			outcome: { result: outcome.result, summary: outcome.summary, data: { kind: 'migrated-batch', batchId } },
		};
	});
}

/** The plan rule: the heads that still hold body.feedback, and the values that have no home in the new shape. */
export const feedbackRule: PlanRule = (ctx): RulePlan => {
	const docs = ownDocuments(ctx.repo);
	const changes: ConversionChange[] = [];
	const unmapped: ConversionUnmapped[] = [];
	for (const head of ctx.heads) {
		const entries = legacyEntries(head);
		if (entries.length === 0) continue;
		const c = convertAll(head, docs);
		changes.push({ rule: 'convert-feedback', artifactId: head.artifactId, detail: `${c.converted.length} of ${entries.length} entries` });
		unmapped.push(...c.unmapped);
	}
	return { changes, unmapped };
};

export interface FeedbackResult {
	/** Feedback lines appended by this call. */
	readonly appended:  number;
	/** Batch log entries appended by this call. */
	readonly batches:   number;
	readonly unmapped:  readonly ConversionUnmapped[];
}

/** Test seam: called before each append. */
export interface FeedbackSeams { readonly beforeAppend?: (() => void) | undefined }

/** Appends the feedback lines and batch entries of every head that still holds body.feedback; strips nothing. */
export async function applyFeedback(repo: string, deps: Pick<ConversionDeps, 'store' | 'history'>, seams: FeedbackSeams = {}): Promise<FeedbackResult> {
	const docs = ownDocuments(repo);
	let appended = 0;
	let batches = 0;
	const unmapped: ConversionUnmapped[] = [];
	for (const head of readRawHeads(repo).heads) {
		if (legacyEntries(head).length === 0) continue;
		const c = convertAll(head, docs);
		unmapped.push(...c.unmapped);
		await deps.store.exclusive(head.artifactId, async () => {
			const haveLines = new Set((await deps.history.feedback(head.artifactId)).map(f => f.id));
			for (const { feedback } of c.converted) {
				if (haveLines.has(feedback.id)) continue;
				seams.beforeAppend?.();
				await deps.history.appendFeedback(head.artifactId, feedback);
				appended += 1;
			}
			const haveEntries = new Set((await deps.history.log(head.artifactId)).map(e => e.id));
			for (const entry of batchEntries(head.artifactId, c)) {
				if (haveEntries.has(entry.id)) continue;
				seams.beforeAppend?.();
				await deps.history.appendLog(head.artifactId, entry);
				batches += 1;
			}
		});
	}
	return { appended, batches, unmapped };
}
