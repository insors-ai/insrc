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
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// A short root: a Unix socket path is limited to ~104 bytes on macOS.
const testHome = mkdtempSync('/tmp/insrc-stop-');
process.env['HOME'] = testHome;
mkdirSync(join(testHome, '.insrc'), { recursive: true });

const { stopDaemon } = await import('../daemon.js');
const { PATHS } = await import('../../../shared/paths.js');
assert.equal(PATHS.pidFile, join(testHome, '.insrc/daemon.pid'));
assert.equal(PATHS.sockFile, join(testHome, '.insrc/daemon.sock'));
assert.equal(PATHS.daemonRunGuard, join(testHome, '.insrc/daemon.run-files.guard'));
assert.ok(testHome.startsWith('/tmp/insrc-stop-'));

const children: ChildProcess[] = [];
after(() => {
	for (const c of children) { try { c.kill('SIGKILL'); } catch { /* gone */ } }
	rmSync(testHome, { recursive: true, force: true });
});

/** A stand-in daemon. `reply` — whether it answers the shutdown request. */
function stubbornDaemonSource(reply: boolean, removeFiles = false): string {
	return `
const net = require('node:net');
const fs = require('node:fs');
process.on('SIGTERM', () => {});
process.on('SIGINT', () => {});
const server = net.createServer(sock => {
	sock.on('error', () => {});
	sock.on('data', chunk => {
		if (${String(removeFiles)}) { fs.rmSync(${JSON.stringify(PATHS.pidFile)}, { force: true }); fs.rmSync(${JSON.stringify(PATHS.sockFile)}, { force: true }); sock.destroy(); return; }
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

async function startStubborn(reply: boolean, removeFiles = false): Promise<ChildProcess> {
	const dir = join(mkdtempSync(join(testHome, 'stub-')), 'daemon');
	mkdirSync(dir, { recursive: true });
	const entry = join(dir, 'index.js');
	writeFileSync(entry, stubbornDaemonSource(reply, removeFiles));
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


test('Retained stop target survives run-file removal and RPC failure', async () => {
 const child = await startStubborn(true, true);
 const outcome = await stopDaemon({ stopWaitMs: 100, replyBoundMs: 200 });
 assert.deepEqual(outcome, { stopped: true, forced: true, pid: child.pid });
 assert.equal(await exited(child), 'SIGKILL');
});

test('Verified forced termination preserves StopOutcome and never targets reused PIDs', async () => {
 const child = await startStubborn(true);
 const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); children.push(bystander);
 const { captureDaemon } = await import('../lifecycle.js');
 const original = await captureDaemon();
 writeFileSync(PATHS.pidFile, String(bystander.pid));
 try {
  await assert.rejects(stopDaemon({ capture: async () => original, requestShutdown: async () => { throw new Error('gone socket'); }, stopWaitMs: 0 }), /ownership conflict/);
  assert.equal(await exited(child), 'SIGKILL');
  assert.equal(bystander.exitCode, null); assert.equal(bystander.signalCode, null);
  assert.equal(existsSync(PATHS.pidFile), true);
 } finally { bystander.kill('SIGKILL'); rmSync(PATHS.pidFile, { force: true }); rmSync(PATHS.sockFile, { force: true }); }
});

test('Real ownership and guard conflicts prevent maintenance restart', async () => {
 const { restart } = await import('../maintenance.js');
 const { acquireRunFileGuard } = await import('../../../shared/daemon-run-files.js');
 let starts = 0;
 const child = await startStubborn(true);
 let guard: ReturnType<typeof acquireRunFileGuard> | undefined;
 try {
  const result = await restart(() => {}, {
   stopDaemon: () => stopDaemon({ requestShutdown: async () => { guard = acquireRunFileGuard(PATHS.daemonRunGuard); return 'no-reply'; }, stopWaitMs: 0 }),
   startDaemon: async () => { starts++; return { started: true, alreadyRunning: false, logPath: '' }; },
  });
  assert.equal(result.ok, false); assert.match(result.error!, /ownership conflict/); assert.equal(starts, 0);
  assert.equal(await exited(child), 'SIGKILL'); assert.equal(existsSync(PATHS.pidFile), true);
 } finally { guard?.release(); rmSync(PATHS.pidFile, { force: true }); rmSync(PATHS.sockFile, { force: true }); }
});


test('Injected same-PID reincarnation preserves forced outcome and never retargets the held native capability', async () => {
 const root = fileURLToPath(new URL('../../../../', import.meta.url));
 const binary = join(testHome, 'reused-pid-broker'), signalLog = join(testHome, 'signals'), table = join(testHome, 'process-table');
 execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', join(root, 'src/native/process-broker'), join(root, 'src/native/process-broker/main.c'), join(root, 'src/cli/services/__tests__/fixtures/reused-pid-backend.c'), '-o', binary]);
 const { captureStopTarget } = await import('../../../shared/daemon-process-client.js');
 const { stopDaemonWith } = await import('../daemon.js');
 const prior = process.env['INSRC_REUSE_SIGNAL_LOG']; process.env['INSRC_REUSE_SIGNAL_LOG'] = signalLog;
 let target;
 try { target = await captureStopTarget(71, { executable: binary }); }
 finally { if (prior === undefined) delete process.env['INSRC_REUSE_SIGNAL_LOG']; else process.env['INSRC_REUSE_SIGNAL_LOG'] = prior; }
 assert.ok(target); writeFileSync(table, '71 original-incarnation');
 const out = await stopDaemonWith({ capture: async () => ({ target, pidFile: undefined, socketFile: undefined }),
  requestShutdown: async () => { writeFileSync(table, '71 replacement-incarnation alive'); return 'no-reply'; },
  waitForStop: async () => false, cleanup: () => {}, sleep: async () => {}, replyBoundMs: 10, stopWaitMs: 0, killWaitMs: 100,
 });
 assert.deepEqual(out, { stopped: true, forced: true, pid: 71 });
 assert.equal(readFileSync(signalLog, 'utf8'), '71 original-incarnation\n');
 assert.equal(readFileSync(table, 'utf8'), '71 replacement-incarnation alive');
});

test('Real orphaned guard owner death prevents maintenance restart', async () => {
 const { restart } = await import('../maintenance.js');
 const child = await startStubborn(true); let starts = 0;
 let guardOwner: ChildProcess | undefined;
 try {
  const result = await restart(() => {}, { stopDaemon: () => stopDaemon({ stopWaitMs: 0, requestShutdown: async () => {
   const module = new URL('../../../shared/daemon-run-files.ts', import.meta.url).href;
   guardOwner = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import { acquireRunFileGuard } from ${JSON.stringify(module)}; acquireRunFileGuard(${JSON.stringify(PATHS.daemonRunGuard)}); process.stdout.write('ready'); setInterval(() => {}, 1000);`], { stdio: ['ignore', 'pipe', 'inherit'] }); children.push(guardOwner);
   await once(guardOwner.stdout!, 'data'); const ended = once(guardOwner, 'exit'); guardOwner.kill('SIGKILL'); await ended;
   return 'no-reply';
  } }), startDaemon: async () => { starts++; return { started: true, alreadyRunning: false, logPath: '' }; } });
  assert.equal(result.ok, false); assert.match(result.error!, /owner pid=.*state=gone/); assert.equal(starts, 0);
  assert.equal(await exited(child), 'SIGKILL'); assert.equal(existsSync(PATHS.daemonRunGuard), true);
 } finally { guardOwner?.kill('SIGKILL'); rmSync(PATHS.daemonRunGuard, { recursive: true, force: true }); rmSync(PATHS.pidFile, { force: true }); rmSync(PATHS.sockFile, { force: true }); }
});
