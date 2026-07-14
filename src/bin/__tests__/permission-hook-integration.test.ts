/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc-permission-hook` end-to-end integration test.
 *
 * Each test:
 *   1. Stands up a fake daemon socket (a node:net server that
 *      replies with scripted IpcStreamMessages).
 *   2. Spawns the hook binary via `tsx` with INSRC_DAEMON_SOCKET +
 *      INSRC_SPEC_ID + INSRC_SESSION_ID set to point at the fake.
 *   3. Pipes a tool_use payload to the hook's stdin.
 *   4. Asserts the hook's stdout JSON matches the expected verdict
 *      and the request the fake daemon received matches what the
 *      hook sent on its end of the wire.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_TS   = resolve(__dirname, '..', 'permission-hook.ts');
const TSX_BIN   = resolve(__dirname, '..', '..', 'node_modules', '.bin', 'tsx');

interface DaemonRequest {
	readonly id:     number;
	readonly method: string;
	readonly params: unknown;
	readonly stream: boolean;
}

interface FakeDaemonOpts {
	readonly socketPath: string;
	/**
	 * Scripted reply: receive the parsed request, return an ordered
	 * list of IpcStreamMessage objects to write back. The server
	 * always appends a `done` after these UNLESS the script already
	 * includes one.
	 */
	readonly reply: (req: DaemonRequest) => readonly { stream: string; data: unknown }[];
}

interface FakeDaemonHandle {
	readonly server:   Server;
	readonly received: DaemonRequest[];
	close: () => Promise<void>;
}

function startFakeDaemon(opts: FakeDaemonOpts): Promise<FakeDaemonHandle> {
	const received: DaemonRequest[] = [];
	const server = createServer((socket: Socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (line.trim().length === 0) continue;
				const req = JSON.parse(line) as DaemonRequest;
				received.push(req);
				const messages = opts.reply(req);
				for (const m of messages) {
					socket.write(JSON.stringify({ id: req.id, ...m }) + '\n');
				}
				// If the script didn't already include a done/error, end the stream cleanly.
				const last = messages[messages.length - 1];
				if (last === undefined || (last.stream !== 'done' && last.stream !== 'error')) {
					socket.write(JSON.stringify({ id: req.id, stream: 'done', data: {} }) + '\n');
				}
			}
		});
	});
	return new Promise((resolveStart, reject) => {
		server.on('error', reject);
		server.listen(opts.socketPath, () => {
			resolveStart({
				server, received,
				close: () => new Promise(resCl => { server.close(() => resCl()); }),
			});
		});
	});
}

interface SpawnHookResult {
	readonly stdout:   string;
	readonly stderr:   string;
	readonly exitCode: number;
}

function spawnHook(args: {
	socketPath: string;
	specId:     string;
	sessionId:  string;
	stdin:      string;
}): Promise<SpawnHookResult> {
	return new Promise((resolveSp) => {
		const child = spawn(TSX_BIN, [HOOK_TS], {
			env: {
				...process.env,
				INSRC_DAEMON_SOCKET: args.socketPath,
				INSRC_SPEC_ID:       args.specId,
				INSRC_SESSION_ID:    args.sessionId,
			},
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
		child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
		child.on('close', (exitCode: number | null) => {
			resolveSp({ stdout, stderr, exitCode: exitCode ?? -1 });
		});
		child.stdin.end(args.stdin);
	});
}

function mkSock(): string {
	// Unix socket paths have a length limit (~104 bytes); the tmpdir
	// path on macOS is already long, so use the shortest possible
	// filename inside it.
	const dir = mkdtempSync(join(tmpdir(), 'phk-'));
	return join(dir, 's');
}

function cleanupSock(sockPath: string): void {
	rmSync(dirname(sockPath), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Allow path
// ---------------------------------------------------------------------------

test("hook: allow verdict -> stdout {continue:true}; daemon received the gate.request-permission with parsed params", async () => {
	const sock = mkSock();
	const daemon = await startFakeDaemon({
		socketPath: sock,
		reply: () => [{ stream: 'progress', data: { verdict: 'allow' } }],
	});
	try {
		const result = await spawnHook({
			socketPath: sock,
			specId:     'spec-1',
			sessionId:  'sess-1',
			stdin:      JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts' } }),
		});
		assert.equal(result.exitCode, 0);
		const decision = JSON.parse(result.stdout) as { continue: boolean };
		assert.equal(decision.continue, true);

		// And the daemon saw exactly one request with the right method + params.
		assert.equal(daemon.received.length, 1);
		const req = daemon.received[0]!;
		assert.equal(req.method, 'gate.request-permission');
		assert.equal(req.stream, true);
		const p = req.params as { specId: string; tool: string; input: { file_path: string }; sessionId: string };
		assert.equal(p.specId,    'spec-1');
		assert.equal(p.sessionId, 'sess-1');
		assert.equal(p.tool,      'Edit');
		assert.equal(p.input.file_path, 'src/foo.ts');
	} finally {
		await daemon.close();
		cleanupSock(sock);
	}
});

// ---------------------------------------------------------------------------
// Deny path (with stopReason propagation)
// ---------------------------------------------------------------------------

test("hook: deny verdict carries the daemon's stopReason into the hook output", async () => {
	const sock = mkSock();
	const daemon = await startFakeDaemon({
		socketPath: sock,
		reply: () => [{ stream: 'progress', data: { verdict: 'deny', stopReason: 'sudo banned by policy' } }],
	});
	try {
		const result = await spawnHook({
			socketPath: sock,
			specId:     'spec-1',
			sessionId:  'sess-1',
			stdin:      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'sudo whoami' } }),
		});
		const decision = JSON.parse(result.stdout) as { continue: boolean; stopReason: string };
		assert.equal(decision.continue, false);
		assert.equal(decision.stopReason, 'sudo banned by policy');
	} finally {
		await daemon.close();
		cleanupSock(sock);
	}
});

// ---------------------------------------------------------------------------
// Prompt path (daemon emits 'gate' then resolves to allow)
// ---------------------------------------------------------------------------

test('hook: prompt path -- daemon emits a "gate" message then progresses to allow; hook silently waits then emits {continue:true}', async () => {
	const sock = mkSock();
	const daemon = await startFakeDaemon({
		socketPath: sock,
		reply: () => [
			{ stream: 'gate',     data: { gateId: 'g-1', tool: 'Bash', sessionId: 'sess-1', specId: 'spec-1' } },
			{ stream: 'progress', data: { verdict: 'allow' } },
		],
	});
	try {
		const result = await spawnHook({
			socketPath: sock,
			specId:     'spec-1',
			sessionId:  'sess-1',
			stdin:      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } }),
		});
		assert.equal(JSON.parse(result.stdout).continue, true);
	} finally {
		await daemon.close();
		cleanupSock(sock);
	}
});

// ---------------------------------------------------------------------------
// Daemon error: hook surfaces it as deny with reason; never crashes
// ---------------------------------------------------------------------------

test('hook: daemon emits stream:error -> hook outputs {continue:false, stopReason} including the error', async () => {
	const sock = mkSock();
	const daemon = await startFakeDaemon({
		socketPath: sock,
		reply: () => [{ stream: 'error', data: { error: 'something bad happened' } }],
	});
	try {
		const result = await spawnHook({
			socketPath: sock,
			specId:     'spec-1',
			sessionId:  'sess-1',
			stdin:      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'true' } }),
		});
		const decision = JSON.parse(result.stdout) as { continue: boolean; stopReason: string };
		assert.equal(decision.continue, false);
		assert.match(decision.stopReason, /something bad happened/);
	} finally {
		await daemon.close();
		cleanupSock(sock);
	}
});

// ---------------------------------------------------------------------------
// Missing env vars
// ---------------------------------------------------------------------------

test('hook: missing INSRC_DAEMON_SOCKET -> deny with self-identifying stopReason', async () => {
	const child = spawn(TSX_BIN, [HOOK_TS], {
		env: { ...process.env, INSRC_DAEMON_SOCKET: '', INSRC_SPEC_ID: 's', INSRC_SESSION_ID: 'x' },
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	let stdout = '';
	child.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
	await new Promise(res => child.on('close', res));
	child.stdin.end('{"tool_name":"Bash","tool_input":{"command":"x"}}');
	const decision = JSON.parse(stdout) as { continue: boolean; stopReason: string };
	assert.equal(decision.continue, false);
	assert.match(decision.stopReason, /INSRC_DAEMON_SOCKET/);
});

// ---------------------------------------------------------------------------
// Bad stdin
// ---------------------------------------------------------------------------

test('hook: invalid stdin JSON -> deny with stopReason mentioning the parse problem', async () => {
	const sock = mkSock();
	const daemon = await startFakeDaemon({
		socketPath: sock,
		reply: () => [],
	});
	try {
		const result = await spawnHook({
			socketPath: sock,
			specId:     'spec-1',
			sessionId:  'sess-1',
			stdin:      'not-json-at-all{',
		});
		const decision = JSON.parse(result.stdout) as { continue: boolean; stopReason: string };
		assert.equal(decision.continue, false);
		assert.match(decision.stopReason, /not JSON|Unexpected/);
	} finally {
		await daemon.close();
		cleanupSock(sock);
	}
});

// ---------------------------------------------------------------------------
// stdin missing tool_name
// ---------------------------------------------------------------------------

test('hook: stdin lacks tool_name -> deny with "missing tool_name"', async () => {
	const sock = mkSock();
	const daemon = await startFakeDaemon({
		socketPath: sock,
		reply: () => [],
	});
	try {
		const result = await spawnHook({
			socketPath: sock,
			specId:     'spec-1',
			sessionId:  'sess-1',
			stdin:      JSON.stringify({ tool_input: { command: 'x' } }),
		});
		const decision = JSON.parse(result.stdout) as { continue: boolean; stopReason: string };
		assert.equal(decision.continue, false);
		assert.match(decision.stopReason, /missing tool_name/);
	} finally {
		await daemon.close();
		cleanupSock(sock);
	}
});

// ---------------------------------------------------------------------------
// Daemon unreachable
// ---------------------------------------------------------------------------

test('hook: socket path does not exist -> deny with stopReason mentioning the socket failure', async () => {
	const result = await spawnHook({
		socketPath: '/tmp/insrc-no-such-socket-' + Date.now(),
		specId:     'spec-1',
		sessionId:  'sess-1',
		stdin:      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'true' } }),
	});
	const decision = JSON.parse(result.stdout) as { continue: boolean; stopReason: string };
	assert.equal(decision.continue, false);
	assert.match(decision.stopReason, /daemon contact failed|ENOENT|socket error/);
});
