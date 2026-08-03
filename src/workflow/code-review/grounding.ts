/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S001 · T003 — `assembleCodeReviewGrounding` (the sc2 producer).
 *
 * Turns the Story's changed-file set into structured `ChangedSymbolSummary`
 * rows from the LMDB graph — signatures + caller/callee + test-reaching edges,
 * NEVER raw file contents (k6). The producer is daemon-internal; consumers reach
 * it only via IPC (T004), so no other surface opens the stores (k5).
 *
 * Behaviour the LLD pins:
 *   - one row PER ENTITY, keyed by entityId (a file with multiple entities
 *     yields multiple rows sharing the same file path);
 *   - a changed file with NO indexed entities is OMITTED from the rows but is
 *     NOT dropped from the subject (the omission is observable, not silently
 *     treated as "no changes");
 *   - test-reaching = the callers whose defining file is a test file (there is
 *     no dedicated TESTS relation; test entities call the code they exercise via
 *     CALLS, and are identified by their file path).
 *
 * The graph reads are factored behind an injectable `GroundingDeps` seam so the
 * unit tests exercise the assembly logic against a small in-memory graph fixture
 * (the fake seam); the default wires the real `getGraphStore` scan +
 * `inNeighbors`/`outNeighbors`. All reads only — nothing mutates the store.
 */

import type { CodeReviewGrounding, ChangedSymbolSummary } from './types.js';

/** A graph entity, flattened to just what a summary/edge needs. */
export interface GroundedEntity {
	readonly id:        string;   // stable entity identity (the u64 id, stringified)
	readonly file:      string;   // repo-relative defining file
	readonly kind:      string;
	readonly name:      string;
	readonly signature: string;
}

/** The graph-read seams `assembleCodeReviewGrounding` composes. */
export interface GroundingDeps {
	/** Entities DEFINED in `file` (empty when the file has no indexed entities). */
	readonly entitiesInFile: (repoPath: string, file: string) => Promise<readonly GroundedEntity[]>;
	/** Entities that CALL the entity `entityId`. */
	readonly callersOf:      (repoPath: string, entityId: string) => Promise<readonly GroundedEntity[]>;
	/** Entities the entity `entityId` CALLS. */
	readonly calleesOf:      (repoPath: string, entityId: string) => Promise<readonly GroundedEntity[]>;
}

/** A defining file counts as a test file when it matches the repo's test
 *  convention (`__tests__/` dir or a `.test.` / `.spec.` suffix). */
export function isTestFile(file: string): boolean {
	return /(^|\/)__tests__\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

/**
 * Assemble the daemon-served grounding for the Story's changed files. Read-only.
 * The dimension stories (s2-s5) reason over these summaries, never raw text.
 */
export async function assembleCodeReviewGrounding(
	repoPath:     string,
	changedFiles: readonly string[],
	deps:         GroundingDeps,
): Promise<CodeReviewGrounding> {
	const symbols: ChangedSymbolSummary[] = [];

	// Serial (no Promise.all): keep provider/store access ordered (k4 discipline).
	for (const file of changedFiles) {
		const entities = await deps.entitiesInFile(repoPath, file);
		for (const ent of entities) {
			const callers = await deps.callersOf(repoPath, ent.id);
			const callees = await deps.calleesOf(repoPath, ent.id);
			const testsReaching = callers.filter(c => isTestFile(c.file));
			symbols.push({
				entityId:      ent.id,
				file:          ent.file,
				kind:          ent.kind,
				name:          ent.name,
				signature:     ent.signature,
				callers:       callers.map(c => c.name),
				callees:       callees.map(c => c.name),
				testsReaching: testsReaching.map(c => c.name),
			});
		}
	}

	return { symbols };
}

// ---------------------------------------------------------------------------
// Real default seam — wires the LMDB graph. Read-only.
// ---------------------------------------------------------------------------

/** Build the real `GroundingDeps` backed by the graph store. Lazy-imports the
 *  graph layer so the pure assembler + its unit tests never open the env. */
export async function realGroundingDeps(): Promise<GroundingDeps> {
	const { getGraphStore }              = await import('../../db/graph/store.js');
	const { decodeEntityRow }            = await import('../../db/graph/codec.js');
	const { decodeEntityKey }            = await import('../../db/graph/keys.js');
	const { inNeighbors, outNeighbors }  = await import('../../db/graph/edges.js');

	const toGrounded = (idU64: bigint, row: { filePath: string; kind: string; name: string; signature: string }): GroundedEntity => ({
		id:        idU64.toString(),
		file:      row.filePath,
		kind:      String(row.kind),
		name:      row.name,
		signature: row.signature,
	});

	const rowById = async (idU64: bigint): Promise<GroundedEntity | null> => {
		const store = await getGraphStore();
		const { encodeEntityKey } = await import('../../db/graph/keys.js');
		const val = store.entity.get(encodeEntityKey(idU64));
		if (!val) return null;
		return toGrounded(idU64, decodeEntityRow(val as Buffer));
	};

	return {
		async entitiesInFile(_repoPath, file) {
			const store = await getGraphStore();
			const out: GroundedEntity[] = [];
			for (const { key, value } of store.entity.getRange()) {
				const row = decodeEntityRow(value as Buffer);
				if (row.filePath === file) out.push(toGrounded(decodeEntityKey(key as Buffer), row));
			}
			return out;
		},
		async callersOf(_repoPath, entityId) {
			const ids = await inNeighbors(BigInt(entityId), { kindFilter: ['CALLS'] });
			const out: GroundedEntity[] = [];
			for (const id of ids) { const r = await rowById(id); if (r) out.push(r); }
			return out;
		},
		async calleesOf(_repoPath, entityId) {
			const ids = await outNeighbors(BigInt(entityId), { kindFilter: ['CALLS'] });
			const out: GroundedEntity[] = [];
			for (const id of ids) { const r = await rowById(id); if (r) out.push(r); }
			return out;
		},
	};
}
