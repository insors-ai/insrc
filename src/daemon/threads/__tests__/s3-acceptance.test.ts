/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s3 / t11: the Story's acceptance criteria ac1-ac6 over the real
 * daemon with daemon threads, spawned as a process and reached over its socket (test hooks
 * on, a 2 s session idle timeout). ac5's source scan runs in this process.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/s3-acceptance.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, alive, childEnv, sockOf } from '../../../mcp/__tests__/helpers/mcp-e2e.js';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-s3-acceptance-'));
const REPO = mkdtempSync(join(tmpdir(), 'insrc-s3-acceptance-repo-'));
const IDLE_MS = 2_000;
let daemon: { pid: number; sock: string; stderr: () => string; exited: Promise<number | null> } | undefined;

/** A client connection: requests by id, one reply line each. */
class Conn {
	private buf = '';
	private seq = 0;
	private readonly waiting = new Map<number, (reply: { result?: unknown; error?: string }) => void>();
	private constructor(private readonly socket: Socket) {
		socket.on('data', d => {
			this.buf += d.toString();
			let end: number;
			while ((end = this.buf.indexOf('\n')) >= 0) {
				const line = JSON.parse(this.buf.slice(0, end)) as { id: number; result?: unknown; error?: string };
				this.buf = this.buf.slice(end + 1);
				this.waiting.get(line.id)?.(line);
				this.waiting.delete(line.id);
			}
		});
	}
	static async open(sock: string): Promise<Conn> {
		const socket = connect(sock);
		await new Promise<void>((res, rej) => { socket.once('connect', () => res()); socket.once('error', rej); });
		return new Conn(socket);
	}
	ask(method: string, params: unknown, client?: { label: string; pid: number }): Promise<{ result?: unknown; error?: string }> {
		const id = ++this.seq;
		return new Promise(resolve => {
			this.waiting.set(id, resolve);
			this.socket.write(JSON.stringify({ id, method, params, ...(client !== undefined ? { client } : {}) }) + '\n');
		});
	}
	close(): void { this.socket.destroy(); }
}
const once = async (method: string, params: unknown, client?: { label: string; pid: number }, sock = daemon!.sock): Promise<{ result?: unknown; error?: string }> => {
	const c = await Conn.open(sock);
	try { return await c.ask(method, params, client); } finally { c.close(); }
};
const threadOf = (r: { result?: unknown }): number => (r.result as { threadId: number }).threadId;

/** Spawn the daemon entry under `home` with `config`; resolves once it answers daemon.status. */
async function spawnDaemon(home: string, config: unknown): Promise<{ pid: number; sock: string; stderr: () => string; exited: Promise<number | null> }> {
	mkdirSync(join(home, '.insrc'), { recursive: true });
	writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify(config));
	const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
		cwd: REPO_ROOT, env: { ...childEnv(home), INSRC_MODE: 'mcp', INSRC_TEST_HOOKS: '1' }, stdio: ['ignore', 'ignore', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
	const exited = new Promise<number | null>(r => child.once('exit', code => r(code)));
	const sock = sockOf(home);
	for (const deadline = Date.now() + 60_000; ;) {
		if (existsSync(sock)) {
			try { const c = await Conn.open(sock); const r = await c.ask('daemon.status', {}); c.close(); if (r.error === undefined) break; } catch { /* not ready yet */ }
		}
		if (child.exitCode !== null) throw new Error(`the daemon exited during start: ${stderr.slice(-2000)}`);
		if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`the daemon did not start: ${stderr.slice(-2000)}`); }
		await new Promise(r => setTimeout(r, 200));
	}
	return { pid: child.pid!, sock, stderr: () => stderr, exited };
}

/** SIGTERM, then SIGKILL after 30 s; resolves once it exited. */
async function stopDaemon(d: { pid: number; exited: Promise<number | null> }): Promise<void> {
	if (!alive(d.pid)) return;
	process.kill(d.pid, 'SIGTERM');
	const killer = setTimeout(() => { if (alive(d.pid)) process.kill(d.pid, 'SIGKILL'); }, 30_000);
	await d.exited;
	clearTimeout(killer);
}

