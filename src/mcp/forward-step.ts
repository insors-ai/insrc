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

import { isAbsolute } from 'node:path';
import { createConnection, type Socket } from 'node:net';

import { privateSessionBootstrap } from './session-bootstrap.js';
import { resolveRepoPath } from './resolve-repo.js';
import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';
import type { StepClient, StepToolName } from '../shared/step-context.js';
import type { DaemonStatus } from '../shared/types.js';

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
	/** Test seam: the repo resolver (default: the session-aware resolveRepoPath over this process's cwd). */
	readonly resolveRepo?: ((explicit: string | undefined) => Promise<string | undefined>) | undefined;
	readonly connect?: (() => Socket) | undefined;
	readonly cwd?:     string | undefined;
	readonly envRepo?: string | undefined;
}

let _nextId = 1;

/** The analyze tools, whose calls may carry a structured request. */
const REQUEST_TOOLS: ReadonlySet<string> = new Set(['insrc_analyze_step', 'insrc_analyze']);
/** The feature a daemon advertises (daemon.status `features`) when its analyze tools accept a structured request. */
const REQUEST_FEATURE = 'analyze-request';

/** Whether a call carries a structured request: an older daemon would ignore it (step tool) or refuse the missing focus (one-shot). */
function carriesRequest(tool: string, args: unknown): boolean {
	if (!REQUEST_TOOLS.has(tool) || typeof args !== 'object' || args === null) return false;
	const request = (args as Record<string, unknown>)['request'];
	return typeof request === 'object' && request !== null;
}

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

/** The step tools whose phases can write into a repository: the daemon is told the repo explicitly. */
const REPO_WRITING_STEP_TOOLS: ReadonlySet<string> = new Set(['insrc_workflow_step', 'insrc_build_step']);

/**
 * `args` with the session's repo made explicit: a call that names no repo and carries no run token (the first phase of a run) gets the
 * repo the session workspace resolves to, as an absolute path. A call with a repo or a token, or one the session cannot resolve, is
 * unchanged: the daemon refuses a modifying phase that still has no repo.
 */
export async function withExplicitRepo(args: unknown, resolveRepo: (explicit: string | undefined) => Promise<string | undefined>): Promise<unknown> {
	if (args === null || typeof args !== 'object' || Array.isArray(args)) return args;
	const a = args as Record<string, unknown>;
	const has = (k: string): boolean => typeof a[k] === 'string' && (a[k] as string).length > 0;
	if (has('repo') || has('state')) return args;
	const repo = await resolveRepo(undefined);
	return repo !== undefined && isAbsolute(repo) ? { ...a, repo } : args;
}

/** Forward one step-tool call to the daemon and return its reply envelope. */
export async function forwardStep(
	tool:    StepToolName,
	rawArgs: unknown,
	extra:   ForwardStepExtra = {},
	deps:    ForwardStepDeps = {},
): Promise<StepMcpEnvelope> {
	let args = rawArgs;
	if (REPO_WRITING_STEP_TOOLS.has(tool)) {
		try { args = await withExplicitRepo(rawArgs, deps.resolveRepo ?? (e => resolveRepoPath(e, deps.cwd !== undefined ? { cwd: deps.cwd } : {}))); } catch { args = rawArgs; }
	}
	return forwardStepNow(tool, args, extra, deps);
}

