/**
 * The exploration the persistent cache is keyed on (Story
 * 65b643840a294422/s1, task t12).
 *
 * The lookups whose output depends on the area a request named (the
 * candidate search, the document lookups and the capability check, which
 * calls the candidate search) get the area in their key: two requests with
 * the same question on two modules of one repository must not share an
 * entry. Every read and write of the cache, in the one-shot executor, the
 * multi-turn executor and the narrow phase, takes its exploration from here.
 */

import { scopeAreaKey, type ResolvedScope } from '../context/scope.js';
import type { Exploration } from './types.js';

/** The lookups whose output depends on the area. */
export const AREA_AWARE_TYPES: ReadonlySet<string> = new Set([
	'concept.resolve',
	'doc.mention',
	'doc.decision.trace',
	'doc.constraint.enumerate',
	'capability.reuse-check',
]);

/**
 * The exploration to key the cache on: the exploration itself, or, for an
 * area-aware lookup, the exploration with the request's area in its params.
 * No scope, or a repository or workspace scope, is the whole repository.
 */
export function cacheExplorationFor(exp: Exploration, scope: ResolvedScope | undefined): Exploration {
	if (!AREA_AWARE_TYPES.has(exp.type)) return exp;
	return { ...exp, params: { ...exp.params, __area: scope === undefined ? 'repo' : scopeAreaKey(scope) } };
}
