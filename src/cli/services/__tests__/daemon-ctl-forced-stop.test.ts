/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Control script forced stop (Epic c2ba6fa6, Story s4, t2). Runs the REAL
 * scripts/daemon-ctl.sh against real stand-in processes in a temporary home:
 * the script reads its pid file and socket from $HOME, so the user's daemon is
 * never touched. A stand-in is recognised as a daemon by the tail of its
 * command line, hence the file name `daemon/index.js`.
 *
 * Run: npx tsx --test src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO   = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCRIPT = join(REPO, 'scripts/daemon-ctl.sh');

const children: ChildProcess[] = [];
const strayPids: number[] = [];
const homes: string[] = [];
after(() => {
	for (const c of children) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
	for (const pid of strayPids) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
	for (const h of homes) rmSync(h, { recursive: true, force: true });
});

interface Home { home: string; pidFile: string; sockFile: string; }

/** A short root: a Unix socket path is limited to ~104 bytes on macOS. */
function tempHome(): Home {
	const home = mkdtempSync('/tmp/insrc-ctl-');
	homes.push(home);
	mkdirSync(join(home, '.insrc'), { recursive: true });
	return { home, pidFile: join(home, '.insrc/daemon.pid'), sockFile: join(home, '.insrc/daemon.sock') };
}

/** A stand-in daemon: writes the pid file and listens on the socket.
 *  `stubborn` — ignores SIGTERM and never exits; otherwise drains like a
 *  healthy daemon (removes its pid file and socket, then exits). */
function standInSource(h: Home, stubborn: boolean): string {
	return `
const net = require('node:net');
const fs = require('node:fs');
const server = net.createServer(sock => { sock.on('error', () => {}); });
process.on('SIGTERM', () => {
	if (${String(stubborn)}) return;
	try { fs.rmSync(${JSON.stringify(h.pidFile)}, { force: true }); } catch {}
	server.close();
	try { fs.rmSync(${JSON.stringify(h.sockFile)}, { force: true }); } catch {}
	process.exit(0);
});
server.listen(${JSON.stringify(h.sockFile)}, () => {
	fs.writeFileSync(${JSON.stringify(h.pidFile)}, String(process.pid));
	process.stdout.write('ready\\n');
});
// Never outlive the test run.
setTimeout(() => process.exit(0), 90_000);
`;
}

function writeEntry(dir: string, name: string, source: string): string {
	mkdirSync(dir, { recursive: true });
	const entry = join(dir, name);
	writeFileSync(entry, source);
	return entry;
}

async function startStandIn(entry: string): Promise<ChildProcess> {
	const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'inherit'] });
	children.push(child);
	await new Promise<void>((res, rej) => {
		child.stdout?.once('data', () => res());
		child.once('exit', code => rej(new Error(`stand-in exited early (${code})`)));
	});
	return child;
}

function exited(child: ChildProcess): Promise<NodeJS.Signals | null> {
	return new Promise(res => {
		if (child.exitCode !== null || child.signalCode !== null) res(child.signalCode);
		else child.once('exit', (_code, signal) => res(signal));
	});
}

function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

function ctl(h: Home, args: string[], env: Record<string, string> = {}): { status: number | null; out: string } {
	const r = spawnSync('bash', [SCRIPT, ...args], {
		encoding: 'utf8',
		env: { ...process.env, HOME: h.home, INSRC_CTL_LOG_DIR: join(h.home, 'ctl-logs'), INSRC_CTL_STOP_WAIT_SECS: '2', ...env },
		timeout: 60_000,
	});
	return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('control script stop against a stubborn child', async () => {
	const h = tempHome();
	const child = await startStandIn(writeEntry(join(h.home, 'stub/daemon'), 'index.js', standInSource(h, true)));

	const r = ctl(h, ['stop']);

	assert.equal(r.status, 0, r.out);
	assert.match(r.out, new RegExp(`daemon did not stop within 2 s; killed \\(pid ${child.pid}\\)`));
	assert.equal(await exited(child), 'SIGKILL');
	assert.equal(existsSync(h.pidFile), false, 'pid file removed');
	assert.equal(existsSync(h.sockFile), false, 'socket removed');
});

test('control script start against a stubborn running child', async () => {
	const h = tempHome();
	const stale = await startStandIn(writeEntry(join(h.home, 'stub/daemon'), 'index.js', standInSource(h, true)));

	// A minimal installed-daemon tree whose entry is a healthy stand-in.
	const root = join(h.home, 'root');
	mkdirSync(join(root, '.git'), { recursive: true });
	mkdirSync(join(root, 'src'), { recursive: true });
	writeFileSync(join(root, 'package.json'), '{}');
	symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'));   // `--import tsx/esm` resolves here
	writeEntry(join(root, 'out/daemon'), 'index.js', standInSource(h, false));

	const r = ctl(h, ['start', '--skip-sync', '--skip-install', '--skip-build', '--branch', 'main'], { INSRC_DAEMON_ROOT: root });

	const fresh = existsSync(h.pidFile) ? Number(readFileSync(h.pidFile, 'utf8')) : NaN;
	if (Number.isInteger(fresh)) strayPids.push(fresh);

	assert.equal(r.status, 0, r.out);
	assert.match(r.out, new RegExp(`daemon did not stop within 2 s; killed \\(pid ${stale.pid}\\)`), 'killed through the shared function');
	assert.equal(await exited(stale), 'SIGKILL');
	assert.match(r.out, new RegExp(`daemon running \\(pid ${fresh},`));
	assert.notEqual(fresh, stale.pid);
	assert.ok(alive(fresh), 'a new daemon is running');
	assert.ok(existsSync(h.sockFile), 'the new daemon owns the socket');
});

test('control script leaves a live non-matching pid alone and exits non-zero', async () => {
	const h = tempHome();
	// Same stubborn process, but its command line does not end in daemon/index.js.
	const other = await startStandIn(writeEntry(join(h.home, 'other'), 'server.js', standInSource(h, true)));

	const r = ctl(h, ['stop']);

	assert.notEqual(r.status, 0, r.out);
	assert.match(r.out, new RegExp(`pid ${other.pid} from the pid file is not a daemon process \\(command line: .*other/server\\.js\\)`));
	assert.doesNotMatch(r.out, /; killed \(pid/);
	assert.ok(alive(other.pid ?? -1), 'the process was not killed');
	assert.equal(readFileSync(h.pidFile, 'utf8'), String(other.pid), 'pid file kept');
	assert.ok(existsSync(h.sockFile), 'socket kept');
});

test('control script stop of a healthy daemon behaves and exits as before', async () => {
	const h = tempHome();
	const child = await startStandIn(writeEntry(join(h.home, 'stub/daemon'), 'index.js', standInSource(h, false)));

	const r = ctl(h, ['stop']);

	assert.equal(r.status, 0, r.out);
	assert.match(r.out, /daemon shut down/);
	assert.doesNotMatch(r.out, /; killed \(pid/);
	assert.equal(await exited(child), null, 'exited by itself, not by a signal');
	assert.equal(existsSync(h.pidFile), false);
});