before(async () => {
	daemon = await spawnDaemon(HOME, { daemon: { threads: { enabled: true, sessionIdleMs: IDLE_MS } } });
});
after(async () => {
	if (daemon !== undefined) await stopDaemon(daemon);
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

test("ac1: session B is answered on its own thread while session A's worker spins", { timeout: 60_000 }, async () => {
	const A = { label: 'mcp', pid: 7001 };
	const B = { label: 'mcp', pid: 7002 };
	let aEnded = false;
	const spinning = once('test.spin', { ms: 5_000 }, A).then(r => { aEnded = true; return r; });
	await new Promise(r => setTimeout(r, 500));   // A's worker is now spinning its CPU
	const t0 = Date.now();
	const b = await once('test.servingThread', null, B);
	const elapsed = Date.now() - t0;
	const bBeforeA = !aEnded;
	const a = await spinning;
	// The LLD's ac1: B is answered before A's spin ends (B's first request also starts its worker, so no fixed bound).
	assert.ok(bBeforeA, `B answered in ${elapsed} ms, after A's 5 s spin had ended`);
	assert.ok(threadOf(b) > 0 && threadOf(a) > 0, 'both on worker threads');
	assert.notEqual(threadOf(b), threadOf(a), 'on different threads');
});

test('ac2/ac3: one session over two connections runs in order on one worker thread, released after idle', { timeout: 60_000 }, async () => {
	const A = { label: 'mcp', pid: 7101 };
	const c1 = await Conn.open(daemon!.sock);
	const c2 = await Conn.open(daemon!.sock);
	try {
		const first = c1.ask('test.order', { tag: 'first', ms: 600 }, A);
		await new Promise(r => setTimeout(r, 50));
		const second = c2.ask('test.order', { tag: 'second', ms: 10 }, A);
		const [r1, r2] = [await first, await second];
		const o1 = r1.result as { threadId: number; startedAt: number; endedAt: number };
		const o2 = r2.result as { threadId: number; startedAt: number; endedAt: number };
		assert.equal(o1.threadId, o2.threadId, 'both connections reached the same worker');
		assert.ok(o2.startedAt >= o1.endedAt, `the second started (${o2.startedAt}) only after the first ended (${o1.endedAt})`);
		// Idle past the timeout: the sweep releases the worker; the next request gets a new one.
		await new Promise(r => setTimeout(r, IDLE_MS * 2 + 1_000));
		const next = await c1.ask('test.servingThread', null, A);
		assert.notEqual(threadOf(next), o1.threadId, 'released after idle: a new worker');
	} finally { c1.close(); c2.close(); }
});

test('ac4: a session worker failure is contained; a throwing handler keeps its worker', { timeout: 60_000 }, async () => {
	const A = { label: 'mcp', pid: 7201 };
	const B = { label: 'mcp', pid: 7202 };
	const before = threadOf(await once('test.servingThread', null, A));
	// A throwing handler: the session sees the error and keeps its worker.
	assert.equal((await once('test.throw', null, A)).error, 'the test handler threw');
	assert.equal(threadOf(await once('test.servingThread', null, A)), before, 'the same worker after a throw');
	// The worker exits mid-request.
	const crash = once('test.order', { tag: 'crash', ms: 60_000, exitAfterMs: 200 }, A);
	const other = once('test.order', { tag: 'other', ms: 600 }, B);
	assert.match((await crash).error ?? '', /^session worker failed: /);
	assert.equal(((await other).result as { tag: string }).tag, 'other', 'another session kept working');
	assert.equal((await once('daemon.status', {})).error, undefined, 'the admin worker kept working');
	assert.equal((await once('repo.stats', {})).error, undefined, 'the code-indexing worker kept working');
	assert.notEqual(threadOf(await once('test.servingThread', null, A)), before, "the session's next request runs on a new worker");
});

test('ac5: no Promise.all over provider calls in the modules s3 adds or changes', () => {
	// None runs calls concurrently, so none can run provider calls concurrently. The one exception is the
	// router's wait for a request lifetime's two promises (completed and drained), which reach no provider.
	const files = [
		'threads/session-pool.ts', 'threads/session-routing.ts', 'threads/session-worker.ts', 'threads/router.ts',
		'threads/status-board.ts', 'threads/main-services.ts', 'threads/method-class.ts', 'threads/registry.ts',
		'workflow-run-registry.ts', 'steps/daemon-client.ts',
	];
	for (const file of files) {
		const lines = readFileSync(join(REPO_ROOT, 'src', 'daemon', file), 'utf8').split('\n')
			.filter(line => /Promise\.(all|allSettled|any|race)\s*\(/.test(line) && !/Promise\.all\(\[request\.lifetime\.completed, request\.lifetime\.drained\]\)/.test(line));
		assert.deepEqual(lines, [], `${file} runs nothing concurrently`);
	}
});

test("ac5: a recording provider shows a session's provider calls strictly sequential, over two of its connections at once", { timeout: 60_000 }, async () => {
	const A = { label: 'mcp', pid: 7301 };
	type Recorded = { threadId: number; status: string; calls: { startedAt: number; endedAt: number }[]; maxActive: number };
	// Two runs sent together from two connections of one session: its FIFO must keep their provider calls apart.
	const [one, two] = (await Promise.all([
		once('test.recordedRun', { repo: REPO, runId: 'recorded-1' }, A),
		once('test.recordedRun', { repo: REPO, runId: 'recorded-2' }, A),
	])).map(r => r.result as Recorded);
	for (const r of [one!, two!]) {
		assert.ok(r.threadId > 0, 'run on a session worker');
		assert.equal(r.status, 'done');
		assert.equal(r.calls.length, 2, 'decompose and synthesize');
		assert.equal(r.maxActive, 1, 'never two provider calls at once on the worker');
		assert.ok(r.calls[1]!.startedAt >= r.calls[0]!.endedAt, 'the second started after the first resolved');
	}
	assert.equal(one!.threadId, two!.threadId, 'one worker for the session');
	const [first, second] = one!.calls[0]!.startedAt <= two!.calls[0]!.startedAt ? [one!, two!] : [two!, one!];
	assert.ok(second.calls[0]!.startedAt >= first.calls[1]!.endedAt, 'the later run began only after the earlier one finished');
});

test('ac6: a token of each step kind resumes on a new worker after an idle release', { timeout: 60_000 }, async () => {
	const A = { label: 'mcp', pid: 7401 };
	const minted: Record<string, string> = {};
	let first = 0;
	for (const kind of ['analyze', 'workflow', 'review', 'code-review']) {
		const r = (await once('test.stepState', { op: 'mint', kind, payload: { kind, step: 1 } }, A)).result as { threadId: number; token: string };
		minted[kind] = r.token;
		first = r.threadId;
	}
	await new Promise(r => setTimeout(r, IDLE_MS * 2 + 1_000));
	const second = threadOf(await once('test.servingThread', null, A));
	assert.notEqual(second, first, 'the session is on a new worker after the idle release');
	for (const kind of ['analyze', 'workflow', 'review', 'code-review']) {
		const read = (await once('test.stepState', { op: 'read', kind, token: minted[kind] }, A)).result as { payload: unknown };
		assert.deepEqual(read.payload, { kind, step: 1 }, `${kind}: the token minted on the released worker resumes`);
		const next = ((await once('test.stepState', { op: 'update', kind, token: minted[kind], payload: { kind, step: 2 } }, A)).result as { token: string }).token;
		const old = ((await once('test.stepState', { op: 'read', kind, token: minted[kind] }, A)).result as { payload: unknown }).payload;
		if (kind === 'review') {
			assert.equal(next, minted[kind], 'review keeps its token');
			assert.deepEqual(old, { kind, step: 2 });
		} else {
			assert.notEqual(next, minted[kind], `${kind}: a new token`);
			assert.equal(old, null, `${kind}: the old token no longer resolves`);
			assert.deepEqual(((await once('test.stepState', { op: 'read', kind, token: next }, A)).result as { payload: unknown }).payload, { kind, step: 2 });
		}
	}
});

test('ac7: daemon.status answers within 100 ms at p99 of 200 calls while a session worker spins', { timeout: 120_000 }, async () => {
	const A = { label: 'mcp', pid: 7501 };
	const spinning = once('test.spin', { ms: 15_000 }, A);
	await new Promise(r => setTimeout(r, 500));   // A's worker is spinning its CPU
	const c = await Conn.open(daemon!.sock);
	const latencies: number[] = [];
	try {
		for (let i = 0; i < 200; i++) {
			const t0 = performance.now();
			const r = await c.ask('daemon.status', {});
			latencies.push(performance.now() - t0);
			assert.equal(r.error, undefined);
			const status = r.result as { repos?: unknown; queueDepth?: unknown; uptime?: unknown };
			assert.ok(Array.isArray(status.repos) && typeof status.queueDepth === 'number' && typeof status.uptime === 'number', "each answer reports the daemon's current state");
		}
	} finally { c.close(); }
	const sorted = [...latencies].sort((a, b) => a - b);
	const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1]!;
	const done = await spinning;
	assert.ok(threadOf(done) > 0, 'the spin ran on a session worker');
	assert.ok(sorted.at(-1)! < 15_000, 'every status call returned while the worker was still spinning');
	assert.ok(p99 < 100, `p99 ${p99.toFixed(1)} ms over 200 calls (max ${sorted.at(-1)!.toFixed(1)} ms) while a session worker spun`);
});

test('parity: moved session methods answer over the socket as the single-thread daemon does', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-s3-single-'));
	const single = await spawnDaemon(home, { daemon: { threads: { enabled: false } } });
	try {
		const client = { label: 'mcp', pid: 7601 };
		// Session methods served by a session worker, the shared-state worker or the unattributed worker, each with a fixed input
		// whose answer depends only on an empty store (both daemons start fresh).
		const recorded: [string, unknown][] = [
			['session.list', {}],
			['agent.list', {}],
			['chat.list', {}],
			['todos.listForSession', { sessionId: 'sess-parity' }],
			['workflow.run.poll', { runId: 'no-such-run', cursor: 0 }],
			['workflow.run.abort', { runId: 'no-such-run' }],
			['session.delete', { sessionId: '' }],
			['understanding.history', {}],
		];
		for (const [method, params] of recorded) {
			for (const who of [client, undefined]) {
				const threaded = await once(method, params, who);
				const today = await once(method, params, who, single.sock);
				assert.deepEqual(threaded, today, `${method} ${who === undefined ? '(no identity)' : '(session)'}: the threaded daemon answers as the single-thread one`);
			}
		}
	} finally {
		await stopDaemon(single);
		rmSync(home, { recursive: true, force: true });
	}
});
