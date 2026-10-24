/** Serialized saved-connection application service. Routes remain disabled until maintenance gates install it. */
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import type { ConnectionKey, CredentialPatch, ManagementErrorCode, ManagementRequestContext, MutationOutcome, MutationRequest, OperationTicket, SafeConnection } from '../../shared/connection-management.js';
import { parseMutationRequest, ManagementInputError } from '../../shared/connection-management-wire.js';
import { canonicalRequestJson, SavedTicketAuthority, TicketError } from './management-tickets.js';
import { connectionsPath, loadConnections } from './config.js';
import { credentialValues, materializeDraft, ProfileError, safeConnection } from './driver-profiles.js';
import { CredentialGenerations, referencedSecrets } from './secrets.js';
import { ManagedRegistry, ManagedStoreError } from './managed-store.js';
import type { RegistrySnapshot } from './managed-store.js';
import type { DriverPool } from './pool.js';
import { ConnectionUseError } from './lease-gate.js';
const roots = new Map<string, Promise<void>>();
/** Shared by v2 and unmanaged legacy compatibility writes; never serializes different roots. */
export async function withSavedRootGate<T>(root: string, use: () => Promise<T>): Promise<T> {
	const previous = roots.get(root) ?? Promise.resolve();
	let release!: () => void;
	const tail = new Promise<void>(r => {
		release = r;
	});
	roots.set(root, tail);
	await previous;
	try {
		return await use();
	}
	finally {
		release();
		if (roots.get(root) === tail)
			roots.delete(root);
	}
}
const installed = new Map<string, SavedConnectionManagement>();
export function savedManagementFor(root: string): SavedConnectionManagement | undefined {
	return installed.get(root);
}
export async function dispatchSavedMutation(root: string, context: ManagementRequestContext, request: unknown): Promise<MutationOutcome> {
	const service = installed.get(root);
	return service ? service.mutate(context, request) : managementRejection(new ManagementServiceError('upgrade-required'));
}
/** Only the daemon maintenance owner calls this after all enablement evidence has passed. */
export function installSavedManagement(root: string, service: SavedConnectionManagement): () => void {
	if (service.root !== root || installed.has(root))
		throw new ManagedStoreError('recovery-required');
	installed.set(root, service);
	return () => {
		if (installed.get(root) === service)
			installed.delete(root);
	};
}
export class ManagementServiceError extends Error {
	constructor(readonly code: ManagementErrorCode) {
		super(code === 'registry-unreadable' ? 'Connection registry cannot be read safely.' : code === 'busy' ? 'Connection is currently in use.' : code === 'conflict' ? 'Connection revision changed.' : code === 'duplicate-id' ? 'Connection already exists.' : code === 'not-found' ? 'Connection is unavailable.' : code === 'reconciliation-required' ? 'The operation requires reconciliation.' : code === 'secret-unavailable' ? 'Connection credentials are unavailable.' : code === 'upgrade-required' ? 'Connection management is unavailable until maintenance completes.' : code === 'recovery-required' ? 'Connection management requires recovery.' : 'Invalid connection request.');
		this.name = 'ManagementServiceError';
	}
}
export function managementRejection(error: unknown): Extract<MutationOutcome, {
	status: 'rejected';
}> {
	const code = error instanceof ManagementServiceError || error instanceof ManagedStoreError || error instanceof ConnectionUseError || error instanceof TicketError || error instanceof ProfileError || error instanceof ManagementInputError ? error.code : 'recovery-required';
	const safe = new ManagementServiceError(code === 'unsupported-filesystem' ? 'recovery-required' : code);
	return { status: 'rejected', code: safe.code, message: safe.message };
}
export interface SavedManagementPorts {
	readonly root: string;
	readonly store: ManagedRegistry;
	readonly tickets: SavedTicketAuthority;
	readonly generations: CredentialGenerations;
	readonly pool: DriverPool;
	readonly enabled: () => Promise<boolean>;
	readonly isRegistered: (root: string) => Promise<boolean>;
	readonly activate: (id: string, revision: string) => Promise<void>;
	readonly readSecret: (ref: string) => Promise<string | null>;
}
export class SavedConnectionManagement {
	readonly root: string;
	readonly #lastCommitted = new Map<string, SafeConnection>();
	private constructor(private readonly ports: SavedManagementPorts) {
		this.root = ports.root;
	}
	static async create(ports: SavedManagementPorts): Promise<SavedConnectionManagement> {
		if (await realpath(ports.root) !== ports.root || ports.store.path !== connectionsPath(ports.root))
			throw new ManagementServiceError('invalid-input');
		const service = new SavedConnectionManagement(ports);
		await service.current();
		return service;
	}
	private async current(): Promise<RegistrySnapshot> {
		if (!await this.ports.enabled())
			throw new ManagementServiceError('upgrade-required');
		if (!await this.ports.isRegistered(this.root))
			throw new ManagementServiceError('invalid-input');
		let loaded: Awaited<ReturnType<typeof loadConnections>>;
		try {
			loaded = await loadConnections(this.root);
		}
		catch {
			throw new ManagementServiceError('registry-unreadable');
		}
		const current = await this.ports.store.inspect();
		if (!current.file._management || JSON.stringify(loaded.file) !== JSON.stringify(current.file))
			throw new ManagementServiceError('recovery-required');
		const envelope = current.file._management;
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (!uuid.test(envelope.registryId) || !uuid.test(envelope.generation) || envelope.registryId !== this.ports.generations.journal.registryId || Object.values(envelope.revisions).some(revision => typeof revision !== 'string' || !uuid.test(revision)) || current.file.connections.some(c => !Object.hasOwn(envelope.revisions, c.id)))
			throw new ManagementServiceError('registry-unreadable');
		return current;
	}
	private context(context: ManagementRequestContext): void {
		if (!context.connectionIdentity || context.access.managementRepoRoot !== this.root || context.access.lookupRoot !== this.root || !context.access.daemonEpoch)
			throw new ManagementServiceError('invalid-input');
	}
	legacyProjection(id: string): SafeConnection | undefined {
		const value = this.#lastCommitted.get(id) ?? this.ports.pool.safeList().find(c => c.key.id === id);
		return value ? structuredClone(value) : undefined;
	}
	async list(context: ManagementRequestContext): Promise<readonly SafeConnection[]> {
		this.context(context);
		await this.current();
		await this.ports.pool.reload();
		return this.ports.pool.safeList();
	}
	async ticket(context: ManagementRequestContext, key: ConnectionKey, mode: OperationTicket['mode']): Promise<OperationTicket> {
		this.context(context);
		await this.current();
		return this.ports.tickets.issue(key, mode);
	}
	async mutate(context: ManagementRequestContext, value: unknown): Promise<MutationOutcome> {
		let request: MutationRequest;
		try {
			this.context(context);
			request = parseMutationRequest(JSON.parse(canonicalRequestJson(value)));
			if (request.key.repoRoot !== this.root || request.key.scope !== 'saved' || request.mode === 'remove')
				throw new ManagementServiceError('invalid-input');
		}
		catch (error) {
			return managementRejection(error);
		}
		return withSavedRootGate(this.root, () => this.apply(request));
	}
	private async apply(request: MutationRequest): Promise<MutationOutcome> {
		let barrier: (() => void) | undefined;
		let committed: Extract<MutationOutcome, {
			status: 'committed';
		}> | undefined;
		try {
			const current = await this.current();
			const envelope = current.file._management!;
			const existing = current.file.connections.find(c => c.id === request.key.id);
			if (request.mode === 'create' && existing)
				throw new ManagementServiceError('duplicate-id');
			if (request.mode === 'update' && !existing)
				throw new ManagementServiceError('not-found');
			if (request.mode === 'update' && envelope.revisions[request.key.id] !== request.expectedRevision)
				throw new ManagementServiceError('conflict');
			if (envelope.receipts[request.operationId])
				throw new ManagementServiceError('reconciliation-required');
			await this.ports.pool.reload();
			barrier = this.ports.pool.beginMutation(request.key.id, request.mode, request.expectedRevision);
			const requestMac = await this.ports.tickets.requestMac(request);
			await this.ports.generations.assertReady();
			const effective = await materializeDraft({ key: request.key, mode: request.mode === 'create' ? 'create' : 'update', ...(existing ? { current: { config: existing, revision: envelope.revisions[request.key.id]! } } : {}), ...(request.expectedRevision === undefined ? {} : { expectedRevision: request.expectedRevision }), publicPatch: request.publicPatch ?? {}, credentials: request.credentials ?? {}, readSecret: this.ports.readSecret });
			const staged = await this.ports.generations.stage({ operationId: request.operationId, effective: effective.config, previous: existing, actions: effective.credentialActions });
			const revision = randomUUID();
			const outcome = { operationId: request.operationId, revision, registration: 'persisted' as const, activation: 'pending' as const, credentialCleanup: 'pending' as const };
			const next = { ...current.file, connections: existing ? current.file.connections.map(c => c.id === request.key.id ? staged.config : c) : [...current.file.connections, staged.config], _management: { ...envelope, generation: randomUUID(), revisions: { ...envelope.revisions, [request.key.id]: revision }, receipts: { ...envelope.receipts, [request.operationId]: { ticket: request.ticket, requestMac, outcome, cleanupRefs: staged.cleanupRefs } } } };
			await this.ports.store.commit(current, next);
			committed = { status: 'committed', value: outcome };
			this.#lastCommitted.set(request.key.id, safeConnection(staged.config, request.key, revision));
			let cleanup: 'complete' | 'pending' = 'pending';
			try {
				const recovery = await this.ports.generations.recover();
				cleanup = recovery.find(r => r.operationId === request.operationId)?.cleanup ?? 'complete';
			}
			catch {
				cleanup = 'pending';
			}
			try {
				await this.ports.pool.reload();
			}
			catch {
				barrier();
				barrier = undefined;
				return { status: 'committed', value: { ...outcome, activation: 'failed', credentialCleanup: cleanup } };
			}
			barrier();
			barrier = undefined;
			let activation: 'active' | 'failed' = 'active';
			try {
				await this.ports.activate(request.key.id, revision);
			}
			catch {
				activation = 'failed';
			}
			return { status: 'committed', value: { ...outcome, activation, credentialCleanup: cleanup } };
		}
		catch (error) {
			return committed ?? managementRejection(error);
		}
		finally {
			barrier?.();
		}
	}
	async legacyUpsert(context: ManagementRequestContext, config: ConnectionConfig): Promise<MutationOutcome> {
		try {
			this.context(context);
			config = JSON.parse(canonicalRequestJson(config)) as ConnectionConfig;
		}
		catch (error) {
			return managementRejection(error);
		}
		return withSavedRootGate(this.root, async () => {
			try {
				const current = await this.current();
				const previous = current.file.connections.find(c => c.id === config.id);
				if (previous && previous.kind !== config.kind)
					throw new ManagementServiceError('invalid-input');
				const key: ConnectionKey = { repoRoot: this.root, scope: 'saved', id: config.id };
				const safe = safeConnection(config, key, 'draft');
				if (safe.readOnly)
					throw new ManagementServiceError('invalid-input');
				if (config.family !== undefined && config.family !== (previous?.family ?? safe.registeredFamily))
					throw new ManagementServiceError('invalid-input');
				const raw = credentialValues(config);
				const prior = previous ? credentialValues(previous) : {};
				const credentials: Record<string, CredentialPatch> = {};
				for (const [slot, value] of Object.entries(raw)) {
					const supplied = slot.startsWith('url.') ? config.url !== undefined : config.options !== undefined && Object.hasOwn(config.options, slot.slice(8));
					if (!supplied || JSON.stringify(value) === JSON.stringify(prior[slot]))
						continue;
					if (referencedSecrets(value).size)
						throw new ManagementServiceError('invalid-input');
					credentials[slot] = value === undefined || value === '' ? { action: 'clear' } : { action: 'replace', value: typeof value === 'string' ? value : JSON.stringify(value) };
				}
				const mode = previous ? 'update' : 'create';
				const ticket = await this.ports.tickets.issue(key, mode);
				return this.apply({ ticket, operationId: ticket.operationId, key, mode, ...(previous ? { expectedRevision: current.file._management!.revisions[config.id]! } : {}), publicPatch: { ...safe.publicConfig, kind: config.kind }, credentials });
			}
			catch (error) {
				return managementRejection(error);
			}
		});
	}
}
