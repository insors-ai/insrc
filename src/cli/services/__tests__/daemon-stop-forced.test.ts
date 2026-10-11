/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Forced stop integration tests (Epic c2ba6fa6, Story s4, t1). The REAL
 * stopDaemon against a real child process that stands in for a daemon that
 * will not stop: it writes the pid file, listens on the socket, ignores
 * SIGTERM, and never exits. Its file is named `daemon/index.js` because the
 * stop recognises a daemon by the tail of its command line.
 *
 * The home directory is pointed at a temporary one BEFORE the service is
 * imported, so PATHS (pid file, socket) are never the user's real ones.
 *
 * Run: npx tsx --test src/cli/services/__tests__/daemon-stop-forced.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A short root: a Unix socket path is limited to ~104 bytes on macOS.
const HOME = mkdtempSync('/tmp/insrc-stop-');
process.env['HOME'] = HOME;
mkdirSync(join(HOME, '.insrc'), { recursive: true });

const { stopDaemon } = await import('../daemon.js');
const { PATHS } = await import('../../../shared/paths.js');

const children: ChildProcess[] = [];
after(() => {
	for (const c of children) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
	rmSync(HOME, { recursive: true, force: true });
});

/** A stand-in daemon. `reply` — whether it answers the shutdown request. */
function stubbornDaemonSource(reply: boolean): string {
	return `
const net = require('node:net');
const fs = require('node:fs');
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
const server = net.createServer(sock => {
	sock.on('error', () => {});
	sock.on('data', chunk => {
		if (!${String(reply)}) return;              // accepts, never replies
		const req = JSON.parse(String(chunk).split('\\n')[0]);
		sock.write(JSON.stringify({ id: req.id, result: { ok: true } }) + '\\n');   // replies, never stops
	});
});
server.listen(${JSON.stringify(PATHS.sockFile)}, () => {
	fs.writeFileSync(${JSON.stringify(PATHS.pidFile)}, String(process.pid));
	process.stdout.write('ready\\n');
});
// Never outlive the test: a stand-in whose parent is gone ends itself.
const parent = process.ppid;
setInterval(() => { if (process.ppid !== parent) process.exit(0); }, 250);
`;
}

async function startStubborn(reply: boolean): Promise<ChildProcess> {
	const dir = join(mkdtempSync(join(HOME, 'stub-')), 'daemon');
	mkdirSync(dir, { recursive: true });
	const entry = join(dir, 'index.js');
	writeFileSync(entry, stubbornDaemonSource(reply));
	const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'inherit'] });
	children.push(child);
	await new Promise<void>((resolve, reject) => {
		child.stdout?.once('data', () => resolve());
		child.once('exit', code => reject(new Error(`stand-in daemon exited early (${code})`)));
	});
	return child;
}

function exited(child: ChildProcess): Promise<NodeJS.Signals | null> {
	return new Promise(resolve => {
		if (child.exitCode !== null || child.signalCode !== null) resolve(child.signalCode);
		else child.once('exit', (_code, signal) => resolve(signal));
	});
}

test('forced stop: a child that ignores the request and SIGTERM is ended by stopDaemon', async () => {
	const child = await startStubborn(true);
	assert.ok(existsSync(PATHS.pidFile) && existsSync(PATHS.sockFile));
	child.kill('SIGTERM');   // ignored: the stand-in is still there for the stop

	const started = Date.now();
	const outcome = await stopDaemon({ stopWaitMs: 1_500 });

	assert.deepEqual(outcome, { stopped: true, forced: true, pid: child.pid });
	assert.ok(Date.now() - started >= 1_500, 'killed only after the wait');
	assert.equal(await exited(child), 'SIGKILL');
	assert.equal(existsSync(PATHS.pidFile), false, 'pid file removed');
	assert.equal(existsSync(PATHS.sockFile), false, 'socket removed');
});

test('forced stop, silent daemon: a child that accepts the connection and never replies is ended', async () => {
	const child = await startStubborn(false);

	const started = Date.now();
	const outcome = await stopDaemon({ stopWaitMs: 1_000 });   // the 5-second reply bound is the real one
	const took = Date.now() - started;

	assert.deepEqual(outcome, { stopped: true, forced: true, pid: child.pid });
	assert.ok(took >= 6_000, `ended only after the 5-second bound and the wait (took ${took} ms)`);
	assert.ok(took < 12_000, `the request did not hang (took ${took} ms)`);
	assert.equal(await exited(child), 'SIGKILL');
	assert.equal(existsSync(PATHS.pidFile), false);
	assert.equal(existsSync(PATHS.sockFile), false);
});
