/**
 * Config file handling for data-driver connections.
 *
 * File layout: `~/.insrc/repos/<repoId>/db-connections.json`. The
 * repoId is a SHA256 of the repo path -- matches the `makeEntityId`
 * convention the indexer already uses for its `repo` entities.
 *
 * Concerns in this module:
 *   - deterministic path resolution from repoPath -> config file
 *   - JSON read / write with validation (unknown `kind` rejects,
 *     `id` uniqueness within a file, url-or-path presence)
 *   - `family` inference from the registered driver when the user
 *     didn't pin it in the file
 *
 * What this module does NOT do:
 *   - resolve `${secret:...}` tokens (that's `secrets.ts` + `pool.ts`)
 *   - build drivers (that's `pool.ts`)
 *   - expose RPCs (phase 2 -- setup UX)
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';
import type {
	ConnectionConfig,
	ConnectionsFile,
	DriverFamily,
} from '../../shared/db-driver.js';
import { familyOf, kindExists } from './registry.js';

const log = getLogger('db-config');

const CONFIG_FILENAME = 'db-connections.json';

/**
 * Stable per-repo id derived from the repo's absolute path. Matches
 * the indexer's `makeEntityId(repoPath, '', 'repo', repoPath)` so the
 * same repo produces the same folder across restarts.
 */
export function repoIdOf(repoPath: string): string {
	return createHash('sha256')
		.update(`${repoPath}\x00\x00repo\x00${repoPath}`)
		.digest('hex')
		.slice(0, 32);
}

export function connectionsPath(repoPath: string): string {
	return join(PATHS.insrc, 'repos', repoIdOf(repoPath), CONFIG_FILENAME);
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export interface LoadedConnections {
	readonly file: ConnectionsFile;
	/** Same entries as `file.connections`, with `family` inferred from
	 *  the registry when the user didn't pin it. */
	readonly resolved: readonly ConnectionConfig[];
	readonly warnings: readonly string[];
}

/**
 * Read + validate the connections file for a repo. Missing file is
 * not an error -- returns an empty list + no warnings.
 *
 * Hard errors (invalid JSON, unknown kind, duplicate id, missing
 * url/path) throw; the daemon surfaces them on the IPC event stream
 * so the pane can render.
 */
export async function loadConnections(
	repoPath: string,
): Promise<LoadedConnections> {
	const path = connectionsPath(repoPath);
	let text: string;
	try {
		text = await readFile(path, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return { file: { connections: [] }, resolved: [], warnings: [] };
		}
		throw err;
	}

	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch (err) {
		throw new Error(`db-connections.json: invalid JSON (${(err as Error).message})`);
	}
	if (!isConnectionsFile(doc)) {
		throw new Error('db-connections.json: expected { connections: [...] }');
	}

	const warnings: string[] = [];
	const seenIds = new Set<string>();
	const resolved: ConnectionConfig[] = [];

	for (const conn of doc.connections) {
		validateShape(conn);
		if (seenIds.has(conn.id)) {
			throw new Error(`db-connections.json: duplicate id '${conn.id}'`);
		}
		seenIds.add(conn.id);

		if (!kindExists(conn.kind)) {
			throw new Error(
				`db-connections.json: unknown driver kind '${conn.kind}' ` +
				`(connection '${conn.id}'). Registered kinds: see logs.`,
			);
		}

		const registryFamily = familyOf(conn.kind);
		let family: DriverFamily;
		if (conn.family !== undefined) {
			family = conn.family;
			if (registryFamily !== undefined && registryFamily !== conn.family) {
				warnings.push(
					`connection '${conn.id}': user pinned family='${conn.family}' ` +
					`but driver '${conn.kind}' registered as '${registryFamily}'. ` +
					`Using user-pinned family.`,
				);
			}
		} else {
			// Shadowed by the kindExists guard above.
			family = registryFamily ?? 'rdbms';
		}

		resolved.push({ ...conn, family });
	}

	log.debug({ repoPath, count: resolved.length }, 'loaded db-connections');
	return { file: doc, resolved, warnings };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Write the connections file. The caller is responsible for secret
 * redaction -- this function takes the JSON as-is and just persists
 * it. Creates parent dirs on first write.
 */
export async function saveConnections(
	repoPath: string,
	file: ConnectionsFile,
): Promise<string> {
	const path = connectionsPath(repoPath);
	await mkdir(dirname(path), { recursive: true });
	const serialized = JSON.stringify(file, null, 2) + '\n';
	await writeFile(path, serialized, 'utf8');
	log.debug({ repoPath, path }, 'saved db-connections');
	return path;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isConnectionsFile(doc: unknown): doc is ConnectionsFile {
	return doc !== null
		&& typeof doc === 'object'
		&& Array.isArray((doc as { connections?: unknown }).connections);
}

function validateShape(conn: unknown): asserts conn is ConnectionConfig {
	if (conn === null || typeof conn !== 'object') {
		throw new Error('db-connections.json: each connection must be an object');
	}
	const c = conn as Record<string, unknown>;
	if (typeof c['id'] !== 'string' || c['id'] === '') {
		throw new Error('db-connections.json: connection missing valid `id`');
	}
	if (typeof c['kind'] !== 'string' || c['kind'] === '') {
		throw new Error(`db-connections.json: connection '${c['id']}' missing valid \`kind\``);
	}
	const hasUrl = typeof c['url'] === 'string' && c['url'] !== '';
	const hasPath = typeof c['path'] === 'string' && c['path'] !== '';
	if (!hasUrl && !hasPath) {
		throw new Error(
			`db-connections.json: connection '${c['id']}' must set \`url\` (rdbms/kv) ` +
			`or \`path\` (file)`,
		);
	}
	if (c['family'] !== undefined && !['rdbms', 'kv', 'file'].includes(c['family'] as string)) {
		throw new Error(
			`db-connections.json: connection '${c['id']}' has invalid family '${String(c['family'])}'`,
		);
	}
}
