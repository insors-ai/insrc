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
import { readIndexState } from './index-state.js';

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
	await withWriteTxn(s => writeSubsystemsInTxn(s, repoId, generation, groups));
}

/** writeSubsystems inside the caller's write transaction (ISSUE-7d42b5dc: the subsystem pass publishes in one transaction). */
export function writeSubsystemsInTxn(s: GraphStore, repoId: number, generation: number, groups: readonly SubsystemGroupRow[]): void {
	const previous = new Map(rowsInTxn(s, repoId).map(r => [r.id, r]));
	for (const { key } of [...s.subsystem.getRange(repoRange(repoId))]) s.subsystem.remove(key);
	for (const { key } of [...s.subsystemByFile.getRange(repoRange(repoId))]) s.subsystemByFile.remove(key);
	for (const g of groups) {
		const kept = previous.get(g.id);
		const row: SubsystemRow = {
			...g, summary: kept?.summary ?? null, computedAtGeneration: generation,
			...(kept?.summaryModel !== undefined && { summaryModel: kept.summaryModel }),
		};
		s.subsystem.put(subsystemKey(repoId, g.id), encodeSubsystemRow(row));
		for (const file of g.files) s.subsystemByFile.put(fileKey(repoId, file), Buffer.from(g.id, 'utf8'));
	}
}

/**
 * Inside the caller's write transaction: stamp the stored groups at `generation`
 * without changing them -- they are what the graph at that generation groups
 * into (ISSUE-7d42b5dc). Summaries, ids and memberships are untouched.
 */
export function restampSubsystemsInTxn(s: GraphStore, repoId: number, generation: number): void {
	for (const row of rowsInTxn(s, repoId)) {
		s.subsystem.put(subsystemKey(repoId, row.id), encodeSubsystemRow({ ...row, computedAtGeneration: generation }));
	}
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

/**
 * Set one subsystem's summary -- only while a row with its id exists. The id is
 * the hash of the membership, so a summary written for an id holds for every
 * grouping that kept that membership, at any generation. Returns whether it was set.
 */
export async function writeSubsystemSummary(repoPath: string, id: string, summary: string, summaryModel: string): Promise<boolean> {
	const repoId = await lookupRepoId(repoPath);
	if (repoId === undefined) return false;
	return withWriteTxn(s => {
		const key = subsystemKey(repoId, id);
		const buf = s.subsystem.get(key) as Buffer | undefined;
		if (buf === undefined) return false;
		const row = decodeSubsystemRow(buf);
		s.subsystem.put(key, encodeSubsystemRow({ ...row, summary, summaryModel }));
		return true;
	});
}

/** The index.subsystems answer: the stored subsystems, with what they rest on. */
export interface SubsystemsAnswer {
	readonly repoPath:             string;
	readonly generation:           number;
	readonly computedAtGeneration: number | null;
	readonly graphComplete:        boolean;
	readonly stale:                boolean;
	readonly note?:                string | undefined;
	readonly subsystems:           readonly SubsystemView[];
}

export const NOTE_INCOMPLETE = 'the groups rest on an incomplete graph';
export const NOTE_OLDER = 'the groups rest on an older graph';
export const NOTE_NOT_GROUPED = 'not grouped yet';

/**
 * A repository's subsystems with the state they rest on (Epic c2ba6fa6 s8):
 * the note says when the graph is incomplete (ac5), when the groups are of an
 * older generation, or that the repository is not grouped yet.
 */
export async function subsystemsAnswer(repoPath: string): Promise<SubsystemsAnswer | { error: string }> {
	if (await lookupRepoId(repoPath) === undefined) return { error: `index.subsystems: ${repoPath} is not a registered repo` };
	const state = await readIndexState(repoPath);
	const generation = state?.generation ?? 0;
	const graphComplete = state?.graphComplete ?? false;
	const stored = await readSubsystems(repoPath);
	const stale = stored.computedAtGeneration !== null && stored.computedAtGeneration < generation;
	const note = !graphComplete ? NOTE_INCOMPLETE : stored.computedAtGeneration === null ? NOTE_NOT_GROUPED : stale ? NOTE_OLDER : undefined;
	return {
		repoPath, generation, computedAtGeneration: stored.computedAtGeneration, graphComplete, stale,
		...(note !== undefined && { note }), subsystems: stored.subsystems,
	};
}
