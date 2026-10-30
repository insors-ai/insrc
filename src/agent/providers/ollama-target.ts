/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pre-run check for a claude run against an Ollama server (Epic b220bb61,
 * Story s2): the server answers, the model is available and, for an Ollama
 * cloud model, the server is signed in to ollama.com. Each failure names its
 * cause and the fix, so a run never starts against a server that cannot serve
 * it.
 *
 * Plain HTTP to the local Ollama API, each request bounded by
 * OLLAMA_LIST_TIMEOUT_MS: the ollama npm client offers list and show but no
 * /api/me, so one HTTP path serves all three. /api/me (Ollama's
 * WhoamiHandler) answers 200 with the account when signed in, 401 with a
 * signin_url when not, and 503/500 when ollama.com cannot be asked.
 */

import { fetch as undiciFetch } from 'undici';

import type { OllamaTarget } from './cli-provider.js';
import { OLLAMA_LIST_TIMEOUT_MS } from './ollama.js';

export type OllamaTargetCause = 'ollama-unreachable' | 'model-unavailable' | 'not-signed-in' | 'account-unavailable';

/** A pre-run check failure: no claude process was started. */
export class OllamaTargetError extends Error {
	override readonly cause: OllamaTargetCause;
	readonly host:  string;
	readonly model: string;
	constructor(cause: OllamaTargetCause, host: string, model: string, message: string) {
		super(message);
		this.name  = 'OllamaTargetError';
		this.cause = cause;
		this.host  = host;
		this.model = model;
	}
}

export interface OllamaTargetCheckDeps {
	readonly fetch?:     typeof undiciFetch | undefined;
	readonly timeoutMs?: number | undefined;
}

/**
 * Resolve when `target.host` answers, lists or shows `model` and, for a cloud
 * model, is signed in to ollama.com; otherwise throw OllamaTargetError naming
 * the cause. At most three requests, each bounded by the limit.
 */
export async function checkOllamaTarget(target: OllamaTarget, model: string, deps: OllamaTargetCheckDeps = {}): Promise<void> {
	const fetchFn   = deps.fetch ?? undiciFetch;
	const timeoutMs = deps.timeoutMs ?? OLLAMA_LIST_TIMEOUT_MS;
	const host      = target.host.replace(/\/+$/, '');
	const call = (path: string, body?: unknown) => fetchFn(`${host}${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
		signal: AbortSignal.timeout(timeoutMs),
	});
	const fail = (cause: OllamaTargetCause, message: string): never => { throw new OllamaTargetError(cause, target.host, model, message); };
	const unreachable = (detail: string): never =>
		fail('ollama-unreachable', `Ollama is not running at ${target.host} (${detail}); start Ollama and try again`);

	let names: string[];
	try {
		const tags = await call('/api/tags');
		if (!tags.ok) unreachable(`/api/tags answered ${tags.status}`);
		const list = (await tags.json() as { models?: Array<{ name?: unknown }> }).models ?? [];
		names = list.map(m => m.name).filter((n): n is string => typeof n === 'string');
	} catch (err) {
		if (err instanceof OllamaTargetError) throw err;
		return unreachable((err as Error).name === 'TimeoutError' ? `no answer within ${timeoutMs} ms` : (err as Error).message);
	}

	if (!names.includes(model)) {
		let status: number;
		try { status = (await call('/api/show', { model })).status; }
		catch (err) { return unreachable(`/api/show failed: ${(err as Error).message}`); }
		if (status === 404) fail('model-unavailable', `model ${model} is not available in Ollama at ${target.host}; run \`ollama pull ${model}\``);
		if (status !== 200) unreachable(`/api/show answered ${status}`);
	}

	if (target.hosting !== 'cloud') return;
	let me: { status: number; body: { name?: unknown; signin_url?: unknown } };
	try {
		const res = await call('/api/me', {});
		me = { status: res.status, body: await res.json().catch(() => ({})) as { name?: unknown; signin_url?: unknown } };
	} catch (err) {
		return fail('account-unavailable', `Ollama at ${target.host} could not check the ollama.com account for cloud model ${model} (${(err as Error).message}); try again later`);
	}
	if (me.status === 200 && typeof me.body.name === 'string' && me.body.name.length > 0) return;
	if (me.status === 200 || me.status === 401) {
		const url = typeof me.body.signin_url === 'string' ? ` (or open ${me.body.signin_url})` : '';
		fail('not-signed-in', `Ollama at ${target.host} is not signed in to ollama.com, which cloud model ${model} needs; run \`ollama signin\`${url}`);
	}
	fail('account-unavailable', `Ollama at ${target.host} could not check the ollama.com account for cloud model ${model} (status ${me.status}); try again later`);
}
