/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The ONE place a plan task turns its scope into a repo, a path, an entity or
 * a connection (LLD-b9d5c5c4-s7, task t2).
 *
 * A plan task of the code, docs, infra or data family calls this with its
 * scope and its family. It:
 *   1. checks that the scope's kind is one the family accepts, against the
 *      family's row of the classifier's table (`TARGET_TO_KINDS`), and resolves
 *      the scope, through `resolveScopeForTarget` (no list of kinds is held here);
 *   2. for the code and docs families, which read the stored graph, runs the
 *      indexed check (`ensureNonEmptyClosure`) with the same readers.
 *
 * Infra tasks walk the file system and data tasks open a connection pool at a
 * path: neither reads the graph, so neither is checked for an index.
 *
 * The indexed check keeps its leniency for the kinds that are paths: with a
 * registry that cannot be read, or that holds no repo at all, the scope is not
 * refused and resolves with a null repo, and the task works on the scope's own
 * path. A symbol scope is resolved by `resolveScope`, which decides for itself.
 */

import type { AnalyzeScopeRef } from '../../../shared/analyze-types.js';
import { TARGET_TO_KINDS } from '../../classifier/validate.js';
import { ensureNonEmptyClosure, ScopeKindTargetMismatchError } from '../../context/invariants.js';
import { resolveScopeForTarget } from '../../context/scope.js';
import type { KindsPerTarget, ResolvedScope, ScopeDeps } from '../../context/scope.js';
import type { DocsArea } from '../../docs-retrieval.js';

/** The four families whose plan tasks have a scope of their own. */
export type TaskFamily = 'code' | 'docs' | 'infra' | 'data';

/** Test seam: the readers every runtime's call uses when it passes none (a
 *  runtime never passes any). Pass undefined to go back to the real stores. */
let depsForTest: ScopeDeps | undefined;
export function _setTaskScopeDepsForTest(deps: ScopeDeps | undefined): void {
	depsForTest = deps;
}

/** The families whose tasks read the stored graph, and so need the scope indexed. */
const GRAPH_FAMILIES: ReadonlySet<TaskFamily> = new Set(['code', 'docs']);

/**
 * Resolve a plan task's scope for its family.
 *
 * @throws ScopeKindTargetMismatchError  the scope's kind is not in the family's row;
 *         the message names the template and the kinds allowed.
 * @throws ScopeRefUnresolvedError       `resolveScope` cannot resolve the value.
 * @throws ScopeNotIndexedError          a code or docs scope in no registered repo, or
 *         in one with no stored entities (the registry was read and holds repos).
 */
export async function resolveTaskScope(
	scopeRef:      AnalyzeScopeRef,
	family:        TaskFamily,
	templateLabel: string,
	deps?:         ScopeDeps,
	/** A stand-in for the classifier's table, for a test; never passed in production. */
	table:         KindsPerTarget = TARGET_TO_KINDS,
): Promise<ResolvedScope> {
	const readers = deps ?? depsForTest;
	let scope: ResolvedScope;
	try {
		scope = await resolveScopeForTarget(scopeRef, family, readers, table);
	} catch (err) {
		// Say which template refused; the class, and so the code, is unchanged.
		if (err instanceof ScopeKindTargetMismatchError) err.message = `${templateLabel}: ${err.message}`;
		throw err;
	}
	if (GRAPH_FAMILIES.has(family)) {
		await ensureNonEmptyClosure(scope, readers);
	}
	return scope;
}

// ---------------------------------------------------------------------------
// What a task that reads the stored graph does with its resolved scope
// ---------------------------------------------------------------------------

/**
 * The repo whose stored entities a task reads: the registered repo that
 * contains the scope, or, where none is known (the registry could not be read
 * or holds no repo), the scope's own directory, as before.
 */
export function graphRepoOf(scope: ResolvedScope): string {
	return scope.repoPath ?? scope.lookupPath;
}

/**
 * Whether an entity of that repo lies in the AREA the scope names:
 *   - symbol: the one entity;
 *   - file: the entities of that file;
 *   - module: the entities whose file lies under the directory;
 *   - repo, manifest directory, workspace: the directory too. When it IS the
 *     repo that was read, every entity is kept untouched, exactly as before;
 *     when it is a directory inside that repo, only what lies under it.
 */
export function inAreaOf(scope: ResolvedScope): (entity: { readonly id: string; readonly file: string }) => boolean {
	if (scope.kind === 'symbol') return e => e.id === scope.entityId;
	if (scope.kind === 'file') return e => e.file === scope.filePath;
	const dir = scope.lookupPath;
	if (scope.kind !== 'module' && dir === graphRepoOf(scope)) return () => true;
	return e => e.file === dir || e.file.startsWith(`${dir}/`);
}

/**
 * The area of a docs scope, for a task that hands its selection to document
 * retrieval: the file of a file scope, the directory of a module scope or of a
 * directory inside the repo that is read. Undefined when the scope takes the
 * whole repo, so that retrieval is called exactly as before.
 */
export function docsAreaOf(scope: ResolvedScope): DocsArea | undefined {
	if (scope.kind === 'file' && scope.filePath !== undefined) return { file: scope.filePath };
	if (scope.kind !== 'module' && scope.lookupPath === graphRepoOf(scope)) return undefined;
	return { directory: scope.lookupPath };
}

/** The family a template belongs to: the first part of its id (`code.discovery.modules` -> `code`). */
export function familyOfTemplate(templateId: string): TaskFamily {
	const family = templateId.split('.')[0];
	if (family === 'code' || family === 'docs' || family === 'infra' || family === 'data') return family;
	throw new Error(`${templateId}: the template's id does not begin with a family (code, docs, infra or data)`);
}
