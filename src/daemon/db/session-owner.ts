/** Daemon-memory workbench owner. No installed singleton or public RPC until t4. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { TrustedRpcContext } from '../request-context.js';
import type { OpenConnectionSessionResult, SessionResume } from '../../shared/connection-management.js';
import { ManagementServiceError } from './management.js';
import { registeredConnectionRoot } from './management-root.js';

export const CONNECTION_SESSION_HEARTBEAT_MS = 30_000;
export const CONNECTION_SESSION_LEASE_MS = 90_000;
export const MAX_CONNECTION_SESSIONS = 64;

interface Session<Overlay> {
	readonly handle: string;
	readonly capabilityDigest: Buffer;
	readonly signingKey: Buffer;
	readonly overlays: Map<string, Overlay>;
	deadline: number;
	generation: number;
	controlIdentity: string | undefined;
}
export interface SessionOwnerPorts<Overlay> {
	readonly daemonEpoch: string;
	readonly isRegistered: (root: string) => Promise<boolean>;
	/** Creates an empty owned memory aggregate, never a saved pool. */
	readonly createOverlay: (root: string, sessionHandle: string) => Overlay;
	readonly monotonicNow?: (() => number) | undefined;
}
const token = (): string => randomBytes(32).toString('base64url');
const digest = (capability: string): Buffer => createHash('sha256').update('connection-session:control\0').update(capability).digest();
const expired = (): ManagementServiceError => new ManagementServiceError('session-expired');

/** One instance per daemon epoch. Private maps are never serialized or recovered.
 * Overlay is the sc5-owned memory aggregate supplied by the later entry/runtime
 * integration. Transport closure detaches control; it does not end the workbench.
 */
export class ConnectionSessionOwner<Overlay> {
	readonly #sessions = new Map<string, Session<Overlay>>();
	readonly #controls = new Map<string, { handle: string; generation: number }>();
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
			|| typeof context.connectionIdentity !== 'string' || !context.connectionIdentity || context.signal?.aborted) throw expired();
	}
	#session(handle: string): Session<Overlay> {
		const session = this.#sessions.get(handle);
		if (!session) throw expired();
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
		this.#sessions.delete(session.handle);
		if (session.controlIdentity) this.#controls.delete(session.controlIdentity);
		session.controlIdentity = undefined;
		session.capabilityDigest.fill(0);
		session.signingKey.fill(0);
		session.overlays.clear();
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
		const root = await registeredConnectionRoot(repoRoot, this.#ports.isRegistered);
		this.#context(context);
		this.sweepExpired();
		if (this.#controls.has(context.connectionIdentity) || this.#sessions.size >= MAX_CONNECTION_SESSIONS) throw new ManagementServiceError('busy');
		const handle = token(), capability = token();
		const session: Session<Overlay> = { handle, capabilityDigest: digest(capability), signingKey: randomBytes(32),
			deadline: this.#now() + CONNECTION_SESSION_LEASE_MS, generation: 1, controlIdentity: context.connectionIdentity, overlays: new Map() };
		try {
			session.overlays.set(root, this.#ports.createOverlay(root, handle));
			this.#context(context);
			session.deadline = this.#now() + CONNECTION_SESSION_LEASE_MS;
		} catch {
			session.capabilityDigest.fill(0); session.signingKey.fill(0); session.overlays.clear();
			throw expired();
		}
		this.#sessions.set(handle, session);
		this.#controls.set(context.connectionIdentity, { handle, generation: session.generation });
		return this.#result(session, capability);
	}
	resume(context: TrustedRpcContext, request: SessionResume): OpenConnectionSessionResult {
		this.#context(context);
		if (!request || request.daemonEpoch !== this.#ports.daemonEpoch || typeof request.sessionHandle !== 'string'
			|| typeof request.capability !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(request.sessionHandle)
			|| !/^[A-Za-z0-9_-]{43}$/.test(request.capability)) throw expired();
		const session = this.#session(request.sessionHandle);
		if (!timingSafeEqual(session.capabilityDigest, digest(request.capability))) throw expired();
		this.#session(session.handle);
		const occupied = this.#controls.get(context.connectionIdentity);
		if (occupied && occupied.handle !== session.handle) throw new ManagementServiceError('busy');
		if (session.controlIdentity) this.#controls.delete(session.controlIdentity);
		session.generation++;
		session.controlIdentity = context.connectionIdentity;
		this.#controls.set(context.connectionIdentity, { handle: session.handle, generation: session.generation });
		// Resume preserves the deadline. Only a current-control heartbeat renews it.
		return this.#result(session, request.capability);
	}
	heartbeat(context: TrustedRpcContext): { readonly status: 'active'; readonly leaseMs: 90000 } {
		const session = this.#control(context);
		const now = this.#now();
		if (now >= session.deadline) { this.#expire(session); throw expired(); }
		session.deadline = now + CONNECTION_SESSION_LEASE_MS;
		return { status: 'active', leaseMs: CONNECTION_SESSION_LEASE_MS };
	}
	async overlay(context: TrustedRpcContext, repoRoot: string): Promise<Overlay> {
		const session = this.#control(context), generation = session.generation;
		const root = await registeredConnectionRoot(repoRoot, this.#ports.isRegistered);
		if (this.#control(context) !== session || session.generation !== generation) throw expired();
		if (!session.overlays.has(root)) {
			let overlay: Overlay;
			try { overlay = this.#ports.createOverlay(root, session.handle); } catch { throw expired(); }
			if (this.#control(context) !== session || session.generation !== generation) throw expired();
			session.overlays.set(root, overlay);
		}
		return session.overlays.get(root)!;
	}
	end(context: TrustedRpcContext): void { this.#expire(this.#control(context)); }
	disconnect(context: TrustedRpcContext): void {
		const attachment = this.#controls.get(context.connectionIdentity);
		if (!attachment || context.daemonEpoch !== this.#ports.daemonEpoch) return;
		this.#controls.delete(context.connectionIdentity);
		const session = this.#sessions.get(attachment.handle);
		if (session?.controlIdentity === context.connectionIdentity) session.controlIdentity = undefined;
	}
	close(): void {
		clearInterval(this.#timer);
		this.#closed = true;
		for (const session of this.#sessions.values()) this.#expire(session);
	}
}
