/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The real daemon entry with daemon.threads.enabled (Epic 86197ac6, Story s2):
 * it starts its admin and code-indexing workers, answers admin, indexing and
 * session methods, and shuts down when asked.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/threads-boot.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, alive, childEnv, rpc, sockOf, startDaemon } from '../../../mcp/__tests__/helpers/mcp-e2e.js';

test('the daemon boots with daemon.threads.enabled, answers admin, indexing and session methods through its threads, and shuts down', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-threads-boot-'));
	try {
		mkdirSync(join(home, '.insrc'), { recursive: true });
		writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({ daemon: { threads: { enabled: true } } }));
		const daemon = await startDaemon(home);
		try {
			const status = await rpc(daemon.sock, 'daemon.status') as { repos: unknown[]; queueDepth: number; queueLanes?: unknown };
			assert.ok(Array.isArray(status.repos));
			assert.equal(typeof status.queueDepth, 'number');
			assert.ok(status.queueLanes !== undefined, 'the lanes come from the board');
			assert.deepEqual(await rpc(daemon.sock, 'repo.list'), []);
			assert.ok(Array.isArray(await rpc(daemon.sock, 'repo.stats', {})), 'an indexing method answered by the code-indexing worker');
			assert.ok(typeof await rpc(daemon.sock, 'config.show') === 'object');
			assert.ok((await rpc(daemon.sock, 'session.list', {}) as unknown[]).length >= 0, 'a session method answered on the main thread');
		} finally {
			await daemon.stop();
		}
		assert.equal(alive(daemon.pid), false, 'the daemon exited after daemon.shutdown');
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

/**
 * Start the daemon as startDaemon does, with its log on stderr as well
 * (INSRC_MODE=mcp): the daemon's own log files are shared by every daemon on
 * the machine and rotate, so a test reads its daemon's lines from stderr.
 */
async function startLoggingDaemon(home: string, env: Record<string, string> = {}): Promise<{ readonly pid: number; readonly sock: string; readonly stderr: () => string; readonly exited: Promise<number | null> }> {
	const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
		cwd: REPO_ROOT, env: { ...childEnv(home), INSRC_MODE: 'mcp', ...env }, stdio: ['ignore', 'ignore', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
	const exited = new Promise<number | null>(r => child.once('exit', code => r(code)));
	const sock = sockOf(home);
	const deadline = Date.now() + 60_000;
	for (;;) {
		if (existsSync(sock)) {
			try { await rpc(sock, 'daemon.status'); break; } catch { /* not ready yet */ }
		}
		if (child.exitCode !== null) throw new Error(`the daemon exited during start: ${stderr.slice(-2000)}`);
		if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`the daemon did not start: ${stderr.slice(-2000)}`); }
		await new Promise(r => setTimeout(r, 200));
	}
	return { pid: child.pid!, sock, stderr: () => stderr, exited };
}

