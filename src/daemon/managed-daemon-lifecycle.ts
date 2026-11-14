/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { randomUUID } from 'node:crypto';
import { Socket } from 'node:net';
import {
	encodeSupervisorFrame, readSupervisorReply, readSupervisorRequest, SupervisorFrameReader, SupervisorLifecycleError,
} from '../shared/daemon-supervisor-protocol.js';
import type { SupervisorReply, SupervisorRequest } from '../shared/daemon-supervisor-protocol.js';
import { borrowRunFileGuard } from '../shared/daemon-run-files.js';
import type { DaemonRunFileOwnership, RunFileLease } from './run-file-ownership.js';
import type { ShutdownWatchdog } from './shutdown-watchdog.js';

const REPLY_MS = 2_000;
// Readiness includes an authenticated status RPC to the newly started daemon
// and verification of its published run files. The supervisor owns the startup deadline.
const READY_REPLY_MS = 15_000;
const PUBLIC_REPLY_FLUSH_MS = 50;

export function isManagedDaemon(): boolean {
	return process.platform === 'darwin' && Boolean(process.env['INSRC_SUPERVISOR_GENERATION']);
}

interface Pending {
	readonly request: SupervisorRequest;
	readonly slot: string;
	readonly timer: ReturnType<typeof setTimeout>;
	resolve(reply: Extract<SupervisorReply, { ok: true }>): void;
	reject(error: Error): void;
}

/** Inherited descriptor only. No public socket fallback can arm a different generation. */
export class ManagedDaemonLifecycle {
	private readonly frames = new SupervisorFrameReader();
	private readonly pending = new Map<string, Pending>();
	private readonly used = new Set<string>();
	private readonly parentPid = process.ppid;
	private drain: SupervisorRequest | undefined;
	private startShutdown: ((reason: string) => void) | undefined;
	private shutdownStarted = false;
	private publicDrain: ReturnType<typeof setTimeout> | undefined;
	private failure: SupervisorLifecycleError | undefined;

	static open(): ManagedDaemonLifecycle | undefined {
		if (!isManagedDaemon()) return undefined;
		return new ManagedDaemonLifecycle(process.env['INSRC_SUPERVISOR_GENERATION']!,
			new Socket({ fd: 3, readable: true, writable: true }));
	}

	constructor(private readonly generation: string, private readonly channel: Socket) {
		channel.on('data', (chunk: Buffer) => {
			try { this.frames.push(chunk, frame => this.receive(frame)); }
			catch { this.close(new SupervisorLifecycleError('watchdog-protocol', 'invalid supervisor frame')); }
		});
		channel.on('error', () => this.close(new SupervisorLifecycleError('watchdog-channel', 'supervisor channel failed')));
		channel.once('close', () => this.close(new SupervisorLifecycleError('watchdog-channel', 'supervisor channel closed')));
	}

	get draining(): boolean { return this.drain !== undefined || this.shutdownStarted || this.publicDrain !== undefined; }

	assertProbationActive(): void {
		if (this.failure !== undefined) throw this.failure;
		if (this.draining || this.channel.destroyed || process.ppid !== this.parentPid) {
			throw new SupervisorLifecycleError('watchdog-channel', 'probation lost its supervising generation');
		}
	}

	setShutdownHandler(start: (reason: string) => void): void {
		this.startShutdown = start;
		if (this.drain !== undefined) this.applyDrain(this.drain);
	}

	private close(error: SupervisorLifecycleError): void {
		if (this.failure !== undefined) return;
		this.failure = error;
		this.frames.discardPartial();
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
		this.used.clear();
		this.channel.destroy();
	}

	private receive(frame: unknown): void {
		if (typeof frame !== 'object' || frame === null) throw new Error('invalid inherited frame');
		if ('op' in frame) {
			const drain = readSupervisorRequest(frame, { role: 'parent', generation: this.generation });
			if (this.drain !== undefined) throw new Error('duplicate supervisor drain');
			this.drain = drain;
			if (this.startShutdown !== undefined) this.applyDrain(drain);
			return;
		}
		const pending = 'id' in frame && typeof frame.id === 'string' ? this.pending.get(frame.id) : undefined;
		if (pending === undefined) throw new Error('unknown inherited reply');
		const reply = readSupervisorReply(frame, pending.request);
		this.pending.delete(pending.request.id);
		this.used.delete(pending.slot);
		clearTimeout(pending.timer);
		if (reply.ok) pending.resolve(reply);
		else pending.reject(new SupervisorLifecycleError(reply.error,
			`supervisor refused ${pending.request.op}: ${reply.error}`, reply.generation, reply.exit));
	}

