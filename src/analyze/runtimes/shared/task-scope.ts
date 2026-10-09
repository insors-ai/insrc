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
