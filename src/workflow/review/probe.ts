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
import type { Claim, Evidence, GrepResult, ReadResult } from './types.js';

const log = getLogger('review');

/** Cap on matches kept per grep. Beyond this we set `truncated`. */
const MATCH_CAP = 50;

// ---------------------------------------------------------------------------
// grep (ripgrep when present, Node walk otherwise)
// ---------------------------------------------------------------------------

/**
 * Run one grep pattern over `src/` within `repoPath` via the shared
 * `runGrepSearch` backend — which prefers ripgrep but falls back to a
 * Node recursive walk when `rg` isn't on PATH. This matters: if evidence
 * gathering silently returned nothing when `rg` is absent, every claim
 * would look "unverifiable" and the whole review would over-block. The
 * pattern is passed as data (never shell-interpolated). A bad regex or any
 * other failure yields empty + `truncated:false` and is logged — a probe
 * that errors must not abort the review.
 */
async function runGrep(pattern: string, repoPath: string): Promise<GrepResult> {
	try {
		const data = await runGrepSearch({ pattern, root: join(repoPath, 'src'), limit: MATCH_CAP });
		// Re-prefix with `src/` so match paths line up with how claims cite
		// them (the search root strips it) and stay diff-clickable.
		const matches = data.hits.map(h => `src/${h.path}:${h.line}:${h.text}`);
		return { pattern, matches, truncated: data.truncated };
	} catch (err) {
		// runGrepSearch throws only on an empty/invalid pattern; everything
		// else (missing files, binaries, rg absent) is handled inside it.
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ pattern, err: msg }, 'review:probe: grep errored; treating as empty');
		return { pattern, matches: [], truncated: false };
	}
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
 *  path-suffix, searched under `src/`. Bounded (≤5 hits, skips ignored dirs). */
function findFilesByName(repoPath: string, token: string): string[] {
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
	walk(join(repoPath, 'src'));
	return found;
}

/** Existence notes for the filename tokens in a grep pattern, so the judge
 *  sees a file that exists even when nothing references it by name. */
function existenceMatches(pattern: string, repoPath: string): string[] {
	const out: string[] = [];
	for (const tok of filenameTokens(pattern)) {
		if (!tok.includes('.')) continue;
		for (const p of findFilesByName(repoPath, tok)) out.push(`FILE EXISTS: ${p} (matched by name, not content)`);
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
	const out: Evidence[] = [];
	for (const claim of claims) {
		const grepResults: GrepResult[] = [];
		for (const pattern of claim.probe.greps ?? []) {
			const gr = await runGrep(pattern, repoPath);
			// Augment with filename-existence notes so the judge doesn't false-flag
			// a file that exists on disk but is referenced in no file body.
			const exists = existenceMatches(pattern, repoPath);
			grepResults.push(exists.length > 0 ? { ...gr, matches: [...exists, ...gr.matches] } : gr);
		}
		const reads: ReadResult[] = [];
		for (const anchor of claim.probe.reads ?? []) {
			reads.push(runRead(anchor, repoPath));
		}
		out.push({ claimId: claim.id, grepResults, reads });
	}
	log.info({ claims: claims.length }, 'review:probe: gathered deterministic evidence');
	return out;
}
