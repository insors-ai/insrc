/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { reviewNativeTransport } from './review-process-bridge.js';
import { launchReviewShell } from '../daemon/tools/review-shell-process.js';

import { killProcessGroup } from './process-group.js';
import { onUtf8Data } from './utf8-stream.js';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : undefined;
}

export interface VibeCatalogModel {
	readonly id: string;
	readonly aliases?: readonly string[] | undefined;
	readonly efforts: readonly string[];
}

interface VibeModelChoice {
	readonly name: string;
	readonly alias: string;
	readonly thinking: string;
	readonly thinkingLevels: readonly unknown[];
}

function modelChoice(value: unknown): VibeModelChoice | undefined {
	const model = record(value);
	if (model === undefined || typeof model['name'] !== 'string' || typeof model['alias'] !== 'string'
		|| model['alias'] === '' || typeof model['thinking'] !== 'string' || !Array.isArray(model['thinkingLevels'])) return undefined;
	return { name: model['name'], alias: model['alias'], thinking: model['thinking'], thinkingLevels: model['thinkingLevels'] };
}

function runtimeConfig(value: unknown): RecordValue | undefined {
	return record(record(record(value)?.['runtime'])?.['config']);
}

function matchesCatalog(model: VibeCatalogModel, name: string): boolean {
	return model.id === name || model.aliases?.includes(name) === true;
}

export class VibeSelectionError extends Error {
	constructor(model: string | undefined, effort: string | undefined, detail: string) {
		super(`Vibe selection unavailable (model ${model ?? 'default'}, effort ${effort ?? 'default'}): ${detail}`);
		this.name = 'VibeSelectionError';
	}
}

export interface VibeSessionOptions {
	readonly command: string;
	readonly args?: readonly string[] | undefined;
	readonly cwd?: string | undefined;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly timeoutMs: number;
	readonly signal?: AbortSignal | undefined;
	readonly agentConfig: Readonly<RecordValue>;
	readonly nativeSessionId?: string | undefined;
	readonly model?: string | undefined;
	readonly effort?: string | undefined;
	readonly catalog: readonly VibeCatalogModel[];
	readonly verifyRuntime?: ((runtime: Readonly<RecordValue>) => void) | undefined;
	/** A dedicated supervisor will sweep its own group after writing the result. */
	readonly inheritProcessGroup?: boolean | undefined;
}

interface VibeTransport {
	request(method: string, params: RecordValue): Promise<unknown>;
	notify(method: string, params: RecordValue): void;
	observe(onEvent: (method: string, params: RecordValue) => void, onFailure: (error: Error) => void): void;
	releaseSetupAbort(): void;
	close(): Promise<void>;
}

export interface VerifiedVibeSession {
	readonly id: string;
	readonly model: string;
	readonly effort: string;
	readonly transport: VibeTransport;
}

interface PendingRequest {
	readonly method: string;
	resolve(value: unknown): void;
	reject(error: Error): void;
}

const MAX_FRAME_CHARS = 8 * 1024 * 1024;
const EXIT_DRAIN_MS = 250;
const CLOSE_GRACE_MS = 1_000;

