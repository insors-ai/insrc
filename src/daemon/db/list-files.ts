/**
 * Directory-connection file enumeration (Phase 6.2 of
 * plans/data-driver-duckdb-files.md).
 *
 * Walks the file tree under a connection's `path`, respecting the
 * `recursive` flag, and returns a bounded list of `{ path, size,
 * mtime }` entries with paths relative to the connection root.
 *
 * Hidden files (`.foo`) are skipped to keep results clean. Optional
 * basename-glob pattern lets callers narrow to a specific extension
 * without writing a per-tool filter.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export interface ListedFile {
	/** Repo-root-relative path from the caller's perspective ARE NOT
	 *  re-resolved here -- this helper returns paths relative to the
	 *  connection's `path`, since that's what Family-1 skills consume. */
	readonly path: string;
	readonly size: number;
	/** ISO timestamp. */
	readonly mtime: string;
}

export interface ListFilesResult {
	readonly root: string;
	readonly files: readonly ListedFile[];
	readonly truncated: boolean;
}

export interface ListFilesOpts {
	readonly recursive?: boolean;
	/** Basename glob: `*.csv`, `*.parquet`. */
	readonly pattern?: string;
	readonly limit: number;
}

/**
 * Enumerate files under `connectionPath` (which may itself be a
 * single file). Returns a bounded list ordered by relative path.
 */
export async function listFilesForConnection(
	connectionPath: string,
	opts: ListFilesOpts,
): Promise<ListFilesResult> {
	const rootStat = await stat(connectionPath);
	if (rootStat.isFile()) {
		return {
			root: connectionPath,
			files: [{
				path: '',
				size: rootStat.size,
				mtime: new Date(rootStat.mtimeMs).toISOString(),
			}],
			truncated: false,
		};
	}

	const matcher = opts.pattern !== undefined ? globToRegex(opts.pattern) : null;
	const out: ListedFile[] = [];
	let truncated = false;

	const walk = async (dir: string): Promise<void> => {
		if (out.length >= opts.limit) { truncated = true; return; }
		const entries = await readdir(dir, { withFileTypes: true });
		// Sorted walk for stable output.
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const e of entries) {
			if (out.length >= opts.limit) { truncated = true; return; }
			if (e.name.startsWith('.')) continue;          // skip hidden
			const full = join(dir, e.name);
			if (e.isDirectory()) {
				if (opts.recursive === true) await walk(full);
				continue;
			}
			if (!e.isFile()) continue;
			if (matcher !== null && !matcher.test(e.name)) continue;
			const s = await stat(full);
			out.push({
				path: relative(connectionPath, full).split(sep).join('/'),
				size: s.size,
				mtime: new Date(s.mtimeMs).toISOString(),
			});
		}
	};

	await walk(connectionPath);
	return { root: connectionPath, files: out, truncated };
}

/** Tiny glob compiler: `*` matches any character except `/`; `?`
 *  matches one. No braces, no brackets -- enough for the basename
 *  filtering this helper supports. */
function globToRegex(pattern: string): RegExp {
	let re = '^';
	for (const ch of pattern) {
		switch (ch) {
			case '*': re += '[^/]*'; break;
			case '?': re += '[^/]';  break;
			// Escape regex metas
			case '.': case '+': case '(': case ')': case '|': case '^': case '$':
			case '[': case ']': case '{': case '}': case '\\':
				re += `\\${ch}`; break;
			default: re += ch;
		}
	}
	re += '$';
	return new RegExp(re);
}
