/**
 * Document relationships proposed by a model, and the quality record that
 * decides whether they are used (Epic c2ba6fa6 s10).
 *
 *   doc_relation_proposals        (repoId u32 BE ++ repo-relative document) -> DocRelationRow
 *   doc_relation_proposals_carry  the same key and value, held across a full index
 *   doc_relation_quality          (repoId u32 BE) -> DocRelationQualityRow
 *
 * The proposal rows are derived data: the doc-relations pass writes them, a
 * whole-repository entity delete clears them, and with `carry` (the full index)
 * the same transaction moves them to the carry table, so none is readable during
 * the rebuild. After the rebuild `restoreCarriedDocRelations` writes back each
 * carried row whose document's file entity still has the hash the row was
 * computed from, so the pass does not send an unchanged document again. The
 * quality row describes the model and the hand-checked set, not the graph: only
 * removing the repository deletes it.
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { assertNoSessionPersistence } from '../shared/connection-persistence.js';
import { getGraphStore, withWriteTxn } from './graph/store.js';
import type { GraphStore } from './graph/store.js';
import { encodeEntityKey, encodeRepoKey } from './graph/keys.js';
import {
	decodeDocRelationQualityRow,
	decodeDocRelationRow,
	decodeEntityRow,
	encodeDocRelationQualityRow,
	encodeDocRelationRow,
	type DocRelationQualityRow,
	type DocRelationRow,
} from './graph/codec.js';
import { lookupRepoIdInTxn } from './repos.js';

export type { DocRelationQualityRow, DocRelationRow };

const documentKey = (repoId: number, file: string): Buffer => Buffer.concat([encodeRepoKey(repoId), Buffer.from(file, 'utf8')]);
const repoRange = (repoId: number) => ({ start: encodeRepoKey(repoId), end: encodeRepoKey(repoId + 1) });

/** The id of a file's 'file' entity, as the parsers make it (src/indexer/parser/base.ts makeEntityId). */
function fileEntityId(repoPath: string, absFile: string): string {
	return createHash('sha256').update(`${repoPath}\x00${absFile}\x00file\x00${absFile}`).digest('hex').slice(0, 32);
}

/** The stored hash of a document's file entity, or undefined when the file is not stored. */
export function fileEntityHashInTxn(s: GraphStore, repoPath: string, relFile: string): string | undefined {
	const abs = join(repoPath, relFile);
	const id = s.entityIdByString.get(fileEntityId(repoPath, abs)) as bigint | number | undefined;
	if (id === undefined) return undefined;
	const row = s.entity.get(encodeEntityKey(BigInt(id))) as Buffer | undefined;
	return row === undefined ? undefined : decodeEntityRow(row).contentHash;
}

// ---------------------------------------------------------------------------
// Proposal rows
// ---------------------------------------------------------------------------

export function readDocRelationRowInTxn(s: GraphStore, repoId: number, relFile: string): DocRelationRow | undefined {
	const buf = s.docRelationProposals.get(documentKey(repoId, relFile)) as Buffer | undefined;
	return buf === undefined ? undefined : decodeDocRelationRow(buf);
}

/** Every proposal row of the repository, by repo-relative document. */
export function readDocRelationRowsInTxn(s: GraphStore, repoId: number): Map<string, DocRelationRow> {
	const rows = new Map<string, DocRelationRow>();
	for (const { key, value } of s.docRelationProposals.getRange(repoRange(repoId))) {
		rows.set((key as Buffer).subarray(4).toString('utf8'), decodeDocRelationRow(value as Buffer));
	}
	return rows;
}

export function writeDocRelationRowInTxn(s: GraphStore, repoId: number, relFile: string, row: DocRelationRow): void {
	assertNoSessionPersistence();
	s.docRelationProposals.put(documentKey(repoId, relFile), encodeDocRelationRow(row));
}

export function deleteDocRelationRowInTxn(s: GraphStore, repoId: number, relFile: string): void {
	assertNoSessionPersistence();
	s.docRelationProposals.remove(documentKey(repoId, relFile));
}

/**
 * Clear the repository's proposal rows, inside the caller's write transaction
 * (the repository delete's). With `carry` they move to the carry table, an
 * existing carry row being overwritten by the live one; without it the carry
 * rows are deleted too. Returns how many rows were carried.
 */
export function clearDocRelationsInTxn(s: GraphStore, repoId: number, carry: boolean): number {
	assertNoSessionPersistence();
	let carried = 0;
	for (const { key, value } of [...s.docRelationProposals.getRange(repoRange(repoId))]) {
		if (carry) { s.docRelationCarry.put(key as Buffer, value as Buffer); carried++; }
		s.docRelationProposals.remove(key as Buffer);
	}
	if (!carry) for (const key of [...s.docRelationCarry.getKeys(repoRange(repoId))]) s.docRelationCarry.remove(key as Buffer);
	return carried;
}

/**
 * Write back the repository's carried proposal rows once the rebuild has stored
 * its documents: a row whose document's file entity holds the hash it was
 * computed from is restored, any other is dropped (the pass examines that
 * document again). The carry rows are removed in the same transaction.
 */
export async function restoreCarriedDocRelations(repoPath: string): Promise<{ restored: number; dropped: number }> {
	assertNoSessionPersistence();
	return withWriteTxn(s => {
		const counts = { restored: 0, dropped: 0 };
		const repoId = lookupRepoIdInTxn(s, repoPath);
		if (repoId === undefined) return counts;
		for (const { key, value } of [...s.docRelationCarry.getRange(repoRange(repoId))]) {
			const k = key as Buffer;
			const row = decodeDocRelationRow(value as Buffer);
			if (fileEntityHashInTxn(s, repoPath, k.subarray(4).toString('utf8')) === row.contentHash) {
				s.docRelationProposals.put(k, value as Buffer);
				counts.restored++;
			} else {
				counts.dropped++;
			}
			s.docRelationCarry.remove(k);
		}
		return counts;
	});
}

// ---------------------------------------------------------------------------
// Quality row
// ---------------------------------------------------------------------------

export function readDocRelationQualityInTxn(s: GraphStore, repoId: number): DocRelationQualityRow | undefined {
	const buf = s.docRelationQuality.get(encodeRepoKey(repoId)) as Buffer | undefined;
	return buf === undefined ? undefined : decodeDocRelationQualityRow(buf);
}

export async function readDocRelationQuality(repoPath: string): Promise<DocRelationQualityRow | undefined> {
	const s = await getGraphStore();
	const repoId = lookupRepoIdInTxn(s, repoPath);
	return repoId === undefined ? undefined : readDocRelationQualityInTxn(s, repoId);
}

export function writeDocRelationQualityInTxn(s: GraphStore, repoId: number, row: DocRelationQualityRow): void {
	assertNoSessionPersistence();
	s.docRelationQuality.put(encodeRepoKey(repoId), encodeDocRelationQualityRow(row));
}

/** Every s10 row of the repository: proposals, carry and quality (removeRepo). */
export function deleteDocRelationsForRepoInTxn(s: GraphStore, repoId: number): void {
	assertNoSessionPersistence();
	clearDocRelationsInTxn(s, repoId, false);
	s.docRelationQuality.remove(encodeRepoKey(repoId));
}
