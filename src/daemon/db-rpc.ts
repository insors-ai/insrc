/**
 * Data-driver RPC handlers surfaced on the daemon IPC server.
 *
 * Phase 3 shipped `db.listConnections` (read-only). Phase 2 setup
 * UX adds the four mutating + probing handlers used by the palette
 * commands and the Data Sources pane:
 *
 *   - db.listConnections    -> { id, kind, family, label }[]
 *   - db.listDriverKinds    -> { kind, family }[]
 *   - db.saveConnection     -> { id, family, redactedUrl?, wrotePath }
 *   - db.deleteConnection   -> { id, removed, removedPath? }
 *   - db.testConnection     -> { ok, kind, family, error?, tookMs }
 *
 * The save handler is responsible for the secret-extract dance:
 * a plaintext URL goes in, the password is moved to the keychain
 * under `db:<repoId>:<connId>`, and the JSON gets the redacted form
 * `${secret:db:<repoId>:<connId>}`. Edit semantics follow naturally
 * by upserting on `id`.
 */

import { isAbsolute, relative, resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConst } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import {
	familyOf,
	getFactory,
	kindExists,
	listRegisteredKinds,
} from './db/registry.js';
import {
	loadConnections,
	repoIdOf,
	saveConnections,
} from './db/config.js';
import {
	deleteSecret,
	extractUrlPassword,
	makeSecretRef,
	resolveSecrets,
} from './db/secrets.js';
import { reloadAll } from './db/pool-cache.js';
import type {
	ConnectionConfig,
	Driver,
	DriverFamily,
} from '../shared/db-driver.js';

const log = getLogger('db-rpc');

// ---------------------------------------------------------------------------
// Common shapes
// ---------------------------------------------------------------------------

export interface ListConnectionsResult {
	readonly id: string;
	readonly kind: string;
	readonly family: DriverFamily;
	readonly label?: string;
}

interface SaveConnectionInput {
	readonly id: string;
	readonly kind: string;
	readonly family?: DriverFamily;
	readonly label?: string;
	/** Plaintext URL as the user entered it; password is extracted +
	 *  moved to the keychain before persistence. RDBMS / KV only. */
	readonly url?: string;
	/** Repo-relative (or absolute) path. File family only. */
	readonly path?: string;
	readonly schemaSource?: { readonly type: 'prisma'; readonly path: string };
	readonly namespace?: { readonly allow: readonly string[] };
	readonly options?: Readonly<Record<string, unknown>>;
	readonly pii?: readonly string[];
}

// ---------------------------------------------------------------------------
// listConnections
// ---------------------------------------------------------------------------

export async function listConnectionsRpc(
	params: { readonly repoRoot?: unknown },
): Promise<readonly ListConnectionsResult[]> {
	const repoRoot = typeof params.repoRoot === 'string' ? params.repoRoot : '';
	if (repoRoot === '') {
		log.warn('db.listConnections called without repoRoot');
		return [];
	}
	try {
		const { resolved } = await loadConnections(repoRoot);
		return resolved.map(c => {
			const base: ListConnectionsResult = {
				id: c.id,
				kind: c.kind,
				family: (c.family ?? 'rdbms') as DriverFamily,
			};
			return c.label === undefined ? base : { ...base, label: c.label };
		});
	} catch (err) {
		log.warn({ repoRoot, err: (err as Error).message }, 'listConnections failed');
		return [];
	}
}

// ---------------------------------------------------------------------------
// listDriverKinds -- powers the kind picker in the setup UX
// ---------------------------------------------------------------------------

export interface DriverKindEntry {
	readonly kind: string;
	readonly family: DriverFamily;
}

export function listDriverKindsRpc(): readonly DriverKindEntry[] {
	return listRegisteredKinds().slice().sort((a, b) => a.kind.localeCompare(b.kind));
}

// ---------------------------------------------------------------------------
// saveConnection (covers add + edit by upserting on id)
// ---------------------------------------------------------------------------

export interface SaveConnectionResult {
	readonly id: string;
	readonly family: DriverFamily;
	readonly redactedUrl?: string;
	readonly wrotePath: string;
}

