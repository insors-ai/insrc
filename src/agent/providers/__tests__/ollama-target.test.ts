/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * checkOllamaTarget against a fake Ollama server (Epic b220bb61, Story s2 · t2).
 * The server answers /api/tags, /api/show and /api/me as each test sets it and
 * records every request it receives.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/ollama-target.test.ts
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { checkOllamaTarget, OllamaTargetError, type OllamaTargetCause } from '../ollama-target.js';
import { OLLAMA_LIST_TIMEOUT_MS } from '../ollama.js';

interface Fake {
	tags?: { status: number; models: string[] } | 'silent';
	show?: number;
	me?: { status: number; body: unknown };
}

const servers: Server[] = [];
after(() => { for (const s of servers) s.close(); });

/** Start a fake Ollama answering per `fake`; returns its address and the requests it saw. */
async function fakeOllama(fake: Fake): Promise<{ host: string; seen: string[] }> {
	const seen: string[] = [];
	const server = createServer((req, res) => {
		seen.push(`${req.method} ${req.url}`);
		const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
		if (req.url === '/api/tags') {
			if (fake.tags === 'silent') return; // never answers
			const t = fake.tags ?? { status: 200, models: [] };
			return json(t.status, { models: t.models.map(name => ({ name })) });
		}
		if (req.url === '/api/show') return json(fake.show ?? 200, fake.show === 404 ? { error: 'model not found' } : { capabilities: ['completion'] });
		if (req.url === '/api/me') return json(fake.me?.status ?? 200, fake.me?.body ?? { name: 'someone' });
		json(404, {});
	});
	servers.push(server);
	await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
	return { host: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

async function rejectsWith(p: Promise<void>, cause: OllamaTargetCause, message: RegExp): Promise<void> {
	await assert.rejects(p, (e: unknown) => {
		assert.ok(e instanceof OllamaTargetError, 'OllamaTargetError');
		assert.equal(e.cause, cause);
		assert.match(e.message, message);
		return true;
	});
}

test("ollama-target.test.ts: a down or silent Ollama gives 'ollama-unreachable' within the limit", async () => {
	// Down: a port nothing listens on.
	const closed = await fakeOllama({});
	servers.pop()!.close();
	await new Promise(r => setTimeout(r, 50));
	await rejectsWith(checkOllamaTarget({ host: closed.host, hosting: 'local' }, 'qwen:1b'), 'ollama-unreachable',
		new RegExp(`Ollama is not running at ${closed.host}.*start Ollama`));

	// Silent: /api/tags never answers; the check gives up at its limit.
	const silent = await fakeOllama({ tags: 'silent' });
	const started = Date.now();
	await rejectsWith(checkOllamaTarget({ host: silent.host, hosting: 'cloud' }, 'glm:cloud', { timeoutMs: 300 }), 'ollama-unreachable', /no answer within 300 ms/);
	assert.ok(Date.now() - started < 2_000, 'gave up at the limit, not later');

	// /api/tags answering an error status is the same cause.
	const broken = await fakeOllama({ tags: { status: 500, models: [] } });
	await rejectsWith(checkOllamaTarget({ host: broken.host, hosting: 'local' }, 'qwen:1b'), 'ollama-unreachable', /\/api\/tags answered 500/);
	assert.equal(OLLAMA_LIST_TIMEOUT_MS, 4_000, 'the default limit is the shared list limit');
});

test("ollama-target.test.ts: a model absent from /api/tags with /api/show 404 gives 'model-unavailable'", async () => {
	const o = await fakeOllama({ tags: { status: 200, models: ['other:cloud'] }, show: 404 });
	await rejectsWith(checkOllamaTarget({ host: o.host, hosting: 'cloud' }, 'kimi-k3:cloud'), 'model-unavailable', /model kimi-k3:cloud is not available.*`ollama pull kimi-k3:cloud`/);
	assert.deepEqual(o.seen, ['GET /api/tags', 'POST /api/show'], 'no sign-in check after a missing model');
	// A model /api/show knows (not in the tag list) passes.
	const shown = await fakeOllama({ tags: { status: 200, models: [] }, show: 200 });
	await checkOllamaTarget({ host: shown.host, hosting: 'local' }, 'qwen:1b');
});

test("ollama-target.test.ts: a cloud model with /api/me 401 gives 'not-signed-in' and /api/me 503 gives 'account-unavailable'", async () => {
	const out = await fakeOllama({ tags: { status: 200, models: ['glm-5.3:cloud'] }, me: { status: 401, body: { error: 'unauthorized', signin_url: 'https://ollama.com/connect?x' } } });
	await rejectsWith(checkOllamaTarget({ host: out.host, hosting: 'cloud' }, 'glm-5.3:cloud'), 'not-signed-in', /not signed in to ollama\.com.*`ollama signin`.*https:\/\/ollama\.com\/connect\?x/);
	const noName = await fakeOllama({ tags: { status: 200, models: ['glm-5.3:cloud'] }, me: { status: 200, body: {} } });
	await rejectsWith(checkOllamaTarget({ host: noName.host, hosting: 'cloud' }, 'glm-5.3:cloud'), 'not-signed-in', /`ollama signin`/);
	const down = await fakeOllama({ tags: { status: 200, models: ['glm-5.3:cloud'] }, me: { status: 503, body: { error: 'account unavailable' } } });
	await rejectsWith(checkOllamaTarget({ host: down.host, hosting: 'cloud' }, 'glm-5.3:cloud'), 'account-unavailable', /could not check the ollama\.com account.*status 503/);
	const signedIn = await fakeOllama({ tags: { status: 200, models: ['glm-5.3:cloud'] }, me: { status: 200, body: { name: 'someone', plan: 'max' } } });
	await checkOllamaTarget({ host: signedIn.host, hosting: 'cloud' }, 'glm-5.3:cloud');
	assert.deepEqual(signedIn.seen, ['GET /api/tags', 'POST /api/me']);
});

test('ollama-target.test.ts: a local model skips /api/me, a listed model skips /api/show, and every request goes to target.host', async () => {
	// /api/me would refuse: a local model never asks it.
	const local = await fakeOllama({ tags: { status: 200, models: ['qwen:local'] }, me: { status: 401, body: {} } });
	await checkOllamaTarget({ host: `${local.host}/`, hosting: 'local' }, 'qwen:local');
	assert.deepEqual(local.seen, ['GET /api/tags'], 'one request: listed, local');
	// Two servers: every request of a check goes to its own target only.
	const a = await fakeOllama({ tags: { status: 200, models: [] }, show: 200 });
	const b = await fakeOllama({ tags: { status: 200, models: [] }, show: 200 });
	await checkOllamaTarget({ host: a.host, hosting: 'cloud' }, 'm:cloud');
	assert.deepEqual(a.seen, ['GET /api/tags', 'POST /api/show', 'POST /api/me']);
	assert.deepEqual(b.seen, []);
});
