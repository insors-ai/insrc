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

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ArtifactIds } from '../artifact-ids.js';
import { deriveMdPath } from '../pending.js';
import type { ArtifactKind } from '../path-scheme.js';
import { ARTIFACTS_DIR } from '../storage.js';
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

/** Every rendered artifact `.md` of a repository, keyed by its absolute path, with the work item it belongs to. */
export interface DocPathIndex {
	readonly repoPath: string;
	readonly byPath:   ReadonlyMap<string, WorkItemRef>;
}

/**
 * Index the repository's docs by reading the stored artifacts, never a folder name: each artifact JSON under
 * `.insrc/artifacts/` names its work item and story in its id and meta, and `deriveMdPath` gives the `.md` it
 * renders to. An artifact whose meta cannot place a path (an unstamped record) is not in the index.
 */
export function buildDocPathIndex(repoPath: string): DocPathIndex {
	const byPath = new Map<string, WorkItemRef>();
	const dir = join(repoPath, ARTIFACTS_DIR);
	let files: string[];
	try { files = readdirSync(dir); } catch { return { repoPath, byPath }; }
	for (const f of files) {
		if (!f.endsWith('.json')) continue;
		const key = ArtifactIds.parse(f.slice(0, -'.json'.length));
		if (key === undefined || !DOC_KINDS.has(key.kind)) continue;
		let meta: Record<string, unknown>;
		try { meta = (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { meta?: Record<string, unknown> }).meta ?? {}; } catch { continue; }
		const md = deriveMdPath(repoPath, key.kind as ArtifactKind, meta);
		if (md.length === 0) continue;
		const ref: WorkItemRef = {
			epicHash: key.epicHash,
			...(key.story !== undefined ? { storyId: key.story } : {}),
			slug: ArtifactIds.make(key.story !== undefined
				? { kind: 'STORY', epicHash: key.epicHash, story: key.story }
				: { kind: 'EPIC', epicHash: key.epicHash }),
		};
		byPath.set(resolve(md), ref);
	}
	return { repoPath, byPath };
}

/** The artifact kinds that render to a `.md` under docs/. */
const DOC_KINDS: ReadonlySet<string> = new Set(['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'BUILD', 'CR', 'EXT', 'ISSUE', 'TESTS']);

/**
 * The work item a docs artifact path belongs to, from the stored artifact that renders to it: `{ epicHash, storyId?,
 * slug }` with `slug` the artifact id of its level (`STORY-<h>-s1` or `EPIC-<h>`), or `null` when no stored artifact
 * renders to the path. A path is matched whole, so the folder name is never read. The semantic adapter uses it to map
 * an artifact hit back to its owning work item. Exported for unit tests.
 */
export function refFromDocPath(index: DocPathIndex, path: string): WorkItemRef | null {
	return index.byPath.get(resolve(index.repoPath, path)) ?? null;
}
