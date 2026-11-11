/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { sameProcess } from './daemon-process.js';
import type { ProcessIdentity } from './daemon-process.js';

export const SUPERVISOR_FRAME_BYTES = 8 * 1024;
export const SUPERVISOR_VERSION = 1;
const MAX_VERSIONS = 16;
const MAX_DEADLINE_MS = 0x7fff_ffff;

const CONTROLLER_OPS = ['status', 'start', 'stop'] as const;
const CHILD_OPS = ['ready', 'arm', 'guard-acquire', 'guard-release'] as const;
const PARENT_OPS = ['drain'] as const;
const ARM_SOURCES = ['public-rpc', 'signal', 'supervisor-drain'] as const;
const STATES = ['idle', 'starting', 'running', 'draining', 'exited'] as const;
const EXIT_KINDS = ['graceful', 'forced', 'failed'] as const;
const ERROR_CODES = [
	'ownership-conflict', 'exit-unconfirmed', 'supervisor-unavailable',
	'watchdog-timeout', 'watchdog-channel', 'watchdog-protocol', 'busy',
	'not-running', 'daemon-exit-failed', 'launch-domain-unavailable', 'runtime-unavailable',
] as const;

export type SupervisorOperation = (typeof CONTROLLER_OPS | typeof CHILD_OPS | typeof PARENT_OPS)[number];
export type SupervisorErrorCode = typeof ERROR_CODES[number];
export type SupervisorState = typeof STATES[number];

export interface SupervisorExit {
	kind: typeof EXIT_KINDS[number];
	code: number | null;
	signal: number | null;
}

export class SupervisorLifecycleError extends Error {
	constructor(
		readonly code: SupervisorErrorCode,
		message: string,
		readonly generation: string | null = null,
		readonly exit?: SupervisorExit,
	) {
		super(message);
		this.name = 'SupervisorLifecycleError';
	}
}

export interface SupervisorHello {
	hello: 1;
	id: string;
	supportedVersions: readonly number[];
}

export interface SupervisorRelease {
	installationRoot: string;
	releaseId: string;
}

/** Identity comes from the OS and the pinned job, separately from the hello. */
export interface SupervisorPeer extends ProcessIdentity {
	uid: number;
}

export interface SupervisorHelloReply extends SupervisorHello, SupervisorRelease {
	selectedVersion: number | null;
}

export interface SupervisorRequest {
	v: typeof SUPERVISOR_VERSION;
	id: string;
	op: SupervisorOperation;
	generation: string | null;
	deadlineMs?: number;
	leaseToken?: string;
	updateId?: string;
	armSource?: typeof ARM_SOURCES[number];
	drainId?: string;
}

interface ReplyEnvelope {
	v: typeof SUPERVISOR_VERSION;
	id: string;
	generation: string | null;
}

export type SupervisorReply = ReplyEnvelope & (
	| { ok: true; state: SupervisorState; exit?: SupervisorExit; leaseToken?: string }
	| { ok: false; error: SupervisorErrorCode; exit?: SupervisorExit }
);

export type SupervisorRequestChannel =
	| { role: 'controller'; version: number | null }
	| { role: 'child'; generation: string; leaseToken: string | null; drainId: string | null }
	| { role: 'parent'; generation: string };

function protocol(message: string): never {
	throw new SupervisorLifecycleError('watchdog-protocol', message);
}

function record(input: unknown): Record<string, unknown> {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) protocol('expected a JSON object');
	return input as Record<string, unknown>;
}

