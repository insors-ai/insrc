/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { readDarwinIncarnation, readDarwinPeerCredentials, verifyDarwinJobProcess } from '../../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import {
	encodeSupervisorFrame, readSupervisorReply, SupervisorFrameReader, SupervisorLifecycleError, verifySupervisorHelloReply,
} from '../../shared/daemon-supervisor-protocol.js';
import type { SupervisorHello, SupervisorReply, SupervisorRequest } from '../../shared/daemon-supervisor-protocol.js';
import { classifyMutationRecovery, InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type { MutationReservation } from '../../shared/installation-mutation-gate.js';
import { ensureManagedJob, inspectManagedJob, installationPaths, requireQuiescentInstallation, supervisorJob } from '../../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../../shared/managed-daemon-installation.js';

type Request = Pick<SupervisorRequest, 'op' | 'generation' | 'deadlineMs'>;
type Reply = Extract<SupervisorReply, { ok: true }>;
const CALL_TIMEOUT_MS = 3_500;
const START_TIMEOUT_MS = 70_000;
const STOP_TIMEOUT_MS = 40_000;
const POLL_MS = 125;

export interface ManagedSupervisorLink {
	call(request: Request): Promise<SupervisorReply>;
	close(): void;
}

class SupervisorLink implements ManagedSupervisorLink {
	private readonly frames = new SupervisorFrameReader();
	private waiting: { resolve(frame: unknown): void; reject(error: Error): void } | undefined;

	constructor(private readonly socket: Socket) {
		socket.on('data', (data: Buffer) => {
			try {
				this.frames.push(data, frame => {
					const next = this.waiting;
					if (next === undefined) throw new Error('unsolicited supervisor frame');
					this.waiting = undefined;
					next.resolve(frame);
				});
			} catch { this.close(); }
		});
		socket.on('error', () => this.close());
		socket.once('close', () => this.close());
	}

	private exchange(frame: SupervisorHello | SupervisorRequest): Promise<unknown> {
		if (this.socket.destroyed || this.waiting !== undefined) return Promise.reject(unavailable('supervisor connection is unavailable'));
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => this.close(), CALL_TIMEOUT_MS);
			this.waiting = {
				resolve: value => { clearTimeout(timeout); resolve(value); },
				reject: error => { clearTimeout(timeout); reject(error); },
			};
			this.socket.write(encodeSupervisorFrame(frame));
		});
	}

	async hello(installation: ManagedInstallation, expected: DarwinIncarnation, observed: DarwinIncarnation): Promise<void> {
		const hello: SupervisorHello = { hello: 1, id: randomUUID(), supportedVersions: [1] };
		const peer = (process: DarwinIncarnation) => ({ ...process, commandLine: process.executable });
		const frame = await this.exchange(hello);
		if (verifySupervisorHelloReply(frame, hello, {
			installationRoot: installation.stateRoot, releaseId: installation.releaseId,
		}, peer(expected), peer(observed)) !== 1) throw unavailable('no supported supervisor protocol');
	}

	async call(request: Request): Promise<SupervisorReply> {
		const frame: SupervisorRequest = { v: 1, id: randomUUID(), ...request };
		try { return readSupervisorReply(await this.exchange(frame), frame); }
		catch (error) { this.close(); throw error; }
	}

	close(): void {
		const next = this.waiting;
		this.waiting = undefined;
		next?.reject(unavailable('supervisor closed before confirming the operation'));
		this.frames.discardPartial();
		this.socket.destroy();
	}
}

function unavailable(message: string): SupervisorLifecycleError {
	return new SupervisorLifecycleError('supervisor-unavailable', message);
}

interface SupervisorLinkDeps {
	readonly inspect?: typeof inspectManagedJob;
	readonly verify?: typeof verifyDarwinJobProcess;
	readonly helper?: string;
}