function forwardStepNow(
	tool:    StepToolName,
	rawArgs: unknown,
	extra:   ForwardStepExtra = {},
	deps:    ForwardStepDeps = {},
): Promise<StepMcpEnvelope> {
	let bootstrap: ReturnType<typeof privateSessionBootstrap>;
	try { bootstrap = privateSessionBootstrap(); } catch { return Promise.resolve(errorEnvelope('session-expired', 'SessionBootstrapError', 'Connection session is unavailable.', false)); }
	const envRepo = bootstrap?.token.repoRoot ?? deps.envRepo ?? process.env['INSRC_REPO'];
	const context = {
		cwd: bootstrap?.token.repoRoot ?? deps.cwd ?? process.cwd(),
		...(envRepo !== undefined && envRepo.length > 0 ? { envRepo } : {}),
		...(extra.client !== undefined ? { client: extra.client } : {}),
	};
	return new Promise<StepMcpEnvelope>((resolve) => {
		let buffer  = '';
		let settled = false;
        let attached = bootstrap === undefined;
        const attachId = bootstrap ? _nextId++ : undefined;
		const finish = (envelope: StepMcpEnvelope): void => {
			if (settled) return;
			settled = true;
            bootstrap?.signal.removeEventListener('abort', expired);
			socket.destroy();
			resolve(envelope);
		};
		const failWith = (err: Error): void => {
			if (!settled && !bootstrap) log.warn({ tool, err: err.message, name: err.name }, 'step.call did not complete');
			finish(bootstrap ? errorEnvelope('session-expired', 'SessionBootstrapError', 'Connection session is unavailable.', false) : envelopeFor(err));
		};
		const tooOld = (detail: string): DaemonTooOldError => new DaemonTooOldError(
			`${tool}: the insrc daemon is older than this MCP server (${detail}). Update the daemon and restart it, then call ${tool} again.`,
		);

		const connect = deps.connect ?? _connectOverride;
		const socket = connect !== undefined ? connect() : createConnection(PATHS.sockFile);
		const expired = () => failWith(new Error('Connection session is unavailable.'));
        bootstrap?.signal.addEventListener('abort', expired, { once: true });
        // A call that carries a structured request first asks this connection's daemon what it can do:
        // an older daemon would silently drop the request, so it is refused here with a clear message.
        const needsFeatures = carriesRequest(tool, rawArgs);
        let featureId: number | undefined;
        const begin = () => {
			if (!needsFeatures) { sendStep(); return; }
			featureId = _nextId++;
			socket.write(JSON.stringify({ id: featureId, method: 'daemon.status', client: { label: 'mcp', pid: process.pid } }) + '\n');
		};
        const sendStep = () => {
			socket.write(JSON.stringify({
				id: _nextId++, method: 'step.call', stream: true,
				client: { label: 'mcp', pid: process.pid },
				params: { tool, args: rawArgs, context },
			}) + '\n');
		};
        socket.on('connect', () => {
         if (bootstrap?.signal.aborted) { expired(); return; }
         if (bootstrap) socket.write(JSON.stringify({ id: attachId, method: 'db.connections.v2.session.attach', params: bootstrap.token }) + '\n');
         else begin();
        });
		// Decoded as a stream: a multi-byte character split across two chunks must
		// not be decoded half by half (that turns it into replacement characters).
		socket.setEncoding('utf8');
		socket.on('data', (chunk: string) => {
			buffer += chunk;
            if (bootstrap && Buffer.byteLength(buffer) > 65536) { expired(); return; }
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
                if (!attached) {
                 const result = frame['result'] as Record<string, unknown> | undefined;
                 if (frame['id'] !== attachId || !result || result['attached'] !== true || result['daemonEpoch'] !== bootstrap!.token.daemonEpoch || result['repoRoot'] !== bootstrap!.token.repoRoot || result['audience'] !== 'mcp-unverified' || !Number.isSafeInteger(result['controlGeneration']) || (result['controlGeneration'] as number) < 1 || bootstrap!.signal.aborted) { expired(); return; }
                 attached = true; begin(); continue;
                }
				if (featureId !== undefined && frame['id'] === featureId) {
					featureId = undefined;
					const features = (frame['result'] as Pick<DaemonStatus, 'features'> | undefined)?.features;
					if (!Array.isArray(features) || !features.includes(REQUEST_FEATURE)) {
						// Named even on a session-attached connection: a missing capability is not private, and the caller must be told to update.
						if (!settled) log.warn({ tool }, 'step.call refused: daemon lacks analyze-request');
						finish(envelopeFor(new DaemonTooOldError(
							`${tool}: the insrc daemon does not accept a structured analyze request (it does not advertise '${REQUEST_FEATURE}'). ` +
							`Update the daemon and restart it, then call ${tool} again; until then send only \`focus\`.`,
						)));
						return;
					}
					sendStep();
					continue;
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
					if (!bootstrap) extra.onProgress?.(frame['data']);
				} else if (stream === 'done') {
					finish(bootstrap ? errorEnvelope('unsupported-temporary', 'UnverifiedAnalysisError', 'Temporary connections are unavailable for this operation.', false) : frame['data'] as StepMcpEnvelope);
					return;
				} else if (stream === 'error') {
					const data = (frame['data'] ?? {}) as { code?: string; error?: string };
                    if (bootstrap) { finish(data.code === 'unsupported-temporary' || data.code === 'upgrade-required' ? errorEnvelope('unsupported-temporary', 'UnverifiedAnalysisError', 'Temporary connections are unavailable for this operation.', false) : errorEnvelope('session-expired', 'SessionBootstrapError', 'Connection session is unavailable.', false)); return; }
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
