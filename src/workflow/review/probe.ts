/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deterministic evidence gathering — the middle pass of the review cycle.
 *
 * NO LLM. For each claim's probe we re-run the cited greps (ripgrep, via
 * `execFile` — the pattern is ALWAYS an argv element, never
 * shell-interpolated) and confirm the cited `path:line` reads against the
 * real file. The output is the ground truth the judge pass reasons over;
 * the LLM never asserts grounding it wasn't handed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import { runGrepSearch } from '../../daemon/tools/builtins/search/grep.js';
import { getLogger } from '../../shared/logger.js';
import { resolveSourceRoots, rootPrefix, type SourceRoot } from './source-roots.js';
import type { Claim, Evidence, GrepResult, ReadResult } from './types.js';

const log = getLogger('review');

/** Cap on matches kept per grep. Beyond this we set `truncated`. */
const MATCH_CAP = 50;

// ---------------------------------------------------------------------------
// grep (ripgrep when present, Node walk otherwise)
// ---------------------------------------------------------------------------

/**
 * Run one grep pattern over the repo's REAL source roots (derived from the
 * indexed graph by `resolveSourceRoots` — no hardcoded `src/` assumption)
 * via the shared `runGrepSearch` backend, which prefers ripgrep but falls
 * back to a Node recursive walk when `rg` isn't on PATH. This matters: if
 * evidence gathering silently returned nothing (rg absent, or code outside
 * `src/`), every claim would look "unverifiable" and the whole review would
 * over-block.
 *
 * Roots are grepped densest-first under a SINGLE global `MATCH_CAP` (not
 * MATCH_CAP-per-root). Each match is re-prefixed with its OWNING root's
 * segment so `path:line` anchors stay diff-clickable. A per-root failure
 * (e.g. a stale root deleted since indexing → ENOENT) skips only that root;
 * a pattern-level failure (invalid regex) yields empty — a probe that errors
 * must not abort the review. The pattern is passed as data (never
 * shell-interpolated).
 */
async function runGrep(
	pattern: string,
	repoPath: string,
	roots: readonly SourceRoot[],
): Promise<GrepResult> {
	const matches: string[] = [];
	let truncated = false;
	for (const root of roots) {
		if (matches.length >= MATCH_CAP) { truncated = true; break; }
		const remaining = MATCH_CAP - matches.length;
		let data;
		try {
			data = await runGrepSearch({ pattern, root: root.path, limit: remaining });
		} catch (err) {
			// Per-root failure: a stale root (ENOENT), a tooling error, OR an
			// empty/invalid pattern (runGrepSearch throws on that). Skip this
			// root; do NOT treat it as an authoritative zero-hit that would
			// drive a BLOCK. If the pattern itself is bad, every root skips and
			// the net result is an honest empty — same as the old behaviour.
			const msg = err instanceof Error ? err.message : String(err);
			log.warn({ pattern, root: root.path, err: msg }, 'review:probe: grep errored on root; skipping');
			continue;
		}
		const prefix = rootPrefix(repoPath, root);
		for (const h of data.hits) {
			matches.push(prefix === '' ? `${h.path}:${h.line}:${h.text}` : `${prefix}/${h.path}:${h.line}:${h.text}`);
		}
		if (data.truncated) truncated = true;
	}
	return { pattern, matches, truncated };
}

// ---------------------------------------------------------------------------
// filename existence — a content grep CANNOT see a file that exists but is
// named in no file body (e.g. "does foo.test.ts exist?"). This closed a real
// false-positive HIGH ("test file X missing" when X was right there on disk).
// ---------------------------------------------------------------------------

const IGNORE = new Set(['node_modules', 'out', 'dist', '.git']);

/** Filename-ish tokens in a grep pattern (`foo.test.ts`, `src/x/y.ts`). */
function filenameTokens(pattern: string): string[] {
	const out = new Set<string>();
	for (const m of pattern.matchAll(/[\w./-]*\w+\.[a-z][a-z0-9]{0,4}(?:\.[a-z][a-z0-9]{0,4})?/gi)) {
		out.add(m[0].replace(/\\/g, ''));
	}
	return [...out];
}

/** Repo-relative paths of existing files matching `token` by basename or
 *  path-suffix, searched under the repo's real source `roots` (no hardcoded
 *  `src/`). Bounded (≤5 hits, skips ignored dirs). */
