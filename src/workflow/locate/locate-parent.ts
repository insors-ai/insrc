/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — the controller-side tiered parent-locator POLICY.
 *
 * A pure, injectable-deps function: it never touches a DB (the DB-bound
 * inference reaches the daemon through `deps.inferCandidates`), so every tier
 * branch and every lc1 guarantee unit-tests with fabricated deps. Enforces the
 * fixed order deterministic → graph-ownership → semantic → prompt → standalone,
 * short-circuits on the first threshold-clearing tier, and NEVER silently
 * attaches to a wrong parent — a low-confidence, ambiguous (tied), or absent
 * match defers to the user prompt, then falls back to standalone.
 *
 * Returns pure data. It does NOT persist `meta.parentRef` — the orchestrator
 * (s4) stamps the returned ParentLocation onto the IssueArtifact.
 */

import type { ResolvedRef } from '../tracker/resolve.js';
import type { WorkItemRef } from '../types.js';
import type {
	InferredCandidates,
	LocateParentDeps,
	LocateParentInput,
	ParentLocation,
	RankedCandidate,
} from './types.js';

/** Project a resolved tracker ref down to the minimal WorkItemRef shape. Only
 *  present fields are set (exactOptionalPropertyTypes). */
function refFromResolved(r: ResolvedRef): WorkItemRef {
	const epicHash = r.epicHash.length > 0 ? r.epicHash : undefined;
	const storyId  = r.storyId;
	const slug     = r.slug.length > 0 ? r.slug : undefined;
	return {
		...(epicHash !== undefined ? { epicHash } : {}),
		...(storyId  !== undefined && storyId.length > 0 ? { storyId } : {}),
		...(slug     !== undefined ? { slug } : {}),
	};
}

/** Keep only well-formed candidates: an object carrying a finite numeric score.
 *  Guards against a malformed port return (e.g. `graph: [null]`) reaching the
 *  ranking logic and dereferencing a bad element outside the caller's try. */
function wellFormed(cands: readonly RankedCandidate[]): RankedCandidate[] {
	return cands.filter((c): c is RankedCandidate =>
		c !== null && typeof c === 'object' && typeof c.score === 'number' && Number.isFinite(c.score));
}

/** The unambiguous top candidate: the single highest-scoring one, or `null`
 *  when the list is empty OR the top score is tied (ambiguous). A tie is
 *  load-bearing — lc1 forbids picking one arbitrarily. */
function unambiguousTop(input: readonly RankedCandidate[]): RankedCandidate | null {
	const cands = wellFormed(input);
	if (cands.length === 0) return null;
	let best = cands[0]!;
	for (const c of cands) if (c.score > best.score) best = c;
	const topCount = cands.filter(c => c.score === best.score).length;
	return topCount === 1 ? best : null;
}

/** Non-empty after trimming. */
function present(s: string | undefined): s is string {
	return s !== undefined && s.trim().length > 0;
}

/**
 * Locate the work item a bugfix corrects, or fall back to standalone.
 *
 * @throws when the input carries none of touchedPaths, defectDescription, or
 *         explicitRef (a malformed request — nothing to locate against). Every
 *         other "no owner" path resolves to a prompt then standalone, never a throw.
 */
export async function locateParent(
	input: LocateParentInput,
	deps: LocateParentDeps,
): Promise<ParentLocation> {
	const hasPaths = input.touchedPaths.length > 0;
	const hasDesc  = input.defectDescription.trim().length > 0;
	if (!hasPaths && !hasDesc && !present(input.explicitRef)) {
		throw new Error(
			'locateParent: malformed input — need at least one of touchedPaths, defectDescription, or explicitRef',
		);
	}

	// ----- tier 1: deterministic (explicit ref, pure-fs resolve) -----
	if (present(input.explicitRef)) {
		const id = input.explicitRef.trim();
		const resolved = deps.resolveRef(deps.repoPath, id);
		if (resolved !== null) {
			return {
				tier:       'deterministic',
				parentRef:  refFromResolved(resolved),
				confidence: 1,
				evidence:   [`explicit ref '${id}' resolved to ${resolved.workflowId}`],
			};
		}
		// A stale / unresolvable explicit ref is NOT authoritative — fall through
		// to the inference tiers exactly as if none had been supplied.
	}

	// ----- tiers 2 & 3: DB-bound inference (graph-ownership + semantic) -----
	// A daemon round-trip failure degrades to "no candidates" → prompt/standalone;
	// it never throws and never auto-attaches (lc1 under an absent inference).
	let inferred: InferredCandidates;
	try {
		const raw = await deps.inferCandidates({
			repoPath:          deps.repoPath,
			touchedPaths:      input.touchedPaths,
			defectDescription: input.defectDescription,
		});
		// Normalize defensively: a daemon that signals failure by RETURNING a
		// resolved `{ error }` object (this codebase's convention) — or any port
		// that returns a malformed shape — must still degrade to prompt/standalone,
		// never crash the locate. Missing lists become empty.
		inferred = {
			graph:    Array.isArray(raw?.graph)    ? raw.graph    : [],
			semantic: Array.isArray(raw?.semantic) ? raw.semantic : [],
		};
	} catch {
		inferred = { graph: [], semantic: [] };
	}

	// tier 2: graph code-ownership
	const graphTop = unambiguousTop(inferred.graph);
	if (graphTop !== null && graphTop.score >= deps.thresholds.graph) {
		return {
			tier:       'graph-ownership',
			parentRef:  graphTop.parentRef,
			confidence: graphTop.score,
			evidence:   graphTop.evidence,
		};
	}

	// tier 3: semantic (inference already omits it for an empty description)
	const semanticTop = unambiguousTop(inferred.semantic);
	if (semanticTop !== null && semanticTop.score >= deps.thresholds.semantic) {
		return {
			tier:       'semantic',
			parentRef:  semanticTop.parentRef,
			confidence: semanticTop.score,
			evidence:   semanticTop.evidence,
		};
	}

	// ----- tier 4: prompt (interactive; the near-miss candidates are surfaced) -----
	// Draw from the well-formed candidates only — a malformed element must not
	// deref here any more than in the ranking above.
	const nearMiss = [...wellFormed(inferred.graph), ...wellFormed(inferred.semantic)]
		.slice(0, 3)
		.flatMap(c => (Array.isArray(c.evidence) ? c.evidence : []))
		.filter((e): e is string => typeof e === 'string');
	const userRef = await deps.promptForRef();
	if (present(userRef ?? undefined)) {
		const id = userRef!.trim();
		const resolved = deps.resolveRef(deps.repoPath, id);
		if (resolved !== null) {
			return {
				tier:       'prompt',
				parentRef:  refFromResolved(resolved),
				confidence: 1,
				evidence:   [`user-supplied ref '${id}' resolved to ${resolved.workflowId}`],
			};
		}
	}

	// ----- tier 5: standalone (no owner; proceed unattached) -----
	return {
		tier:       'standalone',
		parentRef:  null,
		confidence: 0,
		evidence:   nearMiss.length > 0
			? ['no confident parent; proceeding standalone', ...nearMiss]
			: ['no candidate owner found; proceeding standalone'],
	};
}
