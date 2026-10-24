/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DaemonRunFileOwnership, endForRunFileConflict } from '../run-file-ownership.js';
import { acquireRunFileGuard } from '../../shared/daemon-run-files.js';
import { IpcServer } from '../server.js';

function fixture() {
 const dir = mkdtempSync(join(tmpdir(), 'insrc-owned-'));
 const paths = { pidFile: join(dir, 'pid'), socketFile: join(dir, 'sock'), guardPath: join(dir, 'guard') };
 return { dir, paths, owner: new DaemonRunFileOwnership(paths), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('Replacement run files survive original daemon cleanup and implicit socket unlink', async () => {
 const f = fixture();
 const child = fork(fileURLToPath(new URL('./fixtures/run-file-owner-child.ts', import.meta.url)), [f.dir], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
 try {
  await once(child, 'message');
  rmSync(f.paths.pidFile); writeFileSync(f.paths.pidFile, 'replacement');
  rmSync(f.paths.socketFile); writeFileSync(f.paths.socketFile, 'replacement socket');
  const ended = once(child, 'exit'); child.send('close');
  const [code, signal] = await ended;
  assert.equal(code, null); assert.equal(signal, 'SIGKILL');
  assert.equal(readFileSync(f.paths.pidFile, 'utf8'), 'replacement');
  assert.equal(readFileSync(f.paths.socketFile, 'utf8'), 'replacement socket');
 } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); f.cleanup(); }
});

test('Startup publication and awaited close are serialized under the same guard', async () => {
 const f = fixture(); const server = new IpcServer({}, {}, Date.now, f.paths.socketFile, f.owner);
 try {
  const publication = f.owner.lease();
  assert.throws(() => acquireRunFileGuard(f.paths.guardPath), /conflict/);
  f.owner.writePid(); await server.listen(); publication.release();
  const client = connect(f.paths.socketFile); await once(client, 'connect');
  // Ensure the server accepted the connection before closing its listener.
  while (server.attachedClients().length === 0) await new Promise(r => setImmediate(r));
  let closed = false; const closing = server.close().then(() => { closed = true; });
  await new Promise(r => setImmediate(r));
  assert.equal(closed, false); assert.throws(() => acquireRunFileGuard(f.paths.guardPath), /conflict/);
  client.end(); await closing;
  const next = acquireRunFileGuard(f.paths.guardPath); next.release();
  f.owner.clearRunFiles();
  writeFileSync(f.paths.socketFile, 'later owner');
  await server.close();
  assert.equal(readFileSync(f.paths.socketFile, 'utf8'), 'later owner');
 } finally { f.cleanup(); }
});

test('Startup-error, fatal and stale-file cleanup honor ownership', async () => {
 const f = fixture();
 try {
  writeFileSync(f.paths.pidFile, '123'); writeFileSync(f.paths.socketFile, 'stale');
  assert.equal(f.owner.isAlreadyRunning(() => ({ pid: 123, startedAt: 'start', commandLine: 'daemon' })), true);
  assert.throws(() => f.owner.isAlreadyRunning(() => { throw new Error('permission denied'); }), /permission denied/);
  assert.equal(existsSync(f.paths.pidFile), true);
  assert.equal(f.owner.isAlreadyRunning(() => undefined), false);
  assert.equal(existsSync(f.paths.socketFile), false);
  f.owner.writePid(); writeFileSync(f.paths.socketFile, 'foreign');
  assert.throws(() => f.owner.clearRunFiles(), /replacement/);
  assert.equal(readFileSync(f.paths.pidFile, 'utf8'), String(process.pid));
  let killed = false;
  const logPath = join(f.dir, 'fatal.log');
  endForRunFileConflict(new Error('replacement'), { logPath, killSelf: () => { killed = true; } });
  assert.equal(killed, true); assert.match(readFileSync(logPath, 'utf8'), /without cleanup/);
  const unstarted = new IpcServer({}, {}, Date.now, f.paths.socketFile, f.owner);
  await unstarted.close(); assert.equal(readFileSync(f.paths.socketFile, 'utf8'), 'foreign');
 } finally { f.cleanup(); }
});
