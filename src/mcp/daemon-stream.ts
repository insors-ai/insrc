/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Streaming socket client for the daemon `workflow.run` operation.
 *
 * `src/cli/client.ts`'s `rpc()` is UNARY — it closes on the first line — so it
 * cannot drive a streaming op. This client instead opens a socket to the
 * daemon, sends a `{ stream: true, method: 'workflow.run' }` request, and reads
 * newline-delimited frames `{ id, stream, data }` until a terminal `done`
 * (resolve) or `error` (reject). Intermediate `progress` / `delta` frames are
 * forwarded to `opts.onFrame` — the MCP tool maps them to `notifications/progress`.
 *
 * Aborting `opts.signal` destroys the socket. The daemon's IPC server aborts a
 * streaming handler when its client socket closes (see `daemon/server.ts` —
 * socket `close`/`error` → `AbortController.abort()`), and `workflow.run`
 * threads that signal through `runWorkflowServerSide` (checked at every step),
 * so destroying the socket is a REAL mid-run abort, not just a stop-forwarding.
 */

import { createConnection, type Socket } from 'node:net';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('mcp:workflow-run');

let _nextId = 1;

/** Params for a daemon `workflow.run` — a subset of the daemon's
 *  `WorkflowRunParams` (see `daemon/workflow-rpc.ts`). */
export interface RunWorkflowStreamParams {
	readonly repo?:     string | undefined;
	readonly workflow:  string;
	readonly focus:     string;
	readonly params?:   Record<string, unknown> | undefined;
	/** Opt out of the finalize review cycle (default: review runs). */
	readonly review?:   boolean | undefined;
}

/** Terminal `done` payload from the daemon (`workflow-rpc.ts` runStart). */
export interface RunWorkflowStreamResult {
	readonly path:     string;
	readonly runId:    string;
	readonly model:    string;
	readonly artifact: unknown;
	readonly review?:  unknown;
}

export interface RunWorkflowStreamOpts {
	/** Forward each non-terminal frame. `stream` is `'progress'` (a
	 *  `StageProgressEvent`) or `'delta'` (a `TokenProgressEvent`). */
	readonly onFrame: (stream: 'progress' | 'delta', data: unknown) => void;
	/** Abort the run mid-stream — destroys the socket → daemon aborts. */
	readonly signal?: AbortSignal | undefined;
}

/** Test seam: inject the socket factory. Defaults to the daemon socket. */
export interface RunWorkflowStreamDeps {
	readonly connect?: (() => Socket) | undefined;
}

/** One frame off the daemon stream. `id` is echoed by the IPC server. */
interface DaemonFrame {
	readonly id?:    number;
	readonly stream: 'progress' | 'delta' | 'done' | 'error';
	readonly data:   unknown;
}

/**
 * Drive the daemon `workflow.run` streaming op. Forwards `progress` / `delta`
 * frames to `opts.onFrame`; resolves on `done`; rejects on `error`, an aborted
 * `opts.signal`, an unreachable daemon, or a socket close before completion.
 */
export function runWorkflowStream(
	params: RunWorkflowStreamParams,
	opts:   RunWorkflowStreamOpts,
	deps:   RunWorkflowStreamDeps = {},
): Promise<RunWorkflowStreamResult> {
	return new Promise<RunWorkflowStreamResult>((resolve, reject) => {
		const socket = deps.connect !== undefined ? deps.connect() : createConnection(PATHS.sockFile);
		let   buffer  = '';
		let   settled = false;

		const cleanup = (): void => {
			opts.signal?.removeEventListener('abort', onAbort);
			socket.removeListener('data', onData);
		};
		/** Run the terminal action once; later frames/events are ignored. */
		const finish = (action: () => void): void => {
			if (settled) return;
			settled = true;
			cleanup();
			action();
		};

		function onAbort(): void {
			finish(() => {
				socket.destroy();
				reject(new Error('workflow.run: aborted by client'));
			});
		}

		// Already aborted before we even connected — bail immediately.
		if (opts.signal?.aborted) { onAbort(); return; }
		opts.signal?.addEventListener('abort', onAbort);

		socket.on('connect', () => {
			const req = {
				id:     _nextId++,
				method: 'workflow.run',
				stream: true,
				params: {
					workflow: params.workflow,
					focus:    params.focus,
					...(params.repo   !== undefined ? { repo:   params.repo }   : {}),
					...(params.params !== undefined ? { params: params.params } : {}),
					...(params.review !== undefined ? { review: params.review } : {}),
				},
			};
			socket.write(JSON.stringify(req) + '\n');
		});

		function onData(chunk: Buffer): void {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';   // keep the partial trailing line

			for (const line of lines) {
				if (!line.trim()) continue;
				let frame: DaemonFrame;
				try {
					frame = JSON.parse(line) as DaemonFrame;
				} catch {
					finish(() => {
						socket.destroy();
						reject(new Error('workflow.run: invalid frame from daemon'));
					});
					return;
				}
				if (frame.stream === 'progress' || frame.stream === 'delta') {
					opts.onFrame(frame.stream, frame.data);
				} else if (frame.stream === 'done') {
					const data = frame.data as RunWorkflowStreamResult;
					finish(() => { socket.end(); resolve(data); });
					return;
				} else if (frame.stream === 'error') {
					const data = frame.data as { error?: string } | undefined;
					finish(() => {
						socket.end();
						reject(new Error(data?.error ?? 'workflow.run: daemon error'));
					});
					return;
				}
				// Unknown stream kind — ignore (forward-compatible).
			}
		}
		socket.on('data', onData);

		socket.on('error', (err: NodeJS.ErrnoException) => {
			finish(() => {
				if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
					reject(new Error('daemon is not running — start it with: insrc daemon start'));
				} else {
					reject(err);
				}
			});
		});

		socket.on('close', () => {
			// A close before any terminal frame is an abnormal end.
			finish(() => {
				log.warn({ workflow: params.workflow }, 'workflow.run: socket closed before completion');
				reject(new Error('workflow.run: connection closed before completion'));
			});
		});
	});
}