export async function openManagedSupervisorLink(
	installation: ManagedInstallation, deps: SupervisorLinkDeps = {},
): Promise<ManagedSupervisorLink> {
	const job = supervisorJob(installation);
	const registered = await (deps.inspect ?? inspectManagedJob)(installation);
	if (registered?.pid == null) throw unavailable('verified supervisor job is unavailable');
	const expected = await readDarwinIncarnation(registered.pid, deps.helper);
	const socket = createConnection(installationPaths(installation.stateRoot).socket);
	let link: SupervisorLink | undefined;
	try {
		await once(socket, 'connect', { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
		link = new SupervisorLink(socket);
		const fd = (socket as Socket & { _handle?: { fd?: number } })._handle?.fd;
		if (fd === undefined) throw unavailable('supervisor socket has no Unix descriptor');
		const credentials = await readDarwinPeerCredentials(fd, deps.helper);
		if (credentials.uid !== job.uid || credentials.pid !== registered.pid) {
			throw new SupervisorLifecycleError('ownership-conflict', 'supervisor socket belongs to a different process');
		}
		const observed = await readDarwinIncarnation(credentials.pid, deps.helper);
		await link.hello(installation, expected, observed);
		await (deps.verify ?? verifyDarwinJobProcess)(job, observed);
		return link;
	} catch (error) {
		if (link !== undefined) link.close();
		else socket.destroy();
		throw error;
	}
}

function accepted(reply: SupervisorReply): Reply {
	if (!reply.ok) throw new SupervisorLifecycleError(reply.error, `supervisor refused lifecycle operation: ${reply.error}`, reply.generation, reply.exit);
	return reply;
}

interface ControlDeps {
	readonly gate?: InstallationMutationGate;
	readonly owner?: () => Promise<DarwinIncarnation>;
	readonly open?: () => Promise<ManagedSupervisorLink>;
	readonly ensure?: (check: () => Promise<void>) => Promise<void>;
}

export interface ManagedLifecycleResult {
	readonly alreadyRunning: boolean;
	readonly forced: boolean;
}

export class ManagedDaemonControl {
	private readonly gate: InstallationMutationGate;

	constructor(private readonly installation: ManagedInstallation, private readonly deps: ControlDeps = {}) {
		this.gate = deps.gate ?? new InstallationMutationGate(installation.stateRoot);
	}

	private owner(): Promise<DarwinIncarnation> {
		return this.deps.owner?.() ?? readDarwinIncarnation(process.pid);
	}

	private connect(): Promise<ManagedSupervisorLink> {
		return this.deps.open?.() ?? openManagedSupervisorLink(this.installation);
	}

	async run(kind: 'start' | 'stop' | 'restart', deadlineMs?: number): Promise<ManagedLifecycleResult> {
		const reservation = await this.gate.reserve({ kind, owner: await this.owner() });
		let link: ManagedSupervisorLink | undefined;
		try {
			if (kind !== 'stop') {
				const check = async () => { await this.gate.admit(reservation); };
				if (this.deps.ensure !== undefined) await this.deps.ensure(check);
				else await ensureManagedJob(this.installation, check, {
					intent: detail => this.gate.recordIntent(reservation, 'supervisor-job', detail),
					receipt: detail => this.gate.recordReceipt(reservation, 'supervisor-job', detail),
				});
			}
			link = await this.connectWithStartup(kind !== 'stop');
			const original = accepted(await link.call({ op: 'status', generation: null }));
			if (kind === 'start' && original.state === 'running') return { alreadyRunning: true, forced: false };
			let predecessor = original.generation;
			let forced = false;
			if (original.state !== 'idle' && original.state !== 'exited') {
				if (kind === 'start') throw new SupervisorLifecycleError('busy', 'daemon generation is already starting or draining', original.generation);
				const stopped = await this.stop(link, reservation, predecessor!, deadlineMs);
				predecessor = stopped.generation;
				forced = stopped.exit?.kind === 'forced';
				if (stopped.exit?.kind === 'failed') {
					throw new SupervisorLifecycleError('daemon-exit-failed', 'daemon exited unsuccessfully', predecessor, stopped.exit);
				}
			} else if (kind === 'stop') {
				throw new SupervisorLifecycleError('not-running', 'daemon is not running');
			} else if (kind === 'restart' && original.exit?.kind === 'failed') {
				throw new SupervisorLifecycleError('daemon-exit-failed', 'daemon exited unsuccessfully; use explicit start', predecessor, original.exit);
			}
			if (kind !== 'stop') await this.start(link, reservation, predecessor);
			return { alreadyRunning: false, forced };
		} finally {
			link?.close();
			// Unknown mutations deliberately leave their intent and reservation for recovery.
			const active = (await this.gate.read()).active;
			const last = active?.entries.at(-1);
			if (active?.id === reservation.id && (last === undefined || last.receipt !== undefined)) await this.gate.release(reservation);
		}
	}

	private async connectWithStartup(mayBeStarting: boolean): Promise<ManagedSupervisorLink> {
		const deadline = performance.now() + (mayBeStarting ? 5_000 : 0);
		for (;;) {
			try { return await this.connect(); }
			catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (performance.now() >= deadline || !['supervisor-unavailable', 'ENOENT', 'ECONNREFUSED'].includes(code ?? '')) throw error;
				await delay(POLL_MS);
			}
		}
	}

	private async stop(link: ManagedSupervisorLink, reservation: MutationReservation, generation: string, deadlineMs?: number): Promise<Reply> {
		await this.gate.recordIntent(reservation, 'stop', generation);
		const response = await link.call({ op: 'stop', generation, ...(deadlineMs !== undefined ? { deadlineMs } : {}) });
		if (!response.ok && response.error === 'daemon-exit-failed' && response.exit !== undefined) {
			await this.gate.recordReceipt(reservation, 'stop', JSON.stringify(response.exit));
		}
		let stopped = accepted(response);
		if (stopped.state !== 'exited') {
			stopped = await this.waitFor(link, generation, 'exited', Math.max(STOP_TIMEOUT_MS, (deadlineMs ?? 0) + 10_000));
		}
		if (stopped.exit === undefined || stopped.generation !== generation) throw unavailable('supervisor returned no confirmed exit receipt');
		await this.gate.recordReceipt(reservation, 'stop', JSON.stringify(stopped.exit));
		return stopped;
	}

	private async start(link: ManagedSupervisorLink, reservation: MutationReservation, generation: string | null): Promise<void> {
		await this.gate.recordIntent(reservation, 'start', generation ?? 'empty installation');
		const response = await link.call({ op: 'start', generation });
		if (!response.ok && response.error === 'runtime-unavailable') {
			await this.gate.recordReceipt(reservation, 'start', 'runtime unavailable, no launch admitted');
		}
		const started = accepted(response);
		if (started.generation === null) throw unavailable('supervisor returned no replacement generation');
		const ready = started.state === 'running' ? started : await this.waitFor(link, started.generation, 'running', START_TIMEOUT_MS);
		if (ready.state === 'exited' && ready.exit !== undefined) {
			await this.gate.recordReceipt(reservation, 'start', JSON.stringify(ready.exit));
			throw new SupervisorLifecycleError('daemon-exit-failed', 'daemon exited before becoming ready', ready.generation, ready.exit);
		}
		await this.gate.recordReceipt(reservation, 'start', started.generation);
	}

	private async waitFor(link: ManagedSupervisorLink, generation: string, state: 'running' | 'exited', timeoutMs: number): Promise<Reply> {
		const deadline = performance.now() + timeoutMs;
		for (;;) {
			const reply = accepted(await link.call({ op: 'status', generation }));
			if (reply.state === state) return reply;
			if (reply.state === 'exited' && reply.exit !== undefined) return reply;
			if (performance.now() >= deadline) {
				throw new SupervisorLifecycleError('exit-unconfirmed', `daemon generation did not reach ${state}`, generation);
			}
			await delay(POLL_MS);
		}
	}

	async recoveryStatus(): Promise<string> {
		const journal = await this.gate.read();
		const decision = classifyMutationRecovery(journal);
		if (decision === 'idle') return journal.outcome?.detail ?? 'managed daemon is stopped or unavailable';
		return `managed daemon recovery: ${decision} (${journal.active?.kind} reservation ${journal.active?.id})`
			+ (journal.outcome?.id === journal.active?.id && journal.outcome !== null ? `: ${journal.outcome.detail}` : '');
	}

	async recoverStoppedLifecycle(): Promise<void> {
		const active = (await this.gate.read()).active;
		if (active === null || active.kind === 'update') throw unavailable('no stopped lifecycle reservation can be recovered here');
		await this.gate.claimRecovery(active.id, await this.owner(), async () => {
			// A live or unverified job, guard or publication is never removed here.
			if ((await inspectManagedJob(this.installation))?.pid != null) return false;
			try { await requireQuiescentInstallation(this.installation); } catch { return false; }
			return true;
		});
		const recovered = (await this.gate.read()).active;
		if (recovered?.id !== active.id) throw unavailable('recovery reservation changed');
		const last = recovered.entries.at(-1);
		if (last !== undefined && last.receipt === undefined) {
			await this.gate.recordReceipt(recovered, last.step, 'verified job and daemon absent; run files reconciled');
		}
		await this.gate.release(recovered);
	}
}