export async function saveConnectionRpc(params: {
	readonly repoRoot?: unknown;
	readonly config?: unknown;
}): Promise<SaveConnectionResult | { error: string }> {
	const repoRoot = typeof params.repoRoot === 'string' ? params.repoRoot : '';
	if (repoRoot === '') { return { error: 'repoRoot is required' }; }

	const cfg = parseSaveInput(params.config);
	if (typeof cfg === 'string') { return { error: cfg }; }
	const validation = validateForFamily(cfg);
	if (validation !== null) { return { error: validation }; }

	const family: DriverFamily = cfg.family ?? familyOf(cfg.kind) ?? 'rdbms';
	const ref = makeSecretRef(repoIdOf(repoRoot), cfg.id);

	let urlForFile = cfg.url;
	if (family !== 'file' && cfg.url !== undefined && !cfg.url.includes('${secret:')) {
		urlForFile = await extractUrlPassword(cfg.url, ref);
	}
	const next: ConnectionConfig = buildPersistedConfig(cfg, family, urlForFile, ref);

	const existing = await loadConnections(repoRoot)
		.then(r => r.resolved)
		.catch(() => [] as readonly ConnectionConfig[]);
	const filtered = existing.filter(c => c.id !== cfg.id);
	const wrotePath = await saveConnections(repoRoot, {
		connections: [...filtered, next],
	});

	try { await reloadAll(); }
	catch (err) { log.warn({ err: (err as Error).message }, 'pool reload after save failed'); }

	const result: SaveConnectionResult = next.url !== undefined
		? { id: next.id, family, redactedUrl: next.url, wrotePath }
		: { id: next.id, family, wrotePath };
	return result;
}

// ---------------------------------------------------------------------------
// deleteConnection
// ---------------------------------------------------------------------------

export interface DeleteConnectionResult {
	readonly id: string;
	readonly removed: boolean;
	readonly removedPath?: string;
}

export async function deleteConnectionRpc(params: {
	readonly repoRoot?: unknown;
	readonly id?: unknown;
}): Promise<DeleteConnectionResult | { error: string }> {
	const repoRoot = typeof params.repoRoot === 'string' ? params.repoRoot : '';
	const id = typeof params.id === 'string' ? params.id : '';
	if (repoRoot === '' || id === '') {
		return { error: 'repoRoot and id are required' };
	}

	const existing = await loadConnections(repoRoot)
		.then(r => r.resolved)
		.catch(() => [] as readonly ConnectionConfig[]);
	if (existing.find(c => c.id === id) === undefined) {
		return { id, removed: false };
	}
	const filtered = existing.filter(c => c.id !== id);
	const wrotePath = await saveConnections(repoRoot, {
		connections: filtered,
	});

	const ref = makeSecretRef(repoIdOf(repoRoot), id);
	try { await deleteSecret(ref); }
	catch (err) {
		log.warn({ ref, err: (err as Error).message }, 'keychain entry delete failed');
	}

	try { await reloadAll(); }
	catch (err) { log.warn({ err: (err as Error).message }, 'pool reload after delete failed'); }

	return { id, removed: true, removedPath: wrotePath };
}

// ---------------------------------------------------------------------------
// testConnection -- transient driver build + close (no persistence)
// ---------------------------------------------------------------------------

export interface TestConnectionResult {
	readonly ok: boolean;
	readonly kind: string;
	readonly family: DriverFamily;
	readonly error?: string;
	readonly tookMs: number;
}

