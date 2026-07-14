/**
 * Per-repo driver pool for the data driver.
 *
 * Responsibilities:
 *   - Lazy build. First tool call for a connection wakes a driver;
 *     subsequent calls reuse it. Drivers are expensive to build
 *     (TCP handshake, TLS, protocol ping) so pooling matters.
 *   - Idle-close. A driver that hasn't been touched in
 *     `IDLE_CLOSE_MS` closes automatically. Keeps open sockets
 *     bounded when the user leaves a session idle.
 *   - Shutdown-close. On daemon shutdown + on explicit pool reload,
 *     all drivers close cleanly.
 *   - Secret resolution. `${secret:<ref>}` tokens in `config.url`
 *     are resolved against the keychain right before the factory
 *     call; drivers see plaintext URLs.
 *
 * Scope: one pool instance per repo. The daemon wires one on demand
 * when a tool asks for a connection by id.
 */

import { access } from 'node:fs/promises';
import { constants as fsConst } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import type {
	ConnectionConfig,
	Driver,
} from '../../shared/db-driver.js';
import { familyOf, getFactory } from './registry.js';
import { resolveSecrets } from './secrets.js';
import { loadConnections } from './config.js';

const log = getLogger('db-pool');

const IDLE_CLOSE_MS = 10 * 60 * 1000;

interface PoolEntry {
	readonly connectionId: string;
	readonly config: ConnectionConfig;
	driver: Driver | null;
	/** In-flight build promise so concurrent first-calls wait for the
	 *  same driver instead of racing to build duplicates. */
	building: Promise<Driver> | null;
	lastUsedAt: number;
	idleTimer: ReturnType<typeof setTimeout> | null;
}

export class DriverPool {
	private readonly entries = new Map<string, PoolEntry>();

	constructor(private readonly repoPath: string) { }

	/**
	 * Load (or reload) the connections file for this pool's repo.
	 * Replaces the in-memory set of entries; closes drivers whose
	 * config disappeared or changed.
	 */
	async reload(): Promise<{ warnings: readonly string[] }> {
		const { resolved, warnings } = await loadConnections(this.repoPath);

		const nextIds = new Set(resolved.map(c => c.id));
		for (const [id, entry] of this.entries) {
			// Preserve ephemeral entries across reload. The data-analyzer
			// (and future siblings) can register a one-off local file
			// connection mid-run; that entry isn't in db-connections.json
			// so the prune pass would drop it on the next reload triggered
			// by an unrelated Data Sources edit. Skipping ephemerals here
			// keeps the analyzer's run-time view of registered connections
			// stable.
			if (!nextIds.has(id) && entry.config.ephemeral !== true) {
				await this.closeEntry(entry);
				this.entries.delete(id);
			}
		}

		for (const config of resolved) {
			const existing = this.entries.get(config.id);
			if (existing === undefined) {
				this.entries.set(config.id, {
					connectionId: config.id,
					config,
					driver: null,
					building: null,
					lastUsedAt: 0,
					idleTimer: null,
				});
				continue;
			}
			if (!shallowEqual(existing.config, config)) {
				await this.closeEntry(existing);
				this.entries.set(config.id, {
					connectionId: config.id,
					config,
					driver: null,
					building: null,
					lastUsedAt: 0,
					idleTimer: null,
				});
			}
		}

		log.debug(
			{ repoPath: this.repoPath, count: this.entries.size },
			'pool reloaded',
		);
		return { warnings };
	}

	list(): readonly ConnectionConfig[] {
		return Array.from(this.entries.values()).map(e => e.config);
	}

	/**
	 * Get a live driver for `connectionId`. Builds on first call,
	 * resets the idle timer, throws when the connection is not in
	 * config.
	 */
	async acquire(connectionId: string): Promise<Driver> {
		const entry = this.entries.get(connectionId);
		if (entry === undefined) {
			throw new Error(
				`data-driver: no connection '${connectionId}' for repo ${this.repoPath}. ` +
				`Known: ${Array.from(this.entries.keys()).join(', ') || '(none)'}`,
			);
		}
		if (entry.driver !== null) {
			this.touch(entry);
			return entry.driver;
		}
		if (entry.building !== null) {
			return entry.building;
		}
		entry.building = this.build(entry).finally(() => {
			entry.building = null;
		});
		const driver = await entry.building;
		entry.driver = driver;
		this.touch(entry);
		return driver;
	}

	async closeAll(): Promise<void> {
		for (const entry of this.entries.values()) {
			await this.closeEntry(entry);
		}
		this.entries.clear();
	}

	/**
	 * Register an ephemeral session-scoped connection -- used by the
	 * data-analyzer (and future siblings) when the user references a
	 * local file path in their prompt that isn't in
	 * db-connections.json. Idempotent: replaces any existing entry
	 * with the same id, closing the previous driver. The entry is
	 * marked `ephemeral: true` so `reload()` preserves it across
	 * unrelated Data Sources edits.
	 */
	async registerEphemeral(config: ConnectionConfig): Promise<void> {
		const stamped: ConnectionConfig = { ...config, ephemeral: true };
		const existing = this.entries.get(stamped.id);
		if (existing !== undefined) {
			await this.closeEntry(existing);
		}
		this.entries.set(stamped.id, {
			connectionId: stamped.id,
			config: stamped,
			driver: null,
			building: null,
			lastUsedAt: 0,
			idleTimer: null,
		});
		log.debug({ id: stamped.id, kind: stamped.kind, path: stamped.path }, 'pool: ephemeral connection registered');
	}

