/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Docs retrieval primitive.
 *
 * plans/docs-module.md Section 3.1. The single retrieval entry
 * point used by:
 *   - The docs shaper (Phase 2) when building bundles
 *   - The adherence-check templates (Phase 4) when correlating
 *     code entities with doc constraints
 *   - Cross-cutting shaper enrichment (Phase 5) when the code /
 *     data / infra shaper wants to sample relevant doc sections
 *
 * Design:
 *   - Vector pass (ANN over entity_vec kind IN doc/section/config)
 *   - Keyword pass (grep-lite over indexed doc bodies via LMDB
 *     entity iteration -- no shell exec + no subprocess)
 *   - Hybrid rank fusing cosine similarity + keyword hit count
 *   - Family / path bias for filenameHint matches
 *   - Repo closure filter (V1 = current repo only per
 *     plans/docs-module.md Section 6.3)
 *   - Path-prefix filter as LMDB post-filter (no Lance schema
 *     migration; docs corpus is small enough that scanning is
 *     under 100ms even at 10k+ doc entities)
 *
 * Returns `DocSectionResult[]` sorted by score desc. Empty when
 * the vector query returns nothing AND no keywords match; never
 * throws (Ollama-down / Lance-empty fallbacks silently).
 */

import type { DbClient } from '../db/client.js';
import { getEntity, listEntitiesByKinds } from '../db/entities.js';
import { searchEntityVecs } from '../db/lance/entity-vec.js';
import { embedQuery } from '../indexer/embedder.js';
import { getLogger } from '../shared/logger.js';
import type { Entity } from '../shared/types.js';

const log = getLogger('analyze:docs-retrieval');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocSectionResult {
	readonly entityId:    string;
	readonly file:        string;
	readonly heading:     string;
	readonly lineStart:   number;
	readonly lineEnd:     number;
	readonly kind:        'document' | 'section' | 'config';
	readonly score:       number;
	readonly bodyPreview?: string;
	/**
	 * Diagnostic breakdown: individual contributions from vector +
	 * keyword passes. Present when at least one pass matched. Useful
	 * for callers that want to explain a ranking.
	 */
	readonly diagnostics?: {
		readonly vectorScore?:  number;    // 1 - cosine distance, in [0, 1]
		readonly keywordScore?: number;    // bounded keyword-hit signal in [0, 1]
		readonly pathBoost?:    number;    // additive lift produced by the multiplicative path-hint boost (score * PATH_HINT_MULTIPLIER - score); reported for observability
	};
}

export interface DocsRetrievalArgs {
	readonly db:             DbClient;
	readonly query:          string;
	/** Repo closure -- V1 is always a single-element array (current
	 *  repo only). Later versions may widen to a `DEPENDS_ON` closure. */
	readonly closureRepos:   readonly string[];
	/** Cap on returned results. Default 20. */
	readonly maxResults?:    number;
	/** Score floor -- results with `score < minScore` are dropped
	 *  before ranking. Default 0 (no floor). */
	readonly minScore?:      number;
	/** Path substring bias (e.g. 'design/', 'plans/'). Sections
	 *  whose file matches the hint receive a small score boost. */
	readonly filenameHint?:  string;
	/** Preview cap (chars). Default 500. Set 0 to skip previews. */
	readonly previewChars?:  number;
	/**
	 * Optional kind allowlist. Defaults to `['document', 'section',
	 * 'config']`. Callers wanting to restrict to prose-only
	 * (excluding YAML / Dockerfile / etc) can pass
	 * `['document', 'section']`.
	 */
	readonly kinds?: readonly ('document' | 'section' | 'config')[];
}

const DEFAULT_KINDS: readonly ('document' | 'section' | 'config')[] = [
	'document', 'section', 'config',
];

// ---------------------------------------------------------------------------
// Ranking constants
// ---------------------------------------------------------------------------

/** Vector-pass depth: request more from the ANN than we surface so
 *  the keyword pass has a candidate pool to boost/reorder. */
const VECTOR_DEPTH_MULT = 3;

/** Score blend. Vector weight + keyword weight sum to 1.0 (before
 *  the multiplicative path boost). */
const VECTOR_WEIGHT  = 0.6;
const KEYWORD_WEIGHT = 0.4;

/** Path-hint boost applied MULTIPLICATIVELY when `filenameHint`
 *  matches the entity's file. Multiplicative so the lift scales with
 *  the base score -- a weak candidate (score 0.15) gets a
 *  proportional lift to 0.17, not a 75% relative bump to 0.30 that
 *  would swamp real vector/keyword ranking. Additive boost was
 *  observed 2026-07-11 to systematically rank-lift an entire
 *  directory of noise when `filenameHint` was a coarse prefix like
 *  `design/`. */
