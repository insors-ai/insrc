/**
 * Subsystem tables (Epic c2ba6fa6, Story s8): a repository's code files
 * grouped into subsystems, written whole by the subsystem pass and read by the
 * index.subsystems request and the analyzer.
 *
 *   subsystem          (repoId u32 BE ++ subsystem id)        -> SubsystemRow
 *   subsystem_by_file  (repoId u32 BE ++ repo-relative path)  -> subsystem id
 *
 * Each pass replaces a repository's whole set in one transaction, stamped with
 * the generation it grouped; a subsystem whose id (the hash of its members) was
 * already stored keeps its summary, so a summary is written only when a
 * membership is new. Nothing here is written by the file commit.
 */

import { isAbsolute, relative } from 'node:path';

import { encodeRepoKey } from './graph/keys.js';
import { decodeSubsystemRow, encodeSubsystemRow, type SubsystemConnection, type SubsystemRow } from './graph/codec.js';
import { getGraphStore, withWriteTxn, type GraphStore } from './graph/store.js';
import { lookupRepoId } from './repos.js';

export type { SubsystemConnection, SubsystemRow };

/** A subsystem as the request and the analyzer present it. */
export type SubsystemView = Omit<SubsystemRow, 'computedAtGeneration' | 'summaryModel'>;

/** A group to store: everything but the summary, which carries over or is written later. */
export type SubsystemGroupRow = Omit<SubsystemRow, 'summary' | 'summaryModel' | 'computedAtGeneration'>;

export interface StoredSubsystems {
	/** The generation the stored set was grouped at, or null when the repository has none. */
	readonly computedAtGeneration: number | null;
	readonly subsystems:           readonly SubsystemView[];
}

const subsystemKey = (repoId: number, id: string): Buffer => Buffer.concat([encodeRepoKey(repoId), Buffer.from(id, 'utf8')]);
const fileKey = (repoId: number, file: string): Buffer => Buffer.concat([encodeRepoKey(repoId), Buffer.from(file, 'utf8')]);
/** Every key of one repository: from its 4-byte prefix up to the next repository's. */
const repoRange = (repoId: number) => ({ start: encodeRepoKey(repoId), end: encodeRepoKey(repoId + 1) });

function rowsInTxn(s: GraphStore, repoId: number): SubsystemRow[] {
	const out: SubsystemRow[] = [];
	for (const { value } of s.subsystem.getRange(repoRange(repoId))) out.push(decodeSubsystemRow(value as Buffer));
	return out;
}

const view = ({ computedAtGeneration: _g, summaryModel: _m, ...rest }: SubsystemRow): SubsystemView => rest;

/**
 * Replace a repository's subsystems with `groups`, grouped at `generation`, in
 * one transaction: a failure leaves the previous set. A group whose id was
 * stored keeps its summary; every other group starts without one.
 */
export async function writeSubsystems(repoPath: string, generation: number, groups: readonly SubsystemGroupRow[]): Promise<void> {
	const repoId = await lookupRepoId(repoPath);
	if (repoId === undefined) throw new Error(`writeSubsystems: ${repoPath} is not a registered repository`);
	await withWriteTxn(s => {
		const previous = new Map(rowsInTxn(s, repoId).map(r => [r.id, r]));
		for (const { key } of s.subsystem.getRange(repoRange(repoId))) s.subsystem.remove(key);
		for (const { key } of s.subsystemByFile.getRange(repoRange(repoId))) s.subsystemByFile.remove(key);
		for (const g of groups) {
			const kept = previous.get(g.id);
			const row: SubsystemRow = {
				...g, summary: kept?.summary ?? null, computedAtGeneration: generation,
				...(kept?.summaryModel !== undefined && { summaryModel: kept.summaryModel }),
			};
			s.subsystem.put(subsystemKey(repoId, g.id), encodeSubsystemRow(row));
			for (const file of g.files) s.subsystemByFile.put(fileKey(repoId, file), Buffer.from(g.id, 'utf8'));
		}
	});
}

/**
 * A repository's stored subsystems -- all of them, or those holding any of
 * `files` (absolute, or relative to the repository). Reads only the two
 * subsystem tables.
 */
export async function readSubsystems(repoPath: string, opts: { readonly files?: readonly string[] | undefined } = {}): Promise<StoredSubsystems> {
	const repoId = await lookupRepoId(repoPath);
	if (repoId === undefined) return { computedAtGeneration: null, subsystems: [] };
	const store = await getGraphStore();
	const rows = rowsInTxn(store, repoId);
	if (rows.length === 0) return { computedAtGeneration: null, subsystems: [] };
	const generation = rows[0]!.computedAtGeneration;
	if (opts.files === undefined) return { computedAtGeneration: generation, subsystems: rows.map(view) };
	const wanted = new Set<string>();
	for (const f of opts.files) {
		const rel = isAbsolute(f) ? relative(repoPath, f) : f;
		const id = store.subsystemByFile.get(fileKey(repoId, rel)) as Buffer | undefined;
		if (id !== undefined) wanted.add(id.toString('utf8'));
	}
	return { computedAtGeneration: generation, subsystems: rows.filter(r => wanted.has(r.id)).map(view) };
}
