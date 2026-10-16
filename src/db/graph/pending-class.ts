/**
 * The class of a pending relationship, and the count of a repository's
 * pending rows by class (Epic c2ba6fa6, Story s1; sc1 PendingClass).
 *
 * A row's class is stored on the row itself, in its free-form meta, so no
 * stored form changes. A row with no stored class reads as
 * 'external-endpoint' for a boundary kind (left to the endpoint passes) and
 * as 'awaiting-target' otherwise (not yet attempted by the cross-file pass).
 * Recounting reads the stored class; it never runs resolution again.
 */

import type { RelationKind } from '../../shared/types.js';
import { decodeUnresolvedRow, type IndexStateRow, type PendingClass, type UnresolvedRow } from './codec.js';
import type { GraphStore } from './store.js';

/** The external-service relationship kinds, owned by the two endpoint passes. */
export const BOUNDARY_RELATION_KINDS: ReadonlySet<RelationKind> = new Set<RelationKind>([
	'CALLS_HTTP', 'PUBLISHES_TO', 'SUBSCRIBES_TO', 'CALLS_RPC',
]);

const PENDING_CLASSES: readonly PendingClass[] = ['awaiting-target', 'ambiguous', 'no-candidate', 'external-endpoint'];

/** The reason an awaiting row counts under when it carries none: the cross-file pass has not attempted it. */
export const UNATTEMPTED_REASON = 'unattempted';

export function pendingClassOf(row: Pick<UnresolvedRow, 'kind' | 'meta'>): PendingClass {
	const stored = row.meta['class'];
	if (typeof stored === 'string' && (PENDING_CLASSES as readonly string[]).includes(stored)) return stored as PendingClass;
	return BOUNDARY_RELATION_KINDS.has(row.kind as RelationKind) ? 'external-endpoint' : 'awaiting-target';
}

/** The reason an awaiting-target row is counted under. */
export function awaitingReasonOf(row: Pick<UnresolvedRow, 'meta'>): string {
	const reason = row.meta['reason'];
	return typeof reason === 'string' && reason !== '' ? reason : UNATTEMPTED_REASON;
}

export function zeroPending(): Record<PendingClass, number> {
	return { 'awaiting-target': 0, 'ambiguous': 0, 'no-candidate': 0, 'external-endpoint': 0 };
}

/** A repository's state before anything is known: not indexed since this change. */
export function emptyIndexStateRow(): IndexStateRow {
	return {
		generation:         0,
		pending:            zeroPending(),
		unwritable:         0,
		reasonCounts:       { unwritable: {}, awaiting: {} },
		unembedded:         0,
		embeddingAvailable: true,
		uncommittedFiles:   [],
		fullIndexFinished:  false,
		endpointPassFailed: false,
	};
}

export interface PendingCounts {
	pending:  Record<PendingClass, number>;
	/** Awaiting-target rows by reason. */
	awaiting: Record<string, number>;
}

/** Count every repository's pending rows by class (and awaiting rows by reason), from the stored rows. */
export function recountPending(store: GraphStore): Map<number, PendingCounts> {
	const counts = new Map<number, PendingCounts>();
	for (const { value } of store.unresolved.getRange()) {
		const row = decodeUnresolvedRow(value as Buffer);
		let c = counts.get(row.repoId);
		if (c === undefined) {
			c = { pending: zeroPending(), awaiting: {} };
			counts.set(row.repoId, c);
		}
		const cls = pendingClassOf(row);
		c.pending[cls]++;
		if (cls === 'awaiting-target') {
			const reason = awaitingReasonOf(row);
			c.awaiting[reason] = (c.awaiting[reason] ?? 0) + 1;
		}
	}
	return counts;
}
