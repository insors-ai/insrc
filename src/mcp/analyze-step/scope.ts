/**
 * The scope of an insrc_analyze_step run.
 *
 * The step tool never goes through the context builder's entry point:
 * its start phase prepares the planning prompt itself, and its plan
 * and narrow phases execute the lookups themselves. So it makes the
 * same two moves that entry point makes, here: check that the scope's
 * kind goes with the kind of source, then resolve the scope.
 *
 * The state token carries the intent and no resolved scope. Each
 * phase calls this again on the intent it decoded, so the token's
 * shape does not change and a token minted before this existed still
 * drives the later phases.
 */

import { resolveScopeForTarget } from '../../analyze/context/scope.js';
import type { ResolvedScope, ScopeDeps } from '../../analyze/context/scope.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';

/**
 * Today the start phase always builds a workspace scope, which every
 * kind of source allows -- so the pairing test passes. It is here so
 * that a later widening of the step tool's scope cannot go round the
 * table.
 */
export async function stepScope(intent: Pick<ClassifiedIntent, 'target' | 'scopeRef'>, deps?: ScopeDeps): Promise<ResolvedScope> {
	return resolveScopeForTarget(intent.scopeRef, intent.target, deps);
}
