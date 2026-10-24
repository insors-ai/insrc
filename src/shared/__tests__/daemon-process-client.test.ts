import { afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { captureStopTarget, ProcessCapabilityError } from '../daemon-process-client.js';
import type { ProcessCapabilityOptions, StopTarget } from '../daemon-process-client.js';
import { readProcessIdentity } from '../daemon-process.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let dir: string, count = 0;
const targets: ChildProcess[] = [], handles: StopTarget[] = [];
before(() => { if (process.platform === 'linux') execFileSync(process.execPath, ['build-process-broker.mjs'], { cwd: root, timeout: 30000 }); });
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'insrc-cap-client-')); });
afterEach(async () => {
	for (const target of handles.splice(0)) await target.handle.close().catch(() => {});
	for (const child of targets.splice(0)) if (child.exitCode === null && child.signalCode === null) { const done = once(child, 'exit'); child.kill('SIGKILL'); await done; }
	rmSync(dir, { recursive: true, force: true });
});

function helper(body: string) {
	const file = join(dir, `broker-${++count}.mjs`), pidFile = file + '.pid', requests = file + '.requests';
	const marker = Buffer.from('linux:fixture-incarnation').toString('hex');
	const command = Buffer.from('node /démon/daemon/index.js').toString('hex');
	writeFileSync(file, `#!/usr/bin/env node
import { writeFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
const ready = 'READY 1 '+process.argv[2]+' ${marker} ${command}';
const emit = line => process.stdout.write(line+'\\n');
let keepOnEof = false;
setInterval(()=>{},1000);
const input = createInterface({input:process.stdin});
input.on('line',line=>appendFileSync(${JSON.stringify(requests)},line+'\\n'));
input.on('close',()=>{if(!keepOnEof)process.exit(0)});
${body}
`, { mode: 0o755 });
	return { file, pidFile, requests };
}
async function opened(pid: number, options: ProcessCapabilityOptions = {}): Promise<StopTarget> {
	const target = await captureStopTarget(pid, options); assert.ok(target); handles.push(target); return target;
}
function category(expected: string): (error: unknown) => boolean {
	return error => error instanceof ProcessCapabilityError && error.category === expected;
}
function helperGone(pidFile: string): void {
	if (existsSync(pidFile)) assert.equal(readProcessIdentity(Number(readFileSync(pidFile, 'utf8'))), undefined);
}
async function waitForFile(path: string): Promise<void> {
	const deadline = Date.now() + 3000;
	while (!existsSync(path)) { if (Date.now() >= deadline) throw new Error('helper did not start'); await new Promise(r => setTimeout(r, 10)); }
}
async function standIn(): Promise<ChildProcess> {
	const entry = join(mkdtempSync(join(dir, 'target-')), 'daemon/index.js'); mkdirSync(dirname(entry), { recursive: true });
	writeFileSync(entry, "process.stdout.write('ready\\n'); setInterval(()=>{},1000);");
	const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'pipe'] }); targets.push(child);
	await once(child.stdout!, 'data'); return child;
}

test('native StopTarget remains bound after PID-file replacement and terminates only the original process', { skip: process.platform !== 'linux', timeout: 10000 }, async () => {
	const original = await standIn(), replacement = await standIn(), pidFile = join(dir, 'daemon.pid');
	writeFileSync(pidFile, String(original.pid));
	const target = await opened(Number(readFileSync(pidFile, 'utf8')));
	assert.equal(await target.handle.hasExited(), false);
	writeFileSync(pidFile, String(replacement.pid));
	const died = once(original, 'exit'); assert.equal(await target.handle.terminate(), 'sent'); await died;
	assert.equal(await target.handle.hasExited(), true);
	assert.equal(await target.handle.terminate(), 'exited');
	const other = await opened(replacement.pid!); assert.equal(await other.handle.hasExited(), false);
	await target.handle.close();
});

test('native close and cancellation release the broker without terminating an unrequested target', { skip: process.platform !== 'linux', timeout: 10000 }, async () => {
	const child = await standIn(), first = await opened(child.pid!);
	await first.handle.close(); await first.handle.close();
	await assert.rejects(first.handle.hasExited(), category('closed'));
	const abort = new AbortController(), second = await opened(child.pid!, { signal: abort.signal });
	abort.abort(); await assert.rejects(second.handle.hasExited(), category('cancelled'));
	const third = await opened(child.pid!); assert.equal(await third.handle.hasExited(), false);
});

test('chunked readiness and out-of-order replies preserve one immutable identity and request correlation', async () => {
	const fake = helper(`let i=0; const bytes=Buffer.from(ready+'\\n'); function send(){if(i<bytes.length){process.stdout.write(bytes.subarray(i,i+1));i++;setImmediate(send)}}send();
input.on('line',line=>{const [id,op]=line.split(' ');setTimeout(()=>emit(id+' '+(op==='STATE'?'ALIVE':'SENT')),id==='1'?20:0)});`);
	const target = await opened(123, { executable: fake.file });
	assert.match(target.commandLine, /démon\/daemon\/index\.js$/);
	assert.equal(Reflect.set(target, 'pid', 456), false);
	assert.deepEqual(await Promise.all([target.handle.hasExited(), target.handle.terminate()]), [false, 'sent']);
	assert.deepEqual(readFileSync(fake.requests, 'utf8').trim().split('\n'), ['1 STATE', '2 TERM']);
	await target.handle.close(); helperGone(fake.pidFile);
});

