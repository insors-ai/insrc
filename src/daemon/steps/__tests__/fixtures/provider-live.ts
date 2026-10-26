/** Actual isolated local service. No prompt uses user data; no model is pulled. */
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, symlink, readdir, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = await mkdtemp(join(tmpdir(), 'cm-local-privacy-'));
const model = process.env.INSRC_PROVIDER_MODEL ?? 'qwen3.8:27b';
assert.match(model, /^[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+$/);
const [name, tag] = model.split(':');
const source = process.env.INSRC_PROVIDER_MODEL_ROOT ?? join(homedir(), '.ollama', 'models');
const manifestPath = join('manifests', 'registry.ollama.ai', 'library', name!, tag!);
const manifest = JSON.parse(await readFile(join(source, manifestPath), 'utf8'));
await mkdir(join(root, 'models', 'manifests', 'registry.ollama.ai', 'library', name!), { recursive: true });
await mkdir(join(root, 'models', 'blobs')); await mkdir(join(root, 'tmp'));
await writeFile(join(root, 'models', manifestPath), JSON.stringify(manifest));
for (const item of [manifest.config, ...manifest.layers]) { assert.match(item.digest, /^sha256:[a-f0-9]{64}$/); const file = item.digest.replace(':', '-'); await symlink(join(source, 'blobs', file), join(root, 'models', 'blobs', file)); }
const reserve = createServer(); await new Promise<void>(r => reserve.listen(0, '127.0.0.1', r)); const address = reserve.address(); assert.ok(address && typeof address === 'object'); const port = address.port; await new Promise<void>(r => reserve.close(() => r()));
const serverLog = join(root, 'server-output.txt');
const child = spawn(process.env.INSRC_PROVIDER_OLLAMA_BIN ?? '/usr/local/bin/ollama', ['serve'], { cwd: root, env: { ...process.env, OLLAMA_HOST: '127.0.0.1:' + port, OLLAMA_MODELS: join(root, 'models'), OLLAMA_TMPDIR: join(root, 'tmp'), OLLAMA_NO_CLOUD: '1', OLLAMA_DEBUG: '0', OLLAMA_NOPRUNE: '1', OLLAMA_KEEP_ALIVE: '0', OLLAMA_MAX_LOADED_MODELS: '1', OLLAMA_NUM_PARALLEL: '1', OLLAMA_CONTEXT_LENGTH: '2048' }, stdio: ['ignore', 'pipe', 'pipe'] });
let closed = false, spawnError: Error | undefined; child.on('error', error => { spawnError = error; }); const childClosed = once(child, 'close').then(() => { closed = true; });
child.stdout.on('data', b => appendFileSync(serverLog, b)); child.stderr.on('data', b => appendFileSync(serverLog, b));
async function snapshot(directory: string): Promise<Buffer[]> { const bytes: Buffer[] = []; for (const e of await readdir(directory, { withFileTypes: true })) { const path = join(directory, e.name); if (e.isDirectory()) bytes.push(...await snapshot(path)); else if (e.isFile()) bytes.push(await readFile(path)); } return bytes; }
const host = 'http://127.0.0.1:' + port;
try {
	let ready = false; for (let n = 0;n < 100;n++) { if (closed || spawnError) throw Error('isolated server did not start'); try { const response = await fetch(host + '/api/version', { signal: AbortSignal.timeout(500) }); if (response.ok) { ready = true; break; } } catch { } await delay(100); } assert.ok(ready);
	const base = new URL(process.argv[2] === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
	const { PATHS } = await import(new URL('shared/paths.js', base).href) as typeof import('../../../../shared/paths.js');
	PATHS.config = join(root, 'config.json'); await writeFile(PATHS.config, JSON.stringify({ logLevel: 'trace' })); PATHS.insrc = root; PATHS.logDir = join(root, 'logs'); PATHS.daemonLog = join(PATHS.logDir, 'daemon.log'); PATHS.agentLog = join(PATHS.logDir, 'agent.log');
	const { OllamaProvider } = await import(new URL('agent/providers/ollama.js', base).href) as typeof import('../../../../agent/providers/ollama.js');
	const { verifyLocalConnectionProvider, admitConnectionProvider } = await import(new URL('shared/connection-provider.js', base).href) as typeof import('../../../../shared/connection-provider.js');
	const { sessionConnectionExecution, runWithConnectionExecution } = await import(new URL('shared/step-context.js', base).href) as typeof import('../../../../shared/step-context.js');
	const { RequestLifetime } = await import(new URL('daemon/request-context.js', base).href) as typeof import('../../../request-context.js');
	const { getLogger } = await import(new URL('shared/logger.js', base).href) as typeof import('../../../../shared/logger.js');
	const candidate = new OllamaProvider(model, host, 2048, undefined, 'memory-only');
	const assertService = () => { assert.ok(!closed && !spawnError); assert.ok(child.pid); process.kill(child.pid, 0); };
	const snapshots = async () => { await delay(300); return snapshot(root); };
	const proof = await verifyLocalConnectionProvider(candidate, { modelId: model, host, assertIsolatedService: assertService, snapshot: snapshots });
	let active = true; const lifetime = new RequestLifetime();
	const execution = sessionConnectionExecution(Object.freeze({ lookupRoot: root, daemonEpoch: 'live-private', sessionHandle: 'live-owner' }), { bindingId: 'live-binding', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() { assert.ok(active); } });
	try {
		const facade = admitConnectionProvider(candidate, execution, proof), canary = 'CM_SESSION_LIVE_' + Date.now();
		let reads = 0; const poison = new Proxy({}, { get() { reads++; throw Error('private-options'); } });
		const otherLifetime = new RequestLifetime(); const otherOwner = sessionConnectionExecution(Object.freeze({ lookupRoot: root, daemonEpoch: 'live-private', sessionHandle: 'other-owner' }), { bindingId: 'other', audience: 'workbench-ui', controlGeneration: 1, lifetime: otherLifetime, assertActive() { } });
		try { await runWithConnectionExecution(otherOwner, async () => { await assert.rejects(facade.complete(poison as never, poison), { code: 'session-expired' }); }); assert.equal(reads, 0); } finally { otherLifetime.abort(); otherLifetime.complete(); await otherLifetime.drained; }
		const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(facade.complete([], { signal: cancelled.signal }), { code: 'session-expired' });
		const reply = await facade.complete([{ role: 'user', content: 'Return exactly this marker: ' + canary }], { maxTokens: 128, temperature: 0, disableThinking: true }); assert.ok(reply.text.includes(canary));
		const structured = await facade.completeStructured<{ marker: string }>([{ role: 'user', content: 'Return a JSON object with marker equal to ' + canary }], { type: 'object', properties: { marker: { type: 'string' } }, required: ['marker'], additionalProperties: false }, { maxTokens: 128, maxAttempts: 2, disableThinking: true }); assert.equal(structured.marker, canary);
		getLogger('provider-live-saved-control').info({ marker: 'CM_SAVED_LIVE_CONTROL' }, 'saved logs stay visible');
		const bytes = await snapshots(); assert.ok(bytes.some(b => b.includes('CM_SAVED_LIVE_CONTROL'))); assert.ok(bytes.every(b => !b.includes(canary)));
		assert.throws(() => admitConnectionProvider(candidate, execution, { ...proof }), { code: 'unsupported-temporary' });
		const other = new OllamaProvider(model, host, 2048, undefined, 'memory-only'); assert.throws(() => admitConnectionProvider(other, execution, proof), { code: 'unsupported-temporary' });
		const descriptor = Object.getOwnPropertyDescriptor(candidate, 'model')!; let modelReads = 0; Object.defineProperty(candidate, 'model', { get() { modelReads++; throw Error('private-mutated-model'); }, configurable: true }); await assert.rejects(async () => facade.complete([]), { code: 'unsupported-temporary' }); assert.equal(modelReads, 0); Object.defineProperty(candidate, 'model', descriptor);
		active = false; await assert.rejects(async () => facade.complete([{ role: 'user', content: 'must not send' }]), { code: 'session-expired' });
		child.kill('SIGTERM'); await childClosed; const finalBytes = await snapshot(root); assert.ok(finalBytes.every(b => !b.includes(canary)));
		process.stdout.write(JSON.stringify({ completed: true, mode: process.argv[2] ?? 'source', model, actualService: true, admittedComplete: true, admittedStructured: true, privateOutputs: finalBytes.length, savedLogControl: true, copiedAndWrongInstanceDenied: true, expiredDenied: true }) + '\n');
	} finally { active = false; lifetime.abort(); lifetime.complete(); await lifetime.drained; }
} finally { if (!closed) { child.kill('SIGTERM'); await Promise.race([childClosed, delay(5000)]); if (!closed) { child.kill('SIGKILL'); await childClosed; } } await rm(root, { recursive: true, force: true }); }
process.exit(0);