	private async build(entry: PoolEntry): Promise<Driver> {
		const factory = getFactory(entry.config.kind);
		if (factory === undefined) {
			throw new Error(
				`data-driver: no driver registered for kind '${entry.config.kind}' ` +
				`(connection '${entry.config.id}')`,
			);
		}
		const withSecrets = await resolveConfigSecrets(entry.config);
		const resolvedConfig = await resolveConfigPath(withSecrets, this.repoPath);
		log.debug(
			{ id: entry.config.id, kind: entry.config.kind },
			'building driver',
		);
		return factory(resolvedConfig);
	}

	private touch(entry: PoolEntry): void {
		entry.lastUsedAt = Date.now();
		if (entry.idleTimer !== null) { clearTimeout(entry.idleTimer); }
		entry.idleTimer = setTimeout(() => {
			void this.closeEntry(entry).catch(err => {
				log.warn(
					{ err: (err as Error).message, id: entry.config.id },
					'idle-close failed',
				);
			});
		}, IDLE_CLOSE_MS);
		entry.idleTimer.unref();
	}

	private async closeEntry(entry: PoolEntry): Promise<void> {
		if (entry.idleTimer !== null) {
			clearTimeout(entry.idleTimer);
			entry.idleTimer = null;
		}
		if (entry.driver !== null) {
			try { await entry.driver.close(); }
			catch (err) {
				log.warn(
					{ err: (err as Error).message, id: entry.config.id },
					'driver close failed',
				);
			}
			entry.driver = null;
		}
	}
}

// ---------------------------------------------------------------------------
// Pre-build config transforms: secret resolution + file-path resolution
// ---------------------------------------------------------------------------

async function resolveConfigSecrets(
	config: ConnectionConfig,
): Promise<ConnectionConfig> {
	if (config.url === undefined || !config.url.includes('${secret:')) {
		return config;
	}
	const url = await resolveSecrets(config.url);
	return { ...config, url };
}

/**
 * For file-family connections, convert the (repo-relative) `path`
 * into an absolute path. Rejects paths that escape the repo root --
 * Phase 1 applies this unconditionally; the fs-access gate
 * (analyzer design §7.3) will relax this later.
 *
 * Also resolves `schemaSource.path` (the prisma fast-path source
 * for RDBMS describe()) into an absolute path against the repo
 * root. Same containment rule.
 */
async function resolveConfigPath(
	config: ConnectionConfig,
	repoRoot: string,
): Promise<ConnectionConfig> {
	const family = familyOf(config.kind);
	let next: ConnectionConfig = config;

	// File-family connections always carry a `path`. SQLite (rdbms
	// family) is a single-file db, so it carries `path` too -- treat
	// both the same for repo-root containment.
	const needsPathResolution = family === 'file' || config.kind === 'sqlite';
	if (needsPathResolution && config.path !== undefined) {
		const abs = await resolveAndCheckRepoPath(config.id, config.path, repoRoot, 'path');
		next = { ...next, path: abs };
	} else if (family === 'file' && config.path === undefined) {
		throw new Error(`data-driver: file connection '${config.id}' missing path`);
	}

	if (config.schemaSource !== undefined) {
		const abs = await resolveAndCheckRepoPath(
			config.id, config.schemaSource.path, repoRoot, 'schemaSource.path',
		);
		next = { ...next, schemaSource: { type: config.schemaSource.type, path: abs } };
	}

	return next;
}

async function resolveAndCheckRepoPath(
	connId: string,
	givenPath: string,
	repoRoot: string,
	field: string,
): Promise<string> {
	const abs = isAbsolute(givenPath) ? givenPath : resolve(repoRoot, givenPath);
	const rel = relative(repoRoot, abs);
	if (rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error(
			`data-driver: connection '${connId}' ${field} '${givenPath}' ` +
			`resolves outside the repo root`,
		);
	}
	await access(abs, fsConst.R_OK);
	return abs;
}

// ---------------------------------------------------------------------------
// Shallow config equality (for reload-aware replacement)
// ---------------------------------------------------------------------------

function shallowEqual(a: ConnectionConfig, b: ConnectionConfig): boolean {
	return a.id === b.id
		&& a.kind === b.kind
		&& a.family === b.family
		&& a.label === b.label
		&& a.url === b.url
		&& a.path === b.path
		&& a.secretRef === b.secretRef
		&& JSON.stringify(a.options ?? null) === JSON.stringify(b.options ?? null)
		&& JSON.stringify(a.namespace ?? null) === JSON.stringify(b.namespace ?? null)
		&& JSON.stringify(a.schemaSource ?? null) === JSON.stringify(b.schemaSource ?? null)
		&& JSON.stringify(a.pii ?? null) === JSON.stringify(b.pii ?? null);
}
