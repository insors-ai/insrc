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
const once = async (method: string, params: unknown, client?: { label: string; pid: number }): Promise<{ result?: unknown; error?: string }> => {
	const c = await Conn.open(daemon!.sock);
	try { return await c.ask(method, params, client); } finally { c.close(); }
};
const threadOf = (r: { result?: unknown }): number => (r.result as { threadId: number }).threadId;

before(async () => {
	mkdirSync(join(HOME, '.insrc'), { recursive: true });
	writeFileSync(join(HOME, '.insrc', 'config.json'), JSON.stringify({ daemon: { threads: { enabled: true, sessionIdleMs: IDLE_MS } } }));
	const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
		cwd: REPO_ROOT, env: { ...childEnv(HOME), INSRC_MODE: 'mcp', INSRC_TEST_HOOKS: '1' }, stdio: ['ignore', 'ignore', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
	const exited = new Promise<number | null>(r => child.once('exit', code => r(code)));
	const sock = sockOf(HOME);
	for (const deadline = Date.now() + 60_000; ;) {
		if (existsSync(sock)) {
			try { const c = await Conn.open(sock); const r = await c.ask('daemon.status', {}); c.close(); if (r.error === undefined) break; } catch { /* not ready yet */ }
		}
		if (child.exitCode !== null) throw new Error(`the daemon exited during start: ${stderr.slice(-2000)}`);
		if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`the daemon did not start: ${stderr.slice(-2000)}`); }
		await new Promise(r => setTimeout(r, 200));
	}
	daemon = { pid: child.pid!, sock, stderr: () => stderr, exited };
});
after(async () => {
	if (daemon !== undefined && alive(daemon.pid)) {
		process.kill(daemon.pid, 'SIGTERM');
		const killer = setTimeout(() => { if (alive(daemon!.pid)) process.kill(daemon!.pid, 'SIGKILL'); }, 30_000);
		await daemon.exited;
		clearTimeout(killer);
	}
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

test("ac1: session B is answered on its own thread while session A's worker spins", { timeout: 60_000 }, async () => {
	const A = { label: 'mcp', pid: 7001 };
	const B = { label: 'mcp', pid: 7002 };
	const spinning = once('test.spin', { ms: 4_000 }, A);
	await new Promise(r => setTimeout(r, 500));   // A's worker is now spinning its CPU
	const t0 = Date.now();
	const b = await once('test.servingThread', null, B);
	const elapsed = Date.now() - t0;
	const a = await spinning;
	assert.ok(elapsed < 2_000, `B answered in ${elapsed} ms, while A's worker still spun`);
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

test('ac5: no Promise.all over provider calls in the new modules', () => {
	// The modules s3 adds: none runs calls concurrently, so none can run provider calls concurrently.
	for (const file of ['session-pool.ts', 'session-routing.ts', 'session-worker.ts']) {
		const source = readFileSync(join(REPO_ROOT, 'src', 'daemon', 'threads', file), 'utf8');
		assert.doesNotMatch(source, /Promise\.(all|allSettled|any|race)\s*\(/, `${file} runs nothing concurrently`);
	}
});

test("ac5: a recording provider shows a session method's provider calls strictly sequential", { timeout: 60_000 }, async () => {
	const A = { label: 'mcp', pid: 7301 };
	const r = (await once('test.recordedRun', { repo: REPO, runId: 'recorded-1' }, A)).result as { threadId: number; status: string; calls: { startedAt: number; endedAt: number }[]; maxActive: number };
	assert.ok(r.threadId > 0, 'run on a session worker');
	assert.equal(r.status, 'done');
	assert.equal(r.calls.length, 2, 'decompose and synthesize');
	assert.equal(r.maxActive, 1, 'never two provider calls at once');
	assert.ok(r.calls[1]!.startedAt >= r.calls[0]!.endedAt, 'the second started after the first resolved');
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
