import { DriverLogPolicyError } from './driver-log-policy.js';
import { assertSavedIdAvailable } from './connection-reservations.js';
/** Serialized saved-connection application service. Routes remain disabled until maintenance gates install it. */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import type { ConnectionKey, CredentialPatch, ManagementErrorCode, ManagementRequestContext, MutationOutcome, MutationRequest, OperationTicket, SafeConnection, CommittedOutcome, OperationStatus, ActivationRetry, CommittedReceipt, DraftTestRequest, EffectiveDraft, RemovalState } from '../../shared/connection-management.js';
import { parseMutationRequest, parseOperationTicket, parseConnectionKey, parseRemovalStateRequest, ManagementInputError } from '../../shared/connection-management-wire.js';
import { projectRemovalState } from '../../shared/connection-removal.js';
import { canonicalRequestJson, SavedTicketAuthority, TicketError } from './management-tickets.js';
import { connectionsPath, loadConnections } from './config.js';
import { credentialValues, materializeDraft, ProfileError, safeConnection } from './driver-profiles.js';
import { CredentialGenerations, referencedSecrets } from './secrets.js';
import { ManagedRegistry, ManagedStoreError } from './managed-store.js';
import type { RegistrySnapshot } from './managed-store.js';
import type { DriverPool } from './pool.js';
import { ConnectionUseError } from './lease-gate.js';
import { prepareRuntimeConfig } from './runtime-config.js';
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
	const code = error instanceof DriverLogPolicyError || error instanceof ManagementServiceError || error instanceof ManagedStoreError || error instanceof ConnectionUseError || error instanceof TicketError || error instanceof ProfileError || error instanceof ManagementInputError ? error.code : 'recovery-required';
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
	readonly probeMetadataReady?: (() => Promise<RegistrySnapshot>) | undefined;
	readonly isRegistered: (root: string) => Promise<boolean>;
	readonly activate: (id: string, revision: string) => Promise<void>;
	readonly readSecret: (ref: string) => Promise<string | null>;
}
export class SavedConnectionManagement {
	readonly root: string;
	readonly #lastCommitted = new Map<string, SafeConnection>();
	readonly #inflight = new Map<string, {
		canonical: string;
		ticket: OperationTicket;
		promise: Promise<MutationOutcome>;
	}>();
	readonly #phase = new Map<string, CommittedOutcome>();
	/** Exact prepared ownership retained if the registry commit cannot yet be classified. */
	readonly #pendingRemovals = new Map<string, { readonly ticket: OperationTicket; readonly requestMac: string; readonly prepared: object; readonly oldRevision: string }>();
	/** Index into the existing pool's cleanup ownership, never a new SDK/config store. */
	readonly #removalRevisions = new Map<string, string>();
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
	private async current(reconcile = false): Promise<RegistrySnapshot> {
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
		const current = await (reconcile ? this.ports.store.reconcile() : this.ports.store.inspect());
		if (!current.file._management || JSON.stringify(loaded.file) !== JSON.stringify(current.file))
			throw new ManagementServiceError('recovery-required');
		return this.validateSnapshot(current);
	}
	private validateSnapshot(current: RegistrySnapshot): RegistrySnapshot {
		const envelope = current.file._management;
		if (!envelope) throw new ManagementServiceError('recovery-required');
		const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		if (!uuid.test(envelope.registryId) || !uuid.test(envelope.generation) || envelope.registryId !== this.ports.generations.journal.registryId || Object.values(envelope.revisions).some(revision => typeof revision !== 'string' || !uuid.test(revision)) || current.file.connections.some(c => !Object.hasOwn(envelope.revisions, c.id)))
			throw new ManagementServiceError('registry-unreadable');
		for (const [id, receipt] of Object.entries(envelope.receipts)) {
			try {
				if (!uuid.test(id) || !receipt || typeof receipt !== 'object' || Object.keys(receipt).sort().join(',') !== 'cleanupRefs,outcome,requestMac,ticket' || !/^[A-Za-z0-9_-]{43}$/.test(receipt.requestMac))
					throw new Error();
				const ticket = parseOperationTicket(receipt.ticket);
				const outcome = receipt.outcome;
				if (ticket.operationId !== id || ticket.lookupRoot !== this.root || ticket.scope !== 'saved' || !/^[A-Za-z0-9_-]{43}$/.test(ticket.signature) || !outcome || Object.keys(outcome).sort().join(',') !== 'activation,credentialCleanup,operationId,registration,revision' || outcome.operationId !== id || !uuid.test(outcome.revision) || !['persisted', 'removed'].includes(outcome.registration) || !['active', 'pending', 'failed', 'not-applicable'].includes(outcome.activation) || !['complete', 'pending'].includes(outcome.credentialCleanup) || !Array.isArray(receipt.cleanupRefs) || receipt.cleanupRefs.some(ref => typeof ref !== 'string' || !this.ports.generations.owns(ref)))
					throw new Error();
			}
			catch {
				throw new ManagementServiceError('registry-unreadable');
			}
		}
		return current;
	}
	private context(context: ManagementRequestContext): void {
		if (!context.connectionIdentity || context.access.managementRepoRoot !== this.root || context.access.lookupRoot !== this.root || !context.access.daemonEpoch)
			throw new ManagementServiceError('invalid-input');
	}
	/** Readonly selected draft preparation; metadata admission must precede every keychain read. */
	async prepareDraft(context: ManagementRequestContext, request: Pick<DraftTestRequest,'key'|'expectedRevision'|'publicPatch'|'credentials'>, signal?: AbortSignal, drained?: Promise<void>): Promise<EffectiveDraft> {
		this.context(context);
		const key = parseConnectionKey(request.key);
		if (key.repoRoot !== this.root || key.scope !== 'saved') throw new ManagementServiceError('invalid-input');
		return withSavedRootGate(this.root, async () => {
			signal?.throwIfAborted();
			if (!this.ports.probeMetadataReady) throw new ManagementServiceError('upgrade-required');
			const current = this.validateSnapshot(await this.ports.probeMetadataReady());
			signal?.throwIfAborted();
			if ((await this.ports.generations.journal.pending()).length) throw new ManagementServiceError('recovery-required');
			signal?.throwIfAborted();
			const config = current.file.connections.find(c => c.id === key.id), revision = current.file._management!.revisions[key.id];
			const editing = request.expectedRevision !== undefined;
			if (editing && !config) throw new ManagementServiceError('not-found');
			if (!editing && config) throw new ManagementServiceError('duplicate-id');
			if (editing && revision !== request.expectedRevision) throw new ManagementServiceError('conflict');
   if(editing && drained){
    const lease=await this.ports.pool.lease(key.id);
    if(lease.revision!==revision){await lease.release();throw new ManagementServiceError('conflict');}
    // The supervisor resolves this only after preparation and the actual child close.
    void drained.then(()=>lease.release(),()=>lease.release()).catch(()=>{});
   }
			await this.ports.tickets.assertAvailable();
			signal?.throwIfAborted();
			const refs = referencedSecrets(config);
			if ([...refs].some(ref => !this.ports.generations.owns(ref))) throw new ManagementServiceError('recovery-required');
			const effective = await materializeDraft({ key, mode: editing ? 'update' : 'create', ...(config && revision ? {current:{config,revision}} : {}), ...(request.expectedRevision !== undefined ? {expectedRevision:request.expectedRevision}:{}), publicPatch:request.publicPatch, credentials:request.credentials,
				readSecret: async ref => { signal?.throwIfAborted(); if (!refs.has(ref) || !this.ports.generations.owns(ref)) throw new ManagementServiceError('secret-unavailable'); const value=await this.ports.readSecret(ref); signal?.throwIfAborted(); return value; } });
			signal?.throwIfAborted();
			return {...effective, config: await prepareRuntimeConfig(effective.config,this.root,signal)};
		});
	}
	legacyProjection(id: string): SafeConnection | undefined {
		const value = this.#lastCommitted.get(id) ?? this.ports.pool.safeList().find(c => c.key.id === id);
		return value ? structuredClone(value) : undefined;
	}
	private async cleanupState(receipt: CommittedReceipt, current: RegistrySnapshot): Promise<'complete' | 'pending'> {
		if ((await this.ports.generations.journal.pending()).some(r => r.operationId === receipt.ticket.operationId))
			return 'pending';
		if (receipt.outcome.credentialCleanup === 'complete')
			return 'complete';
		// Removal always prepared an empty staging journal before its atomic receipt.
		// No outstanding journal means its credential cleanup/finalization completed.
		if (receipt.outcome.registration === 'removed') return 'complete';
		const live = referencedSecrets(current.file.connections);
		for (const ref of receipt.cleanupRefs) {
			if (!live.has(ref) && await this.ports.readSecret(ref) !== null)
				return 'pending';
		}
		return 'complete';
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
			if (request.key.repoRoot !== this.root || request.key.scope !== 'saved')
				throw new ManagementServiceError('invalid-input');
		}
		catch (error) {
			return managementRejection(error);
		}
		const canonical = canonicalRequestJson(request);
		const prior = this.#inflight.get(request.operationId);
		if (prior)
			return prior.canonical === canonical ? prior.promise.then(value => structuredClone(value)) : managementRejection(new ManagementServiceError('operation-mismatch'));
		const promise = withSavedRootGate(this.root, () => this.apply(request));
		this.#inflight.set(request.operationId, { canonical, ticket: request.ticket, promise });
		try {
			return structuredClone(await promise);
		}
		finally {
			if (this.#inflight.get(request.operationId)?.promise === promise)
				this.#inflight.delete(request.operationId);
		}
	}
	private finishRemovalCommit(ticket: OperationTicket, oldRevision: string, prepared: object, outcome: CommittedOutcome): void {
		const cleanup = this.ports.pool.commitRemoval(prepared);
		this.#pendingRemovals.delete(ticket.operationId);
		if (this.#lastCommitted.get(ticket.connectionId)?.revision === oldRevision) this.#lastCommitted.delete(ticket.connectionId);
		this.#phase.set(ticket.operationId,outcome);
		if (this.ports.pool.removalCleanupPending(ticket.operationId,oldRevision)) {
			this.#removalRevisions.set(ticket.operationId,oldRevision);
			void cleanup.close().then(() => {
				if (this.#removalRevisions.get(ticket.operationId) === oldRevision) this.#removalRevisions.delete(ticket.operationId);
			}, () => {});
		}
	}
	/** Only a reconciled canonical precommit/replacement inode may release a prepared remove barrier. */
	private async reconcilePreparedRemoval(ticket: OperationTicket, current: RegistrySnapshot): Promise<void> {
		const pending = this.#pendingRemovals.get(ticket.operationId);
		if (!pending) return;
		if (canonicalRequestJson(ticket) !== canonicalRequestJson(pending.ticket)) throw new ManagementServiceError('operation-mismatch');
		const receipt = current.file._management!.receipts[ticket.operationId];
		if (receipt) {
			if (canonicalRequestJson(receipt.ticket) !== canonicalRequestJson(ticket) || receipt.requestMac !== pending.requestMac || receipt.outcome.registration !== 'removed' || receipt.outcome.activation !== 'not-applicable') throw new ManagementServiceError('recovery-required');
			this.finishRemovalCommit(ticket,pending.oldRevision,pending.prepared,receipt.outcome);
			return;
		}
		if (current.file._management!.revisions[ticket.connectionId] !== pending.oldRevision || !current.file.connections.some(config => config.id === ticket.connectionId)) throw new ManagementServiceError('recovery-required');
		const recovered = await this.ports.generations.recover();
		if (recovered.find(value => value.operationId === ticket.operationId)?.cleanup === 'pending') throw new ManagementServiceError('recovery-required');
		this.ports.pool.cancelRemoval(pending.prepared);
		this.#pendingRemovals.delete(ticket.operationId);
	}
	private async applyRemoval(request: MutationRequest, current: RegistrySnapshot): Promise<MutationOutcome> {
		let prepared: object | undefined;
		let attempted = false;
		let committed: CommittedOutcome | undefined;
		try {
			const requestMac = await this.ports.tickets.requestMac(request);
			const envelope = current.file._management!;
			const id = request.key.id, oldRevision = request.expectedRevision!;
			if (!current.file.connections.some(config => config.id === id)) throw new ManagementServiceError('not-found');
			if (envelope.revisions[id] !== oldRevision) throw new ManagementServiceError('conflict');
			await this.ports.pool.reload();
			prepared = this.ports.pool.prepareRemoval(id,oldRevision,request.operationId);
			const staged = await this.ports.generations.prepareRemoval({operationId:request.operationId,connectionId:id,expectedRevision:oldRevision});
			const outcome: CommittedOutcome = {operationId:request.operationId,revision:randomUUID(),registration:'removed',activation:'not-applicable',credentialCleanup:'pending'};
			const revisions = {...envelope.revisions}; delete revisions[id];
			const next = {...current.file,connections:current.file.connections.filter(config => config.id !== id),_management:{...envelope,generation:randomUUID(),revisions,
				receipts:{...envelope.receipts,[request.operationId]:{ticket:request.ticket,requestMac,outcome,cleanupRefs:staged.cleanupRefs}}}};
			this.#pendingRemovals.set(request.operationId,{ticket:request.ticket,requestMac,prepared,oldRevision});
			attempted = true;
			await this.ports.store.commit(current,next);
			committed = outcome;
			this.finishRemovalCommit(request.ticket,oldRevision,prepared,outcome);
			let credentialCleanup: 'complete'|'pending' = 'pending';
			try { credentialCleanup = (await this.ports.generations.recover()).find(value => value.operationId === request.operationId)?.cleanup ?? 'complete'; } catch { /* Committed truth survives cleanup failure. */ }
			const final = {...outcome,credentialCleanup}; this.#phase.set(request.operationId,final);
			return {status:'committed',value:final};
		} catch (error) {
			if (prepared && !attempted) this.ports.pool.cancelRemoval(prepared);
			// An attempted commit may have renamed the registry. Its barrier/token remain
			// owned until canonical same-ticket reconciliation classifies the result.
			return committed ? {status:'committed',value:committed} : managementRejection(attempted ? new ManagementServiceError('reconciliation-required') : error);
		}
	}
	private async apply(request: MutationRequest): Promise<MutationOutcome> {
		let barrier: (() => void) | undefined;
		let committed: Extract<MutationOutcome, {
			status: 'committed';
		}> | undefined;
		try {
			const pending = request.mode === 'remove' ? this.#pendingRemovals.get(request.operationId) : undefined;
			if (pending) {
				const mac = await this.ports.tickets.requestMac(request,{reconciliationOnly:true});
				if (!timingSafeEqual(Buffer.from(mac,'base64url'),Buffer.from(pending.requestMac,'base64url'))) throw new ManagementServiceError('operation-mismatch');
			}
			const current = await this.current(pending !== undefined);
			if (pending) await this.reconcilePreparedRemoval(request.ticket,current);
			const envelope = current.file._management!;
			const recorded = envelope.receipts[request.operationId];
			if (recorded) {
				const mac = await this.ports.tickets.requestMac(request, { reconciliationOnly: true });
				if (!timingSafeEqual(Buffer.from(mac, 'base64url'), Buffer.from(recorded.requestMac, 'base64url')))
					throw new ManagementServiceError('operation-mismatch');
				return { status: 'committed', value: { ...structuredClone(this.#phase.get(request.operationId) ?? recorded.outcome), credentialCleanup: await this.cleanupState(recorded, current) } };
			}
			if (this.ports.tickets.expired(request.ticket))
				throw new ManagementServiceError('reconciliation-required');
			if (request.mode === 'remove') return this.applyRemoval(request,current);
			if (request.mode === 'create') await assertSavedIdAvailable(this.root, request.key.id);
			const existing = current.file.connections.find(c => c.id === request.key.id);
			if (request.mode === 'create' && existing)
				throw new ManagementServiceError('duplicate-id');
			if (request.mode === 'update' && !existing)
				throw new ManagementServiceError('not-found');
			if (request.mode === 'update' && envelope.revisions[request.key.id] !== request.expectedRevision)
				throw new ManagementServiceError('conflict');
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
			let activation: 'active' | 'failed' = 'active';
			let poolReady = true;
			try {
				await this.ports.pool.reload();
			}
			catch {
				poolReady = false;
				activation = 'failed';
			}
			barrier();
			barrier = undefined;
			if (poolReady) {
				try {
					await this.ports.activate(request.key.id, revision);
				}
				catch {
					activation = 'failed';
				}
			}
			const final: CommittedOutcome = { ...outcome, activation, credentialCleanup: cleanup };
			const latest = this.ports.store.snapshot;
			const metadata = latest.file._management!;
			try {
				await this.ports.store.commit(latest, { ...latest.file, _management: { ...metadata, generation: randomUUID(), receipts: { ...metadata.receipts, [request.operationId]: { ...metadata.receipts[request.operationId]!, outcome: final } } } });
				this.#phase.set(request.operationId, structuredClone(final));
				return { status: 'committed', value: final };
			}
			catch {
				// Commitment is already durable. Until finalization can be reconciled, report the persisted pending phase.
				return committed;
			}
		}
		catch (error) {
			return committed ?? managementRejection(error);
		}
		finally {
			barrier?.();
		}
	}
	async status(context: ManagementRequestContext, value: unknown): Promise<OperationStatus> {
		try {
			this.context(context);
			const { ticket, expired } = await this.ports.tickets.inspect(value);
			const inFlight = this.#inflight.get(ticket.operationId);
			if (inFlight) {
				if (canonicalRequestJson(inFlight.ticket) !== canonicalRequestJson(ticket))
					throw new ManagementServiceError('operation-mismatch');
				const phase = this.#phase.get(ticket.operationId);
				if (ticket.mode === 'remove' && phase?.registration === 'removed') return {status:'committed',value:structuredClone(phase)};
				return { status: 'pending' };
			}
			return await withSavedRootGate(this.root, async () => {
				let current = await this.current(true);
				if (ticket.mode === 'remove') await this.reconcilePreparedRemoval(ticket,current);
				const receipt = current.file._management!.receipts[ticket.operationId];
				if (receipt && canonicalRequestJson(receipt.ticket) !== canonicalRequestJson(ticket))
					throw new ManagementServiceError('operation-mismatch');
				const ownPreparation = (await this.ports.generations.journal.pending()).some(record => record.operationId === ticket.operationId);
				const recovered = ticket.mode !== 'remove' || ownPreparation ? await this.ports.generations.recover() : [];
				current = await this.current();
				const canonical = current.file._management!.receipts[ticket.operationId];
				if (canonical) {
					await this.ports.store.cleanupCommittedTemp(ticket.operationId);
					const cleanup = recovered.find(r => r.operationId === ticket.operationId)?.cleanup ?? await this.cleanupState(canonical, current);
					const outcome = { ...structuredClone(this.#phase.get(ticket.operationId) ?? canonical.outcome), credentialCleanup: cleanup };
					this.#phase.set(ticket.operationId, structuredClone(outcome));
					return { status: 'committed', value: outcome };
				}
				if (expired)
					return { status: 'reconciliation-required' };
				if ((await this.ports.generations.journal.pending()).some(record => record.operationId === ticket.operationId))
					return { status: 'pending' };
				return { status: 'not-seen' };
			});
		}
		catch {
			return { status: 'reconciliation-required' };
		}
	}
	private async removalTicket(context: ManagementRequestContext, value: OperationTicket): Promise<OperationTicket> {
		this.context(context);
		const parsed = parseRemovalStateRequest({ticket:value});
		return (await this.ports.tickets.inspect(structuredClone(parsed.ticket))).ticket;
	}
	private removalResourceState(operationId: string): 'complete'|'pending' {
		const revision = this.#removalRevisions.get(operationId);
		if (revision === undefined) return 'complete'; // Old-process SDK handles do not survive restart.
		if (this.ports.pool.removalCleanupPending(operationId,revision)) return 'pending';
		this.#removalRevisions.delete(operationId);
		return 'complete';
	}
	async removalState(context: ManagementRequestContext, value: OperationTicket): Promise<RemovalState> {
		const ticket = await this.removalTicket(context,value);
		const status = await this.status(context,ticket);
		return projectRemovalState(ticket,status,this.removalResourceState(ticket.operationId));
	}
	async retryRemovalCleanup(context: ManagementRequestContext, value: OperationTicket): Promise<RemovalState> {
		const ticket = await this.removalTicket(context,value);
		const status = await this.status(context,ticket);
		if (status.status !== 'committed') return projectRemovalState(ticket,status);
		if (status.value.registration !== 'removed' || status.value.operationId !== ticket.operationId) throw new ManagementServiceError('operation-mismatch');
		const revision = this.#removalRevisions.get(ticket.operationId);
		// SDK close runs outside the root gate. A paused close must not block a new
		// generation or a status query; the pool joins concurrent retries exactly.
		if (revision !== undefined) {
			try { await this.ports.pool.retryRemovalCleanup(ticket.operationId,revision); } catch { /* The projection retains pending cleanup. */ }
		}
		return this.removalState(context,ticket);
	}
	async retryActivation(context: ManagementRequestContext, value: ActivationRetry): Promise<MutationOutcome> {
		try {
			this.context(context);
			value = JSON.parse(canonicalRequestJson(value)) as ActivationRetry;
			parseConnectionKey(value.key);
			if (Object.keys(value).sort().join(',') !== 'committedRevision,key' || value.key.repoRoot !== this.root || value.key.scope !== 'saved')
				throw new ManagementServiceError('invalid-input');
		}
		catch (error) {
			return managementRejection(error);
		}
		return withSavedRootGate(this.root, async () => {
			try {
				const current = await this.current();
				const envelope = current.file._management!;
				if (envelope.revisions[value.key.id] !== value.committedRevision || !current.file.connections.some(c => c.id === value.key.id))
					throw new ManagementServiceError('conflict');
				const receipt = Object.values(envelope.receipts).find(r => r.ticket.connectionId === value.key.id && r.outcome.revision === value.committedRevision);
				if (!receipt)
					throw new ManagementServiceError('not-found');
				await this.ports.tickets.inspect(receipt.ticket);
				await this.ports.pool.reload();
				let activation: 'active' | 'failed' = 'active';
				try {
					await this.ports.activate(value.key.id, value.committedRevision);
				}
				catch {
					activation = 'failed';
				}
				const outcome = { ...(this.#phase.get(receipt.ticket.operationId) ?? receipt.outcome), activation, credentialCleanup: await this.cleanupState(receipt, current) };
				this.#phase.set(outcome.operationId, structuredClone(outcome));
				return { status: 'committed', value: outcome };
			}
			catch (error) {
				return managementRejection(error);
			}
		});
	}
	/** Maintenance only. Expired tickets without receipts are never made executable again. */
	async pruneReceipts(context: ManagementRequestContext): Promise<void> {
		this.context(context);
		await withSavedRootGate(this.root, async () => {
			if (this.#pendingRemovals.size) throw new ManagementServiceError('recovery-required');
			const current = await this.current();
			const envelope = current.file._management!;
			const pending = new Set((await this.ports.generations.journal.pending()).map(r => r.operationId));
			const receipts = { ...envelope.receipts };
			const removed: string[] = [];
			for (const [id, receipt] of Object.entries(receipts)) {
				const inspected = await this.ports.tickets.inspect(receipt.ticket);
				if (inspected.expired && !pending.has(id) && !(receipt.ticket.mode === 'remove' && this.removalResourceState(id) === 'pending') && await this.cleanupState(receipt, current) === 'complete') {
					delete receipts[id];
					removed.push(id);
				}
			}
			if (removed.length) {
				await this.ports.store.commit(current, { ...current.file, _management: { ...envelope, generation: randomUUID(), receipts } });
				for (const id of removed)
					this.#phase.delete(id);
			}
		});
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
				await assertSavedIdAvailable(this.root, config.id);
				const current = await this.current();
				const previous = current.file.connections.find(c => c.id === config.id);
				if (previous && previous.kind !== config.kind)
					throw new ManagementServiceError('invalid-input');
				const key: ConnectionKey = { repoRoot: this.root, scope: 'saved', id: config.id };
				// A legacy label/option edit may omit endpoint and credentials. Project the
				// complete server snapshot; credential intent still comes only from supplied fields below.
				const projection = previous ? { ...previous, ...config,
					...(previous.options || config.options ? { options: { ...previous.options, ...config.options } } : {}),
				} : config;
				const safe = safeConnection(projection, key, 'draft');
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
