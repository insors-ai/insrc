/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review s9 — the indexing-readiness freshness compute.
 *
 * `computeCodeReviewFreshness` decides whether the daemon's graph is current for
 * the Story's changed files, using the COMBINED signal the brainstorm settled
 * on: `queue.isProcessing` AND each changed file's per-file index watermark vs
 * its mtime. It is the read-only core the `codeReview.freshness` daemon IPC
 * serves; the controller-side gate (insrc_code_review_step) block-and-polls it
 * before assembling grounding, so an empty/partial `grounding.symbols` (the S001
 * hollow-PASS) is impossible.
 *
 * Per-file staleness rule (matches the LLD edge cases):
 *   - a file WITH indexed entities is stale iff its entity watermark (the max
 *     `indexedAt` over its entities) predates the file's mtime;
 *   - a file with NO indexed entities falls back to the REPO-level `lastIndexed`
 *     watermark: stale iff repoLastIndexed < mtime. This distinguishes a
 *     never-indexed source file (repoLastIndexed behind the change => stale)
 *     from a genuinely non-indexable path like a `.md`/lockfile (the repo was
 *     indexed AFTER the change and still produced no entities => fresh, excluded).
 *
 * The graph + fs + queue reads are behind an injectable {@link FreshnessDeps}
 * seam so the pure compute is unit-tested with fakes (no live daemon), and never
 * calls `repo.reindex` or mutates any store.
 */

/** The read-only seams `computeCodeReviewFreshness` composes. */
export interface FreshnessDeps {
	/** The index queue's in-flight flag (queue.isProcessing). */
	readonly isProcessing: () => boolean;
	/** The max per-entity `indexedAt` (unix ms) over entities DEFINED in `file`,
	 *  or `null` when the file has NO indexed entities. */
	readonly entityWatermark: (repoPath: string, file: string) => Promise<number | null>;
	/** The repo-level `lastIndexed` watermark (unix ms; 0 if never indexed). */
	readonly repoLastIndexed: (repoPath: string) => Promise<number>;
	/** The changed file's mtime (unix ms); 0 when it cannot be stat'd. */
	readonly fileMtime: (repoPath: string, file: string) => Promise<number>;
}

/** The freshness verdict for a changed set. */
export interface FreshnessResult {
	/** queue.isProcessing at check time — the other half of the combined signal. */
	readonly isProcessing: boolean;
	/** The subset of changedFiles whose index watermark is behind their mtime. */
	readonly staleFiles: readonly string[];
}

/**
 * Compute the code-review freshness for the Story's changed files. Read-only;
 * never triggers a reindex. Reads are serial (no Promise.all over the store,
 * k4 discipline). `isProcessing` and `staleFiles` are returned separately so the
 * gate combines them (stale = isProcessing OR staleFiles non-empty).
 */
export async function computeCodeReviewFreshness(
	repoPath:     string,
	changedFiles: readonly string[],
	deps:         FreshnessDeps,
): Promise<FreshnessResult> {
	const isProcessing = deps.isProcessing();
	const staleFiles: string[] = [];
	// The repo-level watermark is only needed for files with no entities; read it
	// at most once, lazily.
	let repoLastIndexed: number | null = null;

	for (const file of changedFiles) {
		const mtime = await deps.fileMtime(repoPath, file);
		const watermark = await deps.entityWatermark(repoPath, file);
		if (watermark !== null) {
			if (watermark < mtime) staleFiles.push(file);
			continue;
		}
		// No indexed entities: fall back to the repo-level watermark.
		if (repoLastIndexed === null) repoLastIndexed = await deps.repoLastIndexed(repoPath);
		if (repoLastIndexed < mtime) staleFiles.push(file);
	}

	return { isProcessing, staleFiles };
}

/**
 * Build the real GRAPH + fs seams for the freshness compute — `entityWatermark`
 * (LMDB graph) + `fileMtime` (fs). The daemon handler supplies the remaining two
 * seams from its own runtime state: `isProcessing` (the queue instance) and
 * `repoLastIndexed` (the registered-repo row it already reads). Lazy-imports the
 * graph layer so the pure compute + its unit tests never open the env. Read-only.
 */
export async function realFreshnessGraphDeps(): Promise<Pick<FreshnessDeps, 'entityWatermark' | 'fileMtime'>> {
	const { getGraphStore }    = await import('../../db/graph/store.js');
	const { decodeEntityRow }  = await import('../../db/graph/codec.js');
	const { statSync }         = await import('node:fs');
	const { join, isAbsolute } = await import('node:path');

	return {
		async entityWatermark(_repoPath, file) {
			const store = await getGraphStore();
			let max: number | null = null;
			for (const { value } of store.entity.getRange()) {
				const row = decodeEntityRow(value as Buffer);
				if (row.filePath === file) {
					const at = typeof row.indexedAt === 'number' ? row.indexedAt : 0;
					max = max === null ? at : Math.max(max, at);
				}
			}
			return max;
		},
		async fileMtime(repoPath, file) {
			try {
				const abs = isAbsolute(file) ? file : join(repoPath, file);
				return statSync(abs).mtimeMs;
			} catch {
				return 0;   // a deleted/unstattable changed file is treated as mtime 0 (never stale on its own)
			}
		},
	};
}
