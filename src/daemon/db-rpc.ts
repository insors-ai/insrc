import { assertSavedUpsertRoot, assertSavedIdAvailable } from './db/connection-reservations.js';
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
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { TrustedRpcContext } from './request-context.js';
import { managementContext } from './connection-management-rpc.js';
import { getLogger } from '../shared/logger.js';
import { familyOf, kindExists, listRegisteredKinds, } from './db/registry.js';
import { connectionsPath, loadConnections, repoIdOf, saveConnections, } from './db/config.js';
import { deleteSecret, extractUrlPassword, makeSecretRef, referencedSecrets, credentialKeystore, } from './db/secrets.js';
import { reloadAll, savedConnectionResolver } from './db/pool-cache.js';
import { assertUnmanagedWrite, managementMarkerExists } from './db/managed-store.js';
import { savedManagementFor, withSavedRootGate, managementRejection } from './db/management.js';
import { materializeDraft, safeConnection } from './db/driver-profiles.js';
import { connectionTestSupervisor } from './db/draft-test.js';
import { assertDraftTestJson, assertNoRuntimeAuth } from '../shared/connection-management-wire.js';
import { prepareRuntimeConfig } from './db/runtime-config.js';
import type { ConnectionConfig, DriverFamily, } from '../shared/db-driver.js';
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
	readonly schemaSource?: {
		readonly type: 'prisma';
		readonly path: string;
	};
	readonly namespace?: {
		readonly allow: readonly string[];
	};
	readonly options?: Readonly<Record<string, unknown>>;
	readonly pii?: readonly string[];
}
// ---------------------------------------------------------------------------
// listConnections
// ---------------------------------------------------------------------------
export async function listConnectionsRpc(params: {
	readonly repoRoot?: unknown;
}, transport?: TrustedRpcContext): Promise<readonly ListConnectionsResult[]> {
	const repoRoot = typeof params.repoRoot === 'string' ? params.repoRoot : '';
	if (repoRoot === '') {
		log.warn('db.listConnections called without repoRoot');
		return [];
	}
	try {
		const managed = savedManagementFor(repoRoot);
		const loaded = managed ? undefined : await loadConnections(repoRoot);
		if ((!transport && managed) || loaded?.file._management || (!managed && await managementMarkerExists(connectionsPath(repoRoot))))
			return [];
		const connections = managed ? await managed.list(managementContext(repoRoot, transport!))
			: loaded!.resolved.map(config => safeConnection(config, { repoRoot, scope: 'saved', id: config.id }, 'legacy:' + createHash('sha256').update(JSON.stringify(config)).digest('hex')));
		return connections.map(c => {
			const base: ListConnectionsResult = {
				id: c.key.id,
				kind: c.kind,
				family: (c.family ?? 'rdbms') as DriverFamily,
			};
			return c.label === undefined ? base : { ...base, label: c.label };
		});
	}
	catch {
		log.warn('legacy connection registry read failed');
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
}, transport?: TrustedRpcContext): Promise<SaveConnectionResult | {
	error: string;
}> {
	if (!transport?.connectionIdentity || !transport.daemonEpoch)
		return { error: 'invalid-input: Invalid connection request.' };
	const repoRoot = typeof params.repoRoot === 'string' ? params.repoRoot : '';
	if (repoRoot === '') {
		return { error: 'repoRoot is required' };
	}
	try { await assertSavedUpsertRoot(repoRoot); } catch (error) { const rejection = managementRejection(error); return { error: `${rejection.code}: ${rejection.message}` }; }
	const cfg = parseSaveInput(params.config);
	if (typeof cfg === 'string') {
		return { error: cfg };
	}
	const managed = savedManagementFor(repoRoot);
	if (managed) {
		const outcome = await managed.legacyUpsert(managementContext(repoRoot, transport), cfg);
		if (outcome.status === 'rejected')
			return { error: `${outcome.code}: ${outcome.message}` };
		const connection = managed.legacyProjection(cfg.id);
		const endpoint = connection?.publicConfig['endpoint'];
		return { id: cfg.id, family: connection?.family ?? cfg.family ?? familyOf(cfg.kind) ?? 'rdbms', wrotePath: connectionsPath(repoRoot), ...(typeof endpoint === 'string' ? { redactedUrl: endpoint } : {}) };
	}
	const validation = validateForFamily(cfg);
	if (validation !== null)
		return { error: validation };
	return withSavedRootGate(repoRoot, async () => {
		try { await assertSavedIdAvailable(repoRoot, cfg.id); } catch (error) { const rejection = managementRejection(error); return { error: `${rejection.code}: ${rejection.message}` }; }
		// Read and guard BEFORE any credential extraction. Only ENOENT is unmanaged empty.
		let loaded: Awaited<ReturnType<typeof loadConnections>>;
		try {
			loaded = await loadConnections(repoRoot);
		}
		catch {
			return { error: 'registry-unreadable: Connection registry cannot be read safely.' };
		}
		try {
			await assertUnmanagedWrite(connectionsPath(repoRoot), loaded.file);
		}
		catch {
			return { error: 'recovery-required: Connection management requires recovery.' };
		}
		const family: DriverFamily = cfg.family ?? familyOf(cfg.kind) ?? 'rdbms';
		const allowedRefs = referencedSecrets(loaded.file.connections.find(config => config.id === cfg.id && config.kind === cfg.kind));
		if ([...referencedSecrets(cfg)].some(ref => !allowedRefs.has(ref)))
			return { error: 'invalid-input: Invalid credential reference.' };
		const ref = makeSecretRef(repoIdOf(repoRoot), cfg.id);
		let urlForFile = cfg.url;
		if (family !== 'file' && cfg.url !== undefined && referencedSecrets(cfg.url).size === 0) {
			urlForFile = await extractUrlPassword(cfg.url, ref);
		}
		const next: ConnectionConfig = buildPersistedConfig(cfg, family, urlForFile, ref);
		const existing = loaded.file.connections;
		const filtered = existing.filter(c => c.id !== cfg.id);
		const wrotePath = await saveConnections(repoRoot, {
			...loaded.file,
			connections: [...filtered, next],
		});
		try {
			await reloadAll();
		}
		catch (err) {
			log.warn({ err: (err as Error).message }, 'pool reload after save failed');
		}
		let endpoint: unknown;
		try {
			endpoint = safeConnection(next, { repoRoot, scope: 'saved', id: next.id }, 'legacy').publicConfig['endpoint'];
		}
		catch { /* A committed legacy write still has its truthful success shape. */
		}
		const result: SaveConnectionResult = { id: next.id, family, wrotePath, ...(typeof endpoint === 'string' ? { redactedUrl: endpoint } : {}) };
		return result;
	});
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
}, transport?: TrustedRpcContext): Promise<DeleteConnectionResult | {
	error: string;
}> {
	if (!transport?.connectionIdentity || !transport.daemonEpoch)
		return { error: 'invalid-input: Invalid connection request.' };
	const repoRoot = typeof params.repoRoot === 'string' ? params.repoRoot : '', id = typeof params.id === 'string' ? params.id : '';
	if (!repoRoot || !id)
		return { error: 'repoRoot and id are required' };
	return withSavedRootGate(repoRoot, async () => {
		let loaded: Awaited<ReturnType<typeof loadConnections>>;
		try {
			loaded = await loadConnections(repoRoot);
		}
		catch {
			return { error: 'registry-unreadable: Connection registry cannot be read safely.' };
		}
		if (loaded.file._management || savedManagementFor(repoRoot))
			return { error: 'upgrade-required: Managed connection removal is not available.' };
		try {
			await assertUnmanagedWrite(connectionsPath(repoRoot), loaded.file);
		}
		catch {
			return { error: 'recovery-required: Connection management requires recovery.' };
		}
		if (!loaded.file.connections.some(config => config.id === id))
			return { id, removed: false };
		const wrotePath = await saveConnections(repoRoot, { ...loaded.file, connections: loaded.file.connections.filter(config => config.id !== id) });
		try {
			await deleteSecret(makeSecretRef(repoIdOf(repoRoot), id));
		}
		catch {
			log.warn('legacy credential cleanup failed');
		}
		try {
			await reloadAll();
		}
		catch {
			log.warn('pool reload after legacy delete failed');
		}
		return { id, removed: true, removedPath: wrotePath };
	});
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
export async function testConnectionRpc(params: {readonly repoRoot?: unknown; readonly config?: unknown}, context?: TrustedRpcContext): Promise<TestConnectionResult | {error:string}> {
 const repoRoot=typeof params.repoRoot==='string'?params.repoRoot:'';
 if(!context?.registerDrain)return {error:'Connection test transport is unavailable.'};
 try{assertDraftTestJson(params);assertNoRuntimeAuth(params);}catch{return {error:'Invalid connection request.'};}
 if(!repoRoot)return {error:'repoRoot is required'};
 const parsed=parseSaveInput(params.config);if(typeof parsed==='string')return {error:'Invalid connection request.'};
 let family:DriverFamily=parsed.family??familyOf(parsed.kind)??'rdbms';
 const began=performance.now();
 try {
  const result=await connectionTestSupervisor.run({requestId:randomUUID(),draftRevision:0,key:{repoRoot,scope:'saved',id:parsed.id},publicPatch:{},credentials:{}},context,async (signal,drained)=>{
   signal.throwIfAborted();let cfg:SaveConnectionInput=parsed;
   if(!cfg.url&&!cfg.path){
    const lease=await savedConnectionResolver.lease({lookupRoot:repoRoot,daemonEpoch:context.daemonEpoch},cfg.id);
    void drained.then(()=>lease.release(),()=>lease.release()).catch(()=>{});
    const existing=await loadConnections(repoRoot);signal.throwIfAborted();
    const match=existing.resolved.find(c=>c.id===cfg.id);if(!match)throw new Error();cfg=mergePersisted(cfg,match);
   }
   if(validateForFamily(cfg)!==null||!kindExists(cfg.kind))throw new Error();
   family=cfg.family??familyOf(cfg.kind)??'rdbms';
   const config=await prepareLegacyProbeConfig(cfg,family,repoRoot,signal);signal.throwIfAborted();
   return {config,credentialActions:{}};
  });
  return {ok:result.status==='reachable',kind:parsed.kind,family,tookMs:result.tookMs,...(result.safeMessage?{error:result.safeMessage}:{})};
 }catch{return {ok:false,kind:parsed.kind,family,tookMs:Math.max(0,performance.now()-began),error:'Connection test failed.'};}
}

function mergePersisted(input: SaveConnectionInput, persisted: ConnectionConfig): SaveConnectionInput {
	// Preserve the user-supplied input fields (in case the test has
	// edits over what's persisted), only fill in the holes from disk.
	const merged: {
		-readonly [K in keyof SaveConnectionInput]: SaveConnectionInput[K];
	} = { ...input };
	if (merged.kind === '' || merged.kind === undefined) {
		merged.kind = persisted.kind;
	}
	if (merged.family === undefined && persisted.family !== undefined) {
		merged.family = persisted.family;
	}
	if (merged.url === undefined && persisted.url !== undefined) {
		merged.url = persisted.url;
	}
	if (merged.path === undefined && persisted.path !== undefined) {
		merged.path = persisted.path;
	}
	if (merged.label === undefined && persisted.label !== undefined) {
		merged.label = persisted.label;
	}
	if (merged.schemaSource === undefined && persisted.schemaSource !== undefined) {
		merged.schemaSource = persisted.schemaSource;
	}
	if (merged.namespace === undefined && persisted.namespace !== undefined) {
		merged.namespace = persisted.namespace;
	}
	if (merged.options === undefined && persisted.options !== undefined) {
		merged.options = persisted.options;
	}
	if (merged.pii === undefined && persisted.pii !== undefined) {
		merged.pii = persisted.pii;
	}
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
	const out: {
		-readonly [K in keyof SaveConnectionInput]: SaveConnectionInput[K];
	} = {
		id: c['id'],
		kind: c['kind'],
	};
	if (c['family'] === 'rdbms' || c['family'] === 'kv' || c['family'] === 'file') {
		out.family = c['family'];
	}
	if (typeof c['label'] === 'string') {
		out.label = c['label'];
	}
	if (typeof c['url'] === 'string') {
		out.url = c['url'];
	}
	if (typeof c['path'] === 'string') {
		out.path = c['path'];
	}
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
	const family: DriverFamily = familyOf(cfg.kind) ?? cfg.family ?? 'rdbms';
	if (cfg.kind === 'sqlite') return cfg.path || cfg.url ? null : 'SQLite connections require path or url';
	if (family === 'file') {
		if (cfg.path === undefined || cfg.path === '') {
			return 'file connections require `path`';
		}
	}
	else {
		if (cfg.url === undefined || cfg.url === '') {
			return `${family} connections require \`url\``;
		}
	}
	return null;
}
function buildPersistedConfig(input: SaveConnectionInput, family: DriverFamily, url: string | undefined, ref: string): ConnectionConfig {
	const base: {
		-readonly [K in keyof ConnectionConfig]: ConnectionConfig[K];
	} = {
		id: input.id,
		kind: input.kind,
		family,
	};
	if (input.label !== undefined) {
		base.label = input.label;
	}
	if (url !== undefined) {
		base.url = url;
	}
	if (input.path !== undefined) {
		base.path = input.path;
	}
	if (input.schemaSource !== undefined) {
		base.schemaSource = input.schemaSource;
	}
	if (input.namespace !== undefined) {
		base.namespace = input.namespace;
	}
	if (input.options !== undefined) {
		base.options = input.options;
	}
	if (input.pii !== undefined) {
		base.pii = input.pii;
	}
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
export async function prepareLegacyProbeConfig(input: SaveConnectionInput, family: DriverFamily, repoRoot: string, signal?: AbortSignal): Promise<ConnectionConfig> {
	const base: {
		-readonly [K in keyof ConnectionConfig]: ConnectionConfig[K];
	} = {
		id: input.id,
		kind: input.kind,
		family,
	};
	if (input.label !== undefined) {
		base.label = input.label;
	}
	if (input.schemaSource !== undefined) {
		base.schemaSource = input.schemaSource;
	}
	if (input.namespace !== undefined) {
		base.namespace = input.namespace;
	}
	if (input.options !== undefined) {
		base.options = input.options;
	}
	if (input.pii !== undefined) {
		base.pii = input.pii;
	}
	if (input.path !== undefined) base.path = input.path;
	if (input.url !== undefined) base.url = input.url;
	const suppliedRefs = referencedSecrets(base);
	let allowedRefs: ReadonlySet<string> = new Set();
	if (suppliedRefs.size > 0) {
		signal?.throwIfAborted();
		const snapshot = await loadConnections(repoRoot);
		signal?.throwIfAborted();
		const stored = snapshot.file.connections.find(config => config.id === input.id && config.kind === input.kind);
		allowedRefs = referencedSecrets(stored);
		if ([...suppliedRefs].some(ref => !allowedRefs.has(ref)))
			throw new Error('Invalid credential reference');
	}
	const effective = await materializeDraft({ key: { scope: 'saved', repoRoot: resolve(repoRoot), id: input.id },
		mode: 'update', current: { config: base, revision: 'private-probe' }, expectedRevision: 'private-probe', publicPatch: {},
		readSecret: async (ref) => { signal?.throwIfAborted(); const value=allowedRefs.has(ref)?await credentialKeystore.getKey(ref):null;signal?.throwIfAborted();return value; },
	});
	return prepareRuntimeConfig(effective.config, repoRoot, signal);
}
