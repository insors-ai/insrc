/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test helper (Epic 86197ac6 s4): spawn the real daemon entry under a temp HOME with test hooks,
 * talk to it over its socket, and stop it. The same steps as s3-acceptance.test.ts.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, alive, childEnv, sockOf } from '../../../../mcp/__tests__/helpers/mcp-e2e.js';

export interface SpawnedDaemon {
	readonly pid: number;
	readonly sock: string;
	readonly stderr: () => string;
	readonly exited: Promise<number | null>;
}

/** A client connection: requests by id, one reply line each. */
export class Conn {
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

/** One request on a connection of its own. */
export async function once(sock: string, method: string, params: unknown, client?: { label: string; pid: number }): Promise<{ result?: unknown; error?: string }> {
	const c = await Conn.open(sock);
	try { return await c.ask(method, params, client); } finally { c.close(); }
}

/** Spawn the daemon entry under `home` with `config`; resolves once it answers daemon.status. */
export async function spawnDaemon(home: string, config: unknown, env: Record<string, string> = {}): Promise<SpawnedDaemon> {
	mkdirSync(join(home, '.insrc'), { recursive: true });
	writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify(config));
	const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
		cwd: REPO_ROOT, env: { ...childEnv(home), INSRC_MODE: 'mcp', INSRC_TEST_HOOKS: '1', ...env }, stdio: ['ignore', 'ignore', 'pipe'],
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

/** SIGTERM, then SIGKILL after 30 s; resolves with the exit code once it exited. */
export async function stopDaemon(d: SpawnedDaemon): Promise<number | null> {
	if (!alive(d.pid)) return await d.exited;
	process.kill(d.pid, 'SIGTERM');
	const killer = setTimeout(() => { if (alive(d.pid)) process.kill(d.pid, 'SIGKILL'); }, 30_000);
	const code = await d.exited;
	clearTimeout(killer);
	return code;
}

/** Wait until `cond` holds, polling; fails with `what` after `ms`. */
export async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
	for (const deadline = Date.now() + ms; !(await cond());) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
		await new Promise(r => setTimeout(r, 50));
	}
}
