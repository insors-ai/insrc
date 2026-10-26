/** Real SDK + normal rotating daemon sink. Protocol faults are controlled; this
 * is not substituted for t24's actual-model service privacy evidence. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = process.argv[2]!, mode = process.argv[3] ?? 'source';
const base = new URL(mode === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
const { PATHS } = await import(new URL('shared/paths.js', base).href) as typeof import('../../../../shared/paths.js');
await mkdir(directory, { recursive: true }); PATHS.config = join(directory, 'config.json'); await writeFile(PATHS.config, JSON.stringify({ logLevel: 'trace' })); PATHS.insrc = directory; PATHS.logDir = join(directory, 'logs'); PATHS.daemonLog = join(PATHS.logDir, 'daemon.log'); PATHS.agentLog = join(PATHS.logDir, 'agent.log');
const { OllamaProvider } = await import(new URL('agent/providers/ollama.js', base).href) as typeof import('../../../../agent/providers/ollama.js');
const { verifyLocalConnectionProvider, admitConnectionProvider } = await import(new URL('shared/connection-provider.js', base).href) as typeof import('../../../../shared/connection-provider.js');
const { sessionConnectionExecution, ConnectionExecutionError, connectionExecutionErrorCode } = await import(new URL('shared/step-context.js', base).href) as typeof import('../../../../shared/step-context.js');
const { RequestLifetime } = await import(new URL('daemon/request-context.js', base).href) as typeof import('../../../request-context.js');
const { withStructuredRetry } = await import(new URL('agent/providers/structured-output.js', base).href) as typeof import('../../../../agent/providers/structured-output.js');
const { getLogger } = await import(new URL('shared/logger.js', base).href) as typeof import('../../../../shared/logger.js');
async function files(root: string): Promise<Buffer[]> { const result: Buffer[] = []; for (const entry of await readdir(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isDirectory()) result.push(...await files(path)); else if (entry.isFile()) result.push(await readFile(path)); } return result; }
let behavior: 'verify' | 'retry' | 'success' | 'http-error' | 'late' = 'verify', calls = 0, lazyReads = 0, retryCalls = 0;
const requests: Record<string, unknown>[] = []; let releaseLate: (() => void) | undefined;
function frame(response: ServerResponse, content: string, done = true) { response.write(JSON.stringify({ model: 'fixture', message: { role: 'assistant', content }, done }) + '\n'); }
const server = createServer((request, response) => {
	if (request.url === '/api/version') { request.resume(); response.end(JSON.stringify({ version: 'SDK-fixture-not-live-service-evidence' })); return; }
	let body = ''; request.on('data', b => { body += b; }); request.once('end', () => {
		const value = JSON.parse(body), content = value.messages[0].content as string; calls++;
		if (content.includes('CM_SAVED_PROVIDER_PROMPT')) { response.writeHead(200, { 'content-type': 'application/x-ndjson' }); frame(response, 'CM_SAVED_PROVIDER_RESPONSE'); response.end(); return; }
		requests.push(value);
		if (behavior === 'http-error') { response.writeHead(503); response.end('CM_PRIVATE_RAW_HTTP_ERROR'); return; }
		response.writeHead(200, { 'content-type': 'application/x-ndjson' });
		if (behavior === 'verify') { frame(response, content.match(/CM_LOCAL_PRIVACY_[a-f0-9]+/)![0]); response.end(); }
		else if (behavior === 'retry') { retryCalls++; frame(response, retryCalls === 1 ? '{"marker":42,"detail":"CM_PRIVATE_VALIDATION_RESPONSE"}' : '{"marker":"CM_PRIVATE_RESPONSE_SUCCESS"}'); response.end(); }
		else if (behavior === 'late') { frame(response, 'CM_PRIVATE_LATE_PARTIAL', false); frame(response, '', true); let released = false; releaseLate = () => { if (!released) { released = true; response.end('CM_PRIVATE_LATE_STREAM_ERROR\n'); } }; }
		else { frame(response, 'CM_PRIVATE_SUCCESS_RESPONSE'); response.end(); }
	});
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const address = server.address(); assert.ok(address && typeof address === 'object'); const host = 'http://127.0.0.1:' + address.port;
const lifetime = new RequestLifetime(); let active = true;
try {
	const candidate = new OllamaProvider('qwen3.8:27b', host, 2048, undefined, 'memory-only');
	const proof = await verifyLocalConnectionProvider(candidate, { modelId: 'qwen3.8:27b', host, assertIsolatedService() { assert.ok(server.listening); }, snapshot: async () => { await delay(30); return files(directory); } });
	const execution = sessionConnectionExecution(Object.freeze({ lookupRoot: directory, daemonEpoch: 'diagnostics', sessionHandle: 'owner' }), { bindingId: 'diagnostics', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() { assert.ok(active); } });
	const facade = admitConnectionProvider(candidate, execution, proof);
	behavior = 'retry'; const schema = { type: 'object', properties: { marker: { type: 'string' } }, required: ['marker'], additionalProperties: false };
	const answer = await facade.completeStructured<{ marker: string }>([{ role: 'user', content: 'CM_PRIVATE_PROMPT' }], schema, { maxAttempts: 3 }); assert.equal(answer.marker, 'CM_PRIVATE_RESPONSE_SUCCESS'); assert.equal(retryCalls, 2);
	assert.equal(JSON.stringify(requests.at(-1)).includes('CM_PRIVATE_VALIDATION_RESPONSE'), false, 'raw validation reply entered retry feedback');
	behavior = 'success'; let innerCalls = 0;
	const raw = new Proxy({}, { get() { lazyReads++; throw Error('CM_PRIVATE_LAZY_ERROR'); }, getPrototypeOf() { lazyReads++; throw Error('CM_PRIVATE_LAZY_ERROR'); } });
	for (const [thrown, expected] of [[raw, 'unsupported-temporary'], [new ConnectionExecutionError('upgrade-required'), 'upgrade-required']] as const) {
		if (expected === 'upgrade-required') for (const key of ['name', 'message', 'code']) Object.defineProperty(thrown, key, { get() { lazyReads++; throw Error('CM_PRIVATE_LAZY_ERROR'); } });
		let inner: Promise<unknown> | undefined;
		await facade.complete([{ role: 'user', content: 'CM_PRIVATE_PROMPT' }], { onToken() { inner ??= withStructuredRetry(async () => { innerCalls++; throw thrown; }, () => ({ ok: true, value: {} }), 3, execution).then(() => undefined, error => error); } });
		assert.ok(inner); const error = await inner; assert.equal(connectionExecutionErrorCode(error), expected);
	}
	assert.equal(innerCalls, 2); assert.equal(lazyReads, 0);
	let validation: Promise<unknown> | undefined, validationCalls = 0;
	await facade.complete([{ role: 'user', content: 'CM_PRIVATE_PROMPT' }], { onToken() { validation ??= withStructuredRetry(async () => { validationCalls++; return {}; }, () => { throw raw; }, 3, execution).then(() => undefined, error => error); } });
	assert.ok(validation); assert.equal(connectionExecutionErrorCode(await validation), 'unsupported-temporary'); assert.equal(validationCalls, 1); assert.equal(lazyReads, 0);

	behavior = 'http-error'; const beforeError = calls; await assert.rejects(facade.complete([{ role: 'user', content: 'CM_PRIVATE_PROMPT' }]), { code: 'unsupported-temporary' }); assert.equal(calls - beforeError, 1);
	behavior = 'late'; let entered!: () => void; const received = new Promise<void>(r => { entered = r; }); let settled = false; const beforeLate = calls;
	const late = facade.complete([{ role: 'user', content: 'CM_PRIVATE_PROMPT' }], { onToken() { entered(); } }); const observed = late.then(() => { settled = true; return undefined; }, error => { settled = true; return error; });
	await received; await delay(20); assert.equal(settled, false); assert.ok(releaseLate);
	// Same actual Ollama logger while Session SDK work is still held. No second
	// model call runs concurrently; project provider calls stay serial.
	getLogger('ollama').info({ marker: 'CM_SAVED_CONCURRENT_PROVIDER_MARKER' }, 'saved provider diagnostic remains visible'); releaseLate(); assert.equal(connectionExecutionErrorCode(await observed), 'unsupported-temporary'); assert.equal(calls - beforeLate, 1);
	const saved = new OllamaProvider('qwen3.8:27b', host, 2048); assert.equal((await saved.complete([{ role: 'user', content: 'CM_SAVED_PROVIDER_PROMPT' }])).text, 'CM_SAVED_PROVIDER_RESPONSE');
	active = false; const beforeExpiry = calls; await assert.rejects(facade.completeStructured([{ role: 'user', content: 'CM_PRIVATE_PROMPT' }], schema, { maxAttempts: 3 }), { code: 'session-expired' }); assert.equal(calls, beforeExpiry);
	let bytes: Buffer[] = []; for (let n = 0;n < 200;n++) { await delay(20); bytes = await files(directory); if (bytes.some(b => b.includes('CM_SAVED_PROVIDER_RESPONSE'))) break; }
	const logs = Buffer.concat(bytes).toString('utf8'); for (const marker of ['CM_SAVED_CONCURRENT_PROVIDER_MARKER', 'CM_SAVED_PROVIDER_PROMPT', 'CM_SAVED_PROVIDER_RESPONSE']) assert.ok(logs.includes(marker), 'Saved provider control missing from actual rotating daemon log'); assert.equal(logs.includes('CM_PRIVATE_'), false);
	process.stdout.write(JSON.stringify({ completed: true, mode, retryCalls, innerCalls, lazyReads, lateStreamQuiet: true, actualDaemonSink: true, savedProviderVisible: true, noRetryAfterExpiry: true }) + '\n');
} finally { active = false; releaseLate?.(); lifetime.abort(); lifetime.complete(); await lifetime.drained; server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
process.exit(0);
