import { driverResourceLog } from '../driver-log-policy.js';
import type { DriverFactoryContext } from '../../../shared/db-driver.js';
/**
 * Memcached driver (kind: `memcached`).
 *
 * Limited surface: memcached has no native SCAN. Servers expose
 * `stats items` + `stats cachedump <slab> <count>` for key listing
 * but it's deprecated, slow, sample-only, and disabled by default
 * on many production deployments. We *do not* attempt a key-listing
 * implementation -- `scan` and `sample_shape` reject with a typed
 * UNSUPPORTED message; only `get` is functional.
 *
 * Users querying memcached typically already know the keys they
 * want (built from the same code path that wrote them). For the
 * data-driver this is acceptable: the analyzer can still inspect
 * specific cache entries it has reason to look up.
 *
 * Connection config:
 *   options.servers: ['localhost:11211']  (required)
 *   options.user, options.password         (optional SASL)
 */

import * as memjsMod from 'memjs';

import { getLogger } from '../../../shared/logger.js';
import type {
	ConnectionConfig,
	KvDriver,
	KeyList,
	KvNamespaceDescription,
	KvNamespaceList,
	KvValue,
	ScanOpts,
	ShapeReport,
} from '../../../shared/db-driver.js';
import { registerDriver } from '../registry.js';
import { SCAN_TIMEOUT_MS } from './kv-common.js';

const log = getLogger('db-memcached');

interface MemcachedClient {
	readonly servers: {username: string; password: string}[];
	get(key: string, cb?: (err: Error | null, value: Buffer | null) => void): unknown;
	incrSeq(): void;
	readonly seq: number;
	perform(key: string, request: Buffer, seq: number, callback: (error: Error | null, response: {header: {status:number;opcode:number}} | null) => void, retries: number): void;
	close(): void;
}

class MemcachedDriver implements KvDriver {
	readonly #runtimeLog: ReturnType<typeof driverResourceLog>;
	readonly family = 'kv' as const;
	readonly kind = 'memcached';

	private readonly client: MemcachedClient;

	constructor(
		readonly id: string,
		serverString: string,
		auth: { user?: string; password?: string },
		context?: DriverFactoryContext,
	) {
		this.#runtimeLog = driverResourceLog('db-memcached', context);
		// memjs's signature: Client.create(serverString, options).
		// We type it loosely because @types/memjs models the legacy
		// callback shape that doesn't expose modern options cleanly.
		const factory = memjsMod as unknown as {
			Client: { create: (s: string, opts: Record<string, unknown>) => MemcachedClient };
		};
		this.client = factory.Client.create(serverString, {
			...(auth.user !== undefined ? { username: auth.user } : {}),
			...(auth.password !== undefined ? { password: auth.password } : {}),
			timeout: SCAN_TIMEOUT_MS / 1000,
			logger: { log: () => log.warn({ id }, 'memcached operation failed') },
		});
		// memjs otherwise fills cleared fields from MEMCACHE_* environment.
		for (const [index, server] of this.client.servers.entries()) {
			const pieces = serverString.split(',')[index]!.split('@');
			const [user, password] = (pieces.at(-2) ?? '').split(':');
			server.username = user || auth.user || '';
			server.password = password || auth.password || '';
		}
	}

	async probeReachability(): Promise<void> {
		// memjs exposes no VERSION convenience method; use its authenticated binary operation path.
		this.client.incrSeq();
		const sequence = this.client.seq, packet = Buffer.alloc(24);
		packet[0] = 0x80; packet[1] = 0x0b; packet.writeUInt32BE(sequence, 12);
		await new Promise<void>((resolve, reject) => this.client.perform('', packet, sequence, (error, response) => {
			if (error) reject(error);
			else if (!response || response.header.status !== 0 || response.header.opcode !== 0x0b) reject(new Error('Memcached probe failed.'));
			else resolve();
		}, 1));
	}

	async scan(_opts: ScanOpts): Promise<KeyList> {
		throw new Error(
			`data-driver: memcached has no native SCAN; key listing unsupported. ` +
			`Use db:kv:get with explicit keys.`,
		);
	}

	async get(key: string | Readonly<Record<string, unknown>>): Promise<KvValue> {
		if (typeof key !== 'string') {
			throw new Error(`data-driver: memcached keys are plain strings; got ${typeof key}`);
		}
		const buf = await new Promise<Buffer | null>((resolvePromise, rejectPromise) => {
			(this.client.get(key, (err: Error | null, value: Buffer | null) => {
				if (err !== null) { rejectPromise(err); return; }
				resolvePromise(value);
			})) as unknown;
		});
		if (buf === null) { return { key, value: null, type: 'null' }; }
		const text = buf.toString('utf8');
		try {
			const parsed = JSON.parse(text);
			if (parsed === null) { return { key, value: null, type: 'null' }; }
			if (Array.isArray(parsed)) { return { key, value: parsed, type: 'array' }; }
			switch (typeof parsed) {
				case 'object':  return { key, value: parsed, type: 'object' };
				case 'number':  return { key, value: parsed, type: 'number' };
				case 'boolean': return { key, value: parsed, type: 'boolean' };
				case 'string':  return { key, value: parsed, type: 'string' };
			}
		} catch { /* not JSON */ }
		return { key, value: text, type: 'string' };
	}

	async sampleShape(_opts: ScanOpts): Promise<ShapeReport> {
		throw new Error(
			`data-driver: memcached has no SCAN; sample_shape unsupported.`,
		);
	}

	async close(): Promise<void> {
		this.client.close();
	}

	async listNamespaces(): Promise<KvNamespaceList> {
		// Memcached has no namespace concept and no enumeration surface;
		// `supported: false` lets the tool layer report it cleanly without
		// failing the call.
		return { namespaces: [], truncated: false, supported: false };
	}

	async describeNamespace(name: string): Promise<KvNamespaceDescription> {
		return {
			name, kind: 'prefix',
			approxCount: null,
			sampleKeys: [], fields: [],
			supported: false,
		};
	}
}

// ---------------------------------------------------------------------------

registerDriver({
	kind: 'memcached',
	family: 'kv',
	factory: async (config: ConnectionConfig, context?: DriverFactoryContext) => {
		const opts = (config.options ?? {}) as Record<string, unknown>;
		const servers = Array.isArray(opts['servers'])
			? opts['servers'].filter((x): x is string => typeof x === 'string')
			: undefined;
		if (servers === undefined || servers.length === 0) {
			throw new Error(
				`data-driver: memcached connection '${config.id}' needs options.servers: string[]`,
			);
		}
		const auth: { user?: string; password?: string } = {};
		if (typeof opts['user'] === 'string')     { auth.user = opts['user']; }
		if (typeof opts['password'] === 'string') { auth.password = opts['password']; }
		return new MemcachedDriver(config.id, servers.join(','), auth, context);
	},
}, 'resource-context');
