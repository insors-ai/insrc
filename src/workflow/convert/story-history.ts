/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The history that belongs to a Story moves from its LLD to its STORY head: the feedback lines the comment sync recorded from the
 * issue (`tracker:<comment id>`) and the receipts of the feedback it posted, so the sync reads and posts on the STORY head from now
 * on. Sidecar lines are append-only, so the LLD keeps its copies as history; a copy keeps the id of the line it copies and the
 * sidecar reader de-duplicates by id, so a repeat appends nothing.
 *
 * The `Attached ...` comments posted before the attach marker existed are not rewritten. When a tracker port is supplied the plan
 * lists them (issue and comment id) and the report names them.
 */

import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import { History } from '../artifact-core/history.js';
import type { ChangeLogEntry, Feedback } from '../artifact-core/types.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import { epicsOf, lldOf, storyId } from './units.js';
import type { ConversionChange, ConversionDeps, LegacyAttachComment, RawHead } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const isTrackerLine = (f: Feedback): boolean => f.id.startsWith('tracker:');
const isReceipt = (e: ChangeLogEntry): boolean => (e.outcome?.data as { kind?: unknown } | undefined)?.kind === 'feedback-post';

/** The lines and receipts of the LLD that the STORY head does not hold yet. */
async function pending(history: History, from: string, to: string): Promise<{ lines: Feedback[]; receipts: ChangeLogEntry[] }> {
	let lines: Feedback[] = [], receipts: ChangeLogEntry[] = [];
	let haveLines = new Set<string>(), haveEntries = new Set<string>();
	try {
		lines = (await history.feedback(from)).filter(isTrackerLine);
		receipts = (await history.log(from)).filter(isReceipt);
		haveLines = new Set((await history.feedback(to)).map(f => f.id));
		haveEntries = new Set((await history.log(to)).map(e => e.id));
	} catch { return { lines: [], receipts: [] }; } // an id the model refuses (an uppercase story id) has no history to move
	return { lines: lines.filter(f => !haveLines.has(f.id)), receipts: receipts.filter(e => !haveEntries.has(e.id)) };
}

/** The marker every attach comment carries since s8. */
const ATTACH_MARKER_PREFIX = '<!-- insrc:attach:';

/** A comment posted as `Attached ...` before the attach marker existed. */
const isLegacyAttach = (text: string): boolean => text.startsWith('Attached ') && !text.includes(ATTACH_MARKER_PREFIX);

const bindingIssue = (head: RawHead | undefined): string | undefined => {
	const meta = head !== undefined && isObj(head.json) ? head.json['meta'] : undefined;
	const envelope = isObj(meta) ? meta['envelope'] : undefined;
	const binding = isObj(envelope) ? envelope['binding'] : undefined;
	const reference = isObj(binding) ? binding['reference'] : undefined;
	return isObj(reference) && typeof reference['entityId'] === 'string' ? reference['entityId'] : undefined;
};

export const storyHistoryRule: PlanRule = async (ctx): Promise<RulePlan> => {
	const history = new History(new FileSidecarStore(ctx.repo));
	const changes: ConversionChange[] = [];
	const legacy: LegacyAttachComment[] = [];
	const seen = new Set<string>();
	const listLegacy = (issue: string | undefined): void => {
		if (ctx.tracker === undefined || issue === undefined || seen.has(issue)) return;
		seen.add(issue);
		const listed = ctx.tracker.listComments(issue);
		if (!listed.ok) return; // never blocks the conversion
		for (const c of listed.value) if (isLegacyAttach(c.text)) legacy.push({ issue, commentId: c.externalId });
	};
	for (const epic of epicsOf(ctx.heads)) {
		listLegacy(bindingIssue(ctx.heads.find(h => h.artifactId === `DEF-${epic.hash}`)));
		for (const story of epic.stories) {
			const lld = lldOf(ctx.heads, epic.hash, story.id);
			if (lld === undefined) continue;
			listLegacy(bindingIssue(lld));
			const sid = storyId(epic.hash, story.id);
			const { lines, receipts } = await pending(history, lld.artifactId, sid);
			if (lines.length + receipts.length > 0) changes.push({ rule: 'move-story-history', artifactId: lld.artifactId, detail: `${lines.length} tracker lines and ${receipts.length} receipts to ${sid}` });
		}
	}
	return { changes, legacyAttachComments: legacy };
};

export interface StoryHistoryResult {
	readonly lines:    number;
	readonly receipts: number;
}

/** Copy each LLD's tracker lines and receipts to its STORY head, under the STORY's lock. Safe to run again. */
export async function applyStoryHistory(repo: string, deps: ConversionDeps): Promise<StoryHistoryResult> {
	let lines = 0, receipts = 0;
	const heads = readRawHeads(repo).heads;
	for (const epic of epicsOf(heads)) {
		for (const story of epic.stories) {
			const lld = lldOf(heads, epic.hash, story.id);
			if (lld === undefined) continue;
			const sid = storyId(epic.hash, story.id);
			await deps.store.exclusive(sid, async () => {
				const todo = await pending(deps.history, lld.artifactId, sid);
				for (const f of todo.lines) { await deps.history.appendFeedback(sid, f); lines += 1; }
				for (const e of todo.receipts) { await deps.history.appendLog(sid, e); receipts += 1; }
			});
		}
	}
	return { lines, receipts };
}
