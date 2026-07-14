/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * module.profile exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 1. Given a
 * directory path (or single file), produce a compact profile:
 *   - subdirs (immediate children only)
 *   - files in dir with language + size + kind
 *   - exports (from __init__.py __all__ / index.ts / etc.)
 *   - entrypoints (main handlers, service registrations, index
 *     files)
 *   - entityCount (functions + classes + methods under this path,
 *     non-artefact)
 *   - totalBytes (sum of code files under this path)
 *
 * Deterministic. Uses the entity graph for symbol enumeration + the
 * filesystem for subdir listing. Runs in <50ms for typical modules.
 */

import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, sep } from 'node:path';

import { getDb } from '../../db/client.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity } from '../../shared/types.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	ModuleProfile,
	ModuleProfileOutput,
} from './types.js';

const log = getLogger('analyze:explore:module-profile');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IGNORE_DIRS = new Set([
	'node_modules', '.git', '__pycache__', '.venv', 'venv',
	'.tox', 'dist', 'build', '.next', '.cache', 'target',
	'.mypy_cache', '.pytest_cache', '.ruff_cache',
	'.DS_Store', 'coverage', '.idea', '.vscode',
]);

/**
 * Filenames that typically hold module-level exports / entry points.
 * Presence in a directory marks it as a real module.
 */
const INDEX_FILENAMES = new Set([
	'__init__.py',
	'index.ts', 'index.tsx', 'index.js', 'index.mjs', 'index.cjs',
	'mod.rs', 'lib.rs',
	'main.py', 'main.go', 'main.ts', 'main.js',
	'__main__.py',
]);

/**
 * Signature substrings that identify a file as an entry point --
 * HTTP handler, CLI main, service registration, etc. Matched
 * against the file body's first 4 KB.
 */
