/**
 * A stand-in `gh` and `git` on PATH whose answers come from a function in the test (Story s9, test support).
 *
 * The code under test now reaches gh and git only through the tool registry, which runs the real programs. A test that wants to fake what
 * those programs print installs this: two executables first on PATH that forward every call (program, arguments, working directory) over
 * a local socket to the test process, which answers with the function's return value as stdout, or, when the function throws, with the
 * error's message on stderr and exit code 1 (what a failing gh or git does). The function has the shape the old exec seam had.
 * Call it with no function to take the stand-ins away.
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type ExecFake = (cmd: string, args: readonly string[], opts?: { readonly cwd?: string | undefined }) => Buffer | string | Promise<Buffer | string>;

/** What the older tests called the fake: a program, its arguments and the cwd. */
export type TrackerExec = ExecFake;

const CLIENT = `
const net = require('node:net');
const [, , sock, program, ...args] = process.argv;
const c = net.createConnection(sock);
let buf = '';
c.on('connect', () => c.write(JSON.stringify({ program, args, cwd: process.cwd() }) + '\\n'));
c.on('data', d => { buf += d; });
c.on('end', () => {
  const r = JSON.parse(buf);
  if (r.error !== undefined) { process.stderr.write(String(r.error) + '\\n'); process.exit(1); }
  process.stdout.write(Buffer.from(r.stdout, 'base64'));
});
c.on('error', e => { process.stderr.write('stand-in: ' + e.message + '\\n'); process.exit(127); });
`;

let current: { dir: string; server: Server; savedPath: string | undefined } | undefined;

function remove(): void {
	if (current === undefined) return;
	const { dir, server, savedPath } = current;
	current = undefined;
	if (savedPath === undefined) delete process.env['PATH']; else process.env['PATH'] = savedPath;
	server.close();
	rmSync(dir, { recursive: true, force: true });
}

/** Install the stand-ins answering with `fn`, or, with no argument, remove them. The server is synchronous to start: the socket is listening when this returns. */
export function installExecStandIn(fn?: ExecFake): void {
	remove();
	if (fn === undefined) return;
	const dir = mkdtempSync(join(tmpdir(), 'insrc-exec-standin-'));
	const sock = join(dir, 's.sock');
	writeFileSync(join(dir, 'client.cjs'), CLIENT);
	for (const program of ['gh', 'git']) {
		writeFileSync(join(dir, program), `#!/bin/sh\nexec node '${join(dir, 'client.cjs')}' '${sock}' ${program} "$@"\n`);
		chmodSync(join(dir, program), 0o755);
	}
	const server = createServer(conn => {
		let data = '';
		conn.on('data', d => {
			data += d;
			if (!data.includes('\n')) return;
			const req = JSON.parse(data) as { program: string; args: string[]; cwd: string };
			void (async () => {
				try {
					const out = await fn(req.program, req.args, { cwd: req.cwd });
					conn.end(JSON.stringify({ stdout: Buffer.from(out).toString('base64') }));
				} catch (err) {
					const stderr = (err as { stderr?: unknown }).stderr;   // a failing program prints its diagnostics on stderr, as execFile reports them
					conn.end(JSON.stringify({ error: stderr !== undefined && String(stderr).length > 0 ? String(stderr) : err instanceof Error ? err.message : String(err) }));
				}
			})();
		});
		conn.on('error', () => undefined);
	});
	server.listen(sock);
	server.unref();
	current = { dir, server, savedPath: process.env['PATH'] };
	process.env['PATH'] = `${dir}:${process.env['PATH'] ?? ''}`;
}

/** Put an empty directory first and alone on PATH, so gh and git are not found (a failing spawn: the tool is missing). Remove with {@link installExecStandIn}(). */
export function installNoPrograms(): void {
	remove();
	const dir = mkdtempSync(join(tmpdir(), 'insrc-no-programs-'));
	const server = createServer();
	current = { dir, server, savedPath: process.env['PATH'] };
	process.env['PATH'] = dir;
}
