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
import { basename, join, relative } from 'node:path';

import { assertNoSessionPersistence } from '../shared/connection-persistence.js';
import { getGraphStore, withWriteTxn } from './graph/store.js';
import type { GraphStore } from './graph/store.js';
import { ENTITY_KIND_BYTE, encodeEntityKey, encodeNameIndexPrefix, encodeRepoKey, prefixSuccessor } from './graph/keys.js';
import { inNeighbors, outNeighbors } from './graph/edges.js';
import type { RelationEvidence } from '../shared/types.js';
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
import { getEntity } from './entities.js';
import { listUnresolvedRelations } from './relations.js';
import { readIndexState } from './index-state.js';

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

/** Write the pass's operational status into the repository's quality row (creating it), keeping its figures. */
export function writeDocRelationExtractionInTxn(s: GraphStore, repoId: number, extraction: DocRelationQualityRow['extraction']): void {
	assertNoSessionPersistence();
	const prev = readDocRelationQualityInTxn(s, repoId);
	writeDocRelationQualityInTxn(s, repoId, { ...(prev?.figures !== undefined ? { figures: prev.figures } : {}), extraction });
}

/** The repo-relative markdown documents the repository stores (from the by-file index). */
export function storedMarkdownFilesInTxn(s: GraphStore, repoId: number): string[] {
	const prefix = encodeRepoKey(repoId);
	const out: string[] = [];
	for (const key of s.entityByFile.getKeys({ start: prefix, end: prefixSuccessor(prefix) })) {
		const rel = (key as Buffer).subarray(4).toString('utf8');
		if (/\.mdx?$/i.test(rel) && out[out.length - 1] !== rel) out.push(rel);
	}
	return out;
}

/** The repo-relative files the repository stores (from the by-file index). */
export function storedFilesInTxn(s: GraphStore, repoId: number): string[] {
	const prefix = encodeRepoKey(repoId);
	const out: string[] = [];
	for (const key of s.entityByFile.getKeys({ start: prefix, end: prefixSuccessor(prefix) })) {
		const rel = (key as Buffer).subarray(4).toString('utf8');
		if (out[out.length - 1] !== rel) out.push(rel);
	}
	return out;
}

/** Every s10 row of the repository: proposals, carry and quality (removeRepo). */
export function deleteDocRelationsForRepoInTxn(s: GraphStore, repoId: number): void {
	assertNoSessionPersistence();
	clearDocRelationsInTxn(s, repoId, false);
	s.docRelationQuality.remove(encodeRepoKey(repoId));
}

// ---------------------------------------------------------------------------
// The switch (Epic c2ba6fa6 s10, ac2)
// ---------------------------------------------------------------------------

export type DocRelationSwitchState = 'on' | 'off' | 'not-measured';

/** The bar the measured figures must meet, on at least this many distinct implied links. */
export const DOC_RELATIONS_BAR = { checked: 100, precision: 0.95, recall: 0.60 } as const;

/**
 * Whether model-proposed relationships are used: 'on' only when the repository
 * was measured on at least 100 implied links with precision >= 0.95 and recall
 * >= 0.60, by the model that runs now, against the hand-checked set as it is
 * now; 'off' with figures that miss the bar or describe another model or set;
 * 'not-measured' with no figures.
 */
export function switchOf(row: DocRelationQualityRow | undefined, validatedModelId: string | undefined, setHash: string | undefined): DocRelationSwitchState {
	const f = row?.figures;
	if (f === undefined) return 'not-measured';
	const atBar = f.checked >= DOC_RELATIONS_BAR.checked && f.precision >= DOC_RELATIONS_BAR.precision && f.recall >= DOC_RELATIONS_BAR.recall;
	return atBar && validatedModelId !== undefined && f.modelId === validatedModelId && setHash !== undefined && f.setHash === setHash ? 'on' : 'off';
}

// ---------------------------------------------------------------------------
// The read (Epic c2ba6fa6 s10, ac1 + ac3)
// ---------------------------------------------------------------------------

export interface DocumentRelationRow {
	readonly from:                  string;
	readonly to:                    string;
	readonly kind:                  'REFERENCES';
	readonly evidence:              RelationEvidence;
	/** For a model-proposed row: the generation its proposal row was computed at. */
	readonly computedAtGeneration?: number | undefined;
}

export interface DocumentRelations {
	readonly rows:           readonly DocumentRelationRow[];
	/** The repository's IndexState generation now. */
	readonly generation:     number;
	/** How many returned model-proposed rows were computed at an older generation. */
	readonly staleProposals: number;
}

/**
 * The document relationships touching an entity, in one direction: the stored
 * REFERENCES rows (with their evidence); the entity's name references resolved
 * now against the repository's files -- returned only while exactly one stored
 * file has the name, so neither the order files were indexed in nor a later
 * second file of the name can make a wrong link stand; and, only while the
 * switch is on, the eligible model proposals (evidence 'model'). A proposal row
 * is eligible while its document's file entity still has the hash it was
 * computed from and it was computed by the model that runs now; a proposal is
 * returned only while both its endpoints are stored. Proposals are not filtered
 * by generation; one computed at an older generation is counted in
 * staleProposals so the reader can say so. This is the one place proposals are
 * read; caller/callee reads and graph traversal never carry them.
 */
