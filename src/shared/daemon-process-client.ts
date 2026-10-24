/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { onUtf8Data } from './utf8-stream.js';
import type { ProcessIdentity } from './daemon-process.js';

export interface StableProcessHandle {
	hasExited(): Promise<boolean>;
	terminate(): Promise<'sent' | 'exited'>;
	close(): Promise<void>;
}
export interface StopTarget extends ProcessIdentity {
	readonly handle: StableProcessHandle;
}
export interface ProcessCapabilityOptions {
	readonly executable?: string | undefined;
	readonly readyTimeoutMs?: number | undefined;
	readonly requestTimeoutMs?: number | undefined;
	readonly signal?: AbortSignal | undefined;
}
type Failure = 'denied' | 'unsupported' | 'unverifiable' | 'wrong-target' | 'protocol' | 'timeout' | 'cancelled' | 'spawn' | 'closed';
export class ProcessCapabilityError extends Error {
	constructor(message: string, readonly category: Failure, readonly errno?: number | undefined) {
		super(message); this.name = 'ProcessCapabilityError';
	}
}

const BROKER = fileURLToPath(new URL('../../out/bin/insrc-process-broker', import.meta.url));
const MAX_LINE = 256 * 1024;
type Operation = 'STATE' | 'TERM';
type Reply = 'ALIVE' | 'EXITED' | 'SENT';
interface Pending {
	readonly operation: Operation;
	readonly resolve: (reply: Reply) => void;
	readonly reject: (error: Error) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

function nativeError(category: string, code: number): ProcessCapabilityError {
	const kind: Failure = ['denied', 'unsupported', 'wrong-target'].includes(category) ? category as Failure
		: category.startsWith('invalid-') || category.startsWith('malformed-') ? 'protocol' : 'unverifiable';
	return new ProcessCapabilityError(`process capability broker refused: ${category} (errno ${code})`, kind, code);
}

/** One stdio session owns exactly one kernel target; its identity is never used to reacquire a PID. */
class BrokerClient implements StableProcessHandle {
	readonly ready: Promise<ProcessIdentity | undefined>;
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly ended: Promise<void>;
	private readonly pending = new Map<number, Pending>();
	private readonly readyTimer: ReturnType<typeof setTimeout>;
	private resolveReady!: (identity: ProcessIdentity | undefined) => void;
	private rejectReady!: (error: Error) => void;
	private readySettled = false;
	private closing = false;
	private buffer = '';
	private stderr = '';
	private nextId = 0;
	private failure: Error | undefined;
	private disposal: Promise<void> | undefined;
	private readonly abort = (): void => this.fail(new ProcessCapabilityError('process capability operation cancelled', 'cancelled'));

	constructor(private readonly pid: number, private readonly options: ProcessCapabilityOptions, private readonly requestMs: number) {
		this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
		try { this.child = spawn(options.executable ?? BROKER, [String(pid)], { stdio: ['pipe', 'pipe', 'pipe'] }); }
		catch (error) { throw new ProcessCapabilityError(`cannot launch process capability broker: ${error instanceof Error ? error.message : String(error)}`, 'spawn'); }
		this.ended = new Promise(resolve => {
			this.child.once('close', (code, signal) => {
				resolve();
				if (!this.closing) this.fail(new ProcessCapabilityError(`process capability broker closed unexpectedly (code ${code}, signal ${signal})${this.stderr ? `: ${this.stderr.trim()}` : ''}`, 'unverifiable'));
			});
		});
		this.readyTimer = setTimeout(() => this.fail(new ProcessCapabilityError('process capability readiness timed out', 'timeout')), options.readyTimeoutMs ?? 2000);
		this.child.once('error', error => this.fail(new ProcessCapabilityError(`cannot launch process capability broker: ${error.message}`, 'spawn')));
		this.child.stdin.on('error', error => { if (!this.closing) this.fail(new ProcessCapabilityError(`process capability transport failed: ${error.message}`, 'unverifiable')); });
		onUtf8Data(this.child.stdout, text => this.receive(text));
		onUtf8Data(this.child.stderr, text => { this.stderr = (this.stderr + text).slice(0, 8192); });
		options.signal?.addEventListener('abort', this.abort, { once: true });
		if (options.signal?.aborted) this.abort();
	}

	private fail(error: Error): void {
		if (this.closing) return;
		this.failure = error;
		if (!this.readySettled) { this.readySettled = true; this.rejectReady(error); }
		for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
		this.pending.clear();
		void this.close().catch(() => { /* callers await close as well and receive a cleanup failure */ });
	}

	private receive(text: string): void {
		if (this.closing) return;
		this.buffer += text;
		let newline: number;
		while ((newline = this.buffer.indexOf('\n')) >= 0) {
			if (newline > MAX_LINE) { this.fail(new ProcessCapabilityError('process capability reply exceeded its bound', 'protocol')); return; }
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			try { this.line(line); }
			catch (error) { this.fail(error instanceof Error ? error : new ProcessCapabilityError(String(error), 'protocol')); }
			if (this.closing) return;
		}
		if (this.buffer.length > MAX_LINE) this.fail(new ProcessCapabilityError('process capability reply exceeded its bound', 'protocol'));
	}