test("SIGTERM during an indexing pass: workers stop, the queue drains, the main thread closes the stores after the workers exit, 'bye' is logged", { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-threads-sigterm-'));
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-threads-sigterm-repo-')));
	try {
		mkdirSync(join(home, '.insrc'), { recursive: true });
		writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({ daemon: { threads: { enabled: true } } }));
		mkdirSync(join(repo, 'src'), { recursive: true });
		for (let i = 0; i < 80; i++) {
			writeFileSync(join(repo, 'src', `m${i}.ts`), `export function f${i}(x: number): number { return x + ${i}; }\nexport class C${i} { m(): number { return f${i}(1); } }\n`);
		}
		const daemon = await startLoggingDaemon(home);
		try {
			assert.equal((await rpc(daemon.sock, 'repo.add', { path: repo }) as { error?: string }).error, undefined);
			// SIGTERM once the indexing pass is under way.
			const deadline = Date.now() + 30_000;
			for (;;) {
				const s = await rpc(daemon.sock, 'daemon.status') as { queueLanes?: { index: { running: boolean; depth: number } } };
				if (s.queueLanes !== undefined && (s.queueLanes.index.running || s.queueLanes.index.depth > 0)) break;
				if (Date.now() > deadline) assert.fail('the indexing pass did not start');
				await new Promise(r => setTimeout(r, 10));
			}
			process.kill(daemon.pid, 'SIGTERM');
			const killer = setTimeout(() => { if (alive(daemon.pid)) process.kill(daemon.pid, 'SIGKILL'); }, 30_000);
			try { assert.equal(await daemon.exited, 0, 'the daemon exited cleanly after SIGTERM'); }
			finally { clearTimeout(killer); }
		} finally {
			if (alive(daemon.pid)) process.kill(daemon.pid, 'SIGKILL');
		}
		const messages = daemon.stderr().split('\n');
		const at = (msg: string): number => messages.findIndex(m => m.includes(msg));
		const order = [
			'shutdown signal received; draining...',
			'shutdown: the code-indexing worker drained its queue',
			"shutdown: the daemon's workers exited",
			'shutdown: stores closed',
			'bye',
		].map(m => [m, at(m)] as const);
		for (const [m, i] of order) assert.ok(i >= 0, `logged: ${m} (the daemon's last lines: ${JSON.stringify(messages.slice(-30))})`);
		assert.deepEqual(order.map(([, i]) => i), [...order.map(([, i]) => i)].sort((a, b) => a - b), 'in this order');
		assert.equal(at('shutdown: hard-exit backstop fired'), -1, 'the drain finished before the backstop');
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(repo, { recursive: true, force: true });
	}
});

