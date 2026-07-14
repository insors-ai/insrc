/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * concept.resolve exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 1. Given a
 * natural-language query (typically `intent.focus`), rank
 * directories, files, and entities in the repo by how well they
 * match the query TOKENS. Deterministic + explainable + cheap --
 * no LLM.
 *
 * This is the exploration that FIXES the Test 3 failure. When
 * asked "map the payable extraction module", the LLM shaper
 * memory-matched `payable` to `insors/core/model/invoice/`. This
 * runner ranks `insors/extraction/payable/` #1 because the path
 * literally contains BOTH tokens (`extraction` + `payable`) --
 * an objective 2-token path match beats the LLM's 1-token
 * memory pattern.
 *
 * Ranking = weighted sum of:
 *   - Path-token match: unique query tokens that appear in the
 *     entity's absolute path, normalised by query token count
 *   - Name-token match: unique query tokens that appear in the
 *     entity's name (identifier or filename), same normalisation
 *   - Path-depth penalty: shallower paths score marginally higher
 *     (a directory is more meaningful than a deep-nested file
 *     when both share the same token match)
 *   - Directory bonus: kind='dir' hits get a small boost when the
 *     query implies "module" / "package" / "framework" (structural
 *     queries) -- expressed via the STRUCTURAL_TOKENS list
 *
 * NOT included in v1:
 *   - Graph in-degree (deferred; adds complexity without proven
 *     ranking benefit for structural-map queries)
 *   - Vector similarity fallback (deferred; the tokenizer covers
 *     the common cases; vector kicks in for prose-retrieval
 *     answer types in a later phase)
 */

import { readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { getDb } from '../../db/client.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity } from '../../shared/types.js';

import type {
	ConceptHit,
	ConceptResolveOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:concept-resolve');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_HITS = 20;

/** Stopwords to drop from queries -- common English filler + generic
 *  code-jargon that would false-match everywhere. */
const STOPWORDS = new Set([
	'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in',
	'on', 'at', 'for', 'with', 'from', 'by', 'as', 'and', 'or', 'not',
	'this', 'that', 'it', 'its', 'we', 'you', 'i', 'me', 'my', 'our',
	'what', 'when', 'where', 'why', 'how', 'do', 'does', 'did', 'have',
	'has', 'had', 'can', 'will', 'would', 'should', 'could',
	// code-jargon fillers
	'code', 'file', 'system', 'framework', 'library', 'source',
	'thing', 'stuff', 'about', 'like', 'some', 'any', 'all',
]);

/** Query tokens that hint the user is asking about a MODULE, not a
 *  single symbol. Presence boosts kind='dir' hits. */
const STRUCTURAL_TOKENS = new Set([
	'module', 'package', 'subsystem', 'framework', 'component',
	'service', 'layer', 'pipeline', 'infrastructure',
]);

/** Score weights (sum to ~1.0 before bonuses).
 *
 *  Depth is DELIBERATELY not a score signal. `depthSegments` is still
 *  computed + surfaced in `diagnostics.pathDepth` for observability,
 *  but it's not weighted -- in a real codebase docs cluster near the
 *  root and code sinks into modules, so encoding "shallower is
 *  better" as a global bonus is a systematic tax on code retrieval.
 *  The former W_DEPTH weight (0.10) was redistributed into
 *  W_NAME_TOKENS: the reader named the thing, so name-token match is
 *  the closer proxy for what they want than path depth. */
const W_PATH_TOKENS   = 0.45;
const W_NAME_TOKENS   = 0.40;
/** Entity density -- how much INDEXED code lives under this
 *  candidate. Discriminates real code modules from
 *  documentation-only directories that share a name (Test A on
 *  insors-extraction: `docs/extraction/payable/` had 0 code
 *  entities but was tied with `insors/extraction/payable/` on
 *  path tokens). */
const W_ENTITY_DENSITY = 0.15;

/** Small additive bonuses. */
const DIR_STRUCTURAL_BONUS = 0.10;

/** Multiplicative penalty for test-only paths. Applied
 *  UNCONDITIONALLY (previously gated on `structuralBoost`, which
 *  missed queries that don't happen to include a structural keyword
 *  -- observed 2026-07-11 when `executor-placeholders.test.ts` beat
 *  `executor.ts` on a "map the executor" style query because the
 *  query had no structural token to trip the gate). Test files
 *  should almost never rank #1 unless the query explicitly mentions
 *  tests. Halving keeps them in the list for fallback. */
const TEST_PATH_PENALTY = 0.50;

/** Regex matching test paths -- anywhere in the path OR basename
 *  starting with `test_` / `spec_`. */
const TEST_PATH_RX = /(^|\/)(tests?|__tests__|test|spec|specs)\/|(^|\/)(test_|spec_)/i;

function isTestPath(path: string): boolean {
	return TEST_PATH_RX.test(path);
}

/** Density thresholds. Bucket into 4 tiers so density adds a
 *  monotonic signal without dominating: 0 entities = 0, 1-9 = 0.25,
 *  10-49 = 0.5, 50-249 = 0.75, 250+ = 1.0. */
function densityScore(entityCount: number): number {
	if (entityCount <= 0)   return 0;
	if (entityCount < 10)   return 0.25;
	if (entityCount < 50)   return 0.5;
	if (entityCount < 250)  return 0.75;
	return 1.0;
}

/** Minimum shared-prefix length for prefix matching. Below this,
 *  we require exact match to avoid `class` -> `classroom` false
 *  hits. Empirically tuned so `classifier` matches `classification`
 *  (shared "classifi" = 8 chars) but `class` does not match
 *  `classroom` (only "class" = 5 chars shared). */
const MIN_PREFIX_LEN = 7;

/**
 * Is there any token in `bag` that shares a >= MIN_PREFIX_LEN
 * prefix with `q` (in either direction)? Both `q` and the
 * candidate must be at least MIN_PREFIX_LEN chars for the check
 * to fire.
 */
function hasPrefixMatch(q: string, bag: ReadonlySet<string>): boolean {
	if (q.length < MIN_PREFIX_LEN) return false;
	const qPrefix = q.slice(0, MIN_PREFIX_LEN);
	for (const t of bag) {
		if (t.length < MIN_PREFIX_LEN) continue;
		if (t.startsWith(qPrefix))                    return true;
		if (q.startsWith(t.slice(0, MIN_PREFIX_LEN))) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/** Split a query on non-alphanumeric boundaries + lower-case. */
function tokenise(query: string): string[] {
	return query.toLowerCase()
		.split(/[^a-z0-9_]+/g)
		.filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Split a code identifier or path segment into tokens. Handles
 * snake_case, camelCase, kebab-case, dot.separated, and file
 * extensions in one pass.
 */
function splitIdentifier(name: string): string[] {
	// First collapse extension separators + slashes to spaces, then
	// split camelCase: any lowercase-to-uppercase or letter-to-digit
	// transition becomes a boundary.
	const collapsed = name
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
		.replace(/([a-zA-Z])(\d)/g, '$1 $2')
		.replace(/(\d)([a-zA-Z])/g, '$1 $2');
	return collapsed
		.split(/[^a-zA-Z0-9]+/g)
		.filter(t => t.length >= 2)
		.map(t => t.toLowerCase());
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface Candidate {
	readonly kind:  'dir' | 'file' | 'entity';
	readonly path:  string;
	readonly name:  string;
	readonly entityId?: string;
	/** Number of non-artefact entities under this candidate's path.
	 *  Directories: entities whose file lives under the directory.
	 *  Files: entities defined in the file. Entities themselves:
	 *  entity_count = 1 (or 0 for module stubs). */
	readonly entityCount?: number;
}

interface ScoredCandidate extends Candidate {
	readonly score: number;
	readonly diagnostics: {
		tokenMatch?:    number;
		pathDepth?:     number;
		entityDensity?: number;
	};
}

function scoreCandidate(
	c:      Candidate,
	tokens: readonly string[],
	repoPath: string,
	structuralBoost: boolean,
): ScoredCandidate | null {
	if (tokens.length === 0) return null;

	// Tokenise the path (walk every path segment, split each on
	// identifier boundaries). Same for the name.
	const relPath = c.path.startsWith(repoPath) ? c.path.slice(repoPath.length + 1) : c.path;
	const pathTokens = new Set<string>();
	for (const seg of relPath.split(/[\\/]+/g)) {
		for (const t of splitIdentifier(seg)) pathTokens.add(t);
	}
	const nameTokens = new Set(splitIdentifier(c.name));

	// Count query tokens that appear in path / name. Exact match
	// scores 1; prefix match (>=7-char shared prefix in both
	// directions) scores 0.7 -- lets `classifier` still hit
	// `classification/` (share "classifi" = 8 chars), `extract` hit
	// `extraction/`, `payable` hit `payables/`, etc. Short tokens
	// (<7 chars) fall back to exact match only so we don't false-
	// match `class` -> `classroom`.
	let pathHits = 0;
	let nameHits = 0;
	for (const t of tokens) {
		if (pathTokens.has(t))       pathHits += 1;
		else if (hasPrefixMatch(t, pathTokens)) pathHits += 0.7;

		if (nameTokens.has(t))       nameHits += 1;
		else if (hasPrefixMatch(t, nameTokens)) nameHits += 0.7;
	}

	// No hits at all -> drop.
	if (pathHits === 0 && nameHits === 0) return null;

	const pathMatchNorm = pathHits / tokens.length;
	const nameMatchNorm = nameHits / tokens.length;

	// Depth is observed but not scored. See W_PATH_TOKENS block above
	// for the rationale: depth is a bad prior in real codebases where
	// docs cluster near the root and code sinks into modules. We keep
	// the segment count as a diagnostic so callers can still see it
	// in `diagnostics.pathDepth`, but it does not enter the score.
	const depthSegments = relPath.split(/[\\/]+/g).filter(x => x.length > 0).length;

	// Entity-density score: how much INDEXED code lives under this
	// candidate. For directories, this is the count of non-artefact
	// entities whose file path lives under the dir. For files, the
	// entity count IN the file. For entity hits, just 1. Density
	// discriminates real code modules from documentation-only dirs
	// that share a name.
	const density = densityScore(c.entityCount ?? 0);

	let score =
		W_PATH_TOKENS    * pathMatchNorm +
		W_NAME_TOKENS    * nameMatchNorm +
		W_ENTITY_DENSITY * density;

	if (structuralBoost && c.kind === 'dir') {
		score += DIR_STRUCTURAL_BONUS;
	}

	// Test-only paths are halved UNCONDITIONALLY -- see the
	// TEST_PATH_PENALTY constant above for why the structuralBoost
	// guard was removed. Test files should almost never rank #1
	// unless the query explicitly mentions tests.
	if (isTestPath(c.path)) {
		score *= TEST_PATH_PENALTY;
	}

	// Clamp to [0, 1] after bonuses.
	if (score > 1) score = 1;
	if (score < 0) score = 0;

	return {
		...c,
		score,
		diagnostics: {
			tokenMatch:    (pathMatchNorm + nameMatchNorm) / 2,
			pathDepth:     depthSegments,
			entityDensity: density,
		},
	};
}

// ---------------------------------------------------------------------------
// Candidate enumeration
// ---------------------------------------------------------------------------

/**
 * Enumerate directories under the repo, up to a depth cap. Skip
 * common noise directories (node_modules, .git, __pycache__, ...).
 *
 * We SCAN the filesystem for directories rather than relying on the
 * indexer's entity table because:
 *   - Directories don't get entities by themselves (only files do)
 *   - We want ALL directories, not just those with code
 *   - Filesystem walk is fast (thousands of dirs in <100ms)
 */
const IGNORE_DIRS = new Set([
	'node_modules', '.git', '__pycache__', '.venv', 'venv',
	'.tox', 'dist', 'build', '.next', '.cache', 'target',
	'.mypy_cache', '.pytest_cache', '.ruff_cache',
	'.DS_Store', 'coverage', '.idea', '.vscode',
]);

const MAX_DIR_DEPTH = 8;

function enumerateDirs(
	repoPath: string,
	ignoreFilter: import('../context/repo-ignore-filter.js').RepoIgnoreFilter,
): Candidate[] {
	const out: Candidate[] = [];
	function walk(dir: string, depth: number): void {
		if (depth > MAX_DIR_DEPTH) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			if (IGNORE_DIRS.has(name)) continue;
			if (name.startsWith('.') && depth === 0) continue;   // skip .git-like at root
			const full = join(dir, name);
			// Drop anything git considers gitignored (build/, dist/,
			// target/, out/, .next/, node_modules/, ...). The hardcoded
			// IGNORE_DIRS above is intentionally incomplete -- every
			// toolchain names its build dir differently. Delegating to
			// git guarantees the analyze surface matches the indexer's
			// view of the repo.
			if (!ignoreFilter.isIncluded(full)) continue;
			let s;
			try { s = statSync(full); }
			catch { continue; }
			if (!s.isDirectory()) continue;
			out.push({ kind: 'dir', path: full, name });
			walk(full, depth + 1);
		}
	}
	walk(repoPath, 0);
	return out;
}

/**
 * Populate `entityCount` on every candidate by counting non-artefact
 * structural entities whose file path lives under the candidate's
 * path. Single O(N * K) scan where N = entities and K = candidates.
 * For 100k entities and 5k candidates the wall-clock is ~500ms --
 * paid once per concept.resolve call.
 */
function annotateEntityCounts(
	candidates: readonly Candidate[],
	entities:   readonly Entity[],
): Candidate[] {
	// Build a prefix index of directory paths -> counter for O(N +
	// K) instead of O(N * K). Every entity file walks up to the root
	// counting each ancestor dir.
	const dirCount = new Map<string, number>();
	const fileCount = new Map<string, number>();
	for (const e of entities) {
		if (e.artifact === true) continue;
		if (!STRUCTURAL_ENTITY_KINDS.has(e.kind) && e.kind !== 'file') continue;
		const file = e.file;
		if (e.kind === 'file') {
			// File entities contribute to dir counts up the chain but
			// not to their own file's structural count (only functions
			// / classes / etc do).
		} else {
			fileCount.set(file, (fileCount.get(file) ?? 0) + 1);
		}
		// Walk parent dirs.
		let cursor = parentDir(file);
		while (cursor.length > 0) {
			dirCount.set(cursor, (dirCount.get(cursor) ?? 0) + 1);
			const next = parentDir(cursor);
			if (next === cursor) break;
			cursor = next;
		}
	}
	// Only structural (non-file) entities get counted in the dir
	// aggregates above -- files that hold structural entities were
	// already contributing via their child structurals. But we also
	// want files themselves to contribute a small signal for
	// entity-count-oriented dirs, so top up each dir by the number
	// of files with kind='file' underneath it.
	// (Simplification: for V1 the structural-only count is
	// meaningful enough; skip the file top-up. Revisit when Phase 4
	// convention.detect wants finer signal.)
	const out: Candidate[] = [];
	for (const c of candidates) {
		let count = 0;
		if (c.kind === 'dir')    count = dirCount.get(c.path)  ?? 0;
		else if (c.kind === 'file') count = fileCount.get(c.path) ?? 0;
		else                    count = 1;  // entity itself
		out.push({ ...c, entityCount: count });
	}
	return out;
}

function parentDir(path: string): string {
	const idx = path.lastIndexOf('/');
	if (idx <= 0) return '';
	return path.slice(0, idx);
}

/**
 * Enumerate `file` entities in the repo. Every source-code file gets
 * a kind='file' entity from the parser layer.
 */
function fileCandidatesFromEntities(
	entities:     readonly Entity[],
	ignoreFilter: import('../context/repo-ignore-filter.js').RepoIgnoreFilter,
): Candidate[] {
	const out: Candidate[] = [];
	for (const e of entities) {
		if (e.kind !== 'file') continue;
		// Artefacts (markdown docs, YAML configs, etc.) are covered by
		// the docs retrieval pipeline. Exclude them from concept.resolve
		// candidates so a `.md` guide file named "messaging_module_
		// guide.md" doesn't beat the actual `insors/core/messaging/`
		// module on a code-target query.
		if (e.artifact === true) continue;
		// Drop stale entities that live under a currently-gitignored
		// path. The entity table can carry rows from prior indexing
		// runs where the path was still tracked; git is the source of
		// truth for what should surface *now*.
		if (!ignoreFilter.isIncluded(e.file)) continue;
		out.push({
			kind: 'file',
			path: e.file,
			name: basename(e.file),
		});
	}
	return out;
}

/**
 * Enumerate the "structural" entities: functions / classes /
 * methods / types / modules. Excludes files (already covered) and
 * artefacts (docs / config -- have their own retrieval path).
 */
const STRUCTURAL_ENTITY_KINDS = new Set([
	'function', 'class', 'method', 'interface', 'type', 'module',
]);

function structuralEntityCandidates(
	entities:     readonly Entity[],
	ignoreFilter: import('../context/repo-ignore-filter.js').RepoIgnoreFilter,
): Candidate[] {
	const out: Candidate[] = [];
	for (const e of entities) {
		if (!STRUCTURAL_ENTITY_KINDS.has(e.kind)) continue;
		if (e.artifact === true) continue;
		// Same stale-entity filter as fileCandidatesFromEntities: a
		// function/class living under a currently-gitignored path
		// (`out/`, `build/`, `dist/`, ...) is a build artefact and must
		// not surface as a candidate.
		if (!ignoreFilter.isIncluded(e.file)) continue;
		out.push({
			kind:     'entity',
			path:     e.file,
			name:     e.name,
			entityId: e.id,
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// Params + runner
// ---------------------------------------------------------------------------

interface ConceptResolveParams {
	readonly query:       string;
	readonly limit?:      number;
	/** Bias to include/exclude kinds. Default: include all. */
	readonly includeKinds?: readonly ('dir' | 'file' | 'entity')[];
}

function parseParams(exp: Exploration): ConceptResolveParams {
	const p = exp.params as Record<string, unknown>;
	const query = typeof p['query'] === 'string' ? (p['query'] as string).trim() : '';
	if (query.length === 0) {
		throw new Error(`concept.resolve: params.query is required (non-empty string)`);
	}
	const limit = typeof p['limit'] === 'number' && p['limit']! > 0
		? Math.min(MAX_HITS, Math.floor(p['limit'] as number))
		: MAX_HITS;
	const includeKindsRaw = p['includeKinds'];
	const includeKinds = Array.isArray(includeKindsRaw)
		? includeKindsRaw.filter(k => k === 'dir' || k === 'file' || k === 'entity') as ('dir' | 'file' | 'entity')[]
		: undefined;
	return {
		query,
		limit,
		...(includeKinds !== undefined ? { includeKinds } : {}),
	};
}

export async function runConceptResolve(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<ConceptResolveOutput> {
	const params = parseParams(exp);
	const tokens = tokenise(params.query);
	if (tokens.length === 0) {
		log.debug({ query: params.query }, 'concept.resolve: no salient tokens');
		return { type: 'concept.resolve', query: params.query, hits: [] };
	}

	const structuralBoost = tokens.some(t => STRUCTURAL_TOKENS.has(t));

	// STRUCTURAL_TOKENS signal INTENT (this is a structural query,
	// give dirs a bonus). They should NOT count as candidate matches
	// themselves -- otherwise a file named `messaging_module_guide.md`
	// gets a bogus "module" name-token hit that lets it beat the
	// actual `insors/core/messaging/` directory. Filter them out of
	// the matching set.
	const matchTokens = tokens.filter(t => !STRUCTURAL_TOKENS.has(t));
	if (matchTokens.length === 0) {
		log.debug({ query: params.query, tokens }, 'concept.resolve: no non-structural tokens; empty result');
		return { type: 'concept.resolve', query: params.query, hits: [] };
	}

	const includeKinds = params.includeKinds ?? ['dir', 'file', 'entity'];

	const db = await getDb();
	const entities = await listEntitiesForRepo(db, ctx.repoPath);

	// Assemble the candidate pool.
	const rawCandidates: Candidate[] = [];
	if (includeKinds.includes('dir'))    rawCandidates.push(...enumerateDirs(ctx.repoPath, ctx.ignoreFilter));
	if (includeKinds.includes('file'))   rawCandidates.push(...fileCandidatesFromEntities(entities, ctx.ignoreFilter));
	if (includeKinds.includes('entity')) rawCandidates.push(...structuralEntityCandidates(entities, ctx.ignoreFilter));

	// Annotate every candidate with an entityCount so the density
	// signal can discriminate real code modules from empty docs
	// dirs that share a name.
	const candidates = annotateEntityCounts(rawCandidates, entities);

	// Score every candidate. Drop zero-hit candidates inline.
	const scored: ScoredCandidate[] = [];
	for (const c of candidates) {
		const s = scoreCandidate(c, matchTokens, ctx.repoPath, structuralBoost);
		if (s !== null) scored.push(s);
	}

	// Dedup by (kind, path) preferring the higher score. Rare edge
	// case where the same path is enumerated via multiple candidate
	// paths.
	const byKey = new Map<string, ScoredCandidate>();
	for (const s of scored) {
		const k = `${s.kind}:${s.path}`;
		const prev = byKey.get(k);
		if (prev === undefined || s.score > prev.score) byKey.set(k, s);
	}

	const ranked = Array.from(byKey.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, params.limit ?? MAX_HITS);

	const hits: ConceptHit[] = ranked.map(r => ({
		kind:  r.kind,
		path:  r.path,
		name:  r.name,
		...(r.entityId !== undefined ? { entityId: r.entityId } : {}),
		score: Math.round(r.score * 1000) / 1000,
		diagnostics: {
			...(r.diagnostics.tokenMatch !== undefined ? { tokenMatch: Math.round(r.diagnostics.tokenMatch * 1000) / 1000 } : {}),
			...(r.diagnostics.pathDepth !== undefined ? { pathDepth:  r.diagnostics.pathDepth } : {}),
			...(r.diagnostics.entityDensity !== undefined ? { graphInDegree: Math.round(r.diagnostics.entityDensity * 1000) / 1000 } : {}),
		},
	}));

	log.info(
		{
			runId:   ctx.runId,
			query:   params.query,
			tokens,
			candidateCount: candidates.length,
			scoredCount:    scored.length,
			returnedCount:  hits.length,
			topPath: hits[0]?.path,
		},
		'concept.resolve: complete',
	);

	return { type: 'concept.resolve', query: params.query, hits };
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _tokeniseForTest = tokenise;
export const _splitIdentifierForTest = splitIdentifier;
export const _scoreCandidateForTest = scoreCandidate;

// silence unused import when this file is later refactored
void relative;
