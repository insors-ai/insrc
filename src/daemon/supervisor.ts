/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import type { Duplex } from 'node:stream';
import { constants as os } from 'node:os';
import { isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import { SupervisorFrameReader, SupervisorLifecycleError, encodeSupervisorFrame, readSupervisorReply, readSupervisorRequest } from '../shared/daemon-supervisor-protocol.js';
import type { SupervisorExit, SupervisorReply, SupervisorRequest, SupervisorState } from '../shared/daemon-supervisor-protocol.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import type { InstallationMutationGate, MutationReservation } from '../shared/installation-mutation-gate.js';
import type { SupervisorRunFiles } from './supervisor-run-files.js';

export interface ChildEvents {
	frame(frame: unknown): void;
	exit(code: number | null, signal: number | null): void;
	spawnFailed(): void;
}

export interface ManagedChild {
	readonly pid: number | undefined;
	send(frame: SupervisorRequest | SupervisorReply): void;
	kill(): boolean;
	closeChannel(): void;
}

export interface PinnedDaemon {
	readonly runtime: string;
	readonly entry: string;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
}

export interface SupervisorClock {
	now(): number;
	schedule(run: () => void, delayMs: number): () => void;
}

const clock: SupervisorClock = {
	now: () => performance.now(),
	schedule(run, delayMs) {
		const timer = setTimeout(run, delayMs);
		return () => clearTimeout(timer);
	},
};

export function spawnSupervisedDaemon(config: PinnedDaemon, generation: string, events: ChildEvents): ManagedChild {
	const child = spawn(config.runtime, [config.entry], {
		cwd: config.cwd, env: { ...config.env, INSRC_SUPERVISOR_GENERATION: generation },
		stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
	});
	// stdio slot 3 is deliberately bidirectional and belongs to this child alone.
	const channel = child.stdio[3] as Duplex;
	const frames = new SupervisorFrameReader();
	channel.on('data', (chunk: Buffer) => {
		try { frames.push(chunk, events.frame); }
		catch { channel.destroy(); }
	});
	channel.on('close', () => frames.discardPartial());
	channel.on('error', () => channel.destroy());
	child.on('error', () => { if (child.pid === undefined) events.spawnFailed(); });
	child.once('exit', (code, signal) => events.exit(code, signal === null ? null : os.signals[signal]));
	return {
		get pid() { return child.pid; },
		send(frame) {
			if (channel.destroyed || channel.writableNeedDrain) { channel.destroy(); return; }
			channel.write(encodeSupervisorFrame(frame));
		},
		kill: () => child.kill('SIGKILL'),
		closeChannel: () => channel.destroy(),
	};
}

interface OwnedGeneration {
	readonly id: string;
	readonly predecessor: string | null;
	readonly child: ManagedChild;
	state: 'starting' | 'running' | 'draining';
	deadline: number | undefined;
	cancel: (() => void) | undefined;
	drain: SupervisorRequest | undefined;
	forceAttempted: boolean;
	forceSent: boolean;
	reaped: boolean;
	checkingReady: boolean;
	failure: 'exit-unconfirmed' | 'ownership-conflict' | 'runtime-unavailable' | undefined;
}

interface ConfirmedExit {
	readonly generation: string;
	readonly exit: SupervisorExit;
}

export interface SupervisorOptions {
	readonly installation: Pick<InstallationMutationGate, 'read' | 'admit'>;
	readonly daemon: PinnedDaemon;
	readonly verifyReady: (generation: string, pid: number) => Promise<void>;
	readonly reconcileExit: (generation: string, pid: number | undefined) => Promise<void>;
	readonly allowInitialStart: () => Promise<boolean>;
	readonly publicArm: (generation: string) => Promise<void>;
	readonly runFiles?: SupervisorRunFiles;
	readonly spawnChild?: typeof spawnSupervisedDaemon;
	readonly clock?: SupervisorClock;
	readonly startupMs?: number;
	readonly shutdownMs?: number;
	readonly reapMs?: number;
}

/** Keeps a public shutdown admitted until the exact child has been reconciled. */
export class SupervisorPublicShutdown {
	private readonly stops = new Map<string, Promise<MutationReservation>>();

	constructor(
		private readonly installation: Pick<InstallationMutationGate, 'reserve' | 'release'>,
		private readonly owner: DarwinIncarnation,
	) {}

	async admit(generation: string): Promise<void> {
		let pending = this.stops.get(generation);
		if (pending === undefined) {
			pending = this.installation.reserve({ kind: 'stop', owner: this.owner });
			this.stops.set(generation, pending);
		}
		try { await pending; }
		catch (error) {
			if (this.stops.get(generation) === pending) this.stops.delete(generation);
			throw error;
		}
	}

	async reconciled(generation: string): Promise<void> {
		const pending = this.stops.get(generation);
		if (pending === undefined) return;
		const reservation = await pending.catch(() => undefined);
		if (reservation !== undefined) await this.installation.release(reservation);
		this.stops.delete(generation);
	}
}

const fail = (code: SupervisorLifecycleError['code'], message: string, generation: string | null = null): never => {
	throw new SupervisorLifecycleError(code, message, generation);
};

/** One event loop owns each child and serializes its escalation with exact reap. */
export class DaemonSupervisor {
	private active: OwnedGeneration | undefined;
	private last: ConfirmedExit | undefined;
	private failedStart: string | undefined;
	private preparing = false;
	private readonly clock: SupervisorClock;

	constructor(private readonly options: SupervisorOptions) {
		this.clock = options.clock ?? clock;
	}

	async controller(request: SupervisorRequest, owner: DarwinIncarnation): Promise<SupervisorReply> {
		try {
			if (request.op === 'status') return this.status(request);
			if (request.op !== 'start' && request.op !== 'stop') fail('watchdog-protocol', 'invalid controller operation');
			const reservation = await this.authorize(request, owner);
			return request.op === 'start' ? await this.start(request, reservation, owner) : this.stop(request);
		} catch (error) { return this.failure(request, error); }
	}

	private async authorize(request: SupervisorRequest, owner: DarwinIncarnation): Promise<MutationReservation> {
		const { active } = await this.options.installation.read();
		if (active === null || (active.kind === 'update' ? request.updateId !== active.id : request.updateId !== undefined)
			|| (active.kind !== 'update' && active.kind !== 'restart' && active.kind !== request.op)) {
			return fail('busy', 'lifecycle operation has no matching installation reservation');
		}
		if (active.owner.pid !== owner.pid || active.owner.uid !== owner.uid
			|| active.owner.startedAt !== owner.startedAt || active.owner.executable !== owner.executable) {
			return fail('busy', 'installation lifecycle operation is owned by another controller');
		}
		return this.options.installation.admit({ id: active.id, owner });
	}

	private failure(request: SupervisorRequest, error: unknown): SupervisorReply {
		const base = { v: request.v, id: request.id, generation: request.generation, ok: false } as const;
		return error instanceof SupervisorLifecycleError
			? { ...base, error: error.code, ...(error.exit === undefined ? {} : { exit: error.exit }) }
			: { ...base, error: 'supervisor-unavailable' };
	}

	private reply(request: SupervisorRequest, generation: string | null, state: SupervisorState, exit?: SupervisorExit): SupervisorReply {
		return { v: request.v, id: request.id, generation, ok: true, state, ...(exit === undefined ? {} : { exit }) };
	}

	private status(request: SupervisorRequest): SupervisorReply {
		const active = this.active;
		if (active === undefined && this.failedStart !== undefined
			&& (request.generation === null || request.generation === this.failedStart)) {
			return this.failure({ ...request, generation: this.failedStart },
				new SupervisorLifecycleError('runtime-unavailable', 'the daemon process could not start'));
		}
		const generation = active?.id ?? this.last?.generation ?? null;
		if (request.generation !== null && request.generation !== generation) return fail('ownership-conflict', 'stale status generation');
		if (active !== undefined) {
			if (active.failure !== undefined) {
				return this.failure({ ...request, generation }, new SupervisorLifecycleError(active.failure, 'generation is fenced'));
			}
			return this.reply(request, active.id, active.state);
		}
		return this.reply(request, generation, this.last === undefined ? 'idle' : 'exited', this.last?.exit);
	}

	private async start(request: SupervisorRequest, reservation: MutationReservation, owner: DarwinIncarnation): Promise<SupervisorReply> {
		const already = this.existingStart(request);
		if (already !== undefined) return already;
		if (this.last === undefined) {
			if (reservation.kind === 'update') {
				const confirmed = reservation.entries.some(entry => entry.step === 'predecessor-stop' && entry.receipt !== undefined);
				if (!confirmed) return fail('ownership-conflict', 'replacement requires durable predecessor evidence');
			} else if (!await this.options.allowInitialStart()) {
				return fail('ownership-conflict', 'installation is not confirmed empty');
			}
		}
		await this.verifyRuntime();
		await this.options.installation.admit({ id: reservation.id, owner });
		const raced = this.existingStart(request);
		if (raced !== undefined) return raced;
		const generation = randomUUID();
		this.preparing = true;
		try {
			return await this.spawnGeneration(request, reservation, owner, generation);
		} finally { this.preparing = false; }
	}

	private async spawnGeneration(
		request: SupervisorRequest, reservation: MutationReservation, owner: DarwinIncarnation, generation: string,
	): Promise<SupervisorReply> {
		await this.options.runFiles?.prepare(generation);
		let child: ManagedChild;
		try {
			await this.options.installation.admit({ id: reservation.id, owner });
		} catch (error) {
			await this.options.runFiles?.reconcile(generation, undefined);
			throw error;
		}
		try {
			child = (this.options.spawnChild ?? spawnSupervisedDaemon)(this.options.daemon, generation, {
				frame: frame => this.childFrame(generation, frame),
				exit: (code, signal) => { void this.reap(generation, code, signal); },
				spawnFailed: () => { void this.spawnFailed(generation); },
			});
		} catch {
			await this.options.runFiles?.reconcile(generation, undefined);
			return fail('runtime-unavailable', 'pinned daemon could not be spawned');
		}
		const active: OwnedGeneration = {
			id: generation, predecessor: request.generation, child, state: 'starting',
			deadline: undefined, cancel: undefined, drain: undefined, forceAttempted: false,
			forceSent: false, reaped: false, checkingReady: false, failure: undefined,
		};
		this.active = active;
		this.failedStart = undefined;
		this.arm(active, this.options.startupMs ?? 60_000);
		return this.reply(request, generation, 'starting');
	}

	private existingStart(request: SupervisorRequest): SupervisorReply | undefined {
		if (this.preparing) return fail('busy', 'previous generation is preparing to start');
		if (this.active !== undefined) {
			if (this.active.failure !== undefined) return fail(this.active.failure, 'previous generation is fenced');
			if (request.generation === this.active.predecessor && this.active.state !== 'draining') {
				return this.reply(request, this.active.id, this.active.state);
			}
			return fail('busy', 'previous generation has not exited');
		}
		if (request.generation !== (this.last?.generation ?? null)) return fail('ownership-conflict', 'stale predecessor');
		return undefined;
	}

	private async verifyRuntime(): Promise<void> {
		const { runtime, entry, cwd } = this.options.daemon;
		try {
			if (![runtime, entry, cwd].every(isAbsolute)) throw new Error('paths must be absolute');
			await access(runtime, constants.X_OK);
			await access(entry, constants.R_OK);
			if (!(await stat(runtime)).isFile() || !(await stat(entry)).isFile() || !(await stat(cwd)).isDirectory()) {
				throw new Error('pinned paths do not have the expected types');
			}
		} catch { fail('runtime-unavailable', 'pinned daemon runtime or entry is unavailable'); }
	}

	private stop(request: SupervisorRequest): SupervisorReply {
		const active = this.active;
		if (active === undefined) {
			if (this.last === undefined) return fail('not-running', 'no managed daemon is active');
			if (this.last.generation !== request.generation) return fail('ownership-conflict', 'stale stop generation');
			if (this.last.exit.kind === 'failed') {
				throw new SupervisorLifecycleError('daemon-exit-failed', 'daemon exited unsuccessfully', this.last.generation, this.last.exit);
			}
			return this.reply(request, this.last.generation, 'exited', this.last.exit);
		}
		if (request.generation !== active.id) return fail('ownership-conflict', 'stale stop generation');
		if (active.failure !== undefined) return fail(active.failure, 'generation is fenced');
		if (active.state !== 'draining') {
			active.state = 'draining';
			this.arm(active, request.deadlineMs ?? this.options.shutdownMs ?? 20_000);
			active.drain = { v: 1, id: randomUUID(), op: 'drain', generation: active.id };
			active.child.send(active.drain);
		}
		return this.reply(request, active.id, 'draining');
	}

	private arm(active: OwnedGeneration, duration: number): void {
		const deadline = this.clock.now() + duration;
		if (active.deadline !== undefined && active.deadline <= deadline) return;
		active.cancel?.();
		active.deadline = deadline;
		const due = (): void => {
			if (this.active !== active || active.reaped || active.deadline !== deadline) return;
			const remaining = deadline - this.clock.now();
			if (remaining > 0) { active.cancel = this.clock.schedule(due, remaining); return; }
			this.force(active);
		};
		active.cancel = this.clock.schedule(due, duration);
	}

	private force(active: OwnedGeneration): void {
		if (this.active !== active || active.reaped || active.forceAttempted) return;
		active.forceAttempted = true;
		active.state = 'draining';
		this.options.runFiles?.fence(active.id);
		active.child.closeChannel();
		try { active.forceSent = active.child.kill(); } catch { active.forceSent = false; }
		active.cancel = this.clock.schedule(() => {
			if (this.active === active && !active.reaped) active.failure = 'exit-unconfirmed';
		}, this.options.reapMs ?? 5_000);
	}

	private childFrame(generation: string, frame: unknown): void {
		const active = this.active;
		if (active === undefined || active.id !== generation || active.reaped || active.forceAttempted) return;
		if (typeof frame === 'object' && frame !== null && 'ok' in frame && active.drain !== undefined) {
			readSupervisorReply(frame, active.drain);
			return;
		}
		const request = readSupervisorRequest(frame, {
			role: 'child', generation, leaseToken: this.options.runFiles?.token(generation) ?? null, drainId: active.drain?.id ?? null,
		});
		void this.handleChild(active, request);
	}

	private async handleChild(active: OwnedGeneration, request: SupervisorRequest): Promise<void> {
		try {
			if (request.op === 'ready') {
				if (!await this.confirmReady(active)) return;
			} else if (request.op === 'arm') {
				if (request.armSource === 'public-rpc') await this.options.publicArm(active.id);
				if (this.active !== active || active.reaped || active.forceAttempted) return;
				if (active.state !== 'draining') {
					active.state = 'draining';
					this.arm(active, request.deadlineMs ?? this.options.shutdownMs ?? 20_000);
				}
			} else if (request.op === 'guard-acquire' && this.options.runFiles !== undefined && active.state !== 'running') {
				const leaseToken = await this.options.runFiles.grant(active.id);
				if (this.active === active && !active.reaped && !active.forceAttempted) {
					active.child.send({ v: 1, id: request.id, generation: active.id, ok: true, state: active.state, leaseToken });
				}
				return;
			} else if (request.op === 'guard-release' && this.options.runFiles !== undefined && request.leaseToken !== undefined) {
				this.options.runFiles.releaseGrant(active.id, request.leaseToken);
			} else return fail('watchdog-protocol', 'unsupported inherited operation');
			active.child.send(this.reply(request, active.id, active.state));
		} catch (error) {
			if (this.active === active && !active.reaped && !active.forceAttempted) active.child.send(this.failure(request, error));
		}
	}

	private async confirmReady(active: OwnedGeneration): Promise<boolean> {
		const pid = active.child.pid;
		if (active.state !== 'starting' || pid === undefined || active.checkingReady) {
			return fail('ownership-conflict', 'stale or duplicate readiness');
		}
		active.checkingReady = true;
		try {
			await this.options.verifyReady(active.id, pid);
			if (!this.canReady(active)) return false;
			await this.options.runFiles?.ready(active.id, pid);
			if (!this.canReady(active)) return false;
			if (active.deadline !== undefined && this.clock.now() >= active.deadline) { this.force(active); return false; }
			await this.options.runFiles?.finishReady(active.id);
			if (!this.canReady(active)) return false;
			if (active.deadline !== undefined && this.clock.now() >= active.deadline) { this.force(active); return false; }
			active.cancel?.();
			active.deadline = undefined;
			active.state = 'running';
			return true;
		} finally { active.checkingReady = false; }
	}

	private canReady(active: OwnedGeneration): boolean {
		return this.active === active && active.state === 'starting' && !active.reaped && !active.forceAttempted;
	}

	private async spawnFailed(generation: string): Promise<void> {
		const active = this.active;
		if (active?.id !== generation || active.child.pid !== undefined) return;
		active.cancel?.();
		active.child.closeChannel();
		// Node emits a spawn error without a child PID. There is no process to reap.
		active.reaped = true;
		active.failure = 'runtime-unavailable';
		try {
			await this.options.runFiles?.reconcile(active.id, undefined);
			await this.options.reconcileExit(active.id, undefined);
		}
		catch { active.failure = 'ownership-conflict'; return; }
		this.failedStart = generation;
		this.active = undefined;
	}

	private async reap(generation: string, code: number | null, signal: number | null): Promise<void> {
		const active = this.active;
		if (active?.id !== generation || active.reaped) return;
		active.reaped = true;
		active.state = 'draining';
		active.cancel?.();
		active.child.closeChannel();
		const exit: SupervisorExit = {
			kind: active.forceSent && signal === os.signals.SIGKILL ? 'forced' : code === 0 ? 'graceful' : 'failed',
			code, signal,
		};
		try {
			await this.options.runFiles?.reconcile(active.id, active.child.pid);
			await this.options.reconcileExit(active.id, active.child.pid);
		}
		catch { active.failure = 'ownership-conflict'; return; }
		this.last = { generation, exit };
		this.active = undefined;
	}
}
