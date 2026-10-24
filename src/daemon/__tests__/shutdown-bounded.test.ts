/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const dir = mkdtempSync('/tmp/insrc-bounded-'); const children: ChildProcess[] = [];
before(() => { execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe', timeout: 120000 }); });
after(() => { for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); });
async function scenario(mode: string) {
 const home = mkdtempSync(join(dir, 'parent-')), entryDir = join(home, 'daemon'); mkdirSync(entryDir);
 const events = join(home, 'events'), log = join(home, 'last.log');
 const entry = join(entryDir, 'index.js');
 writeFileSync(entry, `(async () => {
 const { createShutdown } = await import(${JSON.stringify(new URL('../../../out/daemon/shutdown.js', import.meta.url).href)});
 const { armShutdownWatchdog } = await import(${JSON.stringify(new URL('../../../out/daemon/shutdown-watchdog.js', import.meta.url).href)});
 const fs = require('node:fs'); const mode = ${JSON.stringify(mode)};
 const event = value => fs.appendFileSync(${JSON.stringify(events)}, value + '\\n');
 if (mode === 'exit-hook') process.on('exit', () => { event('hook'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); });
 const health = mode === 'locks-lost' ? { state: 'locks-lost', at: 'test', operation: 'test', detectedBy: 'read', libraryMessage: 'lock failure' } : { state: 'ok' };
 const shutdown = createShutdown({ log: { info(value) { if (value === 'bye') event('bye'); }, warn() {} },
 armWatchdog: options => { event('arm'); return armShutdownWatchdog({ ...options, ...(mode === 'arm-fail' ? { brokerPath: '/missing-broker' } : {}) }); },
 hardExitMs: 600, queueDone: Promise.resolve(),
 stopBackgroundWork: () => event('stop'), closeStores: async () => { event('close'); if (mode === 'blocked' || mode === 'arm-fail') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); },
 end: { clearPid: () => event('clear'), exit: code => process.exit(code), killSelf: () => process.kill(process.pid, 'SIGKILL'), lastLinePath: ${JSON.stringify(log)}, storeHealth: () => health } });
 shutdown('SIGTERM'); shutdown('SIGINT');
 setInterval(() => {}, 1000);
 })();`);
 const child = spawn(process.execPath, [entry], { env: { ...process.env, HOME: home }, stdio: ['ignore', 'ignore', 'pipe'] }); children.push(child);
 const ended = once(child, 'exit'); const started = Date.now();
 const result = await ended;
 assert.ok(Date.now() - started < 3000);
 return { code: result[0], signal: result[1], events: readFileSync(events, 'utf8').trim().split('\n'), log: readFileSync(log, 'utf8') };
}
test('Watchdog arm failure self-kills before blocked native cleanup', { timeout: 5000 }, async () => {
 const out = await scenario('arm-fail'); assert.equal(out.signal, 'SIGKILL');
 assert.deepEqual(out.events, ['arm', 'clear']); assert.match(out.log, /shutdown failed.*broker spawn failed/);
});
test('Bounded shutdown preserves lock-loss, fatal and normal cleanup behavior', { timeout: 10000 }, async () => {
 for (const mode of ['blocked', 'exit-hook', 'healthy', 'locks-lost']) {
  const out = await scenario(mode);
  if (mode === 'healthy') { assert.equal(out.code, 0); assert.deepEqual(out.events, ['arm', 'stop', 'close', 'clear', 'bye']); }
  else { assert.equal(out.signal, 'SIGKILL'); if (mode === 'locks-lost') { assert.deepEqual(out.events, ['arm', 'stop', 'clear']); assert.match(out.log, /store's close was skipped/); }
   else { assert.match(out.log, /shutdown deadline exceeded/); if (mode === 'exit-hook') assert.ok(out.events.includes('hook')); }
  }
 }
});
test('Repeated signals and guarded async close preserve ownership', { timeout: 5000 }, async () => {
 const out = await scenario('healthy'); assert.equal(out.events.filter(value => value === 'arm').length, 1); assert.equal(out.events.filter(value => value === 'close').length, 1);
 assert.match(out.log, /watchdog arm/); assert.match(out.log, /exit hooks/);
 assert.equal(existsSync(join(dir, 'unused')), false);
});