function findFilesByName(repoPath: string, token: string, roots: readonly SourceRoot[]): string[] {
	const base = token.split('/').pop() ?? token;
	const found: string[] = [];
	const walk = (dir: string): void => {
		if (found.length >= 5) return;
		let entries;
		try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			if (found.length >= 5) return;
			if (e.name.startsWith('.') || IGNORE.has(e.name)) continue;
			const full = join(dir, e.name);
			if (e.isDirectory()) { walk(full); continue; }
			const rel = relative(repoPath, full);
			if (e.isFile() && (e.name === base || rel.endsWith(token))) found.push(rel);
		}
	};
	for (const root of roots) {
		if (found.length >= 5) break;
		walk(root.path);
	}
	return found;
}

/** Existence notes for the filename tokens in a grep pattern, so the judge
 *  sees a file that exists even when nothing references it by name. */
function existenceMatches(pattern: string, repoPath: string, roots: readonly SourceRoot[]): string[] {
	const out: string[] = [];
	for (const tok of filenameTokens(pattern)) {
		if (!tok.includes('.')) continue;
		for (const p of findFilesByName(repoPath, tok, roots)) out.push(`FILE EXISTS: ${p} (matched by name, not content)`);
	}
	return out;
}

// ---------------------------------------------------------------------------
// path:line reads
// ---------------------------------------------------------------------------

/** Parse a `path:line` anchor. Tolerates a trailing `:col`. */
function parseAnchor(anchor: string): { path: string; line: number } | null {
	// Split on the LAST colon-number groups: `path:line` or `path:line:col`.
	const m = /^(.*?):(\d+)(?::\d+)?$/.exec(anchor.trim());
	if (m === null) return null;
	const path = m[1];
	const lineStr = m[2];
	if (path === undefined || lineStr === undefined || path.length === 0) return null;
	const line = Number.parseInt(lineStr, 10);
	if (!Number.isFinite(line) || line < 1) return null;
	return { path, line };
}

/** Resolve `path` inside `repoPath`, refusing escapes outside the repo. */
function resolveInRepo(repoPath: string, path: string): string | null {
	const root = resolve(repoPath);
	const abs = isAbsolute(path) ? normalize(path) : normalize(join(root, path));
	if (abs !== root && !abs.startsWith(root + sep)) return null;
	return abs;
}

/** Confirm one `path:line` anchor against the real file. */
function runRead(anchor: string, repoPath: string): ReadResult {
	const parsed = parseAnchor(anchor);
	if (parsed === null) return { anchor, found: false };
	const abs = resolveInRepo(repoPath, parsed.path);
	if (abs === null) return { anchor, found: false };
	try {
		const content = readFileSync(abs, 'utf8');
		const lines = content.split('\n');
		const idx = parsed.line - 1;
		if (idx < 0 || idx >= lines.length) return { anchor, found: false };
		const line = lines[idx];
		if (line === undefined) return { anchor, found: false };
		return { anchor, found: true, line };
	} catch {
		return { anchor, found: false };
	}
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Gather deterministic evidence for every claim. Greps and reads are pure
 * filesystem operations — no provider, no `Promise.all` policy concern
 * (nothing here reaches an LLM). Ordering of claims in the output matches
 * the input.
 */
export async function gatherEvidence(claims: Claim[], repoPath: string): Promise<Evidence[]> {
	// Derive the repo's REAL source roots ONCE from the indexed graph (not
	// per-pattern) — replaces the old hardcoded `join(repoPath, 'src')`. A
	// degraded/unindexed repo falls back to the repo root (observable), so a
	// probe always has a real target and can never manufacture a false BLOCK.
	const { roots, fallbackUsed } = await resolveSourceRoots(repoPath);
	if (fallbackUsed) {
		log.warn({ repoPath }, 'review:probe: source-root graph read empty/failed; grepping repo root (degraded run)');
	}
	const out: Evidence[] = [];
	for (const claim of claims) {
		const grepResults: GrepResult[] = [];
		for (const pattern of claim.probe.greps ?? []) {
			const gr = await runGrep(pattern, repoPath, roots);
			// Augment with filename-existence notes so the judge doesn't false-flag
			// a file that exists on disk but is referenced in no file body.
			const exists = existenceMatches(pattern, repoPath, roots);
			grepResults.push(exists.length > 0 ? { ...gr, matches: [...exists, ...gr.matches] } : gr);
		}
		const reads: ReadResult[] = [];
		for (const anchor of claim.probe.reads ?? []) {
			reads.push(runRead(anchor, repoPath));
		}
		out.push({ claimId: claim.id, grepResults, reads });
	}
	log.info({ claims: claims.length, roots: roots.length, fallbackUsed }, 'review:probe: gathered deterministic evidence');
	return out;
}
