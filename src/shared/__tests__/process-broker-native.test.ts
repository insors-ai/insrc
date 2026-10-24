import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const binary = join(root, 'out/bin/insrc-process-broker');
const dir = mkdtempSync(join(tmpdir(), 'insrc-broker-native-'));
const fake = join(dir, 'fake-broker');
const children: ChildProcess[] = [];
const supported = process.platform === 'linux' || process.platform === 'darwin';

before(() => {
	if (!supported) return;
	// Exercise the actual package build, not just a test-only compiler invocation.
	execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe', timeout: 120_000 });
	execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', join(root, 'src/native/process-broker'), join(root, 'src/native/process-broker/main.c'), join(root, 'src/shared/__tests__/fixtures/process-broker-fake-backend.c'), '-o', fake], { stdio: 'pipe', timeout: 30_000 });
});
afterEach(async () => {
	for (const child of children.splice(0)) {
		if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill('SIGKILL'); await ended; }
	}
});
after(() => { rmSync(dir, { recursive: true, force: true }); });

function session(pid: number | string, executable = binary, env: NodeJS.ProcessEnv = process.env) {
	const child = spawn(executable, [String(pid)], { env, stdio: ['pipe', 'pipe', 'pipe'] });
	children.push(child);
	const lines: string[] = [];
	let waiter: { resolve: (line: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
	let ended = false;
	const reader = createInterface({ input: child.stdout!, crlfDelay: Infinity });
	reader.on('line', line => {
		if (waiter) { const pending = waiter; waiter = undefined; clearTimeout(pending.timer); pending.resolve(line); }
		else lines.push(line);
	});
	const finish = (): void => {
		ended = true;
		if (waiter) { clearTimeout(waiter.timer); waiter.reject(new Error('broker ended before replying')); waiter = undefined; }
	};
	child.once('error', finish); reader.once('close', finish);
	return {
		child,
		next(): Promise<string> {
			const line = lines.shift(); if (line !== undefined) return Promise.resolve(line);
			if (ended) return Promise.reject(new Error('broker ended before replying'));
			return new Promise((resolve, reject) => { const timer = setTimeout(() => { waiter = undefined; reject(new Error('broker reply timeout')); }, 3000); waiter = { resolve, reject, timer }; });
		},
		async request(value: string): Promise<string> { child.stdin!.write(value); return this.next(); },
	};
}

async function daemonStandIn(named = true): Promise<ChildProcess> {
	const entry = join(mkdtempSync(join(dir, 'target-')), 'démon', named ? 'daemon' : 'other', 'index.js');
	mkdirSync(dirname(entry), { recursive: true });
	writeFileSync(entry, "process.stdout.write('ready\\n'); setInterval(() => {}, 1000);");
	const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
	await once(child.stdout!, 'data'); return child;
}

test('normal build ships the host broker with no numeric-PID kill symbol', { skip: !supported }, () => {
	assert.equal(existsSync(binary), true);
	const imports = execFileSync('nm', ['-u', binary], { encoding: 'utf8', timeout: 5000 });
	assert.doesNotMatch(imports, /\b_?kill(?:@|\s|$)/m);
});

test('Linux native handle retains the original target through termination and exit without retargeting', { skip: process.platform !== 'linux', timeout: 10000 }, async () => {
	const target = await daemonStandIn(), broker = session(target.pid!);
	const ready = (await broker.next()).split(' ');
	assert.deepEqual(ready.slice(0, 3), ['READY', '1', String(target.pid)]);
	assert.match(Buffer.from(ready[3]!, 'hex').toString('utf8'), /^linux:/);
	assert.match(Buffer.from(ready[4]!, 'hex').toString('utf8'), /démon\/daemon\/index\.js$/);
	assert.equal(await broker.request('1 STATE\n'), '1 ALIVE');
	const died = once(target, 'exit');
	assert.equal(await broker.request('2 TERM\n'), '2 SENT'); await died;
	const replacement = await daemonStandIn();
	assert.equal(await broker.request('3 STATE\n'), '3 EXITED');
	assert.equal(await broker.request('4 TERM\n'), '4 EXITED');
	assert.equal(replacement.exitCode, null); assert.equal(replacement.signalCode, null);
	assert.equal(await broker.request('5 CLOSE\n'), '5 CLOSED');
});

test('closing or abandoning a native handle does not terminate its target', { skip: process.platform !== 'linux', timeout: 10000 }, async () => {
	const target = await daemonStandIn(), broker = session(target.pid!);
	assert.match(await broker.next(), /^READY 1 /);
	const ended = once(broker.child, 'exit');
	assert.equal(await broker.request('1 CLOSE\n'), '1 CLOSED'); await ended;
	assert.equal(target.exitCode, null); assert.equal(target.signalCode, null);
	const second = session(target.pid!); assert.match(await second.next(), /^READY 1 /);
	const eof = once(second.child, 'exit'); second.child.stdin!.end(); await eof;
	assert.equal(target.exitCode, null); assert.equal(target.signalCode, null);
});

test('native framing rejects malformed requests and non-daemon targets without signalling', { skip: process.platform !== 'linux', timeout: 10000 }, async () => {
	const target = await daemonStandIn(), broker = session(target.pid!);
	assert.match(await broker.next(), /^READY 1 /);
	assert.equal(await broker.request('1 UNKNOWN\n'), '1 ERROR invalid-operation 22');
	assert.equal(await broker.request('2 TERM\0extra\n'), 'ERROR malformed-request 22');
	assert.equal(target.signalCode, null);
	const unrelated = await daemonStandIn(false), rejected = session(unrelated.pid!);
	assert.equal(await rejected.next(), 'ERROR wrong-target 22');
	assert.equal(unrelated.signalCode, null);
	for (const pid of ['0', '-1', '1junk', '2147483648']) assert.equal(await session(pid).next(), 'ERROR invalid-target 22');
});

test('Darwin-style denied and unsupported capability seams fail before readiness and never enable termination', { skip: !supported }, async () => {
	// The real protocol is linked to a test-only OS adapter; this is not Darwin runtime evidence.
	for (const mode of ['denied', 'unsupported']) {
		const broker = session(123, fake, { ...process.env, INSRC_TEST_CAPTURE: mode });
		assert.match(await broker.next(), new RegExp(`^ERROR ${mode} [0-9]+$`));
		const exited = broker.child.exitCode === null ? await once(broker.child, 'exit') : [broker.child.exitCode];
		assert.equal(exited[0], 1);
	}
});

test('missing identity metadata is unverifiable rather than positive process-exit evidence', { skip: !supported }, async () => {
	const broker = session(123, fake, { ...process.env, INSRC_TEST_CAPTURE: 'missing-metadata' });
	assert.match(await broker.next(), /^ERROR unverifiable [0-9]+$/);
});
