/**
 * Offline-bundle helpers.
 *
 * When a user has cached the Mermaid bundle at
 * `~/.insrc/cache/artifacts/mermaid-<version>.min.js`, the template
 * binder inlines the whole bundle into the standalone-mode HTML
 * instead of referencing the CDN. Produces a snippet that renders
 * with no network, at the cost of ~3.3 MB of size per standalone
 * snippet -- a trade-off users opt into by running the download
 * command.
 *
 * Detection is purely by cache-file presence; no config flag. This
 * keeps the UX simple: download when you want offline, delete the
 * cache when you want CDN again.
 */

import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PATHS } from '../../shared/paths.js';
import type { MermaidCdnMeta } from '../../shared/artifacts.js';

export const OFFLINE_CACHE_DIR = join(PATHS.insrc, 'cache', 'artifacts');

export function offlineBundlePath(version: string): string {
	return join(OFFLINE_CACHE_DIR, `mermaid-${version}.min.js`);
}

/**
 * Load the cached bundle and verify its SRI matches the pinned
 * hash. Returns the bundle text when valid, null when the cache
 * is missing or the hash doesn't match.
 *
 * A stale / tampered cache is treated the same as a missing cache:
 * fall back to the CDN. The caller may want to surface a one-time
 * warning the first time this happens.
 */
export async function readVerifiedOfflineBundle(
	cdn: MermaidCdnMeta,
): Promise<string | null> {
	const path = offlineBundlePath(cdn.version);
	try {
		await stat(path);
	} catch {
		return null;
	}
	const text = await readFile(path, 'utf8');
	if (!sriMatches(text, cdn.integrity)) {
		return null;
	}
	return text;
}

/**
 * Compare the content's SHA-384 hash against the SRI string
 * `sha384-<base64>`. Tolerates other algorithms in the header
 * (returns false when unrecognised), kept narrow so the check
 * can't drift away from the published metadata.
 */
export function sriMatches(content: string, integrity: string): boolean {
	const match = /^sha384-(.+)$/.exec(integrity);
	if (match === null) { return false; }
	const expectedBase64 = match[1] ?? '';
	const actual = createHash('sha384').update(content).digest('base64');
	return actual === expectedBase64;
}
