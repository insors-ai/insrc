/** Per-directory driver owner. Management eligibility is separate from saved lookup scope. */
import { createHash, randomUUID } from 'node:crypto';
import { getLogger } from '../../shared/logger.js';
import type { ConnectionConfig, Driver, DriverFactory } from '../../shared/db-driver.js';
import type { ConnectionLease, SafeConnection } from '../../shared/connection-management.js';
import { familyOf, getFactory } from './registry.js';
import { resolveSecrets } from './secrets.js';
import { loadConnections } from './config.js';
import { safeConnection } from './driver-profiles.js';
import { RevisionLeaseGate, ConnectionUseError } from './lease-gate.js';
import { guardedDriver, driverFailure } from './driver-guard.js';
import { fileExecutionPolicy } from './file-policy.js';
import { prepareRuntimeConfig } from './runtime-config.js';
import { RemovalRetirementOwner } from './removal-retirement.js';
import type { RemovalCleanup } from './removal-retirement.js';
import { ManagementServiceError } from './management.js';
const log = getLogger('db-pool');
const IDLE_CLOSE_MS = 10 * 60 * 1000;
interface PoolEntry {
	readonly connectionId: string;
	readonly config: ConnectionConfig;
	readonly stored: ConnectionConfig;
	readonly revision: string;
	driver: Driver | null;
	building: Promise<Driver> | null;
	closing: Promise<void> | null;
	lastUsedAt: number;
	idleTimer: ReturnType<typeof setTimeout> | null;
}
interface PreparedRemoval {
	readonly id: string;
	readonly revision: string;
	entry: PoolEntry | undefined;
	readonly reservation: object | undefined;
	readonly release: () => void;
	phase: 'prepared' | 'committed' | 'canceled';
}
export interface DriverPoolOptions {
	readonly idleCloseMs?: number | undefined;
	readonly factory?: ((kind: string) => DriverFactory | undefined) | undefined;
	readonly gate?: RevisionLeaseGate | undefined;
}
export class DriverPool {
	readonly #ownerId = randomUUID();
	private readonly entries = new Map<string, PoolEntry>();
	readonly #gate: RevisionLeaseGate;
	readonly #replacing = new Set<string>();
	#reloadTail: Promise<void> = Promise.resolve();
	#closing = false;
	readonly #retirements: RemovalRetirementOwner;
	readonly #removalTokens = new WeakMap<object, PreparedRemoval>();
	readonly #preparedRemovals = new Set<string>();
	constructor(private readonly repoPath: string, private readonly options: DriverPoolOptions = {}) {
		this.#gate = options.gate ?? new RevisionLeaseGate(repoPath);
		this.#retirements = new RemovalRetirementOwner(repoPath);
	}
	async reload(): Promise<{
		warnings: readonly string[];
	}> {
		if (this.#closing)
			throw new ConnectionUseError('busy');
		const run = this.#reloadTail.then(() => this.reloadNow());
		this.#reloadTail = run.then(() => {
		}, () => {
		});
		return run;
	}
	private async reloadNow(): Promise<{
		warnings: readonly string[];
	}> {
		if (this.#closing || this.#preparedRemovals.size)
			throw new ConnectionUseError('busy');
		const { file, resolved, warnings } = await loadConnections(this.repoPath);
		if (this.#closing || this.#preparedRemovals.size)
			throw new ConnectionUseError('busy');
		const next = new Map<string, PoolEntry>();
		for (const config of resolved) {
			const stored = file.connections.find(c => c.id === config.id)!;
			const revision = file._management?.revisions[config.id] ?? 'legacy:' + createHash('sha256').update(JSON.stringify(stored)).digest('hex');
			const old = this.entries.get(config.id);
			next.set(config.id, old && old.revision === revision && shallowEqual(old.config, config) ? old : this.entry(config, stored, revision));
		}
		for (const [id, old] of this.entries)
			if (!next.has(id) && old.config.ephemeral === true)
				next.set(id, old);
		// Preflight all replacements before closing any driver. No await between gate sync and blocking new uses.
		for (const [id, old] of this.entries)
			if (next.get(id) !== old && this.#gate.snapshot(id).active > 0)
				throw new ConnectionUseError('busy');
		this.#gate.sync(new Map([...next].map(([id, e]) => [id, e.revision])));
		for (const [id, old] of this.entries)
			if (next.get(id) !== old)
				this.#replacing.add(id);
		for (const [id] of next)
			if (!this.entries.has(id))
				this.#replacing.add(id);
		try {
			for (const [id, old] of this.entries)
				if (next.get(id) !== old)
					await this.closeEntry(old);
			this.entries.clear();
			for (const [id, e] of next)
				this.entries.set(id, e);
		}
		finally {
			this.#replacing.clear();
		}
		log.debug({ repoPath: this.repoPath, count: this.entries.size }, 'pool reloaded');
		return { warnings };
	}
	private entry(config: ConnectionConfig, stored: ConnectionConfig, revision: string): PoolEntry {
		return { connectionId: config.id, config: structuredClone(config), stored: structuredClone(stored), revision, driver: null, building: null, closing: null, lastUsedAt: 0, idleTimer: null };
	}
	/** Legacy metadata port; callers migrate to safeList. Returns detached snapshots. */
	list(): readonly ConnectionConfig[] {
		return [...this.entries.values()].map(e => structuredClone(e.config));
	}
	safeList(): readonly SafeConnection[] {
		return [...this.entries.values()].map(e => {
			const key = { repoRoot: this.repoPath, scope: 'saved' as const, id: e.connectionId };
			try {
				return safeConnection(e.stored, key, e.revision);
			}
			catch {
				const family = e.config.family ?? familyOf(e.config.kind) ?? 'rdbms';
				return { key, revision: e.revision, kind: e.config.kind, family, effectiveFamily: family, publicConfig: {}, credentialPresence: {}, hasUrl: e.config.url !== undefined, hasPath: e.config.path !== undefined, ...(e.config.ephemeral === true ? { ephemeral: true as const } : {}), readOnly: true, compatibilityWarning: 'This connection requires a supported driver profile.' };
			}
		});
	}
	leaseState(id: string) {
		return this.#gate.snapshot(id);
	}
	beginMutation(id: string, mode: 'create' | 'update' | 'remove', expectedRevision?: string): () => void {
		if (this.#closing || this.#replacing.has(id))
			throw new ConnectionUseError('busy');
		return this.#gate.beginMutation(id, mode, expectedRevision);
	}
	/** Holds the existing revision barrier until proven commit or cancellation; no cleanup starts here. */
	prepareRemoval(id: string, oldRevision: string, operationId: string): object {
		const release = this.beginMutation(id, 'remove', oldRevision);
		try {
			const entry = this.entries.get(id);
			if (!entry || entry.revision !== oldRevision) throw new ConnectionUseError('conflict');
			if (entry.closing) throw new ConnectionUseError('busy');
			const reservation = entry.driver || entry.building ? this.#retirements.prepare(operationId, oldRevision) : undefined;
			if (entry.idleTimer) { clearTimeout(entry.idleTimer); entry.idleTimer = null; }
			const token = Object.freeze({});
			this.#removalTokens.set(token, {id,revision:oldRevision,entry,reservation,release,phase:'prepared'});
			this.#preparedRemovals.add(id);
			return token;
		} catch (error) { release(); throw error; }
	}
	#preparedRemoval(token: object): PreparedRemoval {
		const record = this.#removalTokens.get(token);
		if (!record) throw new ConnectionUseError('conflict');
		return record;
	}
	cancelRemoval(token: object): void {
		const record = this.#preparedRemoval(token);
		if (record.phase === 'canceled') return;
		if (record.phase !== 'prepared') throw new ConnectionUseError('conflict');
		if (record.reservation) this.#retirements.cancel(record.reservation);
		const entry = record.entry;
		record.phase = 'canceled'; record.entry = undefined;
		this.#preparedRemovals.delete(record.id); record.release();
		if (entry?.driver) this.touch(entry);
	}
	/** Known committed registry truth only. Detach synchronously before returning a cleanup-only handle. */
	commitRemoval(token: object): RemovalCleanup {
		const record = this.#preparedRemoval(token);
		const entry = record.entry;
		if (record.phase !== 'prepared' || !entry || this.entries.get(record.id) !== entry) throw new ConnectionUseError('conflict');
		let driver = entry.driver;
		let building = entry.building;
		const cleanup = record.reservation ? this.#retirements.commit(record.reservation, async () => {
			if (building) {
				try { driver = await building; } catch { /* A failed constructor yielded no SDK handle. */ }
				building = null;
			}
			if (driver) { await driver.close(); driver = null; }
		}) : Object.freeze({close:async () => {}});
		const revisions = new Map([...this.entries].filter(([id]) => id !== record.id).map(([id,e]) => [id,e.revision]));
		this.#gate.sync(revisions);
		this.entries.delete(record.id);
		if (entry.idleTimer) clearTimeout(entry.idleTimer);
		entry.idleTimer = null;
		record.phase = 'committed'; record.entry = undefined;
		this.#preparedRemovals.delete(record.id); record.release();
		return cleanup;
	}
	removalCleanupPending(operationId: string, oldRevision: string): boolean { return this.#retirements.pending(operationId,oldRevision); }
	retryRemovalCleanup(operationId: string, oldRevision: string): Promise<void> { return this.#retirements.retry(operationId,oldRevision); }
	async lease(id: string): Promise<ConnectionLease> {
		if (this.#closing || this.#replacing.has(id))
			throw new ConnectionUseError('busy');
		const lease = this.#gate.lease(id);
		return { ...lease, release: async () => {
				await lease.release();
				const entry = this.entries.get(id);
				if (entry && !this.#closing)
					this.touch(entry);
			} };
	}
	async withConnection<T>(id: string, use: (driver: Driver) => Promise<T>): Promise<T> {
		const lease = await this.lease(id);
		let guard: ReturnType<typeof guardedDriver> | undefined;
		try {
			const driver = await this.acquire(id);
			guard = guardedDriver(driver);
			return await use(guard.driver);
		}
		catch (error) {
			throw driverFailure(error);
		}
		finally {
			try {
				await guard?.finish();
			}
			catch (error) {
				throw driverFailure(error);
			}
			finally {
				await lease.release();
			}
		}
	}
	/** @deprecated Raw acquisition is a migration-only port; never use it from a v2 consumer. */
	async acquire(connectionId: string): Promise<Driver> {
		if (this.#closing || this.#replacing.has(connectionId))
			throw new ConnectionUseError('busy');
		this.#gate.assertAcquirable(connectionId);
		const entry = this.entries.get(connectionId);
		if (!entry)
			throw new ConnectionUseError('not-found');
		if (entry.closing)
			await entry.closing;
		if (this.entries.get(connectionId) !== entry)
			throw new ConnectionUseError('conflict');
		this.#gate.assertAcquirable(connectionId);
		if (entry.driver) {
			this.touch(entry);
			return entry.driver;
		}
		if (!entry.building)
			entry.building = this.build(entry).then(driver => {
				entry.driver = driver;
				return driver;
			}).finally(() => {
				entry.building = null;
			});
		const driver = await entry.building;
		if (this.entries.get(connectionId) !== entry) throw new ConnectionUseError('conflict');
		this.#gate.assertAcquirable(connectionId);
		this.touch(entry);
		return driver;
	}
	async closeAll(): Promise<void> {
		this.#closing = true;
		this.#retirements.stopAdmission();
		await this.#reloadTail;
		if (this.#preparedRemovals.size) throw new ConnectionUseError('busy');
		for (const entry of this.entries.values()) {
			await this.#gate.idle(entry.connectionId);
			await this.closeEntry(entry);
		}
		this.entries.clear();
		this.#gate.sync(new Map());
		await this.#retirements.drain();
	}
	async registerEphemeral(config: ConnectionConfig): Promise<void> {
		if (this.#closing || this.#gate.snapshot(config.id).barrier !== 'none')
			throw new ConnectionUseError('busy');
		const stamped = { ...config, ephemeral: true };
		const existing = this.entries.get(config.id);
		const revisions = new Map([...this.entries].map(([id, e]) => [id, e.revision]));
		const revision = randomUUID();
		revisions.set(config.id, revision);
		this.#gate.sync(revisions);
		this.#replacing.add(config.id);
		try {
			if (existing)
				await this.closeEntry(existing);
			this.entries.set(config.id, this.entry(stamped, stamped, revision));
		}
		finally {
			this.#replacing.delete(config.id);
		}
		log.debug({ id: config.id, kind: config.kind }, 'pool: ephemeral connection registered');
	}
	private async build(entry: PoolEntry): Promise<Driver> {
		const factory = (this.options.factory ?? getFactory)(entry.config.kind);
		if (!factory)
			throw new ConnectionUseError('not-found');
		const withSecrets = await resolveConfigSecrets(entry.config);
		const config = await prepareRuntimeConfig(withSecrets, this.repoPath);
		log.debug({ id: entry.config.id, kind: entry.config.kind }, 'building driver');
		return factory(config, familyOf(config.kind) === 'file' ? { fileExecutionPolicy: fileExecutionPolicy(config, {
			lookupRoot: this.repoPath, ownerId: this.#ownerId, revision: entry.revision,
			persistence: config.ephemeral === true ? 'memory-only' : 'saved-cache',
		}) } : undefined);
	}
	private touch(entry: PoolEntry): void {
		if (this.entries.get(entry.connectionId) !== entry || this.#gate.snapshot(entry.connectionId).barrier !== 'none') return;
		entry.lastUsedAt = Date.now();
		if (entry.idleTimer)
			clearTimeout(entry.idleTimer);
		entry.idleTimer = setTimeout(() => {
			if (this.#gate.snapshot(entry.connectionId).active > 0) {
				this.touch(entry);
				return;
			}
			void this.closeEntry(entry).catch(() => log.warn({ id: entry.connectionId }, 'idle-close failed'));
		}, this.options.idleCloseMs ?? IDLE_CLOSE_MS);
		entry.idleTimer.unref();
	}
	private async closeEntry(entry: PoolEntry): Promise<void> {
		if (entry.closing)
			return entry.closing;
		if (this.#gate.snapshot(entry.connectionId).active > 0)
			throw new ConnectionUseError('busy');
		if (entry.idleTimer) {
			clearTimeout(entry.idleTimer);
			entry.idleTimer = null;
		}
		const closing = (async () => {
			if (entry.building)
				await entry.building.catch(() => {
				});
			if (entry.driver) {
				try {
					await entry.driver.close();
				}
				catch {
					log.warn({ id: entry.connectionId }, 'driver close failed');
					throw new ManagementServiceError('recovery-required');
				}
				entry.driver = null;
			}
		})();
		entry.closing = closing;
		try {
			await closing;
		}
		finally {
			entry.closing = null;
		}
	}
}
// ---------------------------------------------------------------------------
// Pre-build config transforms: secret resolution + file-path resolution
// ---------------------------------------------------------------------------
async function resolveConfigSecrets(config: ConnectionConfig): Promise<ConnectionConfig> {
	const visit = async (value: unknown): Promise<unknown> => {
		if (typeof value === 'string')
			return resolveSecrets(value);
		if (Array.isArray(value)) {
			const result: unknown[] = [];
			for (const v of value)
				result.push(await visit(v));
			return result;
		}
		if (value && typeof value === 'object') {
			const result: Record<string, unknown> = {};
			for (const [key, v] of Object.entries(value))
				result[key] = await visit(v);
			return result;
		}
		return value;
	};
	return { ...config, ...(config.url === undefined ? {} : { url: await resolveSecrets(config.url) }), ...(config.options === undefined ? {} : { options: await visit(config.options) as Readonly<Record<string, unknown>> }) };
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