const PATH_HINT_MULTIPLIER = 1.15;

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function retrieveDocSections(
	args: DocsRetrievalArgs,
): Promise<DocSectionResult[]> {
	if (args.query.trim().length === 0) return [];
	if (args.closureRepos.length === 0) return [];

	const maxResults    = args.maxResults    ?? 20;
	const minScore      = args.minScore      ?? 0;
	const previewChars  = args.previewChars  ?? 500;
	const kinds         = args.kinds         ?? DEFAULT_KINDS;
	const filenameHint  = args.filenameHint;

	// (1) Enumerate every doc/section/config entity in the closure --
	// this is the candidate universe for both passes. Cheap: a
	// single LMDB scan filtered by kind. Docs are a small subset of
	// the entity table (typically <5%).
	const candidatesByRepo: Entity[] = [];
	for (const repo of args.closureRepos) {
		const inRepo = await listEntitiesByKinds(args.db, kinds, { repo });
		candidatesByRepo.push(...inRepo);
	}
	if (candidatesByRepo.length === 0) {
		log.debug(
			{ query: args.query, closureRepos: args.closureRepos },
			'retrieveDocSections: no doc entities in closure',
		);
		return [];
	}
	const candidateById = new Map<string, Entity>();
	for (const e of candidatesByRepo) candidateById.set(e.id, e);

	// (2) Vector pass. Uses the same query embedding the code side
	// uses; when Ollama is down we silently skip this pass and rely
	// on the keyword pass alone.
	const vectorScores = new Map<string, number>();
	let queryVec: number[];
	try {
		queryVec = await embedQuery(args.query);
	} catch (err) {
		log.debug(
			{ err: (err as Error).message },
			'retrieveDocSections: query embed failed; vector pass skipped',
		);
		queryVec = [];
	}
	if (queryVec.length > 0) {
		try {
			const hits = await searchEntityVecs(
				queryVec,
				args.closureRepos,
				maxResults * VECTOR_DEPTH_MULT,
				{ kinds: kinds as readonly string[] },
			);
			for (const h of hits) {
				// Lance cosine distance is in [0, 2]; convert to similarity
				// in [0, 1]. Rows outside our candidate set (edge case: a
				// hit from a doc whose entity was deleted between the ANN
				// snapshot and our LMDB scan) are dropped.
				if (!candidateById.has(h.id)) continue;
				const sim = Math.max(0, 1 - h.distance / 2);
				// Keep the best score if the same id turned up multiple
				// times (Lance shouldn't but defense-in-depth).
				const prev = vectorScores.get(h.id) ?? 0;
				if (sim > prev) vectorScores.set(h.id, sim);
			}
		} catch (err) {
			log.debug(
				{ err: (err as Error).message },
				'retrieveDocSections: vector ANN failed; falling back to keyword only',
			);
		}
	}

	// (3) Keyword pass. Tokenise the query into salient terms, scan
	// every candidate's body for hits. Simple substring count, not
	// BM25 -- we don't need corpus statistics for a small doc corpus.
	// Score = (distinct terms hit) / (total terms in the query), so a
	// section that hits every query term scores 1.0 regardless of
	// query length. Previously the divisor was a fixed KEYWORD_HITS_
	// CAP=6 which (a) short-circuited scanning after 6 hits (making
	// the score ordering-dependent) and (b) punished short precise
	// queries by dividing by a constant larger than terms.length.
	const terms = tokeniseQuery(args.query);
	const keywordScores = new Map<string, number>();
	if (terms.length > 0) {
		for (const e of candidatesByRepo) {
			const body = (e.body ?? '').toLowerCase();
			if (body.length === 0) continue;
			let hits = 0;
			for (const t of terms) {
				if (body.includes(t)) hits += 1;
			}
			if (hits > 0) {
				keywordScores.set(e.id, hits / terms.length);
			}
		}
	}

	// (4) Union of candidates that scored in at least one pass.
	// Docs matching NEITHER pass are dropped (score 0 → below the
	// minScore floor for any non-zero floor, or produces no signal
	// worth surfacing anyway).
	const scoredIds = new Set<string>();
	for (const id of vectorScores.keys())  scoredIds.add(id);
	for (const id of keywordScores.keys()) scoredIds.add(id);

	const results: DocSectionResult[] = [];
	for (const id of scoredIds) {
		const e = candidateById.get(id);
		if (e === undefined) continue;

		const vScore = vectorScores.get(id)  ?? 0;
		const kScore = keywordScores.get(id) ?? 0;
		let score = VECTOR_WEIGHT * vScore + KEYWORD_WEIGHT * kScore;

		// Path-hint boost is now MULTIPLICATIVE (see PATH_HINT_
		// MULTIPLIER above). Applied AFTER the additive blend so it
		// scales the entire hybrid score proportionally rather than
		// swamping weak candidates.
		let pathBoost = 0;
		if (filenameHint !== undefined && filenameHint.length > 0
			&& e.file.toLowerCase().includes(filenameHint.toLowerCase())) {
			const boosted = score * PATH_HINT_MULTIPLIER;
			pathBoost = boosted - score;   // reported for diagnostics parity
			score = boosted;
		}

		if (score < minScore) continue;

		results.push({
			entityId:  e.id,
			file:      e.file,
			heading:   headingFor(e),
			lineStart: e.startLine,
			lineEnd:   e.endLine,
			kind:      e.kind as 'document' | 'section' | 'config',
			score,
			...(previewChars > 0 ? { bodyPreview: previewBody(e.body ?? '', previewChars) } : {}),
			diagnostics: {
				...(vScore   > 0 ? { vectorScore:  vScore   } : {}),
				...(kScore   > 0 ? { keywordScore: kScore   } : {}),
				...(pathBoost > 0 ? { pathBoost                } : {}),
			},
		});
	}

	// (5) Dedup by (file, heading). Prefer the more specific
	// section over the wrapping document when both scored.
	const dedupKey = (r: DocSectionResult): string => `${r.file}:::${r.heading}`;
	const byKey = new Map<string, DocSectionResult>();
	for (const r of results) {
		const k = dedupKey(r);
		const prev = byKey.get(k);
		if (prev === undefined) {
			byKey.set(k, r);
			continue;
		}
		// Prefer section over document when both hit; then prefer
		// higher score.
		if (r.kind === 'section' && prev.kind !== 'section') { byKey.set(k, r); continue; }
		if (r.kind === prev.kind && r.score > prev.score)    { byKey.set(k, r); continue; }
	}

	// (6) Sort by score desc, cap to maxResults.
	return Array.from(byKey.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, maxResults);
}

