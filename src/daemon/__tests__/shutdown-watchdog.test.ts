/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readProcessIdentity } from '../../shared/daemon-process.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'insrc-watchdog-'));
const children: ChildProcess[] = [];
before(() => { execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe', timeout: 120000 }); });
after(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); });
async function run(mode: string) {
 const testDir = mkdtempSync(join(dir, 'parent-')); const entryDir = join(testDir, 'daemon'); mkdirSync(entryDir);
 const entry = join(entryDir, 'index.js'), log = join(testDir, 'watchdog.log'), hook = join(testDir, 'hook');
 const early = join(testDir, 'early.js'), silent = join(testDir, 'silent.js');
 writeFileSync(early, 'process.exit(9)'); writeFileSync(silent, 'setInterval(() => {}, 1000)');
 writeFileSync(entry, `(async () => {
 const { armShutdownWatchdog } = await import(${JSON.stringify(new URL('../../../out/daemon/shutdown-watchdog.js', import.meta.url).href)});
 const fs = require('node:fs'); const mode = ${JSON.stringify(mode)};
 const options = { deadline: Date.now() + 800, logPath: ${JSON.stringify(log)}, readyTimeoutMs: 300 };
 if (mode === 'spawn') options.nodePath = '/missing-node';
 if (mode === 'early') options.helperPath = ${JSON.stringify(early)};
 if (mode === 'timeout') options.helperPath = ${JSON.stringify(silent)};
 if (mode === 'broker') options.brokerPath = '/missing-broker';
 try {
 const watchdog = await armShutdownWatchdog(options);
 watchdog.stage('close native store');
 process.stdout.write(JSON.stringify({ ready: true, watchdog: watchdog.pid }) + '\\n');
 if (mode === 'blocked' || mode === 'exit-hook') {
  if (mode === 'exit-hook') { process.on('exit', () => { fs.writeFileSync(${JSON.stringify(hook)}, 'entered'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }); process.exit(0); }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
 }
 if (mode === 'disarm') { watchdog.disarm(); setTimeout(() => process.exit(0), 1000); }
 else setTimeout(() => process.exit(0), 50);
 } catch (error) { process.stdout.write(JSON.stringify({ error: error.message }) + '\\n'); process.exit(0); }
 })();`);
 const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
 const ended = once(child, 'exit');
 const [data] = await once(child.stdout!, 'data'); const value = JSON.parse(String(data));
 return { child, ended, value, log, hook };
}
async function gone(pid: number): Promise<void> {
 for (let i = 0; i < 100; i++) { try { if (!readProcessIdentity(pid)) return; } catch { /* process changed during exit; retry for positive absence */ } await new Promise(r => setTimeout(r, 20)); }
 assert.fail(`watchdog ${pid} remains alive`);
}
test('Independent watchdog bounds a disposable blocked parent and disarms after healthy exit', { timeout: 10000 }, async () => {
 for (const mode of ['blocked', 'exit-hook', 'healthy', 'disarm']) {
  const started = Date.now(), p = await run(mode); assert.equal(p.value.ready, true);
  const [code, signal] = await p.ended;
  if (mode === 'blocked' || mode === 'exit-hook') { assert.equal(signal, 'SIGKILL'); assert.match(readFileSync(p.log, 'utf8'), /close native store/); assert.ok(Date.now() - started < 3000); }
  else { assert.equal(code, 0); assert.equal(existsSync(p.log), false); }
  if (mode === 'exit-hook') assert.equal(readFileSync(p.hook, 'utf8'), 'entered');
  await gone(p.value.watchdog);
 }
});
test('Ready handshake reports spawn failure, early exit and timeout', { timeout: 10000 }, async () => {
 for (const [mode, expected] of [['spawn', /spawn failed/], ['early', /before readiness/], ['timeout', /timed out/], ['broker', /broker spawn failed/]] as const) {
  const p = await run(mode); assert.match(p.value.error, expected); assert.equal((await p.ended)[0], 0);
 }
});
test('Watchdog never signals after reparenting and imports only Node built-ins', { timeout: 5000 }, async () => {
 const p = await run('healthy'); assert.equal((await p.ended)[0], 0); await gone(p.value.watchdog);
 await new Promise(r => setTimeout(r, 850)); assert.equal(existsSync(p.log), false);
 const source = readFileSync(join(root, 'src/bin/insrc-shutdown-watchdog.ts'), 'utf8');
 const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]!);
 assert.ok(imports.length >= 4); assert.ok(imports.every(name => name.startsWith('node:')));
 assert.doesNotMatch(source, /process\.kill\(/);
 for (const path of ['out/bin/insrc-shutdown-watchdog.js', 'out/daemon/shutdown-watchdog.js', 'out/bin/insrc-process-broker']) assert.equal(existsSync(join(root, path)), true);
});
