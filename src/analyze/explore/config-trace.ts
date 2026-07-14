/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * config.trace exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 4. Given a config
 * key (string literal), enumerate its occurrences across the repo
 * with a per-hit role: `definition` (declared in a config file),
 * `usage` (read via getter/env access), `default` (fallback value
 * passed to a getter), or `unknown`.
 *
 * Backing: the shared `runGrepSearch` helper (same code path as the
 * search_grep tool + the search.text exploration). Roles are
 * classified by file extension + line shape, deterministic. No LLM.
 *
 * Complementary to `search.text` -- both grep, but config.trace
 * knows the caller wants config-key semantics + surfaces roles so
 * the synthesizer can render a config table instead of a flat hit
 * list.
 */

import { runGrepSearch } from '../../daemon/tools/builtins/search/grep.js';
import { getLogger } from '../../shared/logger.js';

import type {
	ConfigTraceHit,
	ConfigTraceOutput,
	ConfigTraceRole,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:config-trace');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 40;
const MAX_TOP_K     = 200;

/** File extensions that read as declarative config -- hits here get
 *  role='definition' unless the line shape says otherwise. */
const CONFIG_EXTS = new Set([
	'.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
	'.properties', '.env', '.tfvars',
]);

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface ConfigTraceParams {
	readonly key:  string;
	readonly path?: string;
	readonly topK?: number;
}

function parseParams(exp: Exploration): ConfigTraceParams {
	const p = exp.params as Record<string, unknown>;
	const key = typeof p['key'] === 'string' ? (p['key'] as string).trim() : '';
	if (key.length === 0) {
		throw new Error('config.trace: params.key is required (non-empty string)');
	}
	const topK = typeof p['topK'] === 'number' && p['topK']! > 0
		? Math.min(MAX_TOP_K, Math.floor(p['topK'] as number))
		: DEFAULT_TOP_K;
	const path = typeof p['path'] === 'string' && (p['path'] as string).length > 0
		? (p['path'] as string)
		: undefined;
	return {
		key,
		topK,
		...(path !== undefined ? { path } : {}),
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runConfigTrace(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<ConfigTraceOutput> {
	const params = parseParams(exp);
	const root = params.path !== undefined
		? scopedPath(params.path, ctx.repoPath)
		: ctx.repoPath;

	// Build a pattern that catches the literal + common quoting.
	// Escape regex-special chars so `foo.bar[0]`-style keys survive.
	const literal = escapeRegex(params.key);

	let data;
	try {
		data = await runGrepSearch({
			pattern: literal,
			root,
			caseInsensitive: false,
			limit:           params.topK ?? DEFAULT_TOP_K,
		});
	} catch (err) {
		log.warn(
			{ runId: ctx.runId, key: params.key, err: (err as Error).message },
			'config.trace: grep failed; returning empty output',
		);
		return {
			type:      'config.trace',
			key:       params.key,
			hits:      [],
			truncated: false,
			backend:   'node',
			root,
		};
	}

	const hits: ConfigTraceHit[] = data.hits.map(h => {
		const abs = h.path.startsWith('/') ? h.path : `${root}/${h.path}`;
		return {
			file: abs,
			line: h.line,
			text: h.text,
			role: classifyRole(abs, h.text, params.key),
		};
	});

	log.info(
		{
			runId:     ctx.runId,
			key:       params.key,
			backend:   data.usedRipgrep ? 'ripgrep' : 'node',
			hits:      hits.length,
			truncated: data.truncated,
		},
		'config.trace: complete',
	);

	return {
		type:      'config.trace',
		key:       params.key,
		hits,
		truncated: data.truncated,
		backend:   data.usedRipgrep ? 'ripgrep' : 'node',
		root:      data.root,
	};
}

// ---------------------------------------------------------------------------
// Role classification
// ---------------------------------------------------------------------------

/**
 * Classify a hit by (file extension, line shape).
 *
 * `definition` -- declarative config file (JSON/YAML/etc.) OR a
 * source line that assigns the key: `KEY = "..."` or `"key": ...`.
 *
 * `default`    -- source line that reads the key with a fallback:
 *                 `os.getenv("KEY", "fallback")`, `config.get("KEY", ...)`,
 *                 `settings.KEY ?? default`.
 *
 * `usage`      -- source line that reads the key without a fallback:
 *                 `os.getenv("KEY")`, `config["KEY"]`, `process.env.KEY`.
 *
 * `unknown`    -- comment, docstring, README mention, or a line whose
 *                 shape doesn't clearly fit.
 */
export function classifyRole(file: string, text: string, key: string): ConfigTraceRole {
	const ext = extname(file).toLowerCase();
	const isConfig = CONFIG_EXTS.has(ext);
	const t = text.trim();

	// Bare mention in a code-file comment reads as documentation, not
	// a live use. Comment-line detection is language-lite: `#`, `//`,
	// `/*`, `--`, `>` (markdown quote).
	if (!isConfig && (t.startsWith('#') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('--'))) {
		return 'unknown';
	}

	// Default-value read: `getenv(KEY, X)`, `get(KEY, X)`, `??`, `||`
	// after the key.
	const defaultRx = new RegExp(
		`(?:getenv|get|getOr|env|settings|config)\\s*[\\(\\[]\\s*['"\`]?${escapeRegex(key)}['"\`]?\\s*[,)]`,
		'i',
	);
	if (defaultRx.test(t) && /,\s*[^)]+/.test(t.slice(t.indexOf(key) + key.length))) {
		return 'default';
	}

	// Config-file line: assignment or key-value shape.
	if (isConfig) return 'definition';

	// Source-file assignment: `KEY = ...`, `"key": ...`, `KEY ?= ...`.
	const assignRx = new RegExp(
		`^\\s*(export\\s+)?(const|let|var|final|public|private)?\\s*['"\`]?${escapeRegex(key)}['"\`]?\\s*[:=]`,
		'i',
	);
	if (assignRx.test(t)) return 'definition';

	// Read access -- treat as usage.
	if (t.includes(key)) return 'usage';
	return 'unknown';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extname(p: string): string {
	const idx = p.lastIndexOf('.');
	if (idx < 0) return '';
	const slashIdx = p.lastIndexOf('/');
	if (idx < slashIdx) return '';
	return p.slice(idx);
}

function scopedPath(candidate: string, repoRoot: string): string {
	const normRoot = repoRoot.replace(/\/+$/, '');
	if (!candidate.startsWith('/')) {
		return `${normRoot}/${candidate.replace(/^\/+/, '')}`;
	}
	const norm = candidate.replace(/\/+$/, '');
	if (norm === normRoot || norm.startsWith(`${normRoot}/`)) return norm;
	throw new Error(`config.trace: params.path='${candidate}' is not inside repoPath='${repoRoot}'`);
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const _classifyRoleForTest = classifyRole;
