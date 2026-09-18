/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — code-ownership index + candidate matching (pure).
 *
 * A work item "owns" a code path when one of its persisted artifacts cites that
 * path. `buildOwnershipIndex` reads the `.insrc/artifacts/*.json` store (the
 * artifact tree in canonical form — the same store `readArtifactCore` reads) and
 * maps every cited code path to the work item(s) that cite it. `matchGraphCandidates`
 * is a pure scoring pass over that index — no DB — so it unit-tests with a
 * fabricated index. The graph EXPANSION (touched entity → neighbour files) is the
 * daemon's job (see `infer.ts`); this module only turns a set of paths into
 * ranked owning work items.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACTS_DIR } from '../storage.js';
import type { WorkItemRef } from '../types.js';
import type { RankedCandidate } from './types.js';

/** A cited-path → owning-work-items map. Keys are repo-relative code paths
 *  (line suffix stripped); values are the distinct work items whose artifacts
 *  cite that path. */
export interface OwnershipIndex {
	/** Look up the work items that cite exactly this path. */
	readonly byPath: ReadonlyMap<string, readonly WorkItemRef[]>;
}

/** Stable key for de-duplicating a WorkItemRef across citations. */
export function workItemKey(ref: WorkItemRef): string {
	return `${ref.epicHash ?? ''}|${ref.storyId ?? ''}|${ref.slug ?? ''}`;
}

/** Strip a trailing `:line` (or `:line:col`) suffix from a `code`/`doc` ref so
 *  citations at different lines of one file collapse to the same path. */
export function refPath(ref: string): string {
	// A ref may be `path`, `path:line`, or `path:line:col`. Cut at the first
	// `:` that is followed by a digit — leaves Windows-style drives untouched
	// (we deal in repo-relative POSIX paths here).
	const m = /^(.*?):\d+(?::\d+)?$/.exec(ref.trim());
	return (m !== null ? m[1]! : ref.trim());
}

interface RawArtifact {
	readonly meta?: {
		readonly epicHash?: unknown;
		readonly storyId?:  unknown;
		readonly epicSlug?: unknown;
	};
	readonly citations?: readonly { readonly kind?: unknown; readonly ref?: unknown }[];
}

/** Derive the minimal WorkItemRef from an artifact's meta. Only the present
 *  fields are set (exactOptionalPropertyTypes). Returns `null` when nothing
 *  identifying is present. */
function refFromMeta(meta: RawArtifact['meta']): WorkItemRef | null {
	if (meta === undefined) return null;
	const epicHash = typeof meta.epicHash === 'string' && meta.epicHash.length > 0 ? meta.epicHash : undefined;
	const storyId  = typeof meta.storyId  === 'string' && meta.storyId.length  > 0 ? meta.storyId  : undefined;
	const slug     = typeof meta.epicSlug === 'string' && meta.epicSlug.length > 0 ? meta.epicSlug : undefined;
	if (epicHash === undefined && storyId === undefined && slug === undefined) return null;
	return {
		...(epicHash !== undefined ? { epicHash } : {}),
		...(storyId  !== undefined ? { storyId }  : {}),
		...(slug     !== undefined ? { slug }     : {}),
	};
}

/**
 * Build the code-ownership index from the persisted artifact store. Best-effort
 * and pure-fs: a missing store yields an empty index; an unreadable JSON is
 * skipped (never throws). Only `code`/`doc` citations with a path-like ref
 * contribute (those are the ones that name source files).
 */
export function buildOwnershipIndex(repoPath: string): OwnershipIndex {
	const byPath = new Map<string, WorkItemRef[]>();
	const dir = join(repoPath, ARTIFACTS_DIR);
	if (!existsSync(dir)) return { byPath };

	for (const name of readdirSync(dir).sort()) {
		if (!name.endsWith('.json')) continue;
		let parsed: RawArtifact;
		try {
			parsed = JSON.parse(readFileSync(join(dir, name), 'utf8')) as RawArtifact;
		} catch {
			continue;
		}
		const ref = refFromMeta(parsed.meta);
		if (ref === null) continue;
		const citations = Array.isArray(parsed.citations) ? parsed.citations : [];
		for (const c of citations) {
			if (c === null || typeof c !== 'object') continue;
			const kind = c.kind;
			if (kind !== 'code' && kind !== 'doc') continue;
			if (typeof c.ref !== 'string' || c.ref.length === 0) continue;
			const path = refPath(c.ref);
			if (path.length === 0) continue;
			const bucket = byPath.get(path);
			if (bucket === undefined) {
				byPath.set(path, [ref]);
			} else if (!bucket.some(r => workItemKey(r) === workItemKey(ref))) {
				bucket.push(ref);
			}
		}
	}
	return { byPath };
}

/**
 * Rank the work items that own any of `paths`, by how many distinct touched
 * paths each owns. Pure — no DB, no fs. A path is matched against the index
 * exact-first, then by suffix (an index key `src/foo.ts` matches a touched
 * `.../src/foo.ts` and vice-versa) so absolute vs repo-relative spellings
 * still align. Evidence lists the matched paths. Sorted score-descending;
 * ties keep their input order (the policy detects ties and defers to prompt).
 */
export function matchGraphCandidates(
	paths: readonly string[],
	index: OwnershipIndex,
): RankedCandidate[] {
	// workItemKey → { ref, matchedPaths }
	const agg = new Map<string, { ref: WorkItemRef; matched: Set<string> }>();

	for (const raw of paths) {
		const p = refPath(raw);
		if (p.length === 0) continue;
		const owners = lookupOwners(p, index);
		for (const ref of owners) {
			const key = workItemKey(ref);
			const cur = agg.get(key);
			if (cur === undefined) agg.set(key, { ref, matched: new Set([p]) });
			else cur.matched.add(p);
		}
	}

	const out: RankedCandidate[] = [];
	for (const { ref, matched } of agg.values()) {
		out.push({
			parentRef: ref,
			score:     matched.size,
			evidence:  [...matched].sort().map(p => `code-ownership: touched ${p}`),
		});
	}
	out.sort((a, b) => b.score - a.score);
	return out;
}

/** Owners of a single path — exact key, else a suffix match either direction. */
function lookupOwners(path: string, index: OwnershipIndex): readonly WorkItemRef[] {
	const exact = index.byPath.get(path);
	if (exact !== undefined) return exact;
	// Fall back to endsWith matching so absolute vs repo-relative spellings align.
	const hits: WorkItemRef[] = [];
	const seen = new Set<string>();
	for (const [key, refs] of index.byPath) {
		if (key.endsWith(path) || path.endsWith(key)) {
			for (const ref of refs) {
				const k = workItemKey(ref);
				if (!seen.has(k)) { seen.add(k); hits.push(ref); }
			}
		}
	}
	return hits;
}
