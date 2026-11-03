/** sc5 control protocol and transport admission. No caller JSON grants authority. */
import { sessionConnectionExecution } from '../shared/step-context.js';
import { CONNECTION_SESSION_METHODS } from '../shared/connection-management.js';
import type { ConnectionSessionMethod } from '../shared/connection-management.js';
import { ManagementInputError, parseSessionOpen, parseSessionResume, parseSessionAttach, parseSessionDelegate, parseSessionEmpty, parseDraftTestRequest, parseTestCancellation } from '../shared/connection-management-wire.js';
import { TEMPORARY_MANAGEMENT_METHODS, parseTemporaryManagement, temporaryRemovalState, retryTemporaryRemovalCleanup } from './db/session-management.js';
import { bindSessionConnectionResolver, savedConnectionResolver } from './db/pool-cache.js';
import type { ConnectionAccessContext, MutationOutcome, DraftTestRequest, EffectiveDraft } from '../shared/connection-management.js';
import { installConnectionReservations } from './db/connection-reservations.js';
import { savedConnectionIds } from './db/managed-store.js';
import { connectionsPath } from './db/config.js';
import { materializeDraft } from './db/driver-profiles.js';
import { withSavedRootGate } from './db/management.js';
import { createTemporaryOverlay, TemporaryConnectionOverlay } from './db/session-entries.js';
import { ConnectionSessionOwner } from './db/session-owner.js';
import type { SessionOwnerPorts } from './db/session-owner.js';
import { ManagementServiceError, managementRejection } from './db/management.js';
import { connectionManagementEnablement } from './db/management-enablement.js';
import { lookupRepoId } from '../db/repos.js';
import type { ForwardRequest, DeliverEnvelope } from './server.js';
import type { TrustedRpcContext, TrustedConnectionSession } from './request-context.js';
import type { LocalRequestEnvelope } from './threads/channel.js';

type ChannelKind = 'control' | 'data' | 'unknown';
interface Claim { readonly kind: 'control' | 'data'; readonly root: string; readonly handle: string }
export interface SessionRpcRuntime {
	call(method: ConnectionSessionMethod, value: unknown, context: TrustedRpcContext): Promise<unknown>;
	ready(): Promise<boolean>;
 removalReady?(): Promise<boolean>;
 probeContext?(context: TrustedRpcContext, request: DraftTestRequest): Promise<TrustedRpcContext>;
 prepareTemporary?(request: DraftTestRequest, context: TrustedRpcContext, signal: AbortSignal, drained?: Promise<void>): Promise<EffectiveDraft>;
	manage?(method: string, value: unknown, context: TrustedRpcContext): Promise<unknown>;
}
export interface ConnectionSessionRpcPorts<Overlay> extends Omit<SessionOwnerPorts<Overlay>, 'daemonEpoch'> {
	readonly enabled: () => Promise<boolean>;
 readonly removalEnabled?: (() => Promise<boolean>) | undefined;
}
const SESSION_METHODS: ReadonlySet<string> = new Set(CONNECTION_SESSION_METHODS);
const SAFE_METADATA: ReadonlySet<string> = new Set(['db.connections.v2.capabilities', 'db.connections.v2.drivers', 'db.listDriverKinds']);
const PROBE_METHODS: ReadonlySet<string> = new Set(['db.connections.v2.test', 'db.connections.v2.cancelTest']);
const PREFIX = 'db.connections.v2.session.';
const fail = (code: 'session-expired' | 'upgrade-required' | 'unsupported-temporary') => new ManagementServiceError(code);

