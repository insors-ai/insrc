/**
 * A repository's recorded index state and the completeness derived from it
 * (Epic c2ba6fa6, Story s1; sc1 IndexState with AMD-c2ba6fa62a148ed1-2's
 * reasonCounts).
 *
 * The state is written only inside the store's write transactions, with the
 * rows it counts (src/db/graph/index-state-rows.ts). This module reads it,
 * derives graphComplete and complete by the sc1 formula, and states a
 * repository's completeness as plain reason lines with their counts.
 */

import { getGraphStore, withWriteTxn } from './graph/store.js';
import type { IndexStateRow, PendingClass } from './graph/codec.js';
import { getIndexStateRowInTxn, readUnattributedUnwritableInTxn, updateIndexStateRowInTxn, type UnattributedUnwritable } from './graph/index-state-rows.js';
import { zeroPending } from './graph/pending-class.js';
import { lookupRepoId } from './repos.js';

export type { PendingClass, UnattributedUnwritable };

/** sc1 IndexState: the stored row plus the two derived flags. */
export interface IndexState extends IndexStateRow {
	repoPath:      string;
	graphComplete: boolean;
	complete:      boolean;
}

/** The completeness field returned beside a repository's unchanged status. */
export interface RepoCompleteness {
	complete:         boolean;
	reasons:          string[];
	counts:           { pending: Record<PendingClass, number>; unwritable: number; unembedded: number; uncommittedFiles: number };
	uncommittedFiles: string[];
	generation:       number;
}

/** The sc1 formula. */
export function deriveIndexState(repoPath: string, row: IndexStateRow): IndexState {
	const graphComplete = row.fullIndexFinished
		&& !row.endpointPassFailed
		&& row.uncommittedFiles.length === 0
		&& row.pending['awaiting-target'] === 0
		&& row.unwritable === 0;
	const complete = graphComplete && (row.unembedded === 0 || !row.embeddingAvailable);
	return { ...row, repoPath, graphComplete, complete };
}

/** A repository's state; undefined for one not registered or not indexed since this change. */
export async function readIndexState(repoPath: string): Promise<IndexState | undefined> {
	const repoId = await lookupRepoId(repoPath);
	if (repoId === undefined) return undefined;
	const store = await getGraphStore();
	const row = getIndexStateRowInTxn(store, repoId);
	return row === undefined ? undefined : deriveIndexState(repoPath, row);
}

/** The daemon-wide count of relationships refused with no repository to count them against. */
export async function readUnattributedUnwritable(): Promise<UnattributedUnwritable> {
	return readUnattributedUnwritableInTxn(await getGraphStore());
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** How an awaiting-target reason reads in a reason line. */
const AWAITING_REASON_TEXT: Record<string, (n: number) => string> = {
	'target-not-stored-yet':     n => `${plural(n, 'relationship awaits', 'relationships await')} a target that is not stored yet`,
	'target-excluded-by-ignore': n => `${plural(n, 'relationship points', 'relationships point')} at files an ignore rule excludes`,
	'target-not-committed':      n => `${plural(n, 'relationship awaits', 'relationships await')} a file that could not be indexed`,
	'unattempted':               n => `${plural(n, 'relationship has', 'relationships have')} not been attempted by the cross-file pass`,
};

export const NOT_INDEXED_REASON = 'not indexed since the index-state change: a reindex is needed';

/**
 * One plain line per non-zero cause, each with its count; awaiting-target rows
 * are split by reason. 'ambiguous', 'no-candidate' and 'external-endpoint'
 * rows are not causes.
 */
export function completenessOf(state: IndexState | undefined): RepoCompleteness {
	if (state === undefined) {
		return {
			complete: false,
			reasons:  [NOT_INDEXED_REASON],
			counts:   { pending: { 'awaiting-target': 0, 'ambiguous': 0, 'no-candidate': 0, 'external-endpoint': 0 }, unwritable: 0, unembedded: 0, uncommittedFiles: 0 },
			uncommittedFiles: [],
			generation: 0,
		};
	}
	const reasons: string[] = [];
	if (!state.fullIndexFinished) reasons.push('the full index has not finished');
	if (state.endpointPassFailed) reasons.push('the external-endpoint pass failed');
	if (state.uncommittedFiles.length > 0) reasons.push(`${plural(state.uncommittedFiles.length, 'file', 'files')} could not be indexed`);
	const awaiting = state.pending['awaiting-target'];
	if (awaiting > 0) {
		let explained = 0;
		for (const [reason, n] of Object.entries(state.reasonCounts.awaiting).sort(([a], [b]) => a.localeCompare(b))) {
			if (n <= 0) continue;
			explained += n;
			reasons.push((AWAITING_REASON_TEXT[reason] ?? (k => `${plural(k, 'relationship awaits', 'relationships await')} a target (${reason})`))(n));
		}
		if (awaiting > explained) reasons.push(`${plural(awaiting - explained, 'relationship awaits', 'relationships await')} a target`);
	}
	if (state.unwritable > 0) {
		const by = Object.entries(state.reasonCounts.unwritable).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([r, n]) => `${r}: ${n}`);
		reasons.push(`${plural(state.unwritable, 'relationship', 'relationships')} could not be stored${by.length > 0 ? ` (${by.join(', ')})` : ''}`);
	}
	if (state.unembedded > 0 && state.embeddingAvailable) reasons.push(`${plural(state.unembedded, 'entity has', 'entities have')} no vector`);
	return {
		complete: state.complete,
		reasons,
		counts:   { pending: { ...state.pending }, unwritable: state.unwritable, unembedded: state.unembedded, uncommittedFiles: state.uncommittedFiles.length },
		uncommittedFiles: [...state.uncommittedFiles],
		generation: state.generation,
	};
}

// ---------------------------------------------------------------------------
// The full index's writes (s1/t11)
// ---------------------------------------------------------------------------

async function updateState(repoPath: string, change: (row: IndexStateRow) => void): Promise<void> {
	const repoId = await lookupRepoId(repoPath);
	if (repoId === undefined) return;
	await withWriteTxn(s => { updateIndexStateRowInTxn(s, repoId, change); });
}

/** A full index begins, after the repository's rows are deleted: generation advanced, counts zeroed, not finished. */
export function beginFullIndexState(repoPath: string): Promise<void> {
	return updateState(repoPath, row => {
		row.generation += 1;
		row.pending = zeroPending();
		row.unwritable = 0;
		row.reasonCounts = { unwritable: {}, awaiting: {} };
		row.unembedded = 0;
		row.uncommittedFiles = [];
		row.fullIndexFinished = false;
		row.endpointPassFailed = false;
	});
}

/** The selected files the full index could not store. */
export function setUncommittedFiles(repoPath: string, files: readonly string[]): Promise<void> {
	return updateState(repoPath, row => { row.uncommittedFiles = [...files]; });
}

/** The full index finished: its cross-file and endpoint passes ran. */
export function finishFullIndexState(repoPath: string, endpointPassFailed: boolean): Promise<void> {
	return updateState(repoPath, row => {
		row.fullIndexFinished = true;
		row.endpointPassFailed = endpointPassFailed;
	});
}