	private line(line: string): void {
		if (!this.readySettled) {
			const error = /^ERROR ([a-z-]+) ([1-9]\d*)$/.exec(line);
			if (error) {
				const code = Number(error[2]);
				if (!Number.isSafeInteger(code)) throw new ProcessCapabilityError('invalid native errno', 'protocol');
				if (error[1] === 'gone' && code === constants.errno.ESRCH) {
					this.readySettled = true; clearTimeout(this.readyTimer); this.resolveReady(undefined);
					void this.close().catch(() => {}); return;
				}
				throw nativeError(error[1]!, code);
			}
			const match = /^READY 1 ([1-9]\d*) ([0-9a-f]+) ([0-9a-f]+)$/.exec(line);
			if (!match || Number(match[1]) !== this.pid || match[2]!.length % 2 !== 0 || match[3]!.length % 2 !== 0) throw new ProcessCapabilityError('invalid process capability readiness reply', 'protocol');
			let startedAt: string, commandLine: string;
			try {
				const decoder = new TextDecoder('utf-8', { fatal: true });
				startedAt = decoder.decode(Buffer.from(match[2]!, 'hex'));
				commandLine = decoder.decode(Buffer.from(match[3]!, 'hex'));
			} catch { throw new ProcessCapabilityError('invalid UTF-8 capability identity', 'protocol'); }
			if (!/^(linux|darwin):[^\s\0]+$/.test(startedAt) || commandLine.includes('\0') || !/\/daemon\/index\.(js|ts)$/.test(commandLine)) throw new ProcessCapabilityError('broker identity is not a verified daemon target', 'wrong-target');
			this.readySettled = true; clearTimeout(this.readyTimer);
			this.resolveReady(Object.freeze({ pid: this.pid, startedAt, commandLine })); return;
		}
		const match = /^([1-9]\d*) (ALIVE|EXITED|SENT|ERROR)(?: ([a-z-]+) ([1-9]\d*))?$/.exec(line);
		const id = match ? Number(match[1]) : NaN;
		const pending = this.pending.get(id);
		if (!match || !pending || !Number.isSafeInteger(id)) throw new ProcessCapabilityError('unmatched process capability reply', 'protocol');
		if (match[2] === 'ERROR') {
			const code = Number(match[4]);
			if (!match[3] || !Number.isSafeInteger(code) || code <= 0) throw new ProcessCapabilityError('invalid native request error', 'protocol');
			throw nativeError(match[3], code);
		}
		if (match[3] !== undefined || (pending.operation === 'STATE' ? !['ALIVE', 'EXITED'].includes(match[2]!) : !['SENT', 'EXITED'].includes(match[2]!))) throw new ProcessCapabilityError('unexpected process capability operation result', 'protocol');
		clearTimeout(pending.timer); this.pending.delete(id); pending.resolve(match[2] as Reply);
	}

	private async request(operation: Operation): Promise<Reply> {
		if (this.closing || this.failure || this.options.signal?.aborted) { await this.close(); throw this.failure ?? new ProcessCapabilityError('process capability handle is closed', 'closed'); }
		if (++this.nextId > 0xffff_ffff) { const error = new ProcessCapabilityError('process capability request identifiers exhausted', 'protocol'); this.fail(error); await this.close(); throw error; }
		const id = this.nextId;
		try {
			return await new Promise<Reply>((resolve, reject) => {
				const timer = setTimeout(() => this.fail(new ProcessCapabilityError('process capability request timed out', 'timeout')), this.requestMs);
				this.pending.set(id, { operation, resolve, reject, timer });
				this.child.stdin.write(`${id} ${operation}\n`, error => { if (error) this.fail(new ProcessCapabilityError(`process capability write failed: ${error.message}`, 'unverifiable')); });
			});
		} catch (error) { await this.close(); throw error; }
	}

	async hasExited(): Promise<boolean> { return await this.request('STATE') === 'EXITED'; }
	async terminate(): Promise<'sent' | 'exited'> { return await this.request('TERM') === 'SENT' ? 'sent' : 'exited'; }
	assertOpen(): void { if (this.closing || this.failure) throw this.failure ?? new ProcessCapabilityError('process capability handle is closed', 'closed'); }

	close(): Promise<void> {
		if (this.disposal) return this.disposal;
		this.closing = true; clearTimeout(this.readyTimer); this.buffer = '';
		this.options.signal?.removeEventListener('abort', this.abort);
		const closed = this.failure ?? new ProcessCapabilityError('process capability handle is closed', 'closed');
		if (!this.readySettled) { this.readySettled = true; this.rejectReady(closed); }
		for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(closed); }
		this.pending.clear(); this.child.stdin.end();
		this.disposal = new Promise<void>((resolve, reject) => {
			// This signal targets ONLY our own broker child, never the captured daemon PID.
			const kill = setTimeout(() => { if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL'); }, 100);
			const deadline = setTimeout(() => { clearTimeout(kill); reject(new ProcessCapabilityError('process capability helper did not exit after closure', 'timeout')); }, this.requestMs + 1000);
			void this.ended.then(() => { clearTimeout(kill); clearTimeout(deadline); resolve(); });
		});
		return this.disposal;
	}
}

/** Undefined is reserved for the native broker's positive ESRCH evidence, never missing metadata. */
export async function captureStopTarget(pid: number, options: ProcessCapabilityOptions = {}): Promise<StopTarget | undefined> {
	if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fff_ffff) throw new ProcessCapabilityError('invalid daemon target PID', 'protocol');
	for (const bound of [options.readyTimeoutMs ?? 2000, options.requestTimeoutMs ?? 2000]) if (!Number.isSafeInteger(bound) || bound <= 0 || bound > 0x7fff_ffff - 1000) throw new ProcessCapabilityError('capability timeouts must be positive integers within the timer range', 'protocol');
	if (options.signal?.aborted) throw new ProcessCapabilityError('process capability capture cancelled', 'cancelled');
	const config = Object.freeze({ ...options });
	const client = new BrokerClient(pid, config, config.requestTimeoutMs ?? 2000);
	try {
		const identity = await client.ready;
		if (!identity) { await client.close(); return undefined; }
		client.assertOpen();
		return Object.freeze({ ...identity, handle: client });
	} catch (error) { await client.close(); throw error; }
}