export class ConnectionSessionRpc<Overlay> implements SessionRpcRuntime {
	readonly #ports: ConnectionSessionRpcPorts<Overlay>;
	readonly #uninstallReservations: () => void;
	readonly #intents = new Map<string, ChannelKind>();
	readonly #claims = new Map<string, Claim>();
	#owner: ConnectionSessionOwner<Overlay> | undefined;
	#epoch: string | undefined;
	#closed = false;
	#drained: Promise<void> | undefined;
	constructor(ports: ConnectionSessionRpcPorts<Overlay>) {
		this.#ports = Object.freeze({ ...ports });
		this.#uninstallReservations = installConnectionReservations({
			ready: async () => this.#owner?.hasReservations || await this.ready(), isRegistered: ports.isRegistered,
			contains: (root, id) => this.#owner?.hasOverlayEntry(root, overlay => overlay instanceof TemporaryConnectionOverlay && overlay.reserves(id)) ?? false
		});
	}
	async ready(): Promise<boolean> { return !this.#closed && await this.#ports.enabled() && !this.#closed; }
 async removalReady(): Promise<boolean> { return await this.ready() && await (this.#ports.removalEnabled ?? (async () => (await connectionManagementEnablement(undefined, ['sc5','sc6'])).ready))() && !this.#closed; }
	#context(context: TrustedRpcContext): void {
		if (this.#closed || !context?.connectionIdentity || !context.daemonEpoch || context.signal?.aborted || context.connectionSignal?.aborted) throw fail('session-expired');
		if (this.#epoch !== undefined && context.daemonEpoch !== this.#epoch) throw fail('session-expired');
	}
	#mark(context: TrustedRpcContext, method: string): void {
		this.#context(context);
		const kind: ChannelKind = !SESSION_METHODS.has(method) ? 'unknown' : method.endsWith('.attach') ? 'data' : 'control';
		const old = this.#intents.get(context.connectionIdentity);
		if (old !== undefined && old !== kind) throw fail('session-expired');
		this.#intents.set(context.connectionIdentity, kind);
	}
	#ownerFor(context: TrustedRpcContext): ConnectionSessionOwner<Overlay> {
		this.#context(context);
		if (!this.#owner) {
			this.#epoch = context.daemonEpoch;
			this.#owner = new ConnectionSessionOwner({ daemonEpoch: context.daemonEpoch, isRegistered: this.#ports.isRegistered,
				createOverlay: this.#ports.createOverlay, ...(this.#ports.dropOverlay ? { dropOverlay: this.#ports.dropOverlay } : {}), ...(this.#ports.monotonicNow ? { monotonicNow: this.#ports.monotonicNow } : {}), ...(this.#ports.wallNow ? { wallNow: this.#ports.wallNow } : {}) });
		}
		return this.#owner;
	}
	async call(method: ConnectionSessionMethod, value: unknown, context: TrustedRpcContext): Promise<unknown> {
		try {
			this.#mark(context, method);
			// Decode before any owner/registry access. The method is not an input flag.
			const request = method.endsWith('.open') ? parseSessionOpen(value)
				: method.endsWith('.resume') ? parseSessionResume(value)
				: method.endsWith('.attach') ? parseSessionAttach(value)
				: method.endsWith('.delegate') ? parseSessionDelegate(value)
				: (parseSessionEmpty(value), undefined);
			if (!SESSION_METHODS.has(method)) throw fail('upgrade-required');
			// Cleanup must remain available when release evidence is withdrawn.
			if (method !== 'db.connections.v2.session.end' && !await this.ready()) throw fail('upgrade-required');
			this.#context(context);
			const owner = method === 'db.connections.v2.session.end' ? this.#owner : this.#ownerFor(context);
			if (!owner) throw fail('session-expired');
			if (method === 'db.connections.v2.session.open') {
				const { repoRoot } = request as ReturnType<typeof parseSessionOpen>;
				const result = await owner.open(context, repoRoot);
				this.#context(context); owner.controlRoot(context);
				this.#claims.set(context.connectionIdentity, { kind: 'control', root: repoRoot, handle: result.sessionHandle });
				return result;
			}
			if (method === 'db.connections.v2.session.resume') {
				const result = owner.resume(context, request as ReturnType<typeof parseSessionResume>);
				this.#claims.set(context.connectionIdentity, { kind: 'control', root: owner.controlRoot(context), handle: result.sessionHandle });
				return result;
			}
			if (method === 'db.connections.v2.session.attach') {
				const binding = await owner.attach(context, request as ReturnType<typeof parseSessionAttach>);
				this.#context(context); binding.assertActive();
				this.#claims.set(context.connectionIdentity, { kind: 'data', root: binding.access.lookupRoot, handle: binding.access.sessionHandle! });
				return { attached: true, daemonEpoch: context.daemonEpoch, repoRoot: binding.access.lookupRoot,
					audience: binding.audience, controlGeneration: binding.controlGeneration };
			}
			if (method === 'db.connections.v2.session.delegate') {
				const { repoRoot, audience } = request as ReturnType<typeof parseSessionDelegate>;
				const result = await owner.delegate(context, repoRoot, audience);
				this.#context(context); owner.controlRoot(context);
				this.#claims.set(context.connectionIdentity, { kind: 'control', root: repoRoot, handle: result.sessionHandle });
				return result;
			}
			if (method === 'db.connections.v2.session.heartbeat') return owner.heartbeat(context);
			const endedClaim = this.#claims.get(context.connectionIdentity);
			await owner.end(context);
			if (this.#claims.get(context.connectionIdentity) === endedClaim) this.#claims.delete(context.connectionIdentity);
			return { status: 'ended' };
		} catch (error) { return managementRejection(error); }
	}
	async #binding(request: LocalRequestEnvelope, selectedRoot?: string): Promise<TrustedConnectionSession> {
		const context = request.trustedContext;
		if (!context) throw fail('session-expired');
		this.#context(context);
		const claim = this.#claims.get(context.connectionIdentity);
		if (!claim || !this.#owner) throw fail('session-expired');
		let root = selectedRoot ?? claim.root;
		if (selectedRoot === undefined) {
			if (request.method === 'step.call') { /* Root authority comes only from the attached transport. */ }
			else if (request.method === 'db.connections.v2.capabilities' && request.params !== undefined && request.params !== null && Object.keys(request.params as object).length) root = parseSessionOpen(request.params).repoRoot;
			else if (request.method === 'db.connections.v2.cancelTest') parseTestCancellation(request.params);
			else parseSessionEmpty(request.params);
		}
		if (claim.kind === 'data') {
			if (root !== claim.root) throw fail('session-expired');
			const binding = this.#owner.dataBinding(context, root);
			if (binding.access.sessionHandle !== claim.handle) throw fail('session-expired');
			return binding;
		}
		const binding = await this.#owner.controlBinding(context, root);
		if (binding.access.sessionHandle !== claim.handle) throw fail('session-expired');
		return binding;
	}
	async manage(method: string, value: unknown, context: TrustedRpcContext): Promise<unknown> {
		try {
			const command = parseTemporaryManagement(method, value);
			if (!await this.ready()) throw fail('upgrade-required');
			const binding = await this.#binding({ kind: 'request', requestId: 'local-management', method, params: value, stream: false, trustedContext: context }, command.root);
			if (binding.audience !== 'workbench-ui' || !this.#owner) throw fail('upgrade-required');
			const { overlay, ledger, binding: current } = await this.#owner.management(context, command.root);
			if (!(overlay instanceof TemporaryConnectionOverlay)) throw fail('upgrade-required');
			const assertRequest = () => { this.#context(context); context.assertRequestActive?.(); binding.assertActive(); current.assertActive(); };
   const removal = command.method === 'db.connections.v2.removalState' || command.method === 'db.connections.v2.retryRemovalCleanup' || (command.method === 'db.connections.v2.ticket' && command.mode === 'remove') || (command.method === 'db.connections.v2.mutate' && command.request.mode === 'remove') || (command.method === 'db.connections.v2.status' && command.ticket.mode === 'remove');
   if(removal && !await this.removalReady())throw fail('upgrade-required');
			assertRequest();
			const signal = AbortSignal.any([binding.signal, ...(context.signal ? [context.signal] : []), ...(context.connectionSignal ? [context.connectionSignal] : [])]);
			if (command.method === 'db.connections.v2.list') {
				const access = await this.accessFor(context, command.root);
				const result = await savedConnectionResolver.list(access);
				assertRequest(); return result;
			}
			const activate = async (id: string, revision: string): Promise<MutationOutcome> => {
				assertRequest(); if (overlay.read(id).revision !== revision) throw new ManagementServiceError('conflict');
				const outcome = ledger.outcome(revision);
				try {
					const privateResolver = overlay.resolver(current.access, { assertActive: assertRequest, signal, ...(context.registerDrain ? { registerDrain: context.registerDrain } : {}) });
					await privateResolver.withConnection(current.access, id, async () => {});
					assertRequest(); ledger.activation(outcome.operationId, revision, 'active');
				} catch {
					assertRequest(); ledger.activation(outcome.operationId, revision, 'failed');
				}
				return { status: 'committed', value: ledger.outcome(revision) };
			};
			if(command.method==='db.connections.v2.removalState')return temporaryRemovalState({binding:current,overlay,ledger,assertRequest},command.ticket);
   if(command.method==='db.connections.v2.retryRemovalCleanup')return await retryTemporaryRemovalCleanup({binding:current,overlay,ledger,assertRequest},command.ticket);
   if (command.method === 'db.connections.v2.ticket') return ledger.issue(command.key, command.mode);
			if (command.method === 'db.connections.v2.status') return ledger.status(command.ticket);
			if (command.method === 'db.connections.v2.read') return overlay.read(command.key.id);
			if (command.method === 'db.connections.v2.activate') return await activate(command.key.id, command.revision);
			return await ledger.mutate(command.request, async (request, commit) => {
				const result = await withSavedRootGate(command.root, async () => {
					assertRequest();
					if(request.mode==='remove'){
      const prepared=await overlay.prepareRemoval({id:request.key.id,expectedRevision:request.expectedRevision!},signal);
      try{assertRequest();return commit(()=>overlay.commitRemoval(prepared));}
      catch(error){overlay.cancelRemoval(prepared);throw error;}
     }
					if ((await savedConnectionIds(connectionsPath(command.root))).has(request.key.id)) throw new ManagementServiceError('duplicate-id');
					assertRequest();
					const prepared = await overlay.prepare({ key: request.key, mode: request.mode as 'create' | 'update', publicPatch: request.publicPatch ?? {}, credentials: request.credentials ?? {}, ...(request.expectedRevision !== undefined ? { expectedRevision: request.expectedRevision } : {}) }, context.signal);
					assertRequest(); return commit(() => overlay.commit(prepared));
				});
				if (result.status !== 'committed' || request.mode==='remove') return result;
				if (overlay.cleanupPending) {
					ledger.cleanup(result.value.operationId, result.value.revision, 'pending');
					const cleanup = overlay.retiredCleanup(); context.registerDrain?.(cleanup);
					void cleanup.then(() => { try { ledger.cleanup(result.value.operationId, result.value.revision, 'complete'); } catch { /* Lost session has no surviving receipt. */ } }, () => {});
				}
				return activate(request.key.id, result.value.revision);
			}, assertRequest);
		} catch (error) { return managementRejection(error); }
	}
 private async probeOwner(context: TrustedRpcContext, root: string) {
  if (!await this.ready() || !this.#owner) throw fail('session-expired');
  const binding = await this.#binding({ kind: 'request', requestId: 'local-probe', method: 'db.connections.v2.test', params: {}, stream: false, trustedContext: context }, root);
  if (binding.audience !== 'workbench-ui') throw fail('upgrade-required');
  const owned = await this.#owner.management(context, root), overlay = owned.overlay;
  if (!(overlay instanceof TemporaryConnectionOverlay)) throw fail('upgrade-required');
  const assertActive = () => { this.#context(context); context.assertRequestActive?.(); binding.assertActive(); owned.binding.assertActive(); };
  assertActive(); return { binding, overlay, assertActive };
 }
 async probeContext(context: TrustedRpcContext, request: DraftTestRequest): Promise<TrustedRpcContext> {
  const owned = await this.probeOwner(context, request.key.repoRoot);
  const signal = AbortSignal.any([owned.binding.signal, ...(context.signal ? [context.signal] : []), ...(context.connectionSignal ? [context.connectionSignal] : [])]);
  return Object.freeze({ ...context, signal, assertRequestActive: () => { owned.assertActive(); if (request.expectedRevision !== undefined && owned.overlay.read(request.key.id).revision !== request.expectedRevision) throw new ManagementServiceError('conflict'); }, registerDrain: (work: PromiseLike<unknown>) => {
   owned.assertActive(); if (!context.registerDrain) throw fail('session-expired'); context.registerDrain(work); owned.overlay.retainWork(work);
  } });
 }
 async prepareTemporary(request: DraftTestRequest, context: TrustedRpcContext, signal: AbortSignal, drained?: Promise<void>): Promise<EffectiveDraft> {
  if (request.key.scope !== 'temporary' || request.expectedRevision === undefined) throw new ManagementServiceError('invalid-input');
  const owned = await this.probeOwner(context, request.key.repoRoot); signal.throwIfAborted();
  const revision = request.expectedRevision;
  if(drained){
   const resolver=owned.overlay.resolver(owned.binding.access,{assertActive:owned.assertActive,signal:owned.binding.signal,...(context.registerDrain?{registerDrain:context.registerDrain}:{})});
   const lease=await resolver.lease(owned.binding.access,request.key.id);
   try{
    if(lease.revision!==revision)throw new ManagementServiceError('conflict');
    lease.retainWork?.(drained);
   }catch(error){await lease.release();throw error;}
   void drained.then(()=>lease.release(),()=>lease.release()).catch(()=>{});
  }
  const result = await owned.overlay.withGeneration(request.key.id, revision, config => materializeDraft({ key: request.key, mode: 'update', expectedRevision: revision,
   publicPatch: request.publicPatch, credentials: request.credentials, current: { config, revision }, readSecret: async () => { throw new ManagementServiceError('secret-unavailable'); } }));
  owned.assertActive(); signal.throwIfAborted(); return result;
 }
	/** Internal owner entry only. JSON copies of the returned object cannot redeem resolver authority. */
	async accessFor(context: TrustedRpcContext, root: string): Promise<Readonly<ConnectionAccessContext>> {
		if (!await this.ready() || !this.#owner) throw fail('session-expired');
		const binding = await this.#binding({ kind: 'request', requestId: 'local-access', method: 'db.connections.v2.read', params: {}, stream: false, trustedContext: context }, root);
		if (binding.audience !== 'workbench-ui') throw fail('upgrade-required');
		const owned = await this.#owner.management(context, root);
		if (!(owned.overlay instanceof TemporaryConnectionOverlay)) throw fail('upgrade-required');
		const overlay = owned.overlay, access = owned.binding.access;
		const assertActive = () => {
			try { context.assertRequestActive?.(); } catch { throw fail('session-expired'); }
			binding.assertActive(); owned.binding.assertActive();
		};
		const signal = AbortSignal.any([binding.signal, ...(context.signal ? [context.signal] : []), ...(context.connectionSignal ? [context.connectionSignal] : [])]);
		bindSessionConnectionResolver(access, async () => {
			assertActive();
			const current = await this.#owner!.management(context, root);
			assertActive();
			if (current.overlay !== overlay || current.binding.controlGeneration !== owned.binding.controlGeneration) throw fail('session-expired');
			return overlay.resolver(access, { assertActive, signal, ...(context.registerDrain ? { registerDrain: context.registerDrain } : {}) });
		}, { assertActive, temporaryRevisions: () => overlay.list(), retainWork: work => { context.registerDrain?.(work); overlay.retainWork(work); } });
		assertActive(); return access;
	}
 async executionFor(context: TrustedRpcContext, root: string) {
  const access = await this.accessFor(context, root), owned = await this.probeOwner(context, root);
  if (!context.registerDrain) throw fail('session-expired');
  return sessionConnectionExecution(access, { bindingId: context.connectionIdentity, audience: owned.binding.audience, controlGeneration: owned.binding.controlGeneration,
   lifetime: { signal: AbortSignal.any([owned.binding.signal, ...(context.signal ? [context.signal] : []), ...(context.connectionSignal ? [context.connectionSignal] : [])]), registerDrain: context.registerDrain }, assertActive: owned.assertActive });
 }
	/** Failed/pending attachment stays sticky: never retry that connection as saved-only.
	 * Only audited metadata and temporary management methods are currently admitted.
	 * Analysis and other data consumers refuse until their concrete integrations exist.
	 */
	forward(next: ForwardRequest): ForwardRequest {
		return (request, deliver) => {
			const context = request.trustedContext;
			const sessionMethod = typeof request.method === 'string' && request.method.startsWith(PREFIX);
			const claimed = context !== undefined && this.#intents.has(context.connectionIdentity);
			if (!sessionMethod && !claimed) return next(request, deliver);
			const reject = (error: unknown) => {
				const result = managementRejection(error);
				try { deliver(request.stream
					? { kind: 'frame', requestId: request.requestId, frame: { id: 0, stream: 'error', data: { error: result.message, code: result.code, recoverable: false } } }
					: { kind: 'reply', requestId: request.requestId, result }); }
				finally { request.lifetime?.complete(); }
			};
			if (sessionMethod) {
				try {
					if (!context) throw fail('session-expired');
					this.#mark(context, request.method);
					if (!SESSION_METHODS.has(request.method)) throw fail('upgrade-required');
					if (request.stream) throw new ManagementInputError();
					return next(request, deliver);
				} catch (error) { reject(error); return () => {}; }
			}
			const step = request.method === 'step.call';
			if ((step && !request.stream) || (!step && !SAFE_METADATA.has(request.method) && !TEMPORARY_MANAGEMENT_METHODS.has(request.method) && !PROBE_METHODS.has(request.method)) || (request.stream && !step)) { reject(fail('upgrade-required')); return () => {}; }
			let cancelled = false, cancel: (() => void) | undefined;
			void Promise.resolve().then(() => TEMPORARY_MANAGEMENT_METHODS.has(request.method) ? this.#binding(request, parseTemporaryManagement(request.method, request.params).root) : request.method === 'db.connections.v2.test' ? this.#binding(request, parseDraftTestRequest(request.params).key.repoRoot) : this.#binding(request)).then(async binding => {
				if (cancelled || request.lifetime?.signal.aborted) { request.lifetime?.complete(); return; }
				binding.assertActive();
				if (step && binding.audience !== 'workbench-ui') throw fail('unsupported-temporary');
				if ((TEMPORARY_MANAGEMENT_METHODS.has(request.method) || PROBE_METHODS.has(request.method)) && binding.audience !== 'workbench-ui') throw fail('upgrade-required');
				let execution;
                if (step) {
                 const lifetime = request.lifetime; if (!lifetime) throw fail('session-expired');
                 execution = await this.executionFor({ ...context!, signal: lifetime.signal, registerDrain: lifetime.registerDrain, assertRequestActive: lifetime.assertActive }, binding.access.lookupRoot);
                 const owned = await this.probeOwner(context!, binding.access.lookupRoot); owned.overlay.retainWork(lifetime.drained);
                }
                binding.assertActive();
                const authenticated: LocalRequestEnvelope = { ...request, trustedContext: Object.freeze({ ...context!, connectionSession: binding, ...(execution ? { connectionExecution: execution } : {}) }) };
				const checked: DeliverEnvelope = envelope => { try { binding.assertActive(); deliver(envelope); } catch (error) { reject(error); } };
				cancel = next(authenticated, checked);
			}).catch(error => { if (!cancelled) reject(error); else request.lifetime?.complete(); });
			return () => { cancelled = true; request.lifetime?.abort(); if (cancel) cancel(); else request.lifetime?.complete(); };
		};
	}
	disconnect(context: TrustedRpcContext): void {
		this.#owner?.disconnect(context);
		this.#claims.delete(context.connectionIdentity); this.#intents.delete(context.connectionIdentity);
	}
	stopAdmission(): void {
		this.#closed = true;
		this.#drained ??= this.#owner?.close() ?? Promise.resolve();
		void this.#drained.then(() => this.#uninstallReservations(), () => { });
	}
	async close(): Promise<void> {
		this.stopAdmission(); this.#claims.clear();
		// Keep safe role markers until each socket disconnects: closing authority cannot downgrade a live channel.
		try { await this.#drained; } catch { this.#drained = undefined; throw new ManagementServiceError('recovery-required'); }
	}
}

export const connectionSessionRuntime = new ConnectionSessionRpc<TemporaryConnectionOverlay>({
	enabled: async () => (await connectionManagementEnablement(undefined, ['sc5'])).ready,
	isRegistered: async root => await lookupRepoId(root) !== undefined,
	createOverlay: createTemporaryOverlay,
	dropOverlay: overlay => overlay.close(),
});
