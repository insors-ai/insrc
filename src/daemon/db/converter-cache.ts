/**
 * Format-converter cache (Phase 3 of plans/data-driver-duckdb-files.md).
 *
 * Layout (`~/.insrc/cache/file-converted/<connection-id>/`):
 *
 *   .meta.json                 -- connection-level metadata
 *   files/
 *     data.bson.parquet        -- single-file connection
 *     data.bson.parquet.meta   -- sidecar (sourceMtime + sourceSize)
 *     events/2024-01.bson.parquet
 *     events/2024-01.bson.parquet.meta
 *     ...
 *
 * Per-source-file invalidation: the sidecar carries the source's
 * `(mtime, size)`. A query checks the sidecar against the source's
 * current stat; mismatch triggers a re-convert. Each file's cache is
 * independent -- changing one file in a 1000-file directory
 * re-converts that one file, the others stay cached.
 *
 * Cap + eviction: the cache root is bounded (5 GB default). After
 * each successful write the manager checks total size and evicts
 * oldest-mtime entries (with their sidecars) until the cap is met.
 *
 * Concurrent-access guard: a per-source-path in-memory mutex
 * (`Map<sourcePath, Promise>`) ensures two parallel queries against
 * the same source converge on a single conversion -- the second
 * awaits the first instead of starting its own. Cross-process races
 * are out of scope (the daemon is the sole writer).
 */

import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';

const log = getLogger('converter-cache');

// 5 GB default cap, total across all converted files in the cache root.
// Configurable via INSRC_CONVERTER_CACHE_MB env var (numeric, megabytes).
const DEFAULT_CACHE_CAP_BYTES = 5 * 1024 * 1024 * 1024;

interface SidecarMeta {
	readonly sourcePath: string;
	readonly sourceMtime: number;
	readonly sourceSize: number;
	readonly convertedAt: string;
	readonly converter: string;
}

const INFLIGHT = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Root of the converter cache (`~/.insrc/cache/file-converted/`). */
export function cacheRoot(): string {
	return join(PATHS.insrc, 'cache', 'file-converted');
}

/** Per-connection cache directory. */
export function cacheDirFor(connectionId: string): string {
	return join(cacheRoot(), connectionId, 'files');
}

/**
 * Map a source-file path under a connection's source root to its
 * cache destination. The cache mirrors the source tree under
 * `<connection>/files/`, with `.parquet` appended to preserve
 * uniqueness when the source has no extension or a clashing one.
 */
export function destForSource(
	connectionId: string,
	sourceRoot: string,
	sourcePath: string,
): string {
	const rel = relative(sourceRoot, sourcePath);
	return join(cacheDirFor(connectionId), `${rel}.parquet`);
}

/**
 * Cache freshness check. The dest is fresh when:
 *   1. dest + sidecar both exist
 *   2. sidecar's recorded sourceMtime + sourceSize match current
 *
 * mtime comparison is millisecond-granular; subsecond changes count
 * as an edit. Size comparison catches truncations / replacements
 * that share an mtime.
 */
export async function isCached(sourcePath: string, destPath: string): Promise<boolean> {
	if (!existsSync(destPath)) return false;
	try {
		const sidecar = await readSidecar(destPath);
		if (sidecar === null) return false;
		const cur = await stat(sourcePath);
		return sidecar.sourceMtime === cur.mtimeMs
			&& sidecar.sourceSize === cur.size;
	} catch {
		return false;
	}
}

/**
 * Run `convert(sourcePath, destPath)` if the cache says it's stale.
 * Concurrent callers for the same `sourcePath` share a single
 * conversion -- the second awaits the first's promise instead of
 * starting its own. Writes the sidecar on success + enforces the
 * cache cap.
 */
export async function ensureCached(
	connectionId: string,
	sourcePath: string,
	destPath: string,
	converterName: string,
	convert: (source: string, dest: string) => Promise<{ rowCount: number; durationMs: number }>,
): Promise<void> {
	if (await isCached(sourcePath, destPath)) return;

	const inflight = INFLIGHT.get(sourcePath);
	if (inflight !== undefined) {
		await inflight;
		return;
	}

	const work = (async (): Promise<void> => {
		await mkdir(dirname(destPath), { recursive: true });
		const tStart = Date.now();
		const result = await convert(sourcePath, destPath);
		const sourceStat = await stat(sourcePath);
		const meta: SidecarMeta = {
			sourcePath,
			sourceMtime: sourceStat.mtimeMs,
			sourceSize: sourceStat.size,
			convertedAt: new Date().toISOString(),
			converter: converterName,
		};
		await writeSidecar(destPath, meta);
		log.info(
			{ connectionId, sourcePath, destPath, rowCount: result.rowCount, durationMs: Date.now() - tStart },
			'converted file cached',
		);
		// Best-effort eviction; failures here don't block the caller.
		enforceCap().catch((err: unknown) => {
			log.warn({ err: errMsg(err) }, 'cache eviction failed (non-fatal)');
		});
	})();

	INFLIGHT.set(sourcePath, work);
	try { await work; }
	finally { INFLIGHT.delete(sourcePath); }
}

