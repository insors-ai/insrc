/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source-root discovery for review-probe evidence gathering (LLD S001).
 *
 * The review probe used to nail the grep/walk root to a literal `src/`
 * subtree, so any repo whose code lives elsewhere (e.g. AFM under `mind/`)
 * returned zero hits and produced a FALSE `block` verdict. This helper
 * derives a repo's REAL top-level code roots from the indexed LMDB graph —
 * NO hardcoded structure assumption — via `listEntitiesForRepo` (the same
 * graph reader the analyze layer uses), filtering `kind === 'file'` and
 * bucketing each file's top-level path segment.
 *
 * Never throws: when the graph yields nothing (unindexed / degraded repo) or
 * the read fails, it returns a single repo-root entry with
 * `fallbackUsed: true`, so the caller can log the degraded run and still grep
 * *something* instead of silently blocking.
 */

import { join, relative, sep } from 'node:path';

import { getDb } from '../../db/client.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity } from '../../shared/types.js';

const log = getLogger('review');

/** One real top-level code root derived from the indexed graph. */
export interface SourceRoot {
	/** Absolute path of the root (repoPath itself for the repo-root / fallback cases). */
	readonly path: string;
	/** Count of indexed files under this root — drives densest-first grep ordering. */
	readonly fileCount: number;
}

export interface SourceRootsResult {
	/** Always non-empty — the repo-root fallback guarantees ≥1 target. */
	readonly roots: SourceRoot[];
	/** true when the graph yielded no file roots and repoPath was substituted. */
	readonly fallbackUsed: boolean;
}

export interface SourceRootsOpts {
	/**
	 * Injected indexed-file reader — dependency-injected in unit tests so no
	 * live daemon graph is opened. Defaults to the daemon graph via
	 * `listEntitiesForRepo(getDb(), repoPath)`.
	 */
	readonly listEntities?: (repoPath: string) => Promise<readonly Entity[]>;
}

/** Default reader: the real indexed LMDB graph (daemon-owned via getDb). */
async function defaultListEntities(repoPath: string): Promise<readonly Entity[]> {
	const db = await getDb();
	return listEntitiesForRepo(db, repoPath);
}

/**
 * Top-level path segment of an absolute file path relative to `repoPath`.
 * Returns `''` when the file sits directly at the repo root (no directory
 * segment) or resolves outside the repo (defensive — treated as repo-root).
 */
function topSegment(repoPath: string, absFile: string): string {
	const rel = relative(repoPath, absFile);
	if (rel === '' || rel.startsWith('..')) return '';
	// A file directly at the repo root has no separator → repo-root bucket.
	if (!rel.includes(sep)) return '';
	return rel.split(sep)[0] ?? '';
}

/**
 * Derive a repo's real top-level source roots from the indexed graph.
 *
 * - Buckets indexed `kind === 'file'` entities by their top-level directory.
 * - If any indexed file sits directly at the repo root, the repo root itself
 *   is a code root and grepping it subsumes every subdir → collapse to a
 *   single `repoPath` root (also the all-files-at-root case).
 * - Otherwise one root per distinct top-level directory, densest-first.
 * - Empty graph / read failure → single `{ path: repoPath, fileCount: 0 }`
 *   with `fallbackUsed: true` (observable degraded run, never a throw).
 */
export async function resolveSourceRoots(
	repoPath: string,
	opts?: SourceRootsOpts,
): Promise<SourceRootsResult> {
	const read = opts?.listEntities ?? defaultListEntities;

	let entities: readonly Entity[];
	try {
		entities = await read(repoPath);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ repoPath, err: msg }, 'review:source-roots: graph read failed; falling back to repo root');
		return { roots: [{ path: repoPath, fileCount: 0 }], fallbackUsed: true };
	}

	const counts = new Map<string, number>();
	let total = 0;
	for (const e of entities) {
		if (e.kind !== 'file') continue;
		total++;
		const seg = topSegment(repoPath, e.file);
		counts.set(seg, (counts.get(seg) ?? 0) + 1);
	}

	if (total === 0) {
		return { roots: [{ path: repoPath, fileCount: 0 }], fallbackUsed: true };
	}

	// Root-level indexed files mean repoPath is itself a code root that
	// subsumes every subdir — grep it once rather than double-covering.
	if (counts.has('')) {
		return { roots: [{ path: repoPath, fileCount: total }], fallbackUsed: false };
	}

	const roots: SourceRoot[] = [...counts.entries()]
		.map(([seg, n]) => ({ path: join(repoPath, seg), fileCount: n }))
		.sort((a, b) => b.fileCount - a.fileCount);
	return { roots, fallbackUsed: false };
}

/**
 * The repo-relative prefix a match under `root` must carry so its `path:line`
 * anchor stays diff-clickable — `''` for the repo-root case, else the top
 * segment (`src`, `mind`, …). Forward-slash normalised.
 */
export function rootPrefix(repoPath: string, root: SourceRoot): string {
	const rel = relative(repoPath, root.path);
	if (rel === '' || rel.startsWith('..')) return '';
	return rel.split(sep).join('/');
}