/**
 * Convenience wrapper for the common case: retrieve doc sections
 * in a single repo, natural-language query, defaults for the rest.
 * Skips the DbClient argument (callers that only want to query
 * one repo).
 */
export async function retrieveDocSectionsInRepo(
	repo:  string,
	query: string,
	opts:  Omit<DocsRetrievalArgs, 'db' | 'closureRepos' | 'query'> = {},
): Promise<DocSectionResult[]> {
	return retrieveDocSections({
		db:           null as unknown as DbClient,
		query,
		closureRepos: [repo],
		...opts,
	});
}

/**
 * Hydrate a single result's full body from LMDB. Callers wanting
 * the surrounding prose beyond the preview call this after
 * ranking, only for the results they actually surface. Returns
 * null when the entity is gone.
 */
export async function hydrateDocSection(
	db:       DbClient,
	entityId: string,
): Promise<Entity | null> {
	return getEntity(db, entityId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
	'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in',
	'on', 'at', 'for', 'with', 'from', 'by', 'as', 'and', 'or', 'not',
	'this', 'that', 'it', 'its', 'we', 'you', 'i', 'me', 'my', 'our',
	'what', 'when', 'where', 'why', 'how', 'do', 'does', 'did', 'have',
	'has', 'had', 'can', 'will', 'would', 'should', 'could',
]);

function tokeniseQuery(query: string): string[] {
	const raw = query.toLowerCase()
		.split(/[^a-z0-9_./-]+/g)
		.filter(t => t.length >= 3 && !STOPWORDS.has(t));
	// Dedupe.
	return Array.from(new Set(raw));
}

function headingFor(e: Entity): string {
	// Section entities carry the heading text in `name`; document /
	// config entities use the basename as the heading. Matches how
	// the artifact parser writes rows.
	if (e.kind === 'section') return e.name;
	if (e.name.length > 0)    return e.name;
	const parts = e.file.split(/[\\/]/);
	return parts[parts.length - 1] ?? '';
}

function previewBody(body: string, cap: number): string {
	if (body.length <= cap) return body;
	return body.slice(0, cap - 3).trimEnd() + '...';
}