test('daemon.shutdown during maintenance is refused with the activity and reason; SIGTERM during maintenance waits for the compaction and then shuts down', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-threads-maintenance-'));
	try {
		mkdirSync(join(home, '.insrc'), { recursive: true });
		// Idle maintenance at once, whatever the reclaimable space; it holds its lock 4 s before compacting (test hook).
		writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({ daemon: {
			threads: { enabled: true },
			maintenance: { idleMs: 500, minReclaimablePct: 0, minReclaimableMb: 0, pauseLimitMs: 60_000 },
		} }));
		const daemon = await startLoggingDaemon(home, { INSRC_TEST_HOOKS: '1', INSRC_TEST_MAINTENANCE_HOLD_MS: '4000' });
		try {
			const deadline = Date.now() + 30_000;
			let maintenance: { state?: string; activity?: string; reason?: string } | undefined;
			while ((maintenance = (await rpc(daemon.sock, 'daemon.status') as { maintenance?: typeof maintenance }).maintenance)?.state !== 'compacting') {
				if (Date.now() > deadline) assert.fail('maintenance did not start');
				await new Promise(r => setTimeout(r, 50));
			}
			assert.equal(maintenance.activity, 'compaction');
			await assert.rejects(rpc(daemon.sock, 'daemon.shutdown'), /^Error: daemon busy: compaction since \S+ \(0 min idle, [0-9.]+% \/ [0-9]+ MB reclaimable\); retry later$/);
			assert.equal(alive(daemon.pid), true, 'still running: the shutdown request was refused');
			process.kill(daemon.pid, 'SIGTERM');
			const killer = setTimeout(() => { if (alive(daemon.pid)) process.kill(daemon.pid, 'SIGKILL'); }, 30_000);
			try { assert.equal(await daemon.exited, 0, 'a clean exit after the compaction'); }
			finally { clearTimeout(killer); }
		} finally {
			if (alive(daemon.pid)) process.kill(daemon.pid, 'SIGKILL');
		}
		const messages = daemon.stderr().split('\n');
		const at = (msg: string): number => messages.findIndex(m => m.includes(msg));
		const order = ['shutdown signal received; draining...', 'maintenance: compaction done', 'shutdown: stores closed', 'bye'].map(m => [m, at(m)] as const);
		for (const [m, i] of order) assert.ok(i >= 0, `logged: ${m} (the daemon's last lines: ${JSON.stringify(messages.slice(-30))})`);
		assert.deepEqual(order.map(([, i]) => i), [...order.map(([, i]) => i)].sort((a, b) => a - b), 'the compaction finished before the stores closed');
		assert.equal(at('hard-exit backstop fired'), -1);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

/** One request as a client with an identity sends it; resolves with its reply line. */
async function rpcAs(sock: string, method: string, params: unknown, client: { label: string; pid: number }): Promise<{ result?: unknown; error?: string }> {
	const { connect } = await import('node:net');
	return new Promise((resolve, reject) => {
		const socket = connect(sock);
		let buf = '';
		socket.on('connect', () => socket.write(JSON.stringify({ id: 1, method, params, client }) + '\n'));
		socket.on('data', d => {
			buf += d.toString();
			const end = buf.indexOf('\n');
			if (end >= 0) { socket.destroy(); resolve(JSON.parse(buf.slice(0, end)) as { result?: unknown; error?: string }); }
		});
		socket.on('error', reject);
	});
}

test('boot: threads enabled serves a session method from a session worker over the socket, and SIGTERM drains and exits 0', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-threads-session-boot-'));
	try {
		mkdirSync(join(home, '.insrc'), { recursive: true });
		writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({ daemon: { threads: { enabled: true } } }));
		const daemon = await startLoggingDaemon(home, { INSRC_TEST_HOOKS: '1' });
		try {
			const client = { label: 'mcp', pid: process.pid };
			const where = await rpcAs(daemon.sock, 'test.servingThread', null, client);
			assert.equal(where.error, undefined, JSON.stringify(where));
			const workerThread = (where.result as { threadId: number }).threadId;
			assert.ok(workerThread > 0, `served on a worker thread, not the main thread (got ${workerThread})`);
			assert.deepEqual(await rpcAs(daemon.sock, 'test.servingThread', null, client), where, "the session's next request runs on the same worker");
			const other = await rpcAs(daemon.sock, 'test.servingThread', null, { label: 'mcp', pid: process.pid + 1 });
			assert.notEqual((other.result as { threadId: number }).threadId, workerThread, 'another session gets its own worker');
			const listed = await rpcAs(daemon.sock, 'session.list', {}, client);
			assert.equal(listed.error, undefined, 'a session method answered by the session worker');
			assert.deepEqual((await rpcAs(daemon.sock, 'chat.list', {}, client)).result, { sessions: [] }, 'chat.list answered by the shared-state worker');
			process.kill(daemon.pid, 'SIGTERM');
			assert.equal(await daemon.exited, 0, `the daemon exited cleanly after SIGTERM:\n${daemon.stderr().slice(-2000)}`);
		} finally {
			if (alive(daemon.pid)) process.kill(daemon.pid, 'SIGKILL');
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test('boot: threads disabled runs every session method on the main thread as today', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-threads-off-boot-'));
	try {
		mkdirSync(join(home, '.insrc'), { recursive: true });
		writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({ daemon: { threads: { enabled: false } } }));
		const daemon = await startLoggingDaemon(home, { INSRC_TEST_HOOKS: '1' });
		try {
			const client = { label: 'mcp', pid: process.pid };
			// The worker-only test hook is unknown: nothing was sent to a worker.
			assert.equal((await rpcAs(daemon.sock, 'test.servingThread', null, client)).error, 'unknown method: test.servingThread');
			assert.equal((await rpcAs(daemon.sock, 'session.list', {}, client)).error, undefined, 'session methods answered on the main thread');
			assert.deepEqual((await rpcAs(daemon.sock, 'chat.list', {}, client)).result, { sessions: [] }, 'the chat pool lives on the main thread');
			assert.doesNotMatch(daemon.stderr(), /daemon threads enabled|session pool/, 'no threads and no session pool were started');
			process.kill(daemon.pid, 'SIGTERM');
			assert.equal(await daemon.exited, 0, `the daemon exited cleanly after SIGTERM:\n${daemon.stderr().slice(-2000)}`);
		} finally {
			if (alive(daemon.pid)) process.kill(daemon.pid, 'SIGKILL');
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
