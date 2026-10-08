/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * module.profile exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 1. Given a
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
import { buildCompleteness } from '../completeness.js';
import type { PartlyReadItem, SkippedItem } from '../completeness.js';
import { createItemMeasurer } from './item-measure.js';
import type { ItemMeasurer } from './item-measure.js';

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
/** How much of a file's stored body is scanned for an entry-point marker. */
const ENTRYPOINT_SCAN_CHARS = 4096;

/**
 * What the entry-point list rests on. The index stores no content for a
 * source file's own entity, so for those files only the name is checked; the
 * markers are looked for where a stored body exists.
 */
const ENTRYPOINT_RULE =
	'Entry points are recognised by file name, and by a marker in the first 4,096 characters of a file whose content the index stores; ' +
	'the index stores no content for a source file itself, so such a file is recognised by name only.';

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

	// Entry points are looked for in the first 4,096 characters of a file's
	// stored body. A longer file in which none was found was read in part.
	const measurer = createItemMeasurer(db, entities);
	const partlyRead: PartlyReadItem[] = [];

	if (stat.isFile()) {
		const profile = await profileFile(path, entities, measurer, partlyRead);
		log.info(
			{ runId: ctx.runId, path, kind: 'file', entityCount: profile.entityCount },
			'module.profile: file profiled',
		);
		return {
			type: 'module.profile',
			completeness: buildCompleteness({ returned: 1, partlyRead, basis: 'filesystem', basisNote: ENTRYPOINT_RULE }),
			profile,
		};
	}

	const skipped: SkippedItem[] = [];
	const profile = await profileDir(path, entities, ctx.ignoreFilter, measurer, partlyRead, skipped);
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
	return {
		type: 'module.profile',
		// Every immediate child of the directory is listed; nothing is cut by count.
		completeness: buildCompleteness({
			returned: profile.subdirs.length + profile.filesInDir.length,
			partlyRead,
			skipped,
			basis:    'filesystem',
			basisNote: ENTRYPOINT_RULE,
		}),
		profile,
	};
}

// ---------------------------------------------------------------------------
// Dir profile
// ---------------------------------------------------------------------------

async function profileDir(
	dir:      string,
	entities: readonly Entity[],
	ignoreFilter: import('../context/repo-ignore-filter.js').RepoIgnoreFilter,
	measurer:   ItemMeasurer,
	partlyRead: PartlyReadItem[],
	skipped:    SkippedItem[],
): Promise<ModuleProfile> {
	// Immediate children (subdirs + files) via filesystem.
	const subdirs: string[] = [];
	const filesInDir: Array<{
		file: string;
		language: string;
		bytes: number;
		kind: string;
	}> = [];
	// The directory was stat'd a moment ago. If it cannot be listed the lookup
	// could not run: this throws, and the executor reports it as failed.
	const entries: string[] = readdirSync(dir);
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
		catch (err) {
			// Expected: a broken link, or an entry removed while the listing runs.
			skipped.push({ what: full, reason: `the entry could not be read (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})` });
			continue;
		}
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
		const body = (bodyMatchEntity?.body ?? '').slice(0, ENTRYPOINT_SCAN_CHARS);
		if (body.length === 0) continue;
		let found = false;
		for (const rx of ENTRYPOINT_MARKERS) {
			if (rx.test(body)) {
				entrypoints.push(f.file);
				found = true;
				break;
			}
		}
		// A marker past the scanned part would have been missed.
		if (!found && bodyMatchEntity !== undefined) {
			const cut = await measurer.partlyRead(f.file, bodyMatchEntity, body.length);
			if (cut !== undefined) partlyRead.push(cut);
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
				} catch {
					// Expected: the index still holds a file that is no longer on disk.
					skipped.push({ what: e.file, reason: 'the file is in the index and no longer on disk; totalBytes does not count it' });
				}
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

async function profileFile(
	file:       string,
	entities:   readonly Entity[],
	measurer:   ItemMeasurer,
	partlyRead: PartlyReadItem[],
): Promise<ModuleProfile> {
	// The file was stat'd a moment ago; if it is gone now the lookup could not run.
	const size = statSync(file).size;
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
	const body = (fileEntity?.body ?? '').slice(0, ENTRYPOINT_SCAN_CHARS);
	const entrypoints: string[] = [];
	if (INDEX_FILENAMES.has(basename(file))) entrypoints.push(file);
	else {
		for (const rx of ENTRYPOINT_MARKERS) {
			if (rx.test(body)) { entrypoints.push(file); break; }
		}
		// A marker past the scanned part would have been missed.
		if (entrypoints.length === 0 && fileEntity !== undefined && body.length > 0) {
			const cut = await measurer.partlyRead(file, fileEntity, body.length);
			if (cut !== undefined) partlyRead.push(cut);
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
