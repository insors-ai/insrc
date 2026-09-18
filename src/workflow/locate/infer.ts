/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — the inference composition (pure of any DB import).
 *
 * `inferParentCandidates` composes two tiers into a single `InferredCandidates`:
 *   - graph code-ownership: the touched paths, unioned with the graph-expanded
 *     neighbour files (supplied by `InferencePorts.expandTouchedFiles`), scored
 *     against the pure code-ownership index (`matchGraphCandidates`);
 *   - semantic: ranked candidates from `InferencePorts.semanticCandidates`,
 *     SKIPPED when the defect description is empty (nothing to embed).
 *
 * It returns RAW scores only — no threshold, no attach decision; that policy is
 * the controller's (`locateParent`). The DB-bound leaf ops are behind
 * `InferencePorts`, so this composition unit-tests with stub ports + a fabricated
 * ownership index. The real daemon wiring lives in `infer-daemon.ts`.
 */

import type { WorkItemRef } from '../types.js';
import { matchGraphCandidates, type OwnershipIndex } from './ownership.js';
import type { InferParentsRequest, InferredCandidates, RankedCandidate } from './types.js';

/** Default top-K for the semantic ANN pass. */
export const DEFAULT_SEMANTIC_K = 8;

/** The DB-bound leaf operations, injected so `inferParentCandidates` stays pure
 *  and testable. The daemon supplies a real implementation (see infer-daemon.ts);
 *  tests supply stubs. */
export interface InferencePorts {
	/** Expand the touched paths to the files of their graph neighbours (callers /
	 *  callees), so a fix in one file still attaches to the story that owns its
	 *  collaborators. Returns repo-relative or absolute paths (the ownership index
	 *  matches either spelling). May return `[]`. */
	readonly expandTouchedFiles: (touchedPaths: readonly string[]) => Promise<readonly string[]>;
	/** Ranked semantic candidates: embed the defect description, ANN over the
	 *  indexed epic/story artifact embeddings, map each hit to its owning work
	 *  item with a 0..1 score. May return `[]`. */
	readonly semanticCandidates: (defectDescription: string, k: number) => Promise<readonly RankedCandidate[]>;
}

/** Compose the graph + semantic inference tiers into ranked candidates. Raw
 *  scores only; the controller applies the thresholds and tier order. */
export async function inferParentCandidates(
	ports: InferencePorts,
	ownership: OwnershipIndex,
	req: InferParentsRequest,
): Promise<InferredCandidates> {
	// --- graph code-ownership tier ---
	const expanded = await ports.expandTouchedFiles(req.touchedPaths);
	const allPaths = dedupe([...req.touchedPaths, ...expanded]);
	const graph = matchGraphCandidates(allPaths, ownership);

	// --- semantic tier (skipped for an empty description) ---
	const semantic: RankedCandidate[] = req.defectDescription.trim().length > 0
		? [...await ports.semanticCandidates(req.defectDescription, DEFAULT_SEMANTIC_K)]
		: [];

	return { graph, semantic };
}

function dedupe(xs: readonly string[]): string[] {
	return [...new Set(xs.filter(x => x.length > 0))];
}

/**
 * Derive a WorkItemRef from a docs artifact path such as
 * `docs/epics/<slug>-E<date><hash8>/S<nnn>/LLD.md` or
 * `docs/standalone/<slug>-E.../DEF.md`. Returns `{ slug, storyId? }` (the tracker
 * resolves against a slug + optional story) or `null` when the path is not a
 * recognised work-item artifact. Pure — the semantic adapter uses it to map an
 * artifact hit back to its owning work item. Exported for unit tests.
 */
export function refFromDocPath(path: string): WorkItemRef | null {
	const norm = path.replace(/\\/g, '/');
	const m = /\/docs\/(?:epics|standalone)\/([^/]+?)-E[0-9a-f]{6,}(?:\/(S\d+))?\//.exec(`/${norm}/`);
	if (m === null) return null;
	const slug = m[1];
	if (slug === undefined || slug.length === 0) return null;
	const storySeg = m[2];
	const ref: WorkItemRef = {
		slug,
		...(storySeg !== undefined ? { storyId: `s${Number(storySeg.slice(1))}` } : {}),
	};
	return ref;
}
