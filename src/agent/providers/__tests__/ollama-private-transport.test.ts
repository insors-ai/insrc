import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { OllamaProvider } from '../ollama.js';

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