function fields(input: Record<string, unknown>, allowed: readonly string[]): void {
	if (Object.keys(input).some(key => !allowed.includes(key))) protocol('unexpected frame field');
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
	return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function token(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length !== 0 && !value.includes('\0');
}

function positiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function versions(value: unknown): value is readonly number[] {
	return Array.isArray(value) && value.length > 0 && value.length <= MAX_VERSIONS
		&& Array.from(value).every(positiveInteger) && new Set(value).size === value.length;
}

function highestCommonVersion(a: readonly number[], b: readonly number[]): number | null {
	const common = a.filter(version => b.includes(version));
	return common.length === 0 ? null : Math.max(...common);
}

export function readSupervisorHello(input: unknown): SupervisorHello {
	const frame = record(input);
	fields(frame, ['hello', 'id', 'supportedVersions']);
	if (frame.hello !== 1 || !token(frame.id) || !versions(frame.supportedVersions)) protocol('invalid hello');
	return { hello: 1, id: frame.id, supportedVersions: frame.supportedVersions };
}

export function replyToSupervisorHello(
	hello: SupervisorHello,
	release: SupervisorRelease,
	supportedVersions: readonly number[],
): SupervisorHelloReply {
	if (!versions(supportedVersions)) protocol('invalid local version list');
	return {
		hello: 1, id: hello.id, supportedVersions, ...release,
		selectedVersion: highestCommonVersion(hello.supportedVersions, supportedVersions),
	};
}

export function verifySupervisorHelloReply(
	input: unknown,
	hello: SupervisorHello,
	expectedRelease: SupervisorRelease,
	expectedPeer: SupervisorPeer,
	observedPeer: SupervisorPeer,
): number {
	const frame = record(input);
	fields(frame, ['hello', 'id', 'installationRoot', 'releaseId', 'supportedVersions', 'selectedVersion']);
	if (frame.hello !== 1 || frame.id !== hello.id || !versions(frame.supportedVersions)
		|| !token(frame.installationRoot) || !token(frame.releaseId)) protocol('invalid hello reply');
	if (frame.installationRoot !== expectedRelease.installationRoot || frame.releaseId !== expectedRelease.releaseId
		|| observedPeer.uid !== expectedPeer.uid || !sameProcess(expectedPeer, observedPeer)) {
		throw new SupervisorLifecycleError('ownership-conflict', 'supervisor installation or peer does not match');
	}
	const selected = highestCommonVersion(hello.supportedVersions, frame.supportedVersions);
	if (selected === null || selected !== frame.selectedVersion) protocol('supervisor version negotiation failed');
	return selected;
}

/** A connection owns one reader. Close the connection if framing or a callback throws. */
export class SupervisorFrameReader {
	private readonly partial = Buffer.alloc(SUPERVISOR_FRAME_BYTES);
	private readonly utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
	private used = 0;

	push(chunk: Buffer, onFrame: (frame: unknown) => void): void {
		for (let offset = 0; offset < chunk.length;) {
			const newline = chunk.indexOf(10, offset);
			const end = newline === -1 ? chunk.length : newline;
			const length = end - offset;
			if (this.used + length > SUPERVISOR_FRAME_BYTES) protocol('supervisor frame exceeds 8 KiB');
			chunk.copy(this.partial, this.used, offset, end);
			this.used += length;
			if (newline === -1) return;
			let frame: unknown;
			try {
				frame = JSON.parse(this.utf8.decode(this.partial.subarray(0, this.used)));
			} catch {
				protocol('invalid UTF-8 JSON supervisor frame');
			}
			this.used = 0;
			offset = newline + 1;
			onFrame(frame);
		}
	}

	discardPartial(): void {
		this.used = 0;
	}
}

export function encodeSupervisorFrame(frame: SupervisorHello | SupervisorHelloReply | SupervisorRequest | SupervisorReply): Buffer {
	const payload = JSON.stringify(frame);
	if (Buffer.byteLength(payload) > SUPERVISOR_FRAME_BYTES) protocol('supervisor frame exceeds 8 KiB');
	return Buffer.from(payload + '\n');
}

export function readSupervisorRequest(input: unknown, channel: SupervisorRequestChannel): SupervisorRequest {
	const frame = record(input);
	const ops = channel.role === 'controller' ? CONTROLLER_OPS : channel.role === 'child' ? CHILD_OPS : PARENT_OPS;
	if (frame.v !== SUPERVISOR_VERSION || (channel.role === 'controller' && frame.v !== channel.version)
		|| !token(frame.id) || !oneOf(frame.op, ops) || (frame.generation !== null && !token(frame.generation))) {
		protocol('invalid supervisor request envelope or channel');
	}
	const { op, generation } = frame;
	const allowed = ['v', 'id', 'op', 'generation'];
	if (op === 'stop' || op === 'arm') {
		allowed.push('deadlineMs');
		if ('deadlineMs' in frame && (!positiveInteger(frame.deadlineMs) || frame.deadlineMs > MAX_DEADLINE_MS)) {
			protocol('invalid supervisor deadline');
		}
	}
	if (op === 'start' || op === 'stop') {
		allowed.push('updateId');
		if ('updateId' in frame && !token(frame.updateId)) protocol('invalid update id');
	}
	if (generation === null && op !== 'status' && op !== 'start') protocol('generation required');
	if (op === 'arm') {
		allowed.push('armSource');
		if (!oneOf(frame.armSource, ARM_SOURCES)) protocol('invalid watchdog arm source');
		if (frame.armSource === 'supervisor-drain') {
			allowed.push('drainId');
			if (!token(frame.drainId) || channel.role !== 'child' || frame.drainId !== channel.drainId) {
				protocol('watchdog arm does not match an admitted drain');
			}
		}
	}
	if (op === 'guard-release') {
		allowed.push('leaseToken');
		if (!token(frame.leaseToken)) protocol('guard release requires a lease token');
	}
	fields(frame, allowed);
	if (channel.role !== 'controller' && generation !== channel.generation) {
		throw new SupervisorLifecycleError('ownership-conflict', 'stale generation', generation);
	}
	if (op === 'guard-release' && channel.role === 'child' && frame.leaseToken !== channel.leaseToken) {
		throw new SupervisorLifecycleError('ownership-conflict', 'lease does not match active grant', generation);
	}
	return frame as unknown as SupervisorRequest;
}

function exitReceipt(input: unknown): void {
	const receipt = record(input);
	fields(receipt, ['kind', 'code', 'signal']);
	const { code, signal } = receipt;
	if (!oneOf(receipt.kind, EXIT_KINDS)
		|| (code !== null && (typeof code !== 'number' || !Number.isSafeInteger(code) || code < 0))
		|| (signal !== null && !positiveInteger(signal)) || (code === null) === (signal === null)) {
		protocol('invalid supervisor exit receipt');
	}
	if ((receipt.kind === 'graceful' && code !== 0) || (receipt.kind === 'forced' && signal === null)
		|| (receipt.kind === 'failed' && code === 0)) protocol('inconsistent supervisor exit receipt');
}

export function readSupervisorReply(input: unknown, request: SupervisorRequest): SupervisorReply {
	const frame = record(input);
	if (frame.v !== request.v || frame.id !== request.id || (frame.generation !== null && !token(frame.generation))) {
		protocol('supervisor reply does not match request');
	}
	const common = ['v', 'id', 'generation', 'ok'];
	if (frame.ok === false) {
		fields(frame, [...common, 'error', 'exit']);
		if (!oneOf(frame.error, ERROR_CODES)) protocol('unknown lifecycle error');
		if (frame.error === 'daemon-exit-failed') {
			exitReceipt(frame.exit);
			if (record(frame.exit).kind !== 'failed' || !token(frame.generation)) protocol('failed exit evidence required');
		} else if ('exit' in frame) protocol('unexpected exit evidence');
	} else if (frame.ok === true) {
		fields(frame, [...common, 'state', 'exit', 'leaseToken']);
		if (!oneOf(frame.state, STATES)) protocol('unknown lifecycle state');
		if (request.op === 'guard-acquire' ? !token(frame.leaseToken) : 'leaseToken' in frame) {
			protocol('invalid lease token in reply');
		}
		if (request.op === 'arm' && frame.state !== 'draining') protocol('invalid watchdog arm acknowledgement');
		if (request.op === 'start' && !token(frame.generation)) protocol('start reply requires a generation');
		if ('exit' in frame) {
			exitReceipt(frame.exit);
			if (frame.state !== 'exited' || !token(frame.generation)) protocol('unexpected exit evidence');
		}
	} else protocol('invalid lifecycle reply');
	if (request.generation !== null && !(request.op === 'start' && frame.ok === true)
		&& frame.generation !== request.generation) protocol('reply generation does not match request');
	return frame as unknown as SupervisorReply;
}
