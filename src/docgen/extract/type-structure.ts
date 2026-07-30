/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — type-structure extractor (Epic 870ed3dd, Story s1 · t5).
 *
 * Reads type entities in a scope + their inheritance relationships from the
 * code graph and emits a DERIVED-ONLY DocumentIR — no LLM on this path (k8).
 * Every node/edge is graph-backed and cited by entity id (k11).
 *
 * Provenance is structural: the extractor only ever populates
 * `DocumentIR.derived`, never `narrated` — enforced by the type system.
 *
 * The graph reads are injected via `TypeGraphReader` so the IR-shaping core is
 * unit-testable without a live LMDB store; the real reader (graph-backed) is
 * `graphTypeReader` below.
 *
 * SCOPE NOTE — inheritance vs composition: the code graph carries `INHERITS`
 * and `IMPLEMENTS` relations but has NO composition/field-type edge
 * (RelationKind = DEFINES|IMPORTS|CALLS|INHERITS|IMPLEMENTS|DEPENDS_ON|EXPORTS|
 * REFERENCES). So this extractor emits inheritance/implementation faithfully;
 * "composition" in the S001 acceptance requires a graph-model addition (a
 * field-type edge) and is tracked as an s1 follow-up, not fabricated here.
 */

import type { EntityKind } from '../../shared/types.js';
import type { DocumentIR, IrNode, IrEdge } from '../types.js';
import { ok, emptyScope, sourceNotReady, type ShellOutcome } from '../outcome.js';
import type { DocGenOutcome } from '../types.js';
import type { DocTypeRegistration } from '../types.js';

/** The docType key + capability id for this extractor. */
export const TYPE_STRUCTURE_DOCTYPE = 'type-structure';

/** A type entity, reduced to what the extractor needs. */
export interface TypeEntity {
	readonly id:       string;      // SHA256(repo+file+kind+name), hex-32 — the IrNode id
	readonly name:     string;
	readonly kind:     EntityKind;  // 'class' | 'interface' | 'type'
	readonly file:     string;      // repo-relative
	readonly startLine: number;
}

/** One inheritance relationship between two type entities (by id). */
export interface InheritanceRel {
	readonly fromId: string;
	readonly toId:   string;
	readonly kind:   'inherits' | 'implements';
}

/** The scope to document: a repo root plus an optional path prefix within it. */
export interface TypeScope {
	readonly repoRoot: string;
	/** Repo-relative path prefix; '' or undefined = the whole repo. */
	readonly path?: string | undefined;
}

/** The graph reads the extractor needs. Injected so the core is testable. */
export interface TypeGraphReader {
	/** The pinned graph index revision for the repo, or undefined when indexing
	 *  has not finished (→ source-not-ready). Pinned once per extraction. */
	revision(repoRoot: string): Promise<string | undefined>;
	/** class/interface/type entities under the scope. */
	typesInScope(scope: TypeScope): Promise<readonly TypeEntity[]>;
	/** INHERITS + IMPLEMENTS relations among the given entity ids (both
	 *  endpoints resolved to entity ids). */
	inheritanceEdges(entityIds: readonly string[]): Promise<readonly InheritanceRel[]>;
}

/** The type kinds a type-structure diagram shows. */
const TYPE_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['class', 'interface', 'type']);

/**
 * Pure IR-shaping core: given the fetched type entities + inheritance relations
 * + the pinned revision, build the derived-only DocumentIR. Deterministic:
 * nodes are keyed by their (already-deterministic) entity id, so two same-named
 * types in different files stay distinct, and a self-referential type keeps its
 * self-edge. Only edges whose BOTH endpoints are in-scope are drawn, so the
 * document is self-contained.
 */
