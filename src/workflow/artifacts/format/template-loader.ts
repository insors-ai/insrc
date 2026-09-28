/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002, a2) — the FORMAT-template loader cascade for the workflow
 * DEF/HLD/LLD/PLAN markdown documents.
 *
 * Mirrors the 3-tier override cascade of the docgen HTML template loader
 * (daemon/artifacts/template-loader.ts) but for the workflow document FORMATS:
 *
 *   1. <repo>/.insrc/artifacts/formats/<kind>.md   — per-repo override
 *   2. ~/.insrc/artifacts/formats/<kind>.md        — per-user override
 *   3. bundled src/assets/artifacts/formats/<kind>.md — always ships (copy-assets)
 *
 * First readable + parseable file wins; a malformed override degrades to the
 * next tier with a one-shot warn (never a silent no-render). A total miss throws
 * (the bundled default always ships, so this signals a packaging fault).
 *
 * Loading is SYNCHRONOUS (readFileSync + an mtime cache) so the per-type
 * renderers stay sync — they resolve their format through `resolveDocumentFormat`
 * with the in-code `defaultFormat(kind)` as a defensive final fallback, honoring
 * a per-repo/user override on EVERY render path (generation, relink, tail) with
 * no async ripple. Distinct from the docgen loader: different kind set (workflow
 * artifact kinds, not docgen doc types), `.md` not `.html`, and no HTML lint.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getLogger } from '../../../shared/logger.js';
import { PATHS } from '../../../shared/paths.js';
import type { DocumentFormat } from './types.js';
import { defaultFormat } from './formats.js';
import { parseFormatTemplate } from './template.js';

const log = getLogger('artifact-formats');

type FormatKind = DocumentFormat['kind'];
type FormatLayer = 'repo' | 'user' | 'bundled';

const BUNDLED_FORMAT_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../../assets/artifacts/formats',
);
const USER_FORMAT_DIR = join(PATHS.insrc, 'artifacts', 'formats');

function repoFormatDir(repoRoot: string): string {
	return join(repoRoot, '.insrc', 'artifacts', 'formats');
}

export interface LoadedFormat {
	readonly kind:   FormatKind;
	readonly layer:  FormatLayer;
	readonly path:   string;
	readonly format: DocumentFormat;
}

interface CacheEntry {
	readonly layer:   FormatLayer;
	readonly path:    string;
	readonly mtimeMs: number;
	readonly format:  DocumentFormat;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(kind: FormatKind, repoRoot: string | undefined): string {
	return `${kind}::${repoRoot ?? ''}`;
}

function tryRead(path: string): { text: string; mtimeMs: number } | null {
	try {
		const mtimeMs = statSync(path).mtimeMs;
		const text = readFileSync(path, 'utf8');
		return { text, mtimeMs };
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code === 'ENOENT') return null;
		throw err;
	}
}

/**
 * Resolve the FORMAT template for a kind through the 3-tier cascade. Returns the
 * parsed DocumentFormat + the winning layer. Throws when no tier yields a
 * readable, parseable template (bundled always ships → a total miss is a
 * packaging fault).
 */
export function loadDocumentFormat(
	kind: FormatKind,
	opts: { readonly repoRoot?: string | undefined } = {},
): LoadedFormat {
	const key = cacheKey(kind, opts.repoRoot);
	const filename = `${kind}.md`;
	const candidates: { path: string; layer: FormatLayer }[] = [];
	if (opts.repoRoot !== undefined) candidates.push({ path: join(repoFormatDir(opts.repoRoot), filename), layer: 'repo' });
	candidates.push({ path: join(USER_FORMAT_DIR, filename), layer: 'user' });
	candidates.push({ path: join(BUNDLED_FORMAT_DIR, filename), layer: 'bundled' });

	for (const cand of candidates) {
		const read = tryRead(cand.path);
		if (read === null) continue;

		const cached = cache.get(key);
		if (cached && cached.path === cand.path && cached.mtimeMs === read.mtimeMs) {
			return { kind, layer: cached.layer, path: cached.path, format: cached.format };
		}

		let format: DocumentFormat;
		try {
			format = parseFormatTemplate(read.text, kind);
		} catch (err) {
			// A malformed override degrades to the next tier (visible warn), never a
			// silent no-render. Do NOT cache the rejected file.
			log.warn({ kind, path: cand.path, layer: cand.layer, err: (err as Error).message }, 'format template rejected — degrading to next tier');
			continue;
		}
		const entry: CacheEntry = { layer: cand.layer, path: cand.path, mtimeMs: read.mtimeMs, format };
		cache.set(key, entry);
		return { kind, layer: cand.layer, path: cand.path, format };
	}

	throw new Error(
		`artifact-formats: no FORMAT template resolved for kind '${kind}' (tried ${candidates.map(c => c.path).join(', ')})`,
	);
}

/**
 * The DocumentFormat a renderer should use for `kind`, honoring a per-repo/user
 * override. Falls back to the in-code `defaultFormat(kind)` with a one-shot warn
 * when even the bundled file cannot be resolved (a packaging fault must never
 * blank out a document — accuracy over a hard failure at render time).
 */
const warnedFallback = new Set<FormatKind>();

export function resolveDocumentFormat(kind: FormatKind, repoRoot?: string | undefined): DocumentFormat {
	try {
		return loadDocumentFormat(kind, { repoRoot }).format;
	} catch (err) {
		if (!warnedFallback.has(kind)) {
			warnedFallback.add(kind);
			log.warn({ kind, err: (err as Error).message }, 'no FORMAT template resolved — falling back to the in-code default');
		}
		return defaultFormat(kind);
	}
}

/** Clear the loader cache (tests + a future reset-template command path). */
export function clearFormatCache(): void {
	cache.clear();
	warnedFallback.clear();
}
