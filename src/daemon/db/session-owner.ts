/** Daemon-memory workbench owner. Authority and overlays never persist. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { TrustedRpcContext, TrustedConnectionSession } from '../request-context.js';
import type { OpenConnectionSessionResult, SessionResume, SessionDataAttach, ConnectionSessionAudience } from '../../shared/connection-management.js';
import { ManagementServiceError } from './management.js';
import { registeredConnectionRoot } from './management-root.js';

export const CONNECTION_SESSION_HEARTBEAT_MS = 30_000;
export const CONNECTION_SESSION_LEASE_MS = 90_000;
export const MAX_CONNECTION_SESSIONS = 64;
export const MAX_SESSION_DATA_DELEGATIONS = 32;

interface DataDelegation {
	readonly digest: Buffer;
	readonly root: string;
	readonly generation: number;
	readonly audience: ConnectionSessionAudience;
	readonly attachments: Map<string, AbortController>;
}
interface DataAttachment<Overlay> { readonly session: Session<Overlay>; readonly delegation: DataDelegation; readonly controller: AbortController }
export interface SessionDataBinding extends TrustedConnectionSession { readonly role: 'data' }

interface Session<Overlay> {
	phase: 'active' | 'closing';
	readonly handle: string;
	readonly capabilityDigest: Buffer;
	readonly signingKey: Buffer;
	readonly overlays: Map<string, Overlay>;
	readonly delegations: Map<string, DataDelegation>;
	deadline: number;
	generation: number;
	controlIdentity: string | undefined;
	controlController: AbortController;
}
export interface SessionOverlayContext<Overlay> {
	readonly existingOverlays: readonly Overlay[];
	readonly assertActive: () => void;
}
export interface SessionOwnerPorts<Overlay> {
	readonly daemonEpoch: string;
	readonly isRegistered: (root: string) => Promise<boolean>;
	/** Creates an empty owned memory aggregate, never a saved pool. */
	readonly createOverlay: (root: string, sessionHandle: string, context: SessionOverlayContext<Overlay>) => Overlay;
	readonly dropOverlay?: ((overlay: Overlay) => void) | undefined;
	readonly monotonicNow?: (() => number) | undefined;
}
const token = (): string => randomBytes(32).toString('base64url');
const digest = (capability: string): Buffer => createHash('sha256').update('connection-session:control\0').update(capability).digest();
const dataDigest = (capability: string): Buffer => createHash('sha256').update('connection-session:data\0').update(capability).digest();
const expired = (): ManagementServiceError => new ManagementServiceError('session-expired');

/** One instance per daemon epoch. Private maps are never serialized or recovered.
 * Overlay is the sc5-owned memory aggregate supplied by the later entry/runtime
 * integration. Transport closure detaches control; it does not end the workbench.
 */
export class ConnectionSessionOwner<Overlay> {
	readonly #sessions = new Map<string, Session<Overlay>>();
	readonly #controls = new Map<string, { handle: string; generation: number }>();
	readonly #data = new Map<string, DataAttachment<Overlay>>();
	/** Transport role stays sticky after revocation until the socket disconnects. */
	readonly #dataTransports = new Map<string, { handle: string; root: string; audience: ConnectionSessionAudience }>();
	readonly #controlTransports = new Set<string>();
	readonly #ports: SessionOwnerPorts<Overlay>;
	readonly #timer: ReturnType<typeof setInterval>;
	#lastNow = -Infinity;
	#closed = false;

