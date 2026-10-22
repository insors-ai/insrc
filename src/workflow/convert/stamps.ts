/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `meta.epicCreatedAt`: the creation time of a work item, which every record of the item carries and from which its folder is
 * keyed. An old record may lack it. It is taken from the head of the work item (the Define, the ISSUE or the SPEC: its own
 * `epicCreatedAt`, else its `createdAt`); a standalone design with no such head takes the earliest `createdAt` of its records.
 * A record with no source is a problem, never guessed.
 */

import { join } from 'node:path';

import { ARTIFACTS_DIR, writeAtomic } from '../storage.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import type { ConversionChange, ConversionProblem, RawHead } from './types.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;

const ROOT_KINDS = ['DEF', 'ISSUE', 'SPEC'] as const;

function metaOf(head: RawHead): Obj | undefined {
	return isObj(head.json) && isObj(head.json['meta']) ? head.json['meta'] : undefined;
}

/** The key that ties a record to its work item: epicHash, issueHash or specHash. */
function keyOf(meta: Obj): string | undefined {
	return text(meta['epicHash']) ?? text(meta['issueHash']) ?? text(meta['specHash']);
}

/** The anchor of the work item `hash`: its head's time, else (for a standalone design) the earliest record's. */
export function anchorOf(heads: readonly RawHead[], hash: string): string | undefined {
	for (const kind of ROOT_KINDS) {
		const root = heads.find(h => h.artifactId === `${kind}-${hash}`);
		const meta = root === undefined ? undefined : metaOf(root);
		const at = meta === undefined ? undefined : text(meta['epicCreatedAt']) ?? text(meta['createdAt']);
		if (at !== undefined) return at;
	}
	const own = heads.flatMap(h => { const m = metaOf(h); return m !== undefined && keyOf(m) === hash ? [m] : []; });
	if (!own.some(m => m['standalone'] === true)) return undefined;
	const times = own.map(m => text(m['createdAt'])).filter((t): t is string => t !== undefined).sort((a, b) => Date.parse(a) - Date.parse(b));
	return times[0];
}

interface Stamp { readonly head: RawHead; readonly at: string; readonly source: string }

function stampsFor(heads: readonly RawHead[]): { stamps: Stamp[]; problems: ConversionProblem[] } {
	const stamps: Stamp[] = [];
	const problems: ConversionProblem[] = [];
	for (const head of heads) {
		const meta = metaOf(head);
		if (meta === undefined || text(meta['epicCreatedAt']) !== undefined) continue;
		const key = keyOf(meta);
		const at = key === undefined ? undefined : anchorOf(heads, key);
		if (at === undefined) problems.push({ file: `${ARTIFACTS_DIR}/${head.artifactId}.json`, reason: key === undefined ? 'has no work item hash to take epicCreatedAt from' : `has no epicCreatedAt and the work item ${key} has no head or createdAt to take it from` });
		else stamps.push({ head, at, source: key ?? '' });
	}
	return { stamps, problems };
}

/** The plan rule: the records that lack epicCreatedAt, and the ones that cannot be given one. */
export const stampRule: PlanRule = (ctx): RulePlan => {
	const { stamps, problems } = stampsFor(ctx.heads);
	const changes: ConversionChange[] = stamps.map(s => ({ rule: 'stamp-epic-created-at', artifactId: s.head.artifactId, detail: `epicCreatedAt ${s.at}` }));
	return { changes, problems };
};

/** Writes meta.epicCreatedAt into every record that lacks it and can have it; returns how many were written. */
export function applyStamps(repo: string): number {
	const { stamps } = stampsFor(readRawHeads(repo).heads);
	for (const { head, at } of stamps) {
		const json = head.json as Obj;
		const next = { ...json, meta: { ...(json['meta'] as Obj), epicCreatedAt: at } };
		writeAtomic(join(repo, ARTIFACTS_DIR, `${head.artifactId}.json`), JSON.stringify(next, null, 2) + '\n');
	}
	return stamps.length;
}
