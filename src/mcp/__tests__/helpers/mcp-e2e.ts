/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real processes for the MCP end-to-end tests (Epic c2ba6fa6, Story s11, t12):
 * the real daemon (src/daemon/index.ts) and the real MCP server
 * (src/bin/insrc-mcp.ts, over stdio), each with HOME in a temporary directory,
 * so the daemon's socket, stores and logs are all inside it and the user's
 * live daemon is never touched.
 */

import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const TSX_ESM = fileURLToPath(import.meta.resolve('tsx/esm'));

/** The environment of a child: HOME in `home`, no INSRC_REPO, and nothing of the test runner's. */
export function childEnv(home: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v === undefined || k === 'NODE_TEST_CONTEXT' || k.startsWith('NODE_TEST')) continue;
		env[k] = v;
	}
	env['HOME'] = home;
	env['INSRC_REPO'] = '';
	return env;
}

export function sockOf(home: string): string {
	return join(home, '.insrc', 'daemon.sock');
}

/** One unary request to a daemon socket. */
export function rpc(sock: string, method: string, params: unknown = {}): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const s = createConnection(sock);
		let buf = '';
		s.on('connect', () => s.write(JSON.stringify({ id: 1, method, params }) + '\n'));
		s.on('data', (d: Buffer) => {
			buf += d.toString();
			const nl = buf.indexOf('\n');
			if (nl < 0) return;
			s.end();
			const res = JSON.parse(buf.slice(0, nl)) as { result?: unknown; error?: string };
			if (res.error !== undefined) reject(new Error(res.error)); else resolve(res.result);
		});
		s.on('error', reject);
	});
}

export interface RunningDaemon {
	readonly pid:  number;
	readonly sock: string;
	stop(): Promise<void>;
}

/** Start the real daemon with HOME in `home`; resolves once its socket answers. */
export async function startDaemon(home: string): Promise<RunningDaemon> {
	const child: ChildProcess = spawn(process.execPath, ['--import', TSX_ESM, join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
		cwd: REPO_ROOT, env: childEnv(home), stdio: ['ignore', 'ignore', 'pipe'],
	});
	let stderr = '';
	child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
	const exited = new Promise<void>(r => child.once('exit', () => r()));
	const sock = sockOf(home);
	const deadline = Date.now() + 60_000;
	for (;;) {
		if (existsSync(sock)) {
			try { await rpc(sock, 'daemon.status'); break; } catch { /* not ready yet */ }
		}
		if (child.exitCode !== null) throw new Error(`the daemon exited during start (${child.exitCode}): ${stderr.slice(-2000)}`);
		if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`the daemon did not start: ${stderr.slice(-2000)}`); }
		await new Promise(r => setTimeout(r, 200));
	}
	return {
		pid: child.pid!,
		sock,
		stop: async () => {
			if (child.exitCode !== null) return;
			try { await rpc(sock, 'daemon.shutdown'); } catch { /* already going */ }
			const killer = setTimeout(() => child.kill('SIGKILL'), 15_000);
			await exited;
			clearTimeout(killer);
		},
	};
}

export interface RunningMcp {
	readonly client: Client;
	readonly pid:    number;
	close(): Promise<void>;
}

/** Start the real MCP server (src/bin/insrc-mcp.ts) over stdio with HOME in `home`, in `cwd`. */
export async function startMcp(home: string, cwd: string, clientName = 'claude-code'): Promise<RunningMcp> {
	const transport = new StdioClientTransport({
		command: process.execPath,
		args:    ['--import', TSX_ESM, join(REPO_ROOT, 'src', 'bin', 'insrc-mcp.ts')],
		env:     childEnv(home),
		cwd,
		stderr:  'ignore',
	});
	const client = new Client({ name: clientName, version: '0' });
	await client.connect(transport);
	const pid = transport.pid;
	if (pid === null) throw new Error('the MCP server process has no pid');
	return {
		client,
		pid,
		close: async () => { await client.close(); },
	};
}

/** The paths a process holds open (lsof), or [] when it holds none it can list. */
export function openPaths(pid: number): string[] {
	let out = '';
	try {
		out = execFileSync('lsof', ['-n', '-P', '-p', String(pid), '-Fn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
	} catch (e) {
		out = (e as { stdout?: string }).stdout ?? '';
	}
	return out.split('\n').filter(l => l.startsWith('n')).map(l => l.slice(1));
}

/** The store paths among `paths`: the graph store, its lock file, or anything under the vector store. */
export function storePaths(paths: readonly string[]): string[] {
	return paths.filter(p => /graph\.lmdb(-lock)?$/.test(p) || /\/\.insrc\/lance(\/|$)/.test(p));
}

/** True while `pid` is a live process. */
export function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

/** The JSON body of a tool result's first text block. */
export function body(result: { content?: unknown }): Record<string, unknown> {
	const content = result.content as { type: string; text: string }[];
	return JSON.parse(content[0]!.text) as Record<string, unknown>;
}