export async function testConnectionRpc(params: {
	readonly repoRoot?: unknown;
	readonly config?: unknown;
}): Promise<TestConnectionResult | { error: string }> {
	const repoRoot = typeof params.repoRoot === 'string' ? params.repoRoot : '';
	if (repoRoot === '') { return { error: 'repoRoot is required' }; }

	const parsed = parseSaveInput(params.config);
	if (typeof parsed === 'string') { return { error: parsed }; }

	// Two flows merge here: the pane has the full plaintext config
	// (test-before-save), or the palette only has { id, kind, family }
	// (test-persisted). For the latter we hydrate from
	// db-connections.json before validating.
	let cfg: SaveConnectionInput = parsed;
	const hasUrl = cfg.url !== undefined && cfg.url !== '';
	const hasPath = cfg.path !== undefined && cfg.path !== '';
	if (!hasUrl && !hasPath) {
		const existing = await loadConnections(repoRoot)
			.then(r => r.resolved)
			.catch(() => [] as readonly ConnectionConfig[]);
		const lookupId = cfg.id;
		const match = existing.find(c => c.id === lookupId);
		if (match === undefined) {
			return { error: `No persisted connection '${cfg.id}' for repoRoot ${repoRoot}` };
		}
		cfg = mergePersisted(cfg, match);
	}

	const validation = validateForFamily(cfg);
	if (validation !== null) { return { error: validation }; }

	const family: DriverFamily = cfg.family ?? familyOf(cfg.kind) ?? 'rdbms';
	const factory = getFactory(cfg.kind);
	if (factory === undefined) {
		return { error: `Unknown driver kind '${cfg.kind}'` };
	}

	const start = Date.now();
	let driver: Driver | null = null;
	try {
		const transient = await materializeTransientConfig(cfg, family, repoRoot);
		driver = await factory(transient);
		return { ok: true, kind: cfg.kind, family, tookMs: Date.now() - start };
	} catch (err) {
		return {
			ok: false,
			kind: cfg.kind,
			family,
			error: (err as Error).message,
			tookMs: Date.now() - start,
		};
	} finally {
		if (driver !== null) {
			driver.close().catch(() => { /* best-effort */ });
		}
	}
}

