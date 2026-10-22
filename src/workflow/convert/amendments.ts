/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A flat amendment record (`{ id, epicHash, amendment, rationale, status, ... }`) becomes a `{ meta, body, citations }` head.
 * The head is still in the legacy stamp shape (`meta.approvedAt`, `rejectedAt`, `rejectReason`), so the ordinary head migration
 * gives it its lifecycle and log entries from its own approval and rejection stamps, as it does for every other kind.
 *
 * `status: pending` has no stamp and becomes a draft; `approvedBy` and the side effects are kept in the body.
 */

import { join } from 'node:path';

import { ARTIFACTS_DIR, writeAtomic } from '../storage.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import { anchorOf } from './stamps.js';
import type { ConversionChange, ConversionProblem, RawHead } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;

/** The head a flat record becomes, or why it cannot. `epicCreatedAt` is the work item's anchor. */
export function flatToHead(flat: Obj, epicCreatedAt: string | undefined): { head: Obj } | { problem: string } {
	const epicHash = text(flat['epicHash']);
	const proposedAt = text(flat['proposedAt']);
	if (epicHash === undefined) return { problem: 'has no epicHash' };
	if (!isObj(flat['amendment'])) return { problem: 'has no amendment' };
	if (proposedAt === undefined) return { problem: 'has no proposedAt to date it by' };
	const status = text(flat['status']);
	if (status !== undefined && !['pending', 'approved', 'rejected'].includes(status)) return { problem: `has the unknown status '${status}'` };
	if (epicCreatedAt === undefined) return { problem: `has no work item head to take epicCreatedAt from (epic ${epicHash})` };
	const approvedAt = text(flat['approvedAt']);
	const rejectedAt = text(flat['rejectedAt']);
	const meta: Obj = {
		workflow: 'design.epic', epicHash, ...(text(flat['epicSlug']) !== undefined ? { epicSlug: flat['epicSlug'] } : {}),
		createdAt: proposedAt, epicCreatedAt,
		...(approvedAt !== undefined ? { approvedAt } : status === 'approved' ? { status: 'approved' } : {}),
		...(rejectedAt !== undefined ? { rejectedAt } : status === 'rejected' && approvedAt === undefined ? { status: 'rejected' } : {}),
		...(text(flat['rejectedReason']) !== undefined ? { rejectReason: flat['rejectedReason'] } : {}),
	};
	const body: Obj = {
		...(text(flat['id']) !== undefined ? { id: flat['id'] } : {}),
		...(text(flat['hldBaseRunId']) !== undefined ? { hldBaseRunId: flat['hldBaseRunId'] } : {}),
		amendment: flat['amendment'],
		...(flat['rationale'] !== undefined ? { rationale: flat['rationale'] } : {}),
		...(flat['proposedBy'] !== undefined ? { proposedBy: flat['proposedBy'] } : {}),
		proposedAt,
		...(flat['approvedBy'] !== undefined ? { approvedBy: flat['approvedBy'] } : {}),
		...(flat['sideEffects'] !== undefined ? { sideEffects: flat['sideEffects'] } : {}),
	};
	return { head: { meta, body, citations: Array.isArray(flat['citations']) ? flat['citations'] : [] } };
}

const isFlat = (h: RawHead): boolean => h.artifactId.startsWith('AMD-') && isObj(h.json) && !isObj(h.json['meta']);

function convertAll(heads: readonly RawHead[]): { converted: { id: string; head: Obj }[]; problems: ConversionProblem[] } {
	const converted: { id: string; head: Obj }[] = [];
	const problems: ConversionProblem[] = [];
	for (const h of heads.filter(isFlat)) {
		const flat = h.json as Obj;
		const hash = text(flat['epicHash']);
		const out = flatToHead(flat, hash === undefined ? undefined : anchorOf(heads, hash));
		if ('problem' in out) problems.push({ file: `${ARTIFACTS_DIR}/${h.artifactId}.json`, reason: out.problem });
		else converted.push({ id: h.artifactId, head: out.head });
	}
	return { converted, problems };
}

/** The plan rule: one change per flat amendment, and a problem for each that cannot be converted. */
export const amendmentRule: PlanRule = (ctx): RulePlan => {
	const { converted, problems } = convertAll(ctx.heads);
	const changes: ConversionChange[] = converted.map(c => ({ rule: 'convert-amendment', artifactId: c.id, detail: 'flat record to a head' }));
	return { changes, problems };
};

/** Writes each flat amendment as a head; returns how many were written. */
export function applyAmendments(repo: string): number {
	const { converted } = convertAll(readRawHeads(repo).heads);
	for (const { id, head } of converted) writeAtomic(join(repo, ARTIFACTS_DIR, `${id}.json`), JSON.stringify(head, null, 2) + '\n');
	return converted.length;
}