	private async call(op: SupervisorRequest['op'], details: Partial<SupervisorRequest> = {}) {
		if (this.failure !== undefined) throw this.failure;
		if (this.channel.destroyed || this.channel.writableNeedDrain || process.ppid !== this.parentPid) {
			throw new SupervisorLifecycleError('watchdog-channel', 'supervisor channel is unavailable');
		}
		const slot = op === 'arm' ? `arm:${details.armSource}` : op;
		if (this.used.has(slot)) throw new SupervisorLifecycleError('watchdog-protocol', 'duplicate inherited request');
		const request: SupervisorRequest = { ...details, v: 1, id: randomUUID(), op, generation: this.generation };
		const bytes = encodeSupervisorFrame(request);
		const replyMs = op === 'ready' ? READY_REPLY_MS : REPLY_MS;
		return new Promise<Extract<SupervisorReply, { ok: true }>>((resolve, reject) => {
			const timer = setTimeout(() => this.close(new SupervisorLifecycleError('watchdog-timeout',
				'supervisor did not acknowledge ' + request.op)), replyMs);
			this.pending.set(request.id, { request, slot, timer, resolve, reject });
			this.used.add(slot);
			this.channel.write(bytes);
		});
	}

	async ready(): Promise<void> {
		await this.call('ready');
	}

	async borrow(ownership: DaemonRunFileOwnership, guardPath: string): Promise<RunFileLease & { returnGrant(): Promise<void> }> {
		const grant = await this.call('guard-acquire');
		const leaseToken = grant.leaseToken!;
		let active = true;
		const borrowed = borrowRunFileGuard(guardPath, this.parentPid, () => {
			if (!active || this.failure !== undefined) throw new Error('supervisor run-file grant is unavailable');
		});
		const local = ownership.useBorrowedGuard(borrowed);
		return {
			guard: borrowed,
			release() { local.release(); active = false; },
			returnGrant: async () => {
				local.release();
				active = false;
				await this.call('guard-release', { leaseToken });
			},
		};
	}

	async withRunFiles<T>(ownership: DaemonRunFileOwnership, guardPath: string, use: () => Promise<T>): Promise<T> {
		const lease = await this.borrow(ownership, guardPath);
		try { return await use(); } finally { await lease.returnGrant(); }
	}

	/** Public refusal propagates to the caller before any local shutdown begins. */
	async publicShutdown(reason: string): Promise<void> {
		if (this.startShutdown === undefined) throw new SupervisorLifecycleError('busy', 'daemon is still starting');
		await this.arm('public-rpc');
		// The parent deadline is already armed. Let the admin worker and socket
		// send the accepted result before the local drain closes either path.
		if (!this.shutdownStarted) this.publicDrain ??= setTimeout(() => this.begin(reason), PUBLIC_REPLY_FLUSH_MS);
	}

	signal(reason: string, emergency: () => void): void {
		void this.arm('signal').then(() => this.begin(reason)).catch(emergency);
	}

	private arm(source: NonNullable<SupervisorRequest['armSource']>, drainId?: string): Promise<unknown> {
		return this.call('arm', { armSource: source, ...(drainId === undefined ? {} : { drainId }) });
	}

	private applyDrain(drain: SupervisorRequest): void {
		const response = (reply: SupervisorReply): void => { if (!this.channel.destroyed) this.channel.write(encodeSupervisorFrame(reply)); };
		void this.arm('supervisor-drain', drain.id).then(() => {
			response({ v: 1, id: drain.id, generation: this.generation, ok: true, state: 'draining' });
			this.begin('supervisor drain');
		}).catch(() => response({ v: 1, id: drain.id, generation: this.generation, ok: false, error: 'watchdog-channel' }));
	}

	private begin(reason: string): void {
		if (this.shutdownStarted) return;
		this.shutdownStarted = true;
		if (this.publicDrain !== undefined) clearTimeout(this.publicDrain);
		this.publicDrain = undefined;
		this.startShutdown?.(reason);
	}

	/** The parent owns the deadline and cannot be disarmed from the child. */
	watchdog(): Promise<ShutdownWatchdog> {
		return Promise.resolve({ pid: this.parentPid, stage() {}, disarm() {} });
	}
}
