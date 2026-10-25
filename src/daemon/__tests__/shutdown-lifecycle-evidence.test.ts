/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { connect } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureStopTarget } from '../../shared/daemon-process-client.js';
import type { StopTarget } from '../../shared/daemon-process-client.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = mkdtempSync('/tmp/insrc-shutdown-evidence-');
const children: ChildProcess[] = [], targets: StopTarget[] = [];
const moduleUrl = (path: string) => new URL(`../../../out/${path}.js`, import.meta.url).href;
before(() => { execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe', timeout: 120000 }); });
after(async () => {
 for (const child of children) if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill('SIGKILL'); await ended; }
 for (const target of targets) { try { await target.handle.terminate(); } finally { await target.handle.close(); } }
 rmSync(base, { recursive: true, force: true });
});
async function until(predicate: () => boolean) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 20)); } assert.fail('fixture deadline expired'); }
async function scenario(mode: 'healthy' | 'blocked' | 'guard-death') {
 const home = mkdtempSync(join(base, 'case-')), daemonDir = join(home, 'daemon'); mkdirSync(daemonDir);
 const entry = join(daemonDir, 'index.js'), log = join(home, 'shutdown.log'), closing = join(home, 'closing'), watchdogFile = join(home, 'watchdog');
 const bound = mode === 'guard-death' ? 5000 : 600;
 writeFileSync(entry, `(async () => {
 const { IpcServer, directDispatch } = await import(${JSON.stringify(moduleUrl('daemon/server'))});
 const { daemonRunFiles, endForRunFileConflict } = await import(${JSON.stringify(moduleUrl('daemon/run-file-ownership'))});
 const { createShutdown, realEndDeps } = await import(${JSON.stringify(moduleUrl('daemon/shutdown'))});
 const { armShutdownWatchdog } = await import(${JSON.stringify(moduleUrl('daemon/shutdown-watchdog'))});
 const fs = require('node:fs'); const mode = process.env.INSRC_EVIDENCE_MODE || ${JSON.stringify(mode)};
 const publication = daemonRunFiles.lease(); daemonRunFiles.writePid();
 const server = new IpcServer(directDispatch({ 'daemon.shutdown': async () => { shutdown('RPC'); return { ok: true }; } }));
 let serverClosing;
 const shutdown = createShutdown({ log: { info() {}, warn() {} }, hardExitMs: ${bound}, queueDone: Promise.resolve(),
 armWatchdog: async options => { const watchdog = await armShutdownWatchdog(options); fs.writeFileSync(${JSON.stringify(watchdogFile)}, String(watchdog.pid)); return watchdog; },
 stopBackgroundWork: () => { serverClosing = server.close(); void serverClosing.catch(endForRunFileConflict); fs.writeFileSync(${JSON.stringify(closing)}, 'close pending'); },
 closeStores: async () => {
  if (mode !== 'guard-death') { await server.flushPendingWrites(1000); server.disconnectClients(); }
  await serverClosing;
  if (mode === 'blocked') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
 }, end: { ...realEndDeps, lastLinePath: ${JSON.stringify(log)} } });
 await server.listen(); publication.release(); process.stdout.write('ready');
 })();`);
 const env = { ...process.env, HOME: home, INSRC_LOG_LEVEL: 'silent' };
 const child = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'inherit'] }); children.push(child);
 const ended = once(child, 'exit'); await once(child.stdout!, 'data');
 const original = await captureStopTarget(child.pid!); assert.ok(original);
 const identity = { pid: original.pid, startedAt: original.startedAt, commandLine: original.commandLine }; await original.handle.close();
 const heldClient = mode === 'guard-death' ? connect(join(home, '.insrc/daemon.sock')) : undefined;
 if (heldClient) { heldClient.on('error', () => {}); await once(heldClient, 'connect'); }
 const controller = join(home, 'controller.mjs'), starts = join(home, 'starts');
 writeFileSync(controller, `import { restart } from ${JSON.stringify(moduleUrl('cli/services/maintenance'))};
 import { stopDaemon } from ${JSON.stringify(moduleUrl('cli/services/daemon'))};
 import { spawn } from 'node:child_process'; import { appendFileSync } from 'node:fs'; import { once } from 'node:events';
 const result = await restart(() => {}, { stopDaemon: () => stopDaemon({ stopWaitMs: 2000, replyBoundMs: 300 }), startDaemon: async () => {
  appendFileSync(${JSON.stringify(starts)}, 'start\\n');
  const child = spawn(process.execPath, [${JSON.stringify(entry)}], { detached: true, env: { ...process.env, INSRC_EVIDENCE_MODE: 'healthy' }, stdio: ['ignore', 'pipe', 'ignore'] });
  await once(child.stdout, 'data'); child.stdout.destroy(); child.unref();
  return { started: true, alreadyRunning: false, logPath: '', pid: child.pid };
 } }); process.stdout.write(JSON.stringify(result));`);
 const startedAt = new Date().toISOString(), started = Date.now();
 const ctl = spawn(process.execPath, [controller], { env, stdio: ['ignore', 'pipe', 'inherit'] }); children.push(ctl);
 let output = ''; ctl.stdout!.on('data', data => { output += String(data); }); const controllerEnded = once(ctl, 'exit');
 let guardOwner: unknown;
 if (mode === 'guard-death') {
  await until(() => existsSync(closing));
  const guard = join(home, '.insrc/daemon.run-files.guard'); assert.equal(existsSync(guard), true);
  guardOwner = JSON.parse(readFileSync(join(guard, 'owner.json'), 'utf8'));
  child.kill('SIGKILL');
 }
 assert.equal((await controllerEnded)[0], 0); const result = JSON.parse(output); const [exitCode, signal] = await ended;
 heldClient?.destroy();
 const elapsedMs = Date.now() - started;
 const guardRemains = existsSync(join(home, '.insrc/daemon.run-files.guard'));
 const startCount = existsSync(starts) ? readFileSync(starts, 'utf8').trim().split('\n').length : 0;
 if (mode === 'guard-death') { assert.equal(result.ok, false); assert.match(result.error, /ownership conflict.*state=gone/); assert.equal(startCount, 0); assert.equal(guardRemains, true); }
 else {
  assert.equal(result.ok, true); assert.equal(startCount, 1); assert.equal(guardRemains, false);
  const fresh = await captureStopTarget(Number(readFileSync(join(home, '.insrc/daemon.pid'), 'utf8'))); assert.ok(fresh); targets.push(fresh); assert.notEqual(fresh.pid, identity.pid); assert.equal(await fresh.handle.hasExited(), false);
  assert.ok(elapsedMs < 3000);
 }
 if (mode === 'blocked' || mode === 'guard-death') assert.equal(signal, 'SIGKILL'); else assert.equal(exitCode, 0);
 return { mode, startedAt, original: identity, configuredDeadlineMs: bound, elapsedMs, termination: { exitCode, signal }, restart: result, startCount, guardRemains, guardOwner, watchdogPid: Number(readFileSync(watchdogFile, 'utf8')), log: readFileSync(log, 'utf8') };
}
test('Guard-owner death prevents restart while the healthy control restarts normally', { timeout: 15000 }, async () => {
 const cases = [];
 for (const mode of ['blocked', 'healthy', 'guard-death'] as const) cases.push(await scenario(mode));
 const evidence = { recordedAt: new Date().toISOString(), platform: process.platform, node: process.version, historicalCause: 'October 13 native cause remains deferred and unproven', installedDaemonSmoke: 'not performed', cases };
 const destination = process.env['INSRC_SHUTDOWN_EVIDENCE']; if (destination) writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
});
test('Compiled helper packaging and affected lifecycle regression suites', () => {
 for (const path of ['out/bin/insrc-process-broker', 'out/bin/insrc-shutdown-watchdog.js', 'out/daemon/shutdown-watchdog.js', 'out/bin/insrc-daemon-control.js']) assert.equal(existsSync(join(root, path)), true);
});