export async function documentRelations(
	entityId:  string,
	direction: 'out' | 'in',
	sw:        { readonly state: DocRelationSwitchState; readonly modelId?: string | undefined },
): Promise<DocumentRelations> {
	const entity = await getEntity(null, entityId);
	const none: DocumentRelations = { rows: [], generation: 0, staleProposals: 0 };
	if (entity === null) return none;
	const repoPath = entity.repo;
	const s = await getGraphStore();
	const repoId = lookupRepoIdInTxn(s, repoPath);
	const u64 = s.entityIdByString.get(entityId) as bigint | number | undefined;
	if (repoId === undefined || u64 === undefined) return none;
	const generation = (await readIndexState(repoPath))?.generation ?? 0;
	const stored = (id: string): boolean => s.entityIdByString.get(id) !== undefined;
	const rows: DocumentRelationRow[] = [];
	const seen = new Set<string>();
	const add = (row: DocumentRelationRow): void => {
		const key = `${row.from}\0${row.to}`;
		if (seen.has(key)) return;
		seen.add(key);
		rows.push(row);
	};

	// Stored rows.
	const read = direction === 'out' ? outNeighbors : inNeighbors;
	for (const n of await read(BigInt(u64), { kindFilter: ['REFERENCES'], withEvidence: true })) {
		const other = s.entityStringByU64.get(encodeEntityKey(n.u64)) as string | undefined;
		if (other === undefined) continue;
		add(direction === 'out'
			? { from: entityId, to: other, kind: 'REFERENCES', evidence: n.evidence }
			: { from: other, to: entityId, kind: 'REFERENCES', evidence: n.evidence });
	}

	// Name references, resolved now through the name index's file entries: an artifact's file entity is
	// named by its file name and a code file's by its path, so an entry matches when the last segment of
	// its name is the referenced name; each matching entry is resolved to its stored file.
	let byName: Map<string, string[]> | undefined;
	const filesNamed = (name: string): string[] => {
		if (byName === undefined) {
			byName = new Map();
			const prefix = encodeNameIndexPrefix(repoId, ENTITY_KIND_BYTE.file);
			for (const { key, value } of s.nameIndex.getRange({ start: prefix, end: prefixSuccessor(prefix) })) {
				const entryName = (key as Buffer).subarray(prefix.length).toString('utf8');
				const row = s.entity.get(encodeEntityKey((value as Buffer).readBigUInt64BE(0))) as Buffer | undefined;
				if (row === undefined) continue;
				const rel = decodeEntityRow(row).filePath;
				const list = byName.get(basename(entryName)) ?? [];
				if (!list.includes(rel)) list.push(rel);
				byName.set(basename(entryName), list);
			}
		}
		return byName.get(name) ?? [];
	};
	const fileIdOf = (rel: string): string => fileEntityId(repoPath, join(repoPath, rel));
	if (direction === 'out') {
		for (const r of await listUnresolvedRelations(null, repoPath, entity.file)) {
			if (r.fromEntity !== entityId || r.meta['docLink'] !== true || typeof r.meta['nameRef'] !== 'string') continue;
			const files = filesNamed(r.meta['nameRef']);
			if (files.length !== 1) continue;
			// A document naming itself is no link (as for a path reference, which the reader drops).
			if (join(repoPath, files[0]!) === entity.file) continue;
			const to = fileIdOf(files[0]!);
			if (stored(to)) add({ from: entityId, to, kind: 'REFERENCES', evidence: 'extracted' });
		}
	} else if (entity.kind === 'file') {
		const rel = relative(repoPath, entity.file);
		const name = basename(rel);
		const files = filesNamed(name);
		if (files.length === 1 && files[0] === rel) {
			for (const r of await listUnresolvedRelations(null, repoPath)) {
				if (r.meta['docLink'] === true && r.meta['nameRef'] === name && r.fromFile !== entity.file && stored(r.fromEntity)) {
					add({ from: r.fromEntity, to: entityId, kind: 'REFERENCES', evidence: 'extracted' });
				}
			}
		}
	}

	// Model proposals, only while the switch is on.
	let staleProposals = 0;
	if (sw.state === 'on' && sw.modelId !== undefined) {
		const eligible = (rel: string, row: DocRelationRow): boolean =>
			row.modelId === sw.modelId && fileEntityHashInTxn(s, repoPath, rel) === row.contentHash;
		const docs = direction === 'out'
			? (() => {
				const rel = relative(repoPath, entity.file);
				const row = readDocRelationRowInTxn(s, repoId, rel);
				return row === undefined ? new Map<string, DocRelationRow>() : new Map([[rel, row]]);
			})()
			: readDocRelationRowsInTxn(s, repoId);
		for (const [rel, row] of docs) {
			if (!eligible(rel, row)) continue;
			for (const p of row.proposals) {
				if ((direction === 'out' ? p.from : p.to) !== entityId) continue;
				if (!stored(p.from) || !stored(p.to)) continue;
				const before = rows.length;
				add({ from: p.from, to: p.to, kind: 'REFERENCES', evidence: 'model', computedAtGeneration: row.computedAtGeneration });
				if (rows.length > before && row.computedAtGeneration < generation) staleProposals++;
			}
		}
	}
	return { rows, generation, staleProposals };
}