export function buildTypeStructureIR(
	types:       readonly TypeEntity[],
	inheritance: readonly InheritanceRel[],
	revision:    string,
	scopeDescription: string,
): DocumentIR {
	const nodes: IrNode[] = types.map(t => ({
		id:       t.id,
		label:    t.name,
		kind:     t.kind,                       // 'class' | 'interface' | 'type'
		citation: { entityId: t.id },
	}));

	const inScope = new Set(types.map(t => t.id));
	const edges: IrEdge[] = inheritance
		.filter(r => inScope.has(r.fromId) && inScope.has(r.toId))
		.map(r => ({
			id:       `${r.fromId}:${r.kind}:${r.toId}`,
			from:     r.fromId,
			to:       r.toId,
			kind:     r.kind,                    // 'inherits' | 'implements'
			citation: { entityId: r.fromId },
		}));

	return {
		docType:             TYPE_STRUCTURE_DOCTYPE,
		scopeDescription,
		derived:             { nodes, edges },
		narrated:            { sections: [] },   // extractor never narrates (k8)
		generatedAtRevision: revision,
	};
}

/** Parse the tool/IPC input into a TypeScope. `repo` is required; `path`
 *  optional. Returns undefined on a malformed input (the caller maps that to a
 *  validation rejection at the boundary before extract runs — belt-and-braces
 *  here for direct callers). */
function parseScope(input: Record<string, unknown>): TypeScope | undefined {
	const repoRoot = input['repo'];
	if (typeof repoRoot !== 'string' || repoRoot.length === 0) return undefined;
	const path = input['path'];
	return { repoRoot, ...(typeof path === 'string' && path.length > 0 ? { path } : {}) };
}

/** JSON schema for the extractor's scope/entry-point params (sc2). */
export const TYPE_STRUCTURE_INPUT_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['repo'],
	properties: {
		repo: { type: 'string', description: 'Absolute repo root path (registered + indexed)' },
		path: { type: 'string', description: 'Repo-relative path prefix to scope the document (optional; whole repo if omitted)' },
	},
};

/**
 * Build the type-structure extractor's `extract` function over a graph reader.
 * Resolves the pinned revision (→ source-not-ready when absent), reads the
 * in-scope types (→ empty-scope when zero), reads their inheritance edges, and
 * shapes the IR. Never throws for a documentable outcome; UnregisteredRepoError
 * from the storage layer propagates (caller misuse, not a DocGenOutcome).
 */
export function makeExtract(reader: TypeGraphReader) {
	return async function extract(input: Record<string, unknown>): Promise<DocGenOutcome<DocumentIR>> {
		const scope = parseScope(input);
		if (scope === undefined) return emptyScope('type-structure: no repo in scope input');

		const revision = await reader.revision(scope.repoRoot);
		if (revision === undefined) {
			return sourceNotReady(`repo '${scope.repoRoot}' is not finished indexing; no pinned revision to read`);
		}

		const types = await reader.typesInScope(scope);
		if (types.length === 0) {
			const where = scope.path !== undefined ? `${scope.repoRoot}/${scope.path}` : scope.repoRoot;
			return emptyScope(`no types (class/interface/type) found in scope ${where}`);
		}

		const inheritance = await reader.inheritanceEdges(types.map(t => t.id));
		const desc = scope.path !== undefined ? `${scope.path} (types)` : 'repository types';
		return ok(buildTypeStructureIR(types, inheritance, revision, desc));
	};
}

/** The type-structure DocTypeRegistration (sc2). `extract` is bound to the
 *  given reader; the capability is enumerated verbatim on every surface. */
export function typeStructureRegistration(reader: TypeGraphReader): DocTypeRegistration {
	return {
		docType:    TYPE_STRUCTURE_DOCTYPE,
		capability: {
			id:      TYPE_STRUCTURE_DOCTYPE,
			summary: 'Type-structure diagram: the classes/interfaces/types in a scope and the inheritance relationships between them, derived from the code graph.',
		},
		extractorInputSchema: TYPE_STRUCTURE_INPUT_SCHEMA,
		extract: makeExtract(reader),
	};
}

/** Re-export for the boundary layer (t7) that returns the rendered shell. */
export type { ShellOutcome };
export { TYPE_KINDS };