	constructor(ports: SessionOwnerPorts<Overlay>) {
		if (!ports.daemonEpoch) throw new ManagementServiceError('invalid-input');
		this.#ports = Object.freeze({ ...ports });
		this.#timer = setInterval(() => { try { this.sweepExpired(); } catch { this.close(); } }, 1000);
		this.#timer.unref();
	}
	get size(): number { this.sweepExpired(); return this.#sessions.size; }
	#now(): number {
		const now = (this.#ports.monotonicNow ?? (() => performance.now()))();
		if (!Number.isFinite(now) || now < this.#lastNow) throw expired();
		this.#lastNow = now;
		return now;
	}
	#context(context: TrustedRpcContext): void {
		if (this.#closed || !context || context.daemonEpoch !== this.#ports.daemonEpoch
			|| typeof context.connectionIdentity !== 'string' || !context.connectionIdentity || context.signal?.aborted || context.connectionSignal?.aborted) throw expired();
	}
	#session(handle: string): Session<Overlay> {
		const session = this.#sessions.get(handle);
		if (!session || session.phase !== 'active') throw expired();
		if (this.#now() >= session.deadline) { this.#expire(session); throw expired(); }
		return session;
	}
	#control(context: TrustedRpcContext): Session<Overlay> {
		this.#context(context);
		const attachment = this.#controls.get(context.connectionIdentity);
		if (!attachment) throw expired();
		const session = this.#session(attachment.handle);
		if (session.controlIdentity !== context.connectionIdentity || session.generation !== attachment.generation) throw expired();
		return session;
	}
	#expire(session: Session<Overlay>): void {
		session.phase = 'closing';
		this.#sessions.delete(session.handle);
		if (session.controlIdentity) this.#controls.delete(session.controlIdentity);
		session.controlIdentity = undefined;
		session.capabilityDigest.fill(0);
		session.signingKey.fill(0);
		this.#revokeData(session);
		session.controlController.abort();
		for (const overlay of session.overlays.values()) this.#ports.dropOverlay?.(overlay);
		session.overlays.clear();
	}
	#revokeData(session: Session<Overlay>): void {
		const controllers: AbortController[] = [];
		for (const delegation of session.delegations.values()) {
			for (const [identity, controller] of delegation.attachments) {
				this.#data.delete(identity);
				controllers.push(controller);
			}
			delegation.attachments.clear();
			delegation.digest.fill(0);
		}
		session.delegations.clear();
		// Invalidate every attachment before notifying synchronous abort listeners.
		for (const controller of controllers) controller.abort();
	}
	sweepExpired(): void {
		if (this.#closed) return;
		const now = this.#now();
		for (const session of this.#sessions.values()) if (now >= session.deadline) this.#expire(session);
	}
	#result(session: Session<Overlay>, capability: string): OpenConnectionSessionResult {
		return Object.freeze({ sessionHandle: session.handle, capability, daemonEpoch: this.#ports.daemonEpoch,
			heartbeatMs: CONNECTION_SESSION_HEARTBEAT_MS, leaseMs: CONNECTION_SESSION_LEASE_MS });
	}
	async open(context: TrustedRpcContext, repoRoot: string): Promise<OpenConnectionSessionResult> {
		this.#context(context);
		if (this.#dataTransports.has(context.connectionIdentity)) throw expired();
		const root = await registeredConnectionRoot(repoRoot, this.#ports.isRegistered);
		this.#context(context);
		if (this.#dataTransports.has(context.connectionIdentity)) throw expired();
		this.sweepExpired();
		if (this.#controls.has(context.connectionIdentity) || this.#sessions.size >= MAX_CONNECTION_SESSIONS) throw new ManagementServiceError('busy');
		const handle = token(), capability = token();
		const session: Session<Overlay> = { phase: 'active', handle, capabilityDigest: digest(capability), signingKey: randomBytes(32),
			deadline: this.#now() + CONNECTION_SESSION_LEASE_MS, generation: 1, controlIdentity: context.connectionIdentity,
			controlController: new AbortController(), overlays: new Map(), delegations: new Map() };
		try {
			session.overlays.set(root, this.#ports.createOverlay(root, handle, Object.freeze({ existingOverlays: Object.freeze([]), assertActive: () => { this.#session(handle); } })));
			this.#context(context);
			session.deadline = this.#now() + CONNECTION_SESSION_LEASE_MS;
		} catch {
			session.capabilityDigest.fill(0); session.signingKey.fill(0); session.overlays.clear();
			throw expired();
		}
		this.#sessions.set(handle, session);
		this.#controls.set(context.connectionIdentity, { handle, generation: session.generation });
		this.#controlTransports.add(context.connectionIdentity);
		return this.#result(session, capability);
	}
	resume(context: TrustedRpcContext, request: SessionResume): OpenConnectionSessionResult {
		this.#context(context);
		if (this.#dataTransports.has(context.connectionIdentity)) throw expired();
		if (!request || request.daemonEpoch !== this.#ports.daemonEpoch || typeof request.sessionHandle !== 'string'
			|| typeof request.capability !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(request.sessionHandle)
			|| !/^[A-Za-z0-9_-]{43}$/.test(request.capability)) throw expired();
		const session = this.#session(request.sessionHandle);
		if (!timingSafeEqual(session.capabilityDigest, digest(request.capability))) throw expired();
		this.#session(session.handle);
		const occupied = this.#controls.get(context.connectionIdentity);
		if (occupied && occupied.handle !== session.handle) throw new ManagementServiceError('busy');
		if (session.controlIdentity) this.#controls.delete(session.controlIdentity);
		const previousControl = session.controlController;
		session.generation++;
		const generation = session.generation;
		session.controlIdentity = context.connectionIdentity;
		session.controlController = new AbortController();
		this.#controls.set(context.connectionIdentity, { handle: session.handle, generation: session.generation });
		this.#controlTransports.add(context.connectionIdentity);
		this.#revokeData(session);
		previousControl.abort();
		if (this.#control(context) !== session || session.generation !== generation) throw expired();
		// Resume preserves the deadline. Only a current-control heartbeat renews it.
		return this.#result(session, request.capability);
	}
	async delegate(context: TrustedRpcContext, repoRoot: string, audience: ConnectionSessionAudience): Promise<SessionResume> {
		const session = this.#control(context), generation = session.generation;
		if (audience !== 'workbench-ui' && audience !== 'mcp-unverified') throw new ManagementServiceError('invalid-input');
		const root = await registeredConnectionRoot(repoRoot, this.#ports.isRegistered);
		if (this.#control(context) !== session || session.generation !== generation) throw expired();
		if (session.delegations.size >= MAX_SESSION_DATA_DELEGATIONS) throw new ManagementServiceError('busy');
		const capability = token(), hash = dataDigest(capability);
		session.delegations.set(hash.toString('hex'), { digest: hash, root, generation, audience, attachments: new Map() });
		return Object.freeze({ sessionHandle: session.handle, capability, daemonEpoch: this.#ports.daemonEpoch });
	}
	async attach(context: TrustedRpcContext, request: SessionDataAttach): Promise<SessionDataBinding> {
		this.#context(context);
		if (!request || request.daemonEpoch !== this.#ports.daemonEpoch || typeof request.sessionHandle !== 'string'
			|| typeof request.capability !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(request.capability)) throw expired();
		const session = this.#session(request.sessionHandle), hash = dataDigest(request.capability);
		const delegation = session.delegations.get(hash.toString('hex'));
		if (!delegation || !timingSafeEqual(hash, delegation.digest) || request.repoRoot !== delegation.root
			|| delegation.generation !== session.generation || this.#controlTransports.has(context.connectionIdentity)) throw expired();
		const role = this.#dataTransports.get(context.connectionIdentity);
		if (role && (role.handle !== session.handle || role.root !== delegation.root || role.audience !== delegation.audience)) throw expired();
		await registeredConnectionRoot(request.repoRoot, this.#ports.isRegistered);
		this.#context(context);
		if (this.#session(session.handle) !== session || session.generation !== delegation.generation
			|| session.delegations.get(hash.toString('hex')) !== delegation || this.#controlTransports.has(context.connectionIdentity)) throw expired();
		const currentRole = this.#dataTransports.get(context.connectionIdentity);
		if (currentRole && (currentRole.handle !== session.handle || currentRole.root !== delegation.root || currentRole.audience !== delegation.audience)) throw expired();
		const existing = this.#data.get(context.connectionIdentity);
		if (existing && (existing.session !== session || existing.delegation !== delegation)) throw expired();
		if (!existing) {
			const controller = new AbortController();
			delegation.attachments.set(context.connectionIdentity, controller);
			this.#data.set(context.connectionIdentity, { session, delegation, controller });
			this.#dataTransports.set(context.connectionIdentity, { handle: session.handle, root: delegation.root, audience: delegation.audience });
		}
		return this.dataBinding(context, request.repoRoot);
	}
	dataBinding(context: TrustedRpcContext, repoRoot: string): SessionDataBinding {
		this.#context(context);
		const attached = this.#data.get(context.connectionIdentity);
		if (!attached || this.#session(attached.session.handle) !== attached.session
			|| attached.delegation.generation !== attached.session.generation || attached.delegation.root !== repoRoot
			|| attached.controller.signal.aborted) throw expired();
		return Object.freeze({ role: 'data', access: Object.freeze({ lookupRoot: repoRoot, managementRepoRoot: repoRoot,
			 daemonEpoch: this.#ports.daemonEpoch, sessionHandle: attached.session.handle }), audience: attached.delegation.audience,
			controlGeneration: attached.session.generation, signal: attached.controller.signal, assertActive: () => {
				this.#context(context);
				if (this.#data.get(context.connectionIdentity) !== attached || attached.controller.signal.aborted
					|| this.#session(attached.session.handle) !== attached.session || attached.session.generation !== attached.delegation.generation) throw expired();
			} });
	}
	async controlBinding(context: TrustedRpcContext, repoRoot: string): Promise<TrustedConnectionSession> {
		const session = this.#control(context), generation = session.generation, controller = session.controlController;
		const root = await registeredConnectionRoot(repoRoot, this.#ports.isRegistered);
		const assertActive = () => {
			if (this.#control(context) !== session || session.generation !== generation || session.controlController !== controller || controller.signal.aborted) throw expired();
		};
		assertActive();
		return Object.freeze({ role: 'control', access: Object.freeze({ lookupRoot: root, managementRepoRoot: root,
			daemonEpoch: this.#ports.daemonEpoch, sessionHandle: session.handle }), audience: 'workbench-ui', controlGeneration: generation,
			signal: controller.signal, assertActive });
	}
	async dataOverlay(context: TrustedRpcContext, repoRoot: string): Promise<Overlay> {
		const binding = this.dataBinding(context, repoRoot);
		if (binding.audience !== 'workbench-ui') throw new ManagementServiceError('upgrade-required');
		const session = this.#session(binding.access.sessionHandle!);
		const root = await registeredConnectionRoot(repoRoot, this.#ports.isRegistered);
		const current = this.dataBinding(context, root);
		if (current.signal !== binding.signal || current.controlGeneration !== binding.controlGeneration) throw expired();
		if (!session.overlays.has(root)) {
			let overlay: Overlay;
			try { overlay = this.#ports.createOverlay(root, session.handle, Object.freeze({ existingOverlays: Object.freeze([...session.overlays.values()]), assertActive: () => { this.#session(session.handle); } })); } catch { throw expired(); }
			if (this.dataBinding(context, root).signal !== binding.signal) throw expired();
			session.overlays.set(root, overlay);
		}
		return session.overlays.get(root)!;
	}
	heartbeat(context: TrustedRpcContext): { readonly status: 'active'; readonly leaseMs: 90000 } {
		const session = this.#control(context);
		const now = this.#now();
		if (now >= session.deadline) { this.#expire(session); throw expired(); }
		session.deadline = now + CONNECTION_SESSION_LEASE_MS;
		return { status: 'active', leaseMs: CONNECTION_SESSION_LEASE_MS };
	}
	controlRoot(context: TrustedRpcContext): string {
		const root = this.#control(context).overlays.keys().next().value;
		if (root === undefined) throw expired();
		return root;
	}
	async overlay(context: TrustedRpcContext, repoRoot: string): Promise<Overlay> {
		const session = this.#control(context), generation = session.generation;
		const root = await registeredConnectionRoot(repoRoot, this.#ports.isRegistered);
		if (this.#control(context) !== session || session.generation !== generation) throw expired();
		if (!session.overlays.has(root)) {
			let overlay: Overlay;
			try { overlay = this.#ports.createOverlay(root, session.handle, Object.freeze({ existingOverlays: Object.freeze([...session.overlays.values()]), assertActive: () => { this.#session(session.handle); } })); } catch { throw expired(); }
			if (this.#control(context) !== session || session.generation !== generation) throw expired();
			session.overlays.set(root, overlay);
		}
		return session.overlays.get(root)!;
	}
	end(context: TrustedRpcContext): void { this.#expire(this.#control(context)); }
	disconnect(context: TrustedRpcContext): void {
		if (context.daemonEpoch !== this.#ports.daemonEpoch) return;
		this.#dataTransports.delete(context.connectionIdentity);
		this.#controlTransports.delete(context.connectionIdentity);
		const data = this.#data.get(context.connectionIdentity);
		if (data && context.daemonEpoch === this.#ports.daemonEpoch) {
			this.#data.delete(context.connectionIdentity);
			data.delegation.attachments.delete(context.connectionIdentity);
			data.controller.abort();
		}
		const attachment = this.#controls.get(context.connectionIdentity);
		if (!attachment || context.daemonEpoch !== this.#ports.daemonEpoch) return;
		this.#controls.delete(context.connectionIdentity);
		const session = this.#sessions.get(attachment.handle);
		if (session?.controlIdentity === context.connectionIdentity) { session.controlIdentity = undefined; session.controlController.abort(); }
	}
	close(): void {
		clearInterval(this.#timer);
		this.#closed = true;
		for (const session of this.#sessions.values()) this.#expire(session);
		this.#dataTransports.clear(); this.#controlTransports.clear();
	}
}
