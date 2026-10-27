/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review s9 — the indexing-readiness freshness compute.
 *
 * `computeCodeReviewFreshness` decides whether the daemon's graph is current for
 * the Story's changed files, using the COMBINED signal the brainstorm settled
 * on: the repo's code-index work in the queue (in flight or pending; ISSUE-1102dc71)
 * AND each changed file's per-file index watermark vs
 * its mtime. It is the read-only core the `codeReview.freshness` daemon IPC
 * serves; the controller-side gate (insrc_code_review_step) block-and-polls it
 * before assembling grounding, so an empty/partial `grounding.symbols` (the S001
 * hollow-PASS) is impossible.
 *
 * Per-file staleness rule (matches the LLD edge cases):
 *   - a file whose mtime is 0 (deleted or unstattable) is settled first: never
 *     stale, never listed, no other seam is consulted;
 *   - a file WITH indexed entities is stale iff its entity watermark (the max
 *     `indexedAt` over its entities) predates the file's mtime;
 *   - a file with NO indexed entities is classed by the selection seam (the
 *     indexer's own rule): 'not-code' and 'excluded-by-ignore' files are never
 *     stale, a 'selected' file is stale until the graph holds its entities.
 *     A selection read that throws keeps the file stale but unlisted.
 *   - a stale file is also listed in `unindexedFiles` (the index holds it but has
 *     not caught up) unless an index request was made at or after its mtime.
 *
 * The graph + fs + queue reads are behind an injectable {@link FreshnessDeps}
 * seam so the pure compute is unit-tested with fakes (no live daemon), and never
 * calls `repo.reindex` or mutates any store.
 */

import type { FileSelection } from '../../indexer/file-selection.js';

/** The read-only seams `computeCodeReviewFreshness` composes. */
export interface FreshnessDeps {
	/** The code-graph work for `repoPath` queued or in flight (IndexQueue.codeIndexWorkFor);
	 *  other repos, config, re-embed and document-summary jobs are not counted (ISSUE-1102dc71). */
	readonly codeIndexWork: (repoPath: string) => { inFlight: boolean; pending: number } | Promise<{ inFlight: boolean; pending: number }>;
	/** The max per-entity `indexedAt` (unix ms) over entities DEFINED in `file`,
	 *  or `null` when the file has NO indexed entities. */
	readonly entityWatermark: (repoPath: string, file: string) => Promise<number | null>;
	/** The repo-level `lastIndexed` watermark (unix ms; 0 if never indexed). */
	readonly repoLastIndexed: (repoPath: string) => Promise<number>;
	/** The changed file's mtime (unix ms); 0 when it cannot be stat'd. */
	readonly fileMtime: (repoPath: string, file: string) => Promise<number>;
	/** Whether the full index takes the file (the indexer's selectFile rule). */
	readonly selection: (repoPath: string, file: string) => Promise<FileSelection>;
	/** Unix ms of the last index request made for the file, or undefined when none was. */
	readonly requestedAt: (repoPath: string, file: string) => number | undefined;
}

/** The freshness verdict for a changed set. */
export interface FreshnessResult {
	/** Code-index work for the repo is in flight or queued — the other half of the
	 *  combined signal: `inFlight || pendingCodeIndexJobs > 0`. */
	readonly isProcessing: boolean;
	/** A code-index job for the repo is being processed. */
	readonly inFlight: boolean;
	/** Code-index jobs for the repo still queued. */
	readonly pendingCodeIndexJobs: number;
	/** The subset of changedFiles whose index watermark is behind their mtime. */
	readonly staleFiles: readonly string[];
	/** The subset of staleFiles that exist, that the index holds (older watermark, or selected without
	 *  entities) and that no index request at or after their mtime covers: the files to request. */
	readonly unindexedFiles: readonly string[];
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
	const work = await deps.codeIndexWork(repoPath);
	const isProcessing = work.inFlight || work.pending > 0;
	const staleFiles: string[] = [];
	const unindexedFiles: string[] = [];

	for (const file of changedFiles) {
		const mtime = await deps.fileMtime(repoPath, file);
		if (mtime === 0) continue;                                  // deleted or unstattable: settled first
		let listable = true;
		const watermark = await deps.entityWatermark(repoPath, file);
		if (watermark !== null) {
			if (watermark >= mtime) continue;
		} else {
			let selection: FileSelection;
			try {
				selection = await deps.selection(repoPath, file);
			} catch {
				selection = 'selected';                             // unknown: keep it stale, request nothing
				listable = false;
			}
			if (selection !== 'selected') continue;
		}
		staleFiles.push(file);
		const requested = deps.requestedAt(repoPath, file);
		if (listable && (requested === undefined || requested < mtime)) unindexedFiles.push(file);
	}

	return { isProcessing, inFlight: work.inFlight, pendingCodeIndexJobs: work.pending, staleFiles, unindexedFiles };
}

/**
 * Build the real GRAPH + fs seams for the freshness compute — `entityWatermark`
 * (LMDB graph), `fileMtime` (fs) and `selection` (the indexer's selectFile rule).
 * The daemon handler supplies the remaining seams from its own runtime state:
 * `codeIndexWork` (the queue instance), `repoLastIndexed` (the registered-repo row
 * it already reads) and `requestedAt` (its request map). Lazy-imports the
 * graph layer so the pure compute + its unit tests never open the env. Read-only.
 */
export async function realFreshnessGraphDeps(): Promise<Pick<FreshnessDeps, 'entityWatermark' | 'fileMtime' | 'selection'>> {
	const { findEntitiesByFile } = await import('../../db/entities.js');
	const { statSync }         = await import('node:fs');
	const { join, isAbsolute } = await import('node:path');
	const { selectFile }       = await import('../../indexer/file-selection.js');
	const { resolveRepoIgnore } = await import('../../indexer/repo-ignore-config.js');
	// the parsers register themselves on import, as the indexer module does
	await import('../../indexer/parser/typescript.js');
	await import('../../indexer/parser/python.js');
	await import('../../indexer/parser/go.js');
	await import('../../indexer/parser/java.js');
	await import('../../indexer/parser/scala.js');
	await import('../../indexer/parser/kotlin.js');
	await import('../../indexer/parser/artifact.js');

	return {
		async entityWatermark(repoPath, file) {
			const absolute = isAbsolute(file) ? file : join(repoPath, file);
			let max: number | null = null;
			for (const entity of await findEntitiesByFile(null, absolute)) {
				if (entity.repo !== repoPath) continue;
				const parsed = Date.parse(entity.indexedAt);
				const at = Number.isFinite(parsed) ? parsed : 0;
				max = max === null ? at : Math.max(max, at);
			}
			return max;
		},
		async selection(repoPath, file) {
			const absolute = isAbsolute(file) ? file : join(repoPath, file);
			return selectFile(absolute, repoPath, resolveRepoIgnore(repoPath));
		},
		async fileMtime(repoPath, file) {
			try {
				const abs = isAbsolute(file) ? file : join(repoPath, file);
				return statSync(abs).mtimeMs;
			} catch {
				return 0;   // a deleted/unstattable changed file is treated as mtime 0 (settled first by the compute)
			}
		},
	};
}