const ENTRYPOINT_MARKERS: readonly RegExp[] = [
	/if\s+__name__\s*==\s*['"]__main__['"]/,
	/@app\.(get|post|put|delete|patch|route)\b/,   // FastAPI / Flask
	/@router\.(get|post|put|delete|patch)\b/,      // FastAPI router
	/FastAPI\s*\(/,
	/Flask\s*\(/,
	/express\(\)/,
	/http\.createServer/,
	/func\s+main\s*\(/,                            // Go main
	/public\s+static\s+void\s+main\b/,             // Java main
	/^\s*fn\s+main\s*\(/m,                         // Rust main
	/@main\b/,
	/#\[tokio::main\]/,
];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface ModuleProfileParams {
	readonly path: string;
}

function parseParams(exp: Exploration): ModuleProfileParams {
	const p = exp.params as Record<string, unknown>;
	const path = typeof p['path'] === 'string' ? (p['path'] as string) : '';
	if (path.length === 0) {
		throw new Error(`module.profile: params.path is required`);
	}
	return { path };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runModuleProfile(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<ModuleProfileOutput> {
	const { path } = parseParams(exp);

	// Distinguish dir vs file up front. If the caller passed a file
	// path, produce a file-shaped profile; otherwise walk it as a
	// directory.
	let stat;
	try { stat = statSync(path); }
	catch (err) {
		throw new Error(`module.profile: cannot stat '${path}': ${(err as Error).message}`);
	}

	const db = await getDb();
	const entities = await listEntitiesForRepo(db, ctx.repoPath);

	if (stat.isFile()) {
		const profile = await profileFile(path, entities);
		log.info(
			{ runId: ctx.runId, path, kind: 'file', entityCount: profile.entityCount },
			'module.profile: file profiled',
		);
		return { type: 'module.profile', profile };
	}

	const profile = await profileDir(path, entities, ctx.ignoreFilter);
	log.info(
		{
			runId:       ctx.runId,
			path,
			kind:        'dir',
			subdirs:     profile.subdirs.length,
			files:       profile.filesInDir.length,
			exports:     profile.exports.length,
			entrypoints: profile.entrypoints.length,
			entityCount: profile.entityCount,
		},
		'module.profile: dir profiled',
	);
	return { type: 'module.profile', profile };
}

// ---------------------------------------------------------------------------
// Dir profile
// ---------------------------------------------------------------------------

async function profileDir(
	dir:      string,
	entities: readonly Entity[],
	ignoreFilter: import('../context/repo-ignore-filter.js').RepoIgnoreFilter,
): Promise<ModuleProfile> {
	// Immediate children (subdirs + files) via filesystem.
	const subdirs: string[] = [];
	const filesInDir: Array<{
		file: string;
		language: string;
		bytes: number;
		kind: string;
	}> = [];
	let entries: string[];
	try { entries = readdirSync(dir); }
	catch { entries = []; }
	for (const name of entries) {
		if (IGNORE_DIRS.has(name)) continue;
		if (name.startsWith('.') && name !== '.env.example') continue;
		const full = join(dir, name);
		// .gitignore-aware filter. See analyze/context/repo-ignore-
		// filter.ts -- drops anything not tracked by git (out/, build/,
		// dist/, target/, .next/, node_modules/, ...). Permissive for
		// non-git repos, so the IGNORE_DIRS set above still guards.
		if (!ignoreFilter.isIncluded(full)) continue;
		let s;
		try { s = statSync(full); }
		catch { continue; }
		if (s.isDirectory()) {
			subdirs.push(full);
		} else if (s.isFile()) {
			const entity = findFileEntity(entities, full);
			filesInDir.push({
				file:     full,
				language: entity?.language ?? '',
				bytes:    s.size,
				kind:     entity?.kind ?? 'file',
			});
		}
	}
	subdirs.sort();
	filesInDir.sort((a, b) => a.file.localeCompare(b.file));

	// Exports: read entities in index files (__init__.py, index.ts,
	// etc.) directly under `dir` -- functions + classes + variables
	// that are `isExported`.
	const exports: string[] = [];
	for (const f of filesInDir) {
		if (!INDEX_FILENAMES.has(basename(f.file))) continue;
		for (const e of entities) {
			if (e.file !== f.file) continue;
			if (e.kind === 'file' || e.kind === 'module') continue;
			if (e.isExported === true) {
				exports.push(e.name);
			}
		}
	}
	exports.sort();

	// Entrypoints: files matching an INDEX_FILENAMES basename OR
	// whose body triggers an ENTRYPOINT_MARKER regex. Body match
	// requires reading the file entity's body (already indexed).
	const entrypoints: string[] = [];
	for (const f of filesInDir) {
		if (INDEX_FILENAMES.has(basename(f.file))) {
			entrypoints.push(f.file);
			continue;
		}
		const bodyMatchEntity = entities.find(e => e.file === f.file && e.kind === 'file');
		const body = (bodyMatchEntity?.body ?? '').slice(0, 4096);
		if (body.length === 0) continue;
		for (const rx of ENTRYPOINT_MARKERS) {
			if (rx.test(body)) {
				entrypoints.push(f.file);
				break;
			}
		}
	}

	// entityCount + totalBytes across the WHOLE subtree, not just
	// direct children. Non-artefact structural entities.
	const dirWithSep = dir.endsWith(sep) ? dir : dir + sep;
	let entityCount = 0;
	let totalBytes  = 0;
	for (const e of entities) {
		if (e.artifact === true) continue;
		if (e.kind === 'file') {
			if (e.file === dir || e.file.startsWith(dirWithSep)) {
				try {
					totalBytes += statSync(e.file).size;
				} catch { /* file gone */ }
			}
			continue;
		}
		if (e.file === dir || e.file.startsWith(dirWithSep)) {
			entityCount += 1;
		}
	}

	return {
		path:        dir,
		kind:        'dir',
		subdirs,
		filesInDir,
		exports,
		entrypoints,
		entityCount,
		totalBytes,
	};
}

// ---------------------------------------------------------------------------
// File profile
// ---------------------------------------------------------------------------

async function profileFile(file: string, entities: readonly Entity[]): Promise<ModuleProfile> {
	const size = (() => {
		try { return statSync(file).size; }
		catch { return 0; }
	})();
	const fileEntity = entities.find(e => e.kind === 'file' && e.file === file);
	const exports: string[] = [];
	let entityCount = 0;
	for (const e of entities) {
		if (e.file !== file) continue;
		if (e.artifact === true) continue;
		if (e.kind === 'file' || e.kind === 'module') continue;
		entityCount += 1;
		if (e.isExported === true) exports.push(e.name);
	}
	exports.sort();
	const body = (fileEntity?.body ?? '').slice(0, 4096);
	const entrypoints: string[] = [];
	if (INDEX_FILENAMES.has(basename(file))) entrypoints.push(file);
	else {
		for (const rx of ENTRYPOINT_MARKERS) {
			if (rx.test(body)) { entrypoints.push(file); break; }
		}
	}
	return {
		path:        file,
		kind:        'file',
		subdirs:     [],
		filesInDir:  [{
			file,
			language: fileEntity?.language ?? extname(file).slice(1),
			bytes:    size,
			kind:     fileEntity?.kind ?? 'file',
		}],
		exports,
		entrypoints,
		entityCount,
		totalBytes:  size,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFileEntity(entities: readonly Entity[], file: string): Entity | undefined {
	for (const e of entities) {
		if (e.kind === 'file' && e.file === file) return e;
	}
	return undefined;
}