function startTransport(options: VibeSessionOptions): VibeTransport {
	options.signal?.throwIfAborted();
	const review = reviewNativeTransport();
	const managed = review ? launchReviewShell(review, options.command, options.args ?? [], {
		cwd: options.cwd, env: options.env, signal: options.signal, stdio: ['pipe', 'pipe', 'pipe'],
	}) : undefined;
	const ownGroup = !review && options.inheritProcessGroup !== true && process.platform !== 'win32';
	const child = managed ? managed.child as ChildProcessWithoutNullStreams : spawn(options.command, options.args ?? [], {
		stdio: ['pipe', 'pipe', 'pipe'],
		detached: ownGroup,
		cwd: options.cwd,
		env: options.env,
	});
	const pending = new Map<string, PendingRequest>();
	let finishClose!: () => void;
	const closed = new Promise<void>(resolve => { finishClose = resolve; });
	let drainTimer: ReturnType<typeof setTimeout> | undefined;
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	let failure: Error | undefined;
	let eventListener: ((method: string, params: RecordValue) => void) | undefined;
	let failureListener: ((error: Error) => void) | undefined;
	let sequence = 0;
	let buffer = '';

	function stop(error: Error): void {
		if (failure !== undefined) return;
		failure = error;
		clearTimeout(deadline);
		clearTimeout(drainTimer);
		options.signal?.removeEventListener('abort', abort);
		for (const request of pending.values()) request.reject(error);
		pending.clear();
		failureListener?.(error);
		if (child.exitCode === null && child.signalCode === null) {
			if (ownGroup && child.pid !== undefined) killProcessGroup(child.pid);
			else child.kill('SIGKILL');
		}
		// A descendant can still own the other ends of these pipes. Once the
		// transport has stopped, they are no longer a source of turn events.
		child.stdin.destroy();
		child.stdout.destroy();
		child.stderr.destroy();
		closeTimer = setTimeout(finishClose, CLOSE_GRACE_MS);
	}

	function abort(): void {
		stop(new Error('Vibe app server aborted', { cause: options.signal?.reason }));
	}

	function send(message: RecordValue): void {
		if (failure !== undefined) throw failure;
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
	}

	const deadline = setTimeout(() => stop(new Error('Vibe app server timed out')), options.timeoutMs);
	options.signal?.addEventListener('abort', abort, { once: true });
	if (options.signal?.aborted === true) abort();
	child.stderr.resume();
	child.stdin.on('error', error => stop(error));
	child.once('error', error => stop(new Error('Could not launch the Vibe app server', { cause: error })));
	child.once('exit', () => {
		if (ownGroup && child.pid !== undefined) killProcessGroup(child.pid);
		// Let buffered terminal frames arrive, but don't let inherited pipe
		// writers hide an unexpected exit until the whole turn times out.
		if (failure === undefined) {
			drainTimer = setTimeout(() => stop(new Error('Vibe app server exited')), EXIT_DRAIN_MS);
		}
	});
	child.once('close', () => {
		stop(new Error('Vibe app server exited'));
		clearTimeout(closeTimer);
		finishClose();
	});
	onUtf8Data(child.stdout, chunk => {
		buffer += chunk;
		let newline = buffer.indexOf('\n');
		while (newline >= 0 && failure === undefined) {
			if (newline > MAX_FRAME_CHARS) {
				stop(new Error('Vibe app server response exceeded the frame limit'));
				return;
			}
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf('\n');
			if (line === '') continue;
			let message: RecordValue | undefined;
			try { message = record(JSON.parse(line)); } catch {
				stop(new Error('Vibe app server returned invalid JSON'));
				return;
			}
			const method = message?.['method'];
			const params = record(message?.['params']);
			const id = message?.['id'];
			if (typeof method === 'string' && params !== undefined && id === undefined) {
				try { eventListener?.(method, params); } catch (error) {
					stop(new Error('Could not process a Vibe turn event', { cause: error }));
				}
				continue;
			}
			if (message === undefined || typeof id !== 'string') continue;
			const request = pending.get(id);
			if (request === undefined) continue;
			pending.delete(id);
			if (Object.hasOwn(message, 'result')) request.resolve(message['result']);
			else request.reject(new Error(`Vibe app server rejected ${request.method}`));
		}
		if (buffer.length > MAX_FRAME_CHARS) stop(new Error('Vibe app server response exceeded the frame limit'));
	});

	return {
		request(method, params) {
			return new Promise((resolve, reject) => {
				const id = `insrc-${++sequence}`;
				try {
					send({ id, method, params });
					pending.set(id, { method, resolve, reject });
				} catch (error) {
					reject(error);
				}
			});
		},
		notify(method, params) { send({ method, params }); },
		observe(onEvent, onFailure) {
			eventListener = onEvent;
			failureListener = onFailure;
			if (failure !== undefined) onFailure(failure);
		},
		releaseSetupAbort() { options.signal?.removeEventListener('abort', abort); },
		async close() {
			stop(new Error('Vibe app server closed'));
			await closed;
			if (managed) {
				await managed.settled;
				if (managed.disposal().state !== 'confirmed') throw new Error('Vibe native disposal is unknown');
			}
		},
	};
}

export type VibeDispatchState = 'not-sent' | 'possibly-sent' | 'accepted';

export class VibeTurnError extends Error {
	constructor(
		readonly dispatchState: VibeDispatchState,
		readonly sessionId: string | undefined,
		cause: unknown,
	) {
		super(cause instanceof Error ? cause.message : 'Vibe turn failed', { cause });
		this.name = 'VibeTurnError';
	}
}

export interface VibeTurnOptions extends VibeSessionOptions {
	readonly prompt: string;
	readonly onSession?: ((sessionId: string) => void) | undefined;
	readonly onHistory?: ((method: 'history/entryAdded' | 'history/entryUpdated', params: RecordValue) => void) | undefined;
}

