/**
 * The subsystem pass (Epic c2ba6fa6, Story s8): a queued derived pass that
 * groups a graph-complete repository's code files into subsystems and writes
 * them, stamped with the generation it read.
 *
 * It runs only on a complete graph (lc1) and only when the stored subsystems
 * are older than the graph. The file graph comes from the stored relationships
 * between code entities of two files of the repository -- IMPORTS, CALLS,
 * INHERITS, IMPLEMENTS and REFERENCES -- each weighted by kind (inheritance 2,
 * the rest 1) and by how it was established (extracted 1, inferred or chosen
 * 0.8, unknown 0.6, model 0.5), plus an edge of 0.1 between files of one
 * directory. A relationship to a module stub, an external endpoint or another
 * repository's entity is not an edge: its target is not one of the
 * repository's code entities.
 */

import type { DbClient } from '../db/client.js';
import { entityU64ForId, listEntitiesForRepo } from '../db/entities.js';
import { outNeighbors } from '../db/graph/edges.js';
import { readIndexState } from '../db/index-state.js';
import { readSubsystems, writeSubsystems, type SubsystemGroupRow } from '../db/subsystems.js';
import { getLogger } from '../shared/logger.js';
import type { Entity, EntityKind, RelationEvidence, RelationKind } from '../shared/types.js';
import { directoryEdges, groupSubsystems, type FileEdge } from './subsystems.js';

const log = getLogger('subsystem-pass');

/** The entity kinds that make a file a code file, and are counted as its subsystem's entities. */
const CODE_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['function', 'method', 'class', 'interface', 'type', 'variable', 'table', 'view']);

/** The relationships that bind two files, and their weight by kind. */
const KIND_WEIGHT: Readonly<Partial<Record<RelationKind, number>>> = { IMPORTS: 1, CALLS: 1, INHERITS: 2, IMPLEMENTS: 2, REFERENCES: 1 };
const GROUPING_KINDS = Object.keys(KIND_WEIGHT) as RelationKind[];

/** How much a relationship counts, by how it was established (s7). */
const EVIDENCE_WEIGHT: Readonly<Record<RelationEvidence, number>> = { extracted: 1, inferred: 0.8, chosen: 0.8, unknown: 0.6, model: 0.5 };

export interface SubsystemPassResult {
	readonly ran:              boolean;
	readonly reason?:          'graph-incomplete' | 'up-to-date' | undefined;
	readonly generation:       number;
	readonly subsystems:       number;
}

/** Group a graph-complete repository's code files into subsystems and store them. */
export async function runSubsystemPass(opts: { readonly db: DbClient; readonly repoPath: string }): Promise<SubsystemPassResult> {
	const { db, repoPath } = opts;
	const state = await readIndexState(repoPath);
	const generation = state?.generation ?? 0;
	if (state === undefined || !state.graphComplete) {
		log.info({ repo: repoPath, generation }, 'subsystem pass: the graph is not complete; nothing grouped');
		return { ran: false, reason: 'graph-incomplete', generation, subsystems: 0 };
	}
	if ((await readSubsystems(repoPath)).computedAtGeneration === generation) {
		return { ran: false, reason: 'up-to-date', generation, subsystems: 0 };
	}

	const entities = await listEntitiesForRepo(db, repoPath);
	const rel = (file: string) => file.startsWith(repoPath + '/') ? file.slice(repoPath.length + 1) : file;
	const code = entities.filter(e => CODE_KINDS.has(e.kind));
	const codeFiles = new Set(code.map(e => rel(e.file)));
	const entityCount = new Map<string, number>();
	for (const e of code) entityCount.set(rel(e.file), (entityCount.get(rel(e.file)) ?? 0) + 1);

	// Every relationship source of a code file (its code entities and its file entity), by u64.
	const fileOfU64 = new Map<bigint, string>();
	const sources: Entity[] = [];
	for (const e of entities) {
		if (!codeFiles.has(rel(e.file)) || !(CODE_KINDS.has(e.kind) || e.kind === 'file')) continue;
		const u64 = await entityU64ForId(e.id);
		if (u64 === undefined) continue;
		fileOfU64.set(u64, rel(e.file));
		sources.push(e);
	}

	const byPair = new Map<string, { a: string; b: string; weight: number; kinds: Partial<Record<RelationKind, number>> }>();
	for (const [u64, a] of fileOfU64) {
		for (const n of await outNeighbors(u64, { kindFilter: GROUPING_KINDS, withEvidence: true })) {
			const b = fileOfU64.get(n.u64);
			if (b === undefined || b === a) continue;
			const key = `${a}\u0000${b}`;
			const edge = byPair.get(key) ?? { a, b, weight: 0, kinds: {} };
			const kind = n.kind as RelationKind;   // one of GROUPING_KINDS: the read is filtered to them
			edge.weight += (KIND_WEIGHT[kind] ?? 0) * EVIDENCE_WEIGHT[n.evidence];
			edge.kinds[kind] = (edge.kinds[kind] ?? 0) + 1;
			byPair.set(key, edge);
		}
	}
	const files = [...codeFiles].sort();
	const edges: FileEdge[] = [...byPair.values(), ...directoryEdges(files)];
	const groups = groupSubsystems({ files, edges });

	const rows: SubsystemGroupRow[] = groups.map(g => ({
		...g, entityCount: g.files.reduce((n, f) => n + (entityCount.get(f) ?? 0), 0),
	}));
	await writeSubsystems(repoPath, generation, rows);
	log.info({ repo: repoPath, generation, files: files.length, subsystems: rows.length, sources: sources.length }, 'subsystem pass: grouped');
	return { ran: true, generation, subsystems: rows.length };
}
