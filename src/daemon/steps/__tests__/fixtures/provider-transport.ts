import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { OllamaProvider } from '../../../../agent/providers/ollama.js';

async function endpoint(reply: (response: ServerResponse) => void) {
	const server = createServer((request, response) => { request.resume(); request.once('end', () => reply(response)); });
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object');
	return { provider: new OllamaProvider('qwen3.8:27b', 'http://127.0.0.1:' + address.port, 2048, undefined, 'memory-only'), async close() { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}

test('memory-only Ollama transport rejects malformed frames before SDK console diagnostics', async () => {
	let warnings = 0; const spy = mock.method(console, 'warn', () => { warnings++; });
	const f = await endpoint(response => { response.writeHead(200, { 'content-type': 'application/x-ndjson' }); response.end('CM_PRIVATE_MALFORMED_FRAME\n'); });
	try { await assert.rejects(f.provider.complete([{ role: 'user', content: 'fixture' }]), error => error instanceof Error && !error.message.includes('CM_PRIVATE_MALFORMED_FRAME')); assert.equal(warnings, 0); }
	finally { spy.mock.restore(); await f.close(); }
});

test('memory-only Ollama transport retains completion until actual HTTP EOF after terminal frame', async () => {
	let release!: () => void, entered!: () => void; const ready = new Promise<void>(r => { entered = r; });
	const f = await endpoint(response => { response.writeHead(200, { 'content-type': 'application/x-ndjson' }); response.write(JSON.stringify({ model: 'fixture', message: { role: 'assistant', content: 'fixture-ok' }, done: true }) + '\n'); release = () => response.end(); entered(); });
	try { const work = f.provider.complete([{ role: 'user', content: 'fixture' }]); await ready; assert.equal(await Promise.race([work.then(() => true), delay(40).then(() => false)]), false); release(); assert.equal((await work).text, 'fixture-ok'); }
	finally { release?.(); await f.close(); }
});

test('memory-only Ollama transport rejects non-JSON HTTP failures before SDK error diagnostics', async () => {
	let messages = 0; const spy = mock.method(console, 'log', () => { messages++; });
	const f = await endpoint(response => { response.writeHead(503); response.end('CM_PRIVATE_HTTP_ERROR'); });
	try { await assert.rejects(f.provider.complete([{ role: 'user', content: 'fixture' }]), error => error instanceof Error && !error.message.includes('CM_PRIVATE_HTTP_ERROR')); assert.equal(messages, 0); }
	finally { spy.mock.restore(); await f.close(); }
});

import { verifyLocalConnectionProvider, admitConnectionProvider } from '../../../../shared/connection-provider.js';
import { sessionConnectionExecution } from '../../../../shared/step-context.js';
import { RequestLifetime } from '../../../request-context.js';

test('admitted Session expiry during real structured validation prevents the next SDK retry', async () => {
	let requests = 0, responseSent = false, active = true, validationReads = 0;
	const server = createServer((request, response) => {
		if (request.url === '/api/version') { request.resume(); response.end(JSON.stringify({ version: 'SDK-fixture-not-live-service-evidence' })); return; }
		let body = ''; request.on('data', bytes => { body += bytes; }); request.once('end', () => {
			requests++; const value = JSON.parse(body), marker = value.messages[0].content.match(/CM_LOCAL_PRIVACY_[a-f0-9]+/)?.[0];
			if (!marker) responseSent = true;
			response.writeHead(200, { 'content-type': 'application/x-ndjson' }); response.end(JSON.stringify({ model: 'fixture', message: { role: 'assistant', content: marker ?? '{"marker":42,"private":"CM_PRIVATE_VALIDATION_REPLY"}' }, done: true }) + '\n');
		});
	});
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object'); const host = 'http://127.0.0.1:' + address.port;
	const lifetime = new RequestLifetime();
	try {
		const candidate = new OllamaProvider('qwen3.8:27b', host, 2048, undefined, 'memory-only');
		// Controlled HTTP SDK fixture: mechanics only. Actual Ollama proof is the
		// separate mandatory live source/compiled test, never this test's evidence.
		const proof = await verifyLocalConnectionProvider(candidate, { modelId: 'qwen3.8:27b', host, assertIsolatedService() { assert.ok(server.listening); }, snapshot: async () => [] });
		const execution = sessionConnectionExecution(Object.freeze({ lookupRoot: '/private/retry-fixture', daemonEpoch: 'fixture', sessionHandle: 'owner' }), { bindingId: 'fixture', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() { assert.ok(active); } });
		const facade = admitConnectionProvider(candidate, execution, proof);
		const schema = { get type() { if (responseSent) { validationReads++; active = false; } return 'object'; }, properties: { marker: { type: 'string' } }, required: ['marker'], additionalProperties: false };
		await assert.rejects(facade.completeStructured([{ role: 'user', content: 'fixture-schema' }], schema, { maxAttempts: 3 }), { code: 'session-expired' });
		assert.ok(validationReads > 0); assert.equal(requests, 2, 'one verifier request, one admitted invalid reply, zero SDK retries');
	} finally { active = false; lifetime.abort(); lifetime.complete(); await lifetime.drained; server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});

test('memory-only adapter refuses internal helper substitution before native construction', () => {
	const prototype = OllamaProvider.prototype, descriptor = Object.getOwnPropertyDescriptor(prototype, 'clientFor')!; let reads = 0;
	Object.defineProperty(prototype, 'clientFor', { configurable: true, get() { reads++; throw Error('CM_PRIVATE_HELPER'); } });
	try { assert.throws(() => new OllamaProvider('qwen3.8:27b', 'http://127.0.0.1:1', 2048, undefined, 'memory-only'), { code: 'unsupported-temporary' }); assert.equal(reads, 0); }
	finally { Object.defineProperty(prototype, 'clientFor', descriptor); }
});

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtemp, cp, symlink, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('issued proof from an actual changed artifact generation refuses with zero filesystem or spawn calls', async () => {
	const root = await mkdtemp(join(tmpdir(), 'cm-stale-provider-')), repo = fileURLToPath(new URL('../../../../../', import.meta.url));
	let requests = 0; const server = createServer((request, response) => {
		if (request.url === '/api/version') { request.resume(); response.end(JSON.stringify({ version: 'SDK-fixture-not-live-service-evidence' })); return; }
		let body = ''; request.on('data', b => { body += b; }); request.once('end', () => { requests++; const marker = JSON.parse(body).messages[0].content.match(/CM_LOCAL_PRIVACY_[a-f0-9]+/)[0]; response.writeHead(200, { 'content-type': 'application/x-ndjson' }); response.end(JSON.stringify({ message: { role: 'assistant', content: marker }, done: true }) + '\n'); });
	});
	await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const address = server.address(); assert.ok(address && typeof address === 'object'); const host = 'http://127.0.0.1:' + address.port;
	let lifetime: { abort(): void; complete(): void; readonly drained: Promise<void> } | undefined;
	try {
		await cp(join(repo, 'out'), join(root, 'out'), { recursive: true }); await symlink(join(repo, 'node_modules'), join(root, 'node_modules')); await writeFile(join(root, 'package.json'), '{"type":"module"}');
		const artifact = join(root, 'out/agent/providers/ollama.js'), url = pathToFileURL(artifact).href;
		const native = await import(url), policy = await import(pathToFileURL(join(root, 'out/shared/connection-provider.js')).href), context = await import(pathToFileURL(join(root, 'out/shared/step-context.js')).href), request = await import(pathToFileURL(join(root, 'out/daemon/request-context.js')).href);
		const candidate = new native.OllamaProvider('qwen3.8:27b', host, 2048, undefined, 'memory-only');
		const proof = await policy.verifyLocalConnectionProvider(candidate, { modelId: 'qwen3.8:27b', host, assertIsolatedService() { assert.ok(server.listening); }, snapshot: async () => [] });
		lifetime = new request.RequestLifetime();
		const execution = context.sessionConnectionExecution(Object.freeze({ lookupRoot: root, daemonEpoch: 'stale-fixture', sessionHandle: 'owner' }), { bindingId: 'stale', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() { } });
		const facade = policy.admitConnectionProvider(candidate, execution, proof);
		// Change only a private copied artifact, then actually evaluate its new
		// module generation. The prior issued proof must become stale in memory.
		await appendFile(artifact, '\n// private fixture generation changed\n'); await import(url + '?generation=changed');
		let fileCalls = 0, spawned = 0, payloadReads = 0;
		const spies = [mock.method(fs, 'readFileSync', () => { fileCalls++; throw Error('unexpected file access'); }), mock.method(fsPromises, 'readFile', async () => { fileCalls++; throw Error('unexpected file access'); }), mock.method(fs, 'writeFileSync', () => { fileCalls++; throw Error('unexpected write'); }), mock.method(fsPromises, 'writeFile', async () => { fileCalls++; throw Error('unexpected write'); }), mock.method(childProcess, 'spawn', () => { spawned++; throw Error('unexpected spawn'); }), mock.method(childProcess, 'fork', () => { spawned++; throw Error('unexpected fork'); })]; syncBuiltinESMExports();
		try {
			const poison = new Proxy({}, { get() { payloadReads++; throw Error('private payload'); } });
			assert.throws(() => policy.admitConnectionProvider(candidate, execution, proof), { code: 'unsupported-temporary' }); await assert.rejects(facade.complete(poison, poison), { code: 'unsupported-temporary' });
			assert.equal(fileCalls, 0); assert.equal(spawned, 0); assert.equal(payloadReads, 0); assert.equal(requests, 1, 'only the initial verifier reaches the actual SDK fixture');
		} finally { for (const spy of spies) spy.mock.restore(); syncBuiltinESMExports(); }
	} finally { lifetime?.abort(); lifetime?.complete(); if (lifetime) await lifetime.drained; server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); }
});
