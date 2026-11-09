/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';

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
}

interface VibeTransport {
	request(method: string, params: RecordValue): Promise<unknown>;
	notify(method: string, params: RecordValue): void;
	observe(onEvent: (method: string, params: RecordValue) => void, onFailure: (error: Error) => void): void;
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

function startTransport(options: VibeSessionOptions): VibeTransport {
	options.signal?.throwIfAborted();
	const child = spawn(options.command, options.args ?? [], {
		stdio: ['pipe', 'pipe', 'pipe'],
		detached: process.platform !== 'win32',
		cwd: options.cwd,
		env: options.env,
	});
	const pending = new Map<string, PendingRequest>();
	const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
	let failure: Error | undefined;
	let eventListener: ((method: string, params: RecordValue) => void) | undefined;
	let failureListener: ((error: Error) => void) | undefined;
	let sequence = 0;
	let buffer = '';

	function stop(error: Error): void {
		if (failure !== undefined) return;
		failure = error;
		clearTimeout(deadline);
		options.signal?.removeEventListener('abort', abort);
		for (const request of pending.values()) request.reject(error);
		pending.clear();
		failureListener?.(error);
		if (child.pid !== undefined) killProcessGroup(child.pid);
		else child.kill('SIGKILL');
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
		if (child.pid !== undefined && process.platform !== 'win32') killProcessGroup(child.pid);
	});
	child.once('close', () => stop(new Error('Vibe app server exited')));
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
		close() {
			stop(new Error('Vibe app server closed'));
			return closed;
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
		options.onSession?.(id);
		return await new Promise<VibeTurnResult>((resolve, reject) => {
			let turnId: string | undefined;
			let settled = false;
			function fail(error: unknown): void {
				settled = true;
				reject(error);
			}
			function accept(turn: RecordValue | undefined): void {
				const receivedId = turn?.['id'];
				if (typeof receivedId !== 'string' || receivedId === '' || turn?.['sessionId'] !== id
					|| (turnId !== undefined && receivedId !== turnId)) return;
				turnId = receivedId;
				dispatchState = 'accepted';
				switch (turn['status']) {
					case 'completed': {
						const reason = turn['stopReason'];
						settled = true;
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
			options.signal?.throwIfAborted();
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

		const effective = modelChoice(runtimeConfig(await transport.request('runtime/read', params))?.['activeModel']);
		if (effective === undefined || effective.alias !== choice.alias || !matchesCatalog(target, effective.name)
			|| (options.effort !== undefined && effective.thinking !== options.effort)) {
			throw unsupported('the runtime did not confirm the requested settings');
		}
		return { id, model: target.id, effort: effective.thinking, transport };
	} catch (error) {
		await transport.close();
		throw error;
	}
}