function mergePersisted(input: SaveConnectionInput, persisted: ConnectionConfig): SaveConnectionInput {
	// Preserve the user-supplied input fields (in case the test has
	// edits over what's persisted), only fill in the holes from disk.
	const merged: { -readonly [K in keyof SaveConnectionInput]: SaveConnectionInput[K] } = { ...input };
	if (merged.kind === '' || merged.kind === undefined) { merged.kind = persisted.kind; }
	if (merged.family === undefined && persisted.family !== undefined) { merged.family = persisted.family; }
	if (merged.url === undefined && persisted.url !== undefined) { merged.url = persisted.url; }
	if (merged.path === undefined && persisted.path !== undefined) { merged.path = persisted.path; }
	if (merged.label === undefined && persisted.label !== undefined) { merged.label = persisted.label; }
	if (merged.schemaSource === undefined && persisted.schemaSource !== undefined) { merged.schemaSource = persisted.schemaSource; }
	if (merged.namespace === undefined && persisted.namespace !== undefined) { merged.namespace = persisted.namespace; }
	if (merged.options === undefined && persisted.options !== undefined) { merged.options = persisted.options; }
	if (merged.pii === undefined && persisted.pii !== undefined) { merged.pii = persisted.pii; }
	return merged as SaveConnectionInput;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSaveInput(raw: unknown): SaveConnectionInput | string {
	if (raw === null || typeof raw !== 'object') {
		return 'config must be an object';
	}
	const c = raw as Record<string, unknown>;
	if (typeof c['id'] !== 'string' || c['id'] === '') {
		return 'config.id must be a non-empty string';
	}
	if (typeof c['kind'] !== 'string' || c['kind'] === '') {
		return 'config.kind must be a non-empty string';
	}
	const out: { -readonly [K in keyof SaveConnectionInput]: SaveConnectionInput[K] } = {
		id: c['id'],
		kind: c['kind'],
	};
	if (c['family'] === 'rdbms' || c['family'] === 'kv' || c['family'] === 'file') {
		out.family = c['family'];
	}
	if (typeof c['label'] === 'string') { out.label = c['label']; }
	if (typeof c['url'] === 'string')   { out.url   = c['url']; }
	if (typeof c['path'] === 'string')  { out.path  = c['path']; }
	if (c['schemaSource'] !== undefined && c['schemaSource'] !== null && typeof c['schemaSource'] === 'object') {
		const s = c['schemaSource'] as Record<string, unknown>;
		if (s['type'] === 'prisma' && typeof s['path'] === 'string') {
			out.schemaSource = { type: 'prisma', path: s['path'] };
		}
	}
	if (c['namespace'] !== undefined && c['namespace'] !== null && typeof c['namespace'] === 'object') {
		const n = c['namespace'] as Record<string, unknown>;
		if (Array.isArray(n['allow'])) {
			out.namespace = { allow: n['allow'].filter((x): x is string => typeof x === 'string') };
		}
	}
	if (c['options'] !== undefined && c['options'] !== null && typeof c['options'] === 'object') {
		out.options = c['options'] as Readonly<Record<string, unknown>>;
	}
	if (Array.isArray(c['pii'])) {
		out.pii = c['pii'].filter((x): x is string => typeof x === 'string');
	}
	return out as SaveConnectionInput;
}

function validateForFamily(cfg: SaveConnectionInput): string | null {
	if (!kindExists(cfg.kind)) {
		return `Unknown driver kind '${cfg.kind}'. Registered: `
			+ listRegisteredKinds().map(k => k.kind).sort().join(', ');
	}
	const family: DriverFamily = cfg.family ?? familyOf(cfg.kind) ?? 'rdbms';
	if (family === 'file') {
		if (cfg.path === undefined || cfg.path === '') {
			return 'file connections require `path`';
		}
	} else {
		if (cfg.url === undefined || cfg.url === '') {
			return `${family} connections require \`url\``;
		}
	}
	return null;
}

function buildPersistedConfig(
	input: SaveConnectionInput,
	family: DriverFamily,
	url: string | undefined,
	ref: string,
): ConnectionConfig {
	const base: { -readonly [K in keyof ConnectionConfig]: ConnectionConfig[K] } = {
		id: input.id,
		kind: input.kind,
		family,
	};
	if (input.label !== undefined)        { base.label        = input.label; }
	if (url !== undefined)                { base.url          = url; }
	if (input.path !== undefined)         { base.path         = input.path; }
	if (input.schemaSource !== undefined) { base.schemaSource = input.schemaSource; }
	if (input.namespace !== undefined)    { base.namespace    = input.namespace; }
	if (input.options !== undefined)      { base.options      = input.options; }
	if (input.pii !== undefined)          { base.pii          = input.pii; }
	if (url !== undefined && url.includes('${secret:')) {
		base.secretRef = ref;
	}
	return base;
}

/**
 * Build a ConnectionConfig suitable for handing to a driver factory
 * directly -- secrets resolved, file paths absolute. Used only by
 * `testConnectionRpc`; the production hot path goes through the
 * pool which does the same transforms.
 */
async function materializeTransientConfig(
	input: SaveConnectionInput,
	family: DriverFamily,
	repoRoot: string,
): Promise<ConnectionConfig> {
	const base: { -readonly [K in keyof ConnectionConfig]: ConnectionConfig[K] } = {
		id: input.id,
		kind: input.kind,
		family,
	};
	if (input.label !== undefined)        { base.label        = input.label; }
	if (input.schemaSource !== undefined) { base.schemaSource = input.schemaSource; }
	if (input.namespace !== undefined)    { base.namespace    = input.namespace; }
	if (input.options !== undefined)      { base.options      = input.options; }
	if (input.pii !== undefined)          { base.pii          = input.pii; }

	if (family === 'file') {
		if (input.path === undefined) {
			throw new Error('file connection missing path');
		}
		const abs = isAbsolute(input.path) ? input.path : resolve(repoRoot, input.path);
		const rel = relative(repoRoot, abs);
		if (rel.startsWith('..') || isAbsolute(rel)) {
			throw new Error(
				`file connection '${input.id}' path '${input.path}' resolves outside the repo root`,
			);
		}
		await access(abs, fsConst.R_OK);
		base.path = abs;
	} else {
		if (input.url === undefined) { throw new Error(`${family} connection missing url`); }
		base.url = input.url.includes('${secret:')
			? await resolveSecrets(input.url)
			: input.url;
	}
	return base;
}