/** Accumulate Vibe's streamed assistant entries for callers that need its final answer. */
export function vibeAssistantOutput(): {
	accept: NonNullable<VibeTurnOptions['onHistory']>;
	last: () => string;
} {
	let currentId: string | undefined;
	let blocks: Array<string | undefined> = [];
	let length = 0;
	return {
		accept(method, params) {
			if (method === 'history/entryAdded') {
				const entry = record(params['entry']);
				if (entry?.['type'] !== 'message' || entry['role'] !== 'assistant' || typeof entry['id'] !== 'string'
					|| !Array.isArray(entry['content'])) return;
				currentId = entry['id'];
				blocks = entry['content'].map(block => {
					const item = record(block);
					return item?.['type'] === 'text' && typeof item['text'] === 'string' ? item['text'] : undefined;
				});
				length = blocks.reduce<number>((total, text) => total + (text?.length ?? 0), 0);
			} else if (currentId !== undefined && params['entryId'] === currentId && Array.isArray(params['patch'])) {
				for (const item of params['patch']) {
					const patch = record(item);
					const path = patch?.['path'];
					const index = typeof path === 'string' ? /^\/content\/(\d+)\/text$/.exec(path)?.[1] : undefined;
					if (index === undefined || typeof patch?.['value'] !== 'string') continue;
					const i = Number(index);
					const old = blocks[i];
					if (old === undefined) continue;
					const next = patch['op'] === 'append' ? old + patch['value'] : patch['op'] === 'replace' ? patch['value'] : old;
					blocks[i] = next;
					length += next.length - old.length;
				}
			}
			if (length > MAX_FRAME_CHARS) throw new Error('Vibe assistant output exceeded the output limit');
		},
		last: () => blocks.join(''),
	};
}

export interface VibeTurnResult {
	readonly sessionId: string;
	readonly stopReason: string | undefined;
}

/** Own a single turn. An uncertain write is never reported as a safe retry. */
export async function runVerifiedVibeTurn(options: VibeTurnOptions): Promise<VibeTurnResult> {
	let dispatchState: VibeDispatchState = 'not-sent';
	let session: VerifiedVibeSession | undefined;
	try {
		session = await openVerifiedVibeSession(options);
		const { id, transport } = session;
		transport.releaseSetupAbort();
		options.onSession?.(id);
		return await new Promise<VibeTurnResult>((resolve, reject) => {
			let turnId: string | undefined;
			let settled = false;
			let interruptTimer: ReturnType<typeof setTimeout> | undefined;
			let cancellation: Error | undefined;
			function settle(): void {
				settled = true;
				clearTimeout(interruptTimer);
				options.signal?.removeEventListener('abort', abort);
			}
			function fail(error: unknown): void {
				if (settled) return;
				settle();
				reject(cancellation ?? error);
			}
			function abort(): void {
				cancellation = new Error('Vibe turn aborted', { cause: options.signal?.reason });
				if (turnId === undefined) {
					fail(cancellation);
					return;
				}
				// The interrupt acknowledgement is not a terminal event. Give the
				// owned turn a bounded opportunity to confirm it before child cleanup.
				interruptTimer = setTimeout(() => fail(cancellation), 1_000);
				void transport.request('turn/interrupt', { sessionId: id, expectedTurnId: turnId }).catch(fail);
			}
			function accept(turn: RecordValue | undefined): void {
				const receivedId = turn?.['id'];
				if (typeof receivedId !== 'string' || receivedId === '' || turn?.['sessionId'] !== id
					|| (turnId !== undefined && receivedId !== turnId)) return;
				turnId = receivedId;
				dispatchState = 'accepted';
				if (cancellation !== undefined && turn['status'] !== 'in_progress') {
					fail(cancellation);
					return;
				}
				switch (turn['status']) {
					case 'completed': {
						const reason = turn['stopReason'];
						settle();
						resolve({ sessionId: id, stopReason: typeof reason === 'string' ? reason : undefined });
						break;
					}
					case 'failed': {
						const detail = record(turn['error'])?.['message'];
						fail(new Error(typeof detail === 'string' ? detail.slice(0, 500) : 'Vibe turn failed'));
						break;
					}
					case 'interrupted':
						fail(new Error('Vibe turn was interrupted'));
						break;
				}
			}
			transport.observe((method, params) => {
				if (settled || dispatchState === 'not-sent' || params['sessionId'] !== id) return;
				if (method === 'turn/started' || method === 'turn/completed') accept(record(params['turn']));
				else if ((method === 'history/entryAdded' || method === 'history/entryUpdated')
					&& turnId !== undefined && params['turnId'] === turnId) options.onHistory?.(method, params);
			}, fail);
			if (settled) return;
			options.signal?.addEventListener('abort', abort, { once: true });
			if (options.signal?.aborted === true) {
				abort();
				return;
			}
			dispatchState = 'possibly-sent';
			void transport.request('turn/start', { sessionId: id, message: [{ type: 'text', text: options.prompt }] }).then(reply => {
				if (settled) return;
				const turn = record(record(reply)?.['turn']);
				if (typeof turn?.['id'] !== 'string' || turn['sessionId'] !== id) {
					fail(new Error('Vibe app server returned an invalid turn acknowledgement'));
					return;
				}
				accept(turn);
			}, fail);
		});
	} catch (error) {
		throw new VibeTurnError(dispatchState, session?.id, error);
	} finally {
		await session?.transport.close();
	}
}

