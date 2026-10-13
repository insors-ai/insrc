/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The MCP-side forwarder of the seven step tools (Epic c2ba6fa6, Story s11).
 *
 * The step handlers run in the daemon. A tool call here sends the client's raw
 * arguments over the daemon's `step.call` stream request, with this process's
 * working directory, its INSRC_REPO and the calling client, and returns the
 * reply envelope of the 'done' frame unchanged. Progress frames are relayed
 * only when the client asked for progress. This process never runs a handler
 * itself, also not as a fallback:
 *
 *   - no daemon (the socket is missing or refuses)  -> DaemonUnreachableError
 *   - a daemon without step.call, or without the tool -> DaemonTooOldError
 *
 * both returned as an isError envelope in the shape the handlers use for their
 * own errors.
 */

import { createConnection, type Socket } from 'node:net';

import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';
import type { StepClient, StepToolName } from '../shared/step-context.js';

const log = getLogger('mcp:forward-step');

/** A step tool's reply. */
export interface StepMcpEnvelope {
	[key: string]: unknown;
	content: { type: 'text'; text: string }[];
	isError?: boolean;
}

/** The daemon is not running: its socket is missing or refuses the connection. */
export class DaemonUnreachableError extends Error {
	readonly code = 'daemon-unreachable';
	constructor(message: string) { super(message); this.name = 'DaemonUnreachableError'; }
}

/** The daemon is older than this MCP server: it has no step.call, or not this tool. */
export class DaemonTooOldError extends Error {
	readonly code = 'daemon-too-old';
	constructor(message: string) { super(message); this.name = 'DaemonTooOldError'; }
}

export interface ForwardStepExtra {
	/** The calling client, converted from the MCP client's name. */
	readonly client?: StepClient | undefined;
	/** Called with each progress frame's data; given only when the client sent a progress token. */
	readonly onProgress?: ((data: unknown) => void) | undefined;
}

export interface ForwardStepDeps {
	readonly connect?: (() => Socket) | undefined;
	readonly cwd?:     string | undefined;
	readonly envRepo?: string | undefined;
}

let _nextId = 1;

/** Test seam: where every forwarder connects, so a test never reaches the live daemon socket. */
let _connectOverride: (() => Socket) | undefined;
export function _setForwardConnectForTests(connect?: () => Socket): void {
	_connectOverride = connect;
}

/** An error envelope in the handlers' own shape. */
export function errorEnvelope(code: string, name: string, message: string, retryable: boolean): StepMcpEnvelope {
	return {
		content: [{ type: 'text', text: JSON.stringify({ next: 'error', error: { code, name, message, retryable } }, null, 2) }],
		isError: true,
	};
}

function envelopeFor(err: Error): StepMcpEnvelope {
	if (err instanceof DaemonUnreachableError) return errorEnvelope(err.code, err.name, err.message, true);
	if (err instanceof DaemonTooOldError)      return errorEnvelope(err.code, err.name, err.message, false);
	return errorEnvelope('step-failed', 'StepFailedError', err.message, false);
}

/** Forward one step-tool call to the daemon and return its reply envelope. */
export function forwardStep(
	tool:    StepToolName,
	rawArgs: unknown,
	extra:   ForwardStepExtra = {},
	deps:    ForwardStepDeps = {},
): Promise<StepMcpEnvelope> {
	const envRepo = deps.envRepo ?? process.env['INSRC_REPO'];
	const context = {
		cwd: deps.cwd ?? process.cwd(),
		...(envRepo !== undefined && envRepo.length > 0 ? { envRepo } : {}),
		...(extra.client !== undefined ? { client: extra.client } : {}),
	};
	return new Promise<StepMcpEnvelope>((resolve) => {
		let buffer  = '';
		let settled = false;
		const finish = (envelope: StepMcpEnvelope): void => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(envelope);
		};
		const failWith = (err: Error): void => {
			if (!settled) log.warn({ tool, err: err.message, name: err.name }, 'step.call did not complete');
			finish(envelopeFor(err));
		};
		const tooOld = (detail: string): DaemonTooOldError => new DaemonTooOldError(
			`${tool}: the insrc daemon is older than this MCP server (${detail}). Update the daemon and restart it, then call ${tool} again.`,
		);

		const connect = deps.connect ?? _connectOverride;
		const socket = connect !== undefined ? connect() : createConnection(PATHS.sockFile);
		socket.on('connect', () => {
			socket.write(JSON.stringify({
				id: _nextId++, method: 'step.call', stream: true,
				client: { label: 'mcp', pid: process.pid },
				params: { tool, args: rawArgs, context },
			}) + '\n');
		});
		// Decoded as a stream: a multi-byte character split across two chunks must
		// not be decoded half by half (that turns it into replacement characters).
		socket.setEncoding('utf8');
		socket.on('data', (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				let frame: Record<string, unknown>;
				try {
					frame = JSON.parse(line) as Record<string, unknown>;
				} catch {
					failWith(new Error(`${tool}: invalid frame from the daemon`));
					return;
				}
				const stream = frame['stream'];
				if (stream === undefined) {
					// A plain line: the daemon did not take this as a stream request.
					const error = typeof frame['error'] === 'string' ? frame['error'] : undefined;
					if (error !== undefined && error.startsWith('unknown method')) { failWith(tooOld(error)); return; }
					failWith(new Error(error ?? `${tool}: the daemon answered step.call with a plain reply`));
					return;
				}
				if (stream === 'progress' || stream === 'delta') {
					extra.onProgress?.(frame['data']);
				} else if (stream === 'done') {
					finish(frame['data'] as StepMcpEnvelope);
					return;
				} else if (stream === 'error') {
					const data = (frame['data'] ?? {}) as { code?: string; error?: string };
					if (data.code === 'step-unknown-tool') { failWith(tooOld(data.error ?? `no tool '${tool}'`)); return; }
					failWith(new Error(data.error ?? `${tool}: the daemon reported an error`));
					return;
				}
			}
		});
		socket.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
				failWith(new DaemonUnreachableError(
					`${tool}: the insrc daemon is not running (${err.code} on ${PATHS.sockFile}). Start it, then call ${tool} again.`,
				));
			} else {
				failWith(new DaemonUnreachableError(`${tool}: cannot reach the insrc daemon (${err.message}).`));
			}
		});
		socket.on('close', () => failWith(new Error(`${tool}: the connection to the daemon closed before a reply`)));
	});
}
