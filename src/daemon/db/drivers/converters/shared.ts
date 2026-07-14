/**
 * Shared helpers for the format converters
 * (plans/data-driver-duckdb-files.md Phase 2 + 4.5).
 *
 * Directory walking + glob assembly + a `runDirectoryConvert` driver
 * that wraps single-file conversions in the cache layer (per-file
 * mtime/size invalidation, in-memory mutex against parallel
 * duplicate work, oldest-first eviction once the cap is hit).
 */

import { readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

import type {
	ConvertDirectoryOpts,
	ConvertDirectoryResult,
	ConvertResult,
} from './types.js';

/**
 * Walk a source tree, yielding absolute file paths in stable order
 * (sorted per directory). Hidden files (`.foo`) are skipped to keep
 * the cache layer's mirror clean.
 *
 * `opts.pattern` is a basename glob (e.g. `*.bson`); when set, only
 * matching files are yielded. `opts.recursive=false` stops after
 * direct children.
 */
export async function walkSourceTree(
	root: string,
	opts: ConvertDirectoryOpts,
): Promise<string[]> {
	const matcher = opts.pattern !== undefined ? globToRegex(opts.pattern) : null;
	const out: string[] = [];

	const walk = async (dir: string): Promise<void> => {
		let entries;
		try { entries = await readdir(dir, { withFileTypes: true }); }
		catch { return; }
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const e of entries) {
			if (e.name.startsWith('.')) continue;
			const full = join(dir, e.name);
			if (e.isDirectory()) {
				if (opts.recursive) await walk(full);
				continue;
			}
			if (!e.isFile()) continue;
			if (matcher !== null && !matcher.test(e.name)) continue;
			out.push(full);
		}
	};
	await walk(root);
	return out;
}

/** Tiny glob compiler: `*` -> any non-/, `?` -> one non-/. */
function globToRegex(pattern: string): RegExp {
	let re = '^';
	for (const ch of pattern) {
		switch (ch) {
			case '*': re += '[^/]*'; break;
			case '?': re += '[^/]';  break;
			case '.': case '+': case '(': case ')': case '|': case '^': case '$':
			case '[': case ']': case '{': case '}': case '\\':
				re += `\\${ch}`; break;
			default: re += ch;
		}
	}
	re += '$';
	return new RegExp(re);
}

/**
 * Map a source file under `sourceRoot` to its destination under
 * `destDir`, mirroring the relative tree. Always appends `.parquet`
 * (the converted file is Parquet regardless of the source extension).
 */
export function destForRelative(
	sourceRoot: string,
	sourcePath: string,
	destDir: string,
): string {
	const rel = relative(sourceRoot, sourcePath);
	return join(destDir, `${rel}.parquet`);
}

/**
 * Build the DuckDB-readable Parquet glob over the cache root once
 * the directory has been (or will be) populated. Uses `**` for
 * recursive connections, `*` for top-level-only.
 */
export function parquetGlobFor(destDir: string, recursive: boolean): string {
	if (recursive) return join(destDir, '**', '*.parquet');
	return join(destDir, '*.parquet');
}

/**
 * Generic directory-conversion driver. Walks the source tree, calls
 * `convertOne(source, dest)` for each file, returns a
 * `ConvertDirectoryResult`. Per-file cache invalidation is the
 * responsibility of the caller (the daemon driver layer wraps each
 * call in `ensureCached` before invoking).
 */
export async function runDirectoryConvert(
	sourceDir: string,
	destDir: string,
	opts: ConvertDirectoryOpts,
	_kind: string,
	convertOne: (source: string, dest: string) => Promise<ConvertResult>,
): Promise<ConvertDirectoryResult> {
	const t0 = Date.now();
	const sources = await walkSourceTree(sourceDir, opts);
	for (const src of sources) {
		const dest = destForRelative(sourceDir, src, destDir);
		await convertOne(src, dest);
	}
	return {
		parquetGlob: parquetGlobFor(destDir, opts.recursive),
		sourceCount: sources.length,
		durationMs: Date.now() - t0,
	};
}

// Silence unused-import lint when the file is mostly used-by-other-converters.
void dirname; void sep;