/** Open a local Vibe session without a first turn and verify the session-scoped selection. */
export async function openVerifiedVibeSession(options: VibeSessionOptions): Promise<VerifiedVibeSession> {
	const unsupported = (detail: string): VibeSelectionError => new VibeSelectionError(options.model, options.effort, detail);
	const explicitModel = options.catalog.find(model => options.model !== undefined && matchesCatalog(model, options.model));
	if (options.model !== undefined && explicitModel === undefined) throw unsupported('model is absent from the catalog');

	const transport = startTransport(options);
	try {
		await transport.request('initialize', { clientInfo: { name: 'insrc', version: '1' } });
		transport.notify('initialized', {});
		const open = { agentConfig: options.agentConfig, historyLimit: 1 };
		const reply = options.nativeSessionId === undefined
			? await transport.request('session/start', { ...open, sessionOnly: true })
			: await transport.request('session/resume', { ...open, sessionId: options.nativeSessionId });
		const id = record(record(record(reply)?.['state'])?.['session'])?.['id'];
		if (typeof id !== 'string' || id === '' || (options.nativeSessionId !== undefined && options.nativeSessionId !== id)) {
			throw unsupported('could not verify the session identity');
		}

		const params = { sessionId: id };
		const config = runtimeConfig(await transport.request('runtime/read', params));
		const active = modelChoice(config?.['activeModel']);
		const target = explicitModel ?? options.catalog.find(model => active !== undefined && matchesCatalog(model, active.name));
		if (target === undefined || active === undefined) throw unsupported('could not verify the active catalog model');

		const candidates: VibeModelChoice[] = [];
		if (explicitModel === undefined) candidates.push(active);
		else if (Array.isArray(config?.['models'])) {
			for (const entry of config['models']) {
				const candidate = modelChoice(entry);
				if (candidate !== undefined && matchesCatalog(target, candidate.name)) candidates.push(candidate);
			}
		}
		const choice = candidates[0];
		if (choice === undefined || candidates.length !== 1) throw unsupported('no unambiguous local alias for the selected model');
		if (options.effort !== undefined && (!target.efforts.includes(options.effort) || !choice.thinkingLevels.includes(options.effort))) {
			throw unsupported('the selected effort is unavailable on this model');
		}

		const applied = record(await transport.request('config/model/write', {
			...params,
			...(explicitModel !== undefined ? { modelAlias: choice.alias } : {}),
			...(options.effort !== undefined ? { reasoningEffort: options.effort } : {}),
			sessionOnly: true,
		}));
		if (applied?.['status'] !== 'applied' || applied['rejected'] === true
			|| (Array.isArray(applied['failures']) && applied['failures'].length > 0)) {
			throw unsupported('the session rejected its selection');
		}

		const readBack = await transport.request('runtime/read', params);
		const effective = modelChoice(runtimeConfig(readBack)?.['activeModel']);
		if (effective === undefined || effective.alias !== choice.alias || !matchesCatalog(target, effective.name)
			|| (options.effort !== undefined && effective.thinking !== options.effort)) {
			throw unsupported('the runtime did not confirm the requested settings');
		}
		if (options.verifyRuntime !== undefined) {
			const runtime = record(record(readBack)?.['runtime']);
			if (runtime === undefined) throw unsupported('the runtime did not confirm the requested tool policy');
			options.verifyRuntime(runtime);
		}
		return { id, model: target.id, effort: effective.thinking, transport };
	} catch (error) {
		await transport.close();
		throw error;
	}
}
