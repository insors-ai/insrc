/**
 * The subsystem pass's incremental inputs (ISSUE-7d42b5dc).
 *
 *   subsystem_dirty  (repoId u32 BE ++ repo-relative file) -> change stamp (u64 BE)
 *                    (repoId u32 BE ++ 0x00)                -> the repository's last stamp
 *   subsystem_file   (repoId u32 BE ++ repo-relative file) -> FileContributionRow
 *                    (repoId u32 BE ++ 0x00)                -> the repository's reset counter (u64 BE)
 *
 * The changed-file record names every file whose grouping inputs (its
 * outgoing IMPORTS / CALLS / INHERITS / IMPLEMENTS / REFERENCES edges, or its
 * entities) changed since the subsystem pass last published it. It is written
 * in the same transaction as the change, by the store's edge and entity write
 * paths; each write takes the repository's next stamp, so the pass consumes an
 * entry only when it still holds the stamp the pass read -- a change made while
 * the pass ran stays recorded. No file path begins with NUL, so the reserved
 * 0x00 keys never collide with a file.
 *
 * The contribution table is written only by the subsystem pass. A
 * whole-repository entity delete (the start of a full index) drops both tables'
 * rows for the repository and increments its reset counter, so a pass that was
 * running across it publishes nothing and the next pass is full.
 */

import { encodeEntityKey, encodeRepoKey, RELATION_KIND_BYTE, type RelationKind } from './graph/keys.js';
import { decodeEntityRow, decodeFileContributionRow, encodeFileContributionRow, type FileContributionRow } from './graph/codec.js';
import type { GraphStore } from './graph/store.js';

export type { FileContributionRow };

/** The relationships the subsystem pass groups by. */
export const GROUPING_KINDS: readonly RelationKind[] = ['IMPORTS', 'CALLS', 'INHERITS', 'IMPLEMENTS', 'REFERENCES'];
const GROUPING_KIND_BYTES: ReadonlySet<number> = new Set(GROUPING_KINDS.map(k => RELATION_KIND_BYTE[k]));

/** Whether an edge-key kind byte is one the subsystem pass groups by. */
export const isGroupingKindByte = (kindByte: number): boolean => GROUPING_KIND_BYTES.has(kindByte);

const NUL = Buffer.from([0]);
const fileKey = (repoId: number, file: string): Buffer => Buffer.concat([encodeRepoKey(repoId), Buffer.from(file, 'utf8')]);
const reservedKey = (repoId: number): Buffer => Buffer.concat([encodeRepoKey(repoId), NUL]);
const repoRange = (repoId: number) => ({ start: encodeRepoKey(repoId), end: encodeRepoKey(repoId + 1) });
const u64 = (n: bigint): Buffer => { const b = Buffer.alloc(8); b.writeBigUInt64BE(n); return b; };
const readU64 = (b: Buffer | undefined): bigint => (b === undefined || b.length < 8 ? 0n : b.readBigUInt64BE(0));
const fileOfKey = (key: Buffer): string | undefined => (key.length > 4 && key[4] !== 0 ? key.subarray(4).toString('utf8') : undefined);

/** Inside a write transaction: record that `file` of repository `repoId` changed, with the repository's next stamp. */
export function recordChangedFileInTxn(s: GraphStore, repoId: number, file: string): void {
	const next = readU64(s.subsystemDirty.get(reservedKey(repoId)) as Buffer | undefined) + 1n;
	s.subsystemDirty.put(reservedKey(repoId), u64(next));
	s.subsystemDirty.put(fileKey(repoId, file), u64(next));
}

/** Inside a write transaction: record the file of the entity `entityU64` (nothing when it is not stored). */
export function recordChangedEntityFileInTxn(s: GraphStore, entityU64: bigint): void {
	const buf = s.entity.get(encodeEntityKey(entityU64)) as Buffer | undefined;
	if (buf === undefined) return;
	const row = decodeEntityRow(buf);
	recordChangedFileInTxn(s, row.repoId, row.filePath);
}

/** One changed-file entry as the pass reads it. */
export interface ChangedFile {
	readonly file:  string;
	readonly stamp: bigint;
}

/** The repository's changed-file record. */
export function readChangedFilesInTxn(s: GraphStore, repoId: number): ChangedFile[] {
	const out: ChangedFile[] = [];
	for (const { key, value } of s.subsystemDirty.getRange(repoRange(repoId))) {
		const file = fileOfKey(key as Buffer);
		if (file !== undefined) out.push({ file, stamp: readU64(value as Buffer) });
	}
	return out;
}

/**
 * Inside a write transaction: consume the entries the pass read -- each is
 * deleted only when it still holds the stamp the pass read. Returns how many
 * were consumed.
 */
export function consumeChangedFilesInTxn(s: GraphStore, repoId: number, read: readonly ChangedFile[]): number {
	let consumed = 0;
	for (const { file, stamp } of read) {
		const key = fileKey(repoId, file);
		if (readU64(s.subsystemDirty.get(key) as Buffer | undefined) !== stamp) continue;
		s.subsystemDirty.remove(key);
		consumed++;
	}
	return consumed;
}

/** The repository's reset counter: incremented by every whole-repository entity delete. */
export function readResetCounterInTxn(s: GraphStore, repoId: number): bigint {
	return readU64(s.subsystemFile.get(reservedKey(repoId)) as Buffer | undefined);
}

/** The repository's contribution rows, by repo-relative file. */
export function readContributionsInTxn(s: GraphStore, repoId: number): Map<string, FileContributionRow> {
	const out = new Map<string, FileContributionRow>();
	for (const { key, value } of s.subsystemFile.getRange(repoRange(repoId))) {
		const file = fileOfKey(key as Buffer);
		if (file !== undefined) out.set(file, decodeFileContributionRow(value as Buffer));
	}
	return out;
}

/** Inside a write transaction: write (or, with `undefined`, delete) one file's contribution row. */
export function writeContributionInTxn(s: GraphStore, repoId: number, file: string, row: FileContributionRow | undefined): void {
	if (row === undefined) s.subsystemFile.remove(fileKey(repoId, file));
	else s.subsystemFile.put(fileKey(repoId, file), encodeFileContributionRow(row));
}

/** Inside a write transaction: drop every contribution row of the repository (its reset counter stays). */
export function clearContributionsInTxn(s: GraphStore, repoId: number): void {
	for (const { key } of [...s.subsystemFile.getRange(repoRange(repoId))]) {
		if (fileOfKey(key as Buffer) !== undefined) s.subsystemFile.remove(key);
	}
}

/**
 * Inside a write transaction: a whole-repository entity delete (the start of a
 * full index). Drops the repository's contribution rows and changed-file
 * entries and increments its reset counter, so its next pass is full and a pass
 * running across the delete publishes nothing.
 */
export function resetSubsystemInputsInTxn(s: GraphStore, repoId: number): void {
	clearContributionsInTxn(s, repoId);
	for (const { key } of [...s.subsystemDirty.getRange(repoRange(repoId))]) {
		if (fileOfKey(key as Buffer) !== undefined) s.subsystemDirty.remove(key);
	}
	s.subsystemFile.put(reservedKey(repoId), u64(readResetCounterInTxn(s, repoId) + 1n));
}

/** Inside a write transaction: remove every row of both tables for a removed repository. */
export function deleteSubsystemInputsInTxn(s: GraphStore, repoId: number): void {
	for (const db of [s.subsystemDirty, s.subsystemFile]) {
		for (const { key } of [...db.getRange(repoRange(repoId))]) db.remove(key);
	}
}