test('spawn, readiness, malformed identity and native permission failures refuse capture and clean helpers', { timeout: 10000 }, async () => {
	await assert.rejects(captureStopTarget(123, { executable: join(dir, 'missing') }), category('spawn'));
	const bodies: Array<[string, string]> = [
		["emit('ERROR denied 1');", 'denied'], ["emit('ERROR unsupported 38');", 'unsupported'],
		["emit('ERROR unverifiable 2');", 'unverifiable'], ["process.exit(1);", 'unverifiable'], ["emit('ERROR gone 2');", 'unverifiable'],
		["emit(ready.replace('READY 1 ','READY 2 '));", 'protocol'],
		["emit(ready.replace(' 123 ',' 124 '));", 'protocol'],
		["emit('READY 1 123 6c696e75783a66 ff');", 'protocol'],
		["process.stdout.write(ready+'\\n1 ALIVE\\n');", 'protocol'],
	];
	for (const [body, kind] of bodies) {
		const fake = helper(body); await assert.rejects(captureStopTarget(123, { executable: fake.file }), category(kind), body); helperGone(fake.pidFile);
	}
	const gone = helper("keepOnEof=true;emit('ERROR gone 3');");
	assert.equal(await captureStopTarget(123, { executable: gone.file }), undefined); helperGone(gone.pidFile);
});

test('readiness and operation timeouts close a stuck helper without a target-signal fallback', { timeout: 10000 }, async () => {
	const silent = helper('keepOnEof=true;');
	await assert.rejects(captureStopTarget(123, { executable: silent.file, readyTimeoutMs: 500 }), category('timeout')); helperGone(silent.pidFile);
	const stuck = helper('keepOnEof=true;emit(ready);');
	const target = await opened(123, { executable: stuck.file, requestTimeoutMs: 30 });
	await assert.rejects(target.handle.hasExited(), category('timeout')); helperGone(stuck.pidFile);
	assert.deepEqual(readFileSync(stuck.requests, 'utf8').trim().split('\n'), ['1 STATE']);
});

test('abort before capture and during readiness or a pending request leaves no helper', { timeout: 10000 }, async () => {
	const unused = helper('emit(ready);'), before = new AbortController(); before.abort();
	await assert.rejects(captureStopTarget(123, { executable: unused.file, signal: before.signal }), category('cancelled'));
	assert.equal(existsSync(unused.pidFile), false);
	const silent = helper('keepOnEof=true;'), during = new AbortController();
	const opening = captureStopTarget(123, { executable: silent.file, signal: during.signal, readyTimeoutMs: 5000 });
	await waitForFile(silent.pidFile); during.abort(); await assert.rejects(opening, category('cancelled')); helperGone(silent.pidFile);
	const pending = helper('keepOnEof=true;emit(ready);'), request = new AbortController();
	const target = await opened(123, { executable: pending.file, signal: request.signal });
	const querying = target.handle.hasExited(); request.abort(); await assert.rejects(querying, category('cancelled')); helperGone(pending.pidFile);
});

test('unknown reply IDs, operation mismatches and request errors close the capability session', async () => {
	for (const [reply, kind] of [["'999 ALIVE'", 'protocol'], ["id+' SENT'", 'protocol'], ["id+' ERROR denied 1'", 'denied'], ["id+' ERROR gone 3'", 'unverifiable']]) {
		const fake = helper(`emit(ready);input.on('line',line=>{const [id]=line.split(' ');emit(${reply})});`);
		const target = await opened(123, { executable: fake.file });
		await assert.rejects(target.handle.hasExited(), category(kind!)); helperGone(fake.pidFile);
	}
});

test('invalid target IDs and timer bounds are rejected before spawning', async () => {
	const fake = helper('emit(ready);');
	for (const pid of [0, -1, NaN, 0x8000_0000]) await assert.rejects(captureStopTarget(pid, { executable: fake.file }), category('protocol'));
	for (const bound of [0, -1, Infinity, NaN, 0.5, 0x7fff_ffff]) await assert.rejects(captureStopTarget(123, { executable: fake.file, readyTimeoutMs: bound }), category('protocol'));
	assert.equal(existsSync(fake.pidFile), false);
});


test('oversized readiness and partial request replies never become process-exit evidence', async () => {
 const large = helper("process.stdout.write('R'.repeat(256*1024+1));");
 await assert.rejects(captureStopTarget(123, { executable: large.file }), category('protocol')); helperGone(large.pidFile);
 const partial = helper("emit(ready);input.on('line',()=>{process.stdout.write('1 EXI');process.exit(0)});");
 const target = await opened(123, { executable: partial.file });
 await assert.rejects(target.handle.hasExited(), category('unverifiable')); helperGone(partial.pidFile);
});