/**
 * Drop everything under a connection's cache directory. Called by
 * connection deletion / reconfiguration. Safe to call when the
 * directory doesn't exist.
 */
export async function clearConnectionCache(connectionId: string): Promise<void> {
	const dir = join(cacheRoot(), connectionId);
	try { await rm(dir, { recursive: true, force: true }); }
	catch (err) { log.warn({ connectionId, err: errMsg(err) }, 'clearConnectionCache failed'); }
}

/**
 * Test-only. Resets the in-memory inflight map. Production code
 * doesn't need this; the map is per-process and managed via the
 * lifecycle of `ensureCached`.
 */
export function _resetForTests(): void {
	INFLIGHT.clear();
}

// ---------------------------------------------------------------------------
// Sidecar I/O
// ---------------------------------------------------------------------------

function sidecarPathFor(destPath: string): string {
	return `${destPath}.meta`;
}

async function readSidecar(destPath: string): Promise<SidecarMeta | null> {
	try {
		const txt = await readFile(sidecarPathFor(destPath), 'utf8');
		const parsed = JSON.parse(txt);
		// Cheap shape check; missing fields = invalid sidecar.
		if (typeof parsed['sourceMtime'] === 'number'
			&& typeof parsed['sourceSize'] === 'number'
			&& typeof parsed['sourcePath'] === 'string') {
			return parsed as SidecarMeta;
		}
	} catch { /* fall through to null */ }
	return null;
}

async function writeSidecar(destPath: string, meta: SidecarMeta): Promise<void> {
	await writeFile(sidecarPathFor(destPath), JSON.stringify(meta, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Cap + eviction
// ---------------------------------------------------------------------------

interface CachedEntry {
	readonly path: string;
	readonly sidecarPath: string;
	readonly size: number;
	readonly mtimeMs: number;
}

async function enforceCap(): Promise<void> {
	const cap = readCapBytes();
	const root = cacheRoot();
	if (!existsSync(root)) return;

	const entries: CachedEntry[] = [];
	let total = 0;
	await walkParquet(root, (path, statRes) => {
		const sidecarPath = sidecarPathFor(path);
		entries.push({ path, sidecarPath, size: statRes.size, mtimeMs: statRes.mtimeMs });
		total += statRes.size;
	});
	if (total <= cap) return;

	// Oldest first. Sidecars don't move the meter -- we evict the
	// .parquet whose mtime tells us when it was last regenerated;
	// the sidecar follows.
	entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
	let evicted = 0;
	for (const e of entries) {
		if (total <= cap) break;
		try {
			await rm(e.path, { force: true });
			await rm(e.sidecarPath, { force: true });
			total -= e.size;
			evicted++;
		} catch (err) {
			log.warn({ path: e.path, err: errMsg(err) }, 'evict failed');
		}
	}
	if (evicted > 0) {
		log.info({ evicted, totalAfter: total, cap }, 'cache eviction complete');
	}
}

async function walkParquet(
	dir: string,
	visit: (path: string, stat: { size: number; mtimeMs: number }) => void,
): Promise<void> {
	let entries;
	try { entries = await readdir(dir, { withFileTypes: true }); }
	catch { return; }
	for (const e of entries) {
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			await walkParquet(full, visit);
		} else if (e.isFile() && full.endsWith('.parquet')) {
			try {
				const s = statSync(full);
				visit(full, { size: s.size, mtimeMs: s.mtimeMs });
			} catch { /* skip */ }
		}
	}
}

function readCapBytes(): number {
	const raw = process.env['INSRC_CONVERTER_CACHE_MB'];
	if (raw === undefined || raw.length === 0) return DEFAULT_CACHE_CAP_BYTES;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_CAP_BYTES;
	return parsed * 1024 * 1024;
}

function errMsg(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

// Test-only: silence unused-import warning when the file's only
// side-effect-using import is `sep`. The sep import lets future
// directory-mirroring helpers join paths in a portable way; we keep
// the import to avoid churn when those helpers land.
void sep;
