/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — the daemon-side `InferencePorts` implementation.
 *
 * Wires the pure inference composition (`infer.ts`) to the real graph + Lance
 * surfaces. This module is the ONLY part of the locator that touches the DB, and
 * it runs daemon-side (rule 1): the controller never receives a `DbClient`, it
 * reaches this through the `locate.inferParents` IPC.
 *
 * Reuses (k6): `findEntitiesByFile` + `findCallers`/`findCallees` (graph
 * expansion), `embedQuery` + `searchEntities` filtered to `artifact` (semantic
 * ANN over the indexed epic/story artifact embeddings). No new external path.
 */

import type { DbClient } from '../../db/client.js';
import type { Entity } from '../../shared/types.js';
import { findEntitiesByFile } from '../../db/entities.js';
import { listRepos } from '../../db/repos.js';
import { findCallees, findCallers, searchEntities } from '../../db/search.js';
import { embedQuery } from '../../indexer/embedder.js';
import { getLogger } from '../../shared/logger.js';
import { refFromDocPath, type InferencePorts } from './infer.js';
import type { RankedCandidate } from './types.js';

const log = getLogger('locate-infer');

/**
 * Build the daemon `InferencePorts` bound to one repo. Graph expansion and the
 * semantic ANN both run serially over the DB / provider — embeds in particular
 * are never `Promise.all`'d (LLM-provider convention).
 */
export function daemonInferencePorts(db: DbClient, repoPath: string): InferencePorts {
	return {
		async expandTouchedFiles(touchedPaths) {
			const files = new Set<string>();
			for (const path of touchedPaths) {
				let seeds: Entity[];
				try {
					seeds = await findEntitiesByFile(db, path);
				} catch (err) {
					log.debug({ path, err }, 'expandTouchedFiles: entity lookup failed; skipping path');
					continue;
				}
				for (const seed of seeds) {
					// Neighbours in both directions: who calls this entity and whom it calls.
					const callers = await findCallers(db, seed.id);
					const callees = await findCallees(db, seed.id);
					for (const n of [...callers, ...callees]) {
						if (n.file.length > 0) files.add(n.file);
					}
				}
			}
			return [...files];
		},

		async semanticCandidates(defectDescription, k) {
			const queryVec = await embedQuery(defectDescription);
			if (queryVec.length === 0) return [];
			const repos = (await listRepos(db)).map(r => r.path);
			const closure = repos.length > 0 ? repos : [repoPath];
			const hits = await searchEntities(db, queryVec, closure, k, 'artifact');
			return mapSemanticHits(hits);
		},
	};
}

/**
 * Map ranked artifact-entity hits to owning work items with a 0..1 score.
 * `searchEntities` returns rank order (closest first) without a distance, so the
 * score is a rank-decay proxy (top hit ~1.0, decaying by position) — a first-cut
 * that a later tuning pass can replace with a real cosine distance; the tier
 * POLICY (which is threshold-gated and fully tested) is unaffected. Hits whose
 * file is not a recognised work-item artifact are dropped. Exported for tests.
 */
export function mapSemanticHits(hits: readonly Entity[]): RankedCandidate[] {
	const out: RankedCandidate[] = [];
	const seen = new Set<string>();
	const n = hits.length;
	for (let i = 0; i < n; i++) {
		const h = hits[i]!;
		const ref = refFromDocPath(h.file);
		if (ref === null) continue;
		const key = `${ref.epicHash ?? ''}|${ref.storyId ?? ''}|${ref.slug ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		// Rank decay: first hit ~1.0, last ~1/n. Bounded to (0, 1].
		const score = (n - i) / n;
		out.push({
			parentRef: ref,
			score,
			evidence: [`semantic match: ${h.kind}:${h.name} (${h.file})`],
		});
	}
	return out;
}
