/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Config write-path resolution — the single, safe way to set a value inside the
 * `~/.insrc/config.json` object tree (used by the `config.write` daemon IPC).
 *
 * WHY THIS EXISTS: config keys are not all dot-free. Two dynamic-key namespaces
 * use keys that CONTAIN dots (and, for byRepo, slashes):
 *   - `models.tasks.<roleId>`   — role ids like "context.assemble"
 *   - `models.byRepo.<repoPath>.*`   — absolute repo paths
 * Splitting a caller-supplied path on every '.' mis-nests such a leaf
 * (roleTiers.context.assemble) so the reader — which expects the flat key
 * roleTiers["context.assemble"] — never sees it, and the write silently
 * appears to do nothing.
 *
 * The fix is a segment-aware API: callers that know a key contains dots pass an
 * ARRAY of literal segments (no splitting). A plain string keeps the legacy
 * dot-split for the common dot-free case, so every existing caller is
 * unaffected.
 */

/** Thrown when a config write path is empty or has an empty segment. */
export class ConfigPathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigPathError';
	}
}

/**
 * Normalise a config path into literal key segments.
 *   - `string[]`  → used verbatim (each element is ONE key, dots and all).
 *   - `string`    → split on '.' (legacy dot-path — safe only for dot-free keys).
 * Rejects an empty path or any empty segment (would target the whole object or
 * an unnameable key).
 */
export function toConfigSegments(path: string | readonly string[]): string[] {
	const keys = Array.isArray(path) ? [...path] : String(path).split('.');
	if (keys.length === 0) {
		throw new ConfigPathError('config path has no segments');
	}
	for (const k of keys) {
		if (typeof k !== 'string' || k.length === 0) {
			throw new ConfigPathError(`config path has an empty segment: ${JSON.stringify(path)}`);
		}
	}
	return keys;
}

/**
 * Set `value` at `path` inside `root`, creating intermediate objects as needed.
 * An intermediate slot that is not a plain object (scalar, null, or ARRAY) is
 * replaced with a fresh object so the descent never indexes into a non-record.
 * Mutates `root` in place. Throws `ConfigPathError` on an invalid path.
 */
export function setConfigAtPath(
	root: Record<string, unknown>,
	path: string | readonly string[],
	value: unknown,
): void {
	const keys = toConfigSegments(path);
	let obj: Record<string, unknown> = root;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i]!;
		const child = obj[key];
		if (typeof child !== 'object' || child === null || Array.isArray(child)) {
			obj[key] = {};
		}
		obj = obj[key] as Record<string, unknown>;
	}
	obj[keys[keys.length - 1]!] = value;
}
