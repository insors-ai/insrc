/**
 * IndexStateRow upkeep inside a write transaction (Epic c2ba6fa6, Story s1;
 * sc1 IndexState with AMD-c2ba6fa62a148ed1-2's reasonCounts).
 *
 * Every helper here takes the store of an OPEN write transaction and must be
 * called from the same synchronous callback that writes the rows it counts,
 * so a throw aborts the rows and the counts together (withWriteTxn runs its
 * callback as an lmdb child transaction; ISSUE-5437d6e5).
 *
 * `reconcileIndexStateInTxn` is the check on store open: it recounts every
 * repository's pending rows from their stored class, corrects a row that
 * differs (the caller logs each correction), and deletes the row of a repoId
 * that is no longer a registered workspace repository.
 */

import { decodeIndexStateRow, decodeRepoRow, encodeIndexStateRow, type IndexStateRow, type PendingClass } from './codec.js';
import { encodeRepoKey } from './keys.js';
import { emptyIndexStateRow, recountPending, zeroPending } from './pending-class.js';
import type { GraphStore } from './store.js';

/** meta key of the daemon-wide count of relationships refused with no repository to count them against. */
export const UNATTRIBUTED_UNWRITABLE_KEY = 'unattributed_unwritable';

export interface UnattributedUnwritable {
	total:   number;
	reasons: Record<string, number>;
}

export function getIndexStateRowInTxn(s: GraphStore, repoId: number): IndexStateRow | undefined {
	const buf = s.indexState.get(encodeRepoKey(repoId)) as Buffer | undefined;
	return buf === undefined ? undefined : decodeIndexStateRow(buf);
}

export function putIndexStateRowInTxn(s: GraphStore, repoId: number, row: IndexStateRow): void {
	void s.indexState.put(encodeRepoKey(repoId), encodeIndexStateRow(row));
}

/** Read, change and write back a repository's row; a missing row starts empty (not complete). */
export function updateIndexStateRowInTxn(s: GraphStore, repoId: number, change: (row: IndexStateRow) => void): IndexStateRow {
	const row = getIndexStateRowInTxn(s, repoId) ?? emptyIndexStateRow();
	change(row);
	putIndexStateRowInTxn(s, repoId, row);
	return row;
}

/** One side of a pending-row move: its class and, for an awaiting-target row, its reason. */
export interface PendingSlot {
	cls:     PendingClass;
	reason?: string | undefined;
}

function bump(counts: Record<string, number>, key: string, by: number): void {
	const next = (counts[key] ?? 0) + by;
	if (next === 0) delete counts[key];
	else counts[key] = next;
}

/**
 * Move one pending row's count from `from` to `to`: a new row has no `from`,
 * a deleted or promoted row has no `to`. An awaiting-target slot also moves
 * its reason count.
 */
export function movePendingInTxn(s: GraphStore, repoId: number, from: PendingSlot | undefined, to: PendingSlot | undefined): void {
	if (from === undefined && to === undefined) return;
	updateIndexStateRowInTxn(s, repoId, row => {
		for (const [slot, by] of [[from, -1], [to, 1]] as const) {
			if (slot === undefined) continue;
			row.pending[slot.cls] += by;
			if (slot.cls === 'awaiting-target' && slot.reason !== undefined) bump(row.reasonCounts.awaiting, slot.reason, by);
		}
	});
}

/** Count one relationship the store refused: against its repository, or daemon-wide when it names none. */
export function countUnwritableInTxn(s: GraphStore, repoId: number | undefined, reason: string): void {
	if (repoId === undefined) {
		const current = (s.meta.get(UNATTRIBUTED_UNWRITABLE_KEY) as UnattributedUnwritable | undefined) ?? { total: 0, reasons: {} };
		const next: UnattributedUnwritable = { total: current.total + 1, reasons: { ...current.reasons } };
		bump(next.reasons, reason, 1);
		void s.meta.put(UNATTRIBUTED_UNWRITABLE_KEY, next);
		return;
	}
	updateIndexStateRowInTxn(s, repoId, row => {
		row.unwritable++;
		bump(row.reasonCounts.unwritable, reason, 1);
	});
}

export function advanceGenerationInTxn(s: GraphStore, repoId: number): void {
	updateIndexStateRowInTxn(s, repoId, row => { row.generation++; });
}

export function readUnattributedUnwritableInTxn(s: GraphStore): UnattributedUnwritable {
	return (s.meta.get(UNATTRIBUTED_UNWRITABLE_KEY) as UnattributedUnwritable | undefined) ?? { total: 0, reasons: {} };
}

/** A correction the recount on open made, for the caller to log. */
export interface IndexStateCorrection {
	repoId: number;
	kind:   'counts-corrected' | 'row-deleted';
	stored?:   { pending: Record<PendingClass, number>; awaiting: Record<string, number> } | undefined;
	recounted?: { pending: Record<PendingClass, number>; awaiting: Record<string, number> } | undefined;
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
	return true;
}

/**
 * The check on store open. Recounts pending rows by stored class; corrects the
 * pending and awaiting-reason counts of a row that differs; deletes the row of
 * a repoId that is not a registered workspace repository. A repository with no
 * row is left without one (it reads as not indexed since this change).
 */
export function reconcileIndexStateInTxn(s: GraphStore): IndexStateCorrection[] {
	const workspace = new Set<number>();
	for (const { value } of s.repo.getRange()) {
		const r = decodeRepoRow(value as Buffer);
		if (r.kind === 'workspace') workspace.add(r.id);
	}
	const counts = recountPending(s);
	const corrections: IndexStateCorrection[] = [];
	const stale: Buffer[] = [];
	for (const { key, value } of s.indexState.getRange()) {
		const repoId = (key as Buffer).readUInt32BE(0);
		if (!workspace.has(repoId)) {
			stale.push(Buffer.from(key as Buffer));
			corrections.push({ repoId, kind: 'row-deleted' });
			continue;
		}
		const row = decodeIndexStateRow(value as Buffer);
		const c = counts.get(repoId) ?? { pending: zeroPending(), awaiting: {} };
		if (!sameCounts(row.pending, c.pending) || !sameCounts(row.reasonCounts.awaiting, c.awaiting)) {
			corrections.push({
				repoId, kind: 'counts-corrected',
				stored:    { pending: { ...row.pending }, awaiting: { ...row.reasonCounts.awaiting } },
				recounted: { pending: { ...c.pending },   awaiting: { ...c.awaiting } },
			});
			row.pending = { ...c.pending };
			row.reasonCounts.awaiting = { ...c.awaiting };
			putIndexStateRowInTxn(s, repoId, row);
		}
	}
	for (const k of stale) void s.indexState.remove(k);
	return corrections;
}
