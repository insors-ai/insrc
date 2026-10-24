/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureStopTarget } from '../../../shared/daemon-process-client.js';
import type { StopTarget } from '../../../shared/daemon-process-client.js';
const repo = fileURLToPath(new URL('../../../../', import.meta.url)), script = join(repo, 'scripts/daemon-ctl.sh');
const children: ChildProcess[] = [], targets: StopTarget[] = [], homes: string[] = [];
before(() => { execFileSync('npm', ['run', 'build'], { cwd: repo, stdio: 'pipe', timeout: 120000 }); });
after(async () => {
 for (const c of children) if (c.exitCode === null && c.signalCode === null) { const ended = once(c, 'exit'); c.kill('SIGKILL'); await ended; }
 for (const target of targets) { try { await target.handle.terminate(); } finally { await target.handle.close(); } }
 for (const home of homes) rmSync(home, { recursive: true, force: true });
});
function fixture() {
 const home = mkdtempSync('/tmp/insrc-ctl-'); homes.push(home);
 const root = join(home, 'root'), pid = join(home, '.insrc/daemon.pid'), sock = join(home, '.insrc/daemon.sock');
 for (const path of ['.insrc', 'root/.git', 'root/src', 'root/out/daemon']) mkdirSync(join(home, path), { recursive: true });
 writeFileSync(join(root, 'package.json'), '{}'); symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'));
 symlinkSync(join(repo, 'out/bin'), join(root, 'out/bin'));
 assert.ok(pid.startsWith('/tmp/insrc-ctl-')); assert.ok(sock.startsWith('/tmp/insrc-ctl-'));
 return { home, root, pid, sock, guard: join(home, '.insrc/daemon.run-files.guard') };
}
type Fixture = ReturnType<typeof fixture>;
function source(f: Fixture, mode: string): string {
 return `const net = require('node:net'), fs = require('node:fs');
 const mode = ${JSON.stringify(mode)};
 const stop = () => { if (mode === 'stubborn') return; fs.rmSync(${JSON.stringify(f.pid)}, { force: true }); fs.rmSync(${JSON.stringify(f.sock)}, { force: true }); process.exit(0); };
 const server = net.createServer(sock => { sock.on('error', () => {}); sock.on('data', data => {
  const req = JSON.parse(String(data).split('\\n')[0]);
  if (mode === 'remove') { fs.rmSync(${JSON.stringify(f.pid)}, { force: true }); fs.rmSync(${JSON.stringify(f.sock)}, { force: true }); sock.destroy(); return; }
  if (mode === 'replace') { fs.writeFileSync(${JSON.stringify(f.pid)}, '123456789'); fs.rmSync(${JSON.stringify(f.sock)}); fs.writeFileSync(${JSON.stringify(f.sock)}, 'foreign'); sock.destroy(); return; }
  sock.write(JSON.stringify({ id: req.id, result: { ok: true } }) + '\\n'); if (mode === 'clean') setTimeout(stop, 20);
 }); });
 process.on('SIGTERM', stop); server.listen(${JSON.stringify(f.sock)}, () => { fs.writeFileSync(${JSON.stringify(f.pid)}, String(process.pid)); process.stdout.write('ready'); });
 setTimeout(() => process.exit(0), 90000);`;
}
async function standIn(f: Fixture, mode: string, valid = true) {
 const folder = join(f.home, valid ? 'stub/daemon' : 'other'); mkdirSync(folder, { recursive: true });
 const entry = join(folder, valid ? 'index.js' : 'server.js'); writeFileSync(entry, source(f, mode));
 const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'inherit'] }); children.push(child); await once(child.stdout!, 'data'); return child;
}
function ctl(f: Fixture, command: string) {
 const r = spawnSync('bash', [script, command, '--skip-sync', '--skip-install', '--skip-build', '--branch', 'main'], { env: { ...process.env, HOME: f.home, INSRC_DAEMON_ROOT: f.root, INSRC_CTL_LOG_DIR: join(f.home, 'logs'), INSRC_CTL_STOP_WAIT_SECS: '0.1' }, encoding: 'utf8', timeout: 15000 });
 return { status: r.status, output: r.stdout + r.stderr };
}
async function ended(child: ChildProcess) { if (child.exitCode !== null || child.signalCode !== null) return [child.exitCode, child.signalCode]; return once(child, 'exit'); }

test('Control script retains the original target across run-file removal', { timeout: 10000 }, async () => {
 const f = fixture(), child = await standIn(f, 'remove'); const r = ctl(f, 'stop');
 assert.equal(r.status, 0, r.output); assert.match(r.output, /; killed/); assert.equal((await ended(child))[1], 'SIGKILL');
});
test('Control script refuses reused identity, replacement files and orphan guards', { timeout: 15000 }, async () => {
 const other = fixture(), unrelated = await standIn(other, 'stubborn', false);
 const refused = ctl(other, 'restart'); assert.notEqual(refused.status, 0); assert.match(refused.output, /wrong-target/); assert.equal(unrelated.signalCode, null); assert.equal(readFileSync(other.pid, 'utf8'), String(unrelated.pid));
 const replacement = fixture(), old = await standIn(replacement, 'replace');
 const replaced = ctl(replacement, 'restart'); assert.notEqual(replaced.status, 0); assert.match(replaced.output, /ownership conflict/); assert.equal((await ended(old))[1], 'SIGKILL'); assert.equal(readFileSync(replacement.pid, 'utf8'), '123456789'); assert.equal(readFileSync(replacement.sock, 'utf8'), 'foreign');
 const orphan = fixture(), original = await standIn(orphan, 'stubborn');
 execFileSync(process.execPath, ['--input-type=module', '-e', `import { acquireRunFileGuard } from ${JSON.stringify(new URL('../../../../out/shared/daemon-run-files.js', import.meta.url).href)}; acquireRunFileGuard(${JSON.stringify(orphan.guard)});`], { env: { ...process.env, HOME: orphan.home } });
 const guarded = ctl(orphan, 'restart'); assert.notEqual(guarded.status, 0); assert.match(guarded.output, /state=gone/); assert.equal(original.signalCode, null); assert.equal(existsSync(orphan.guard), true);
});
test('Disposable clean and forced script restart paths preserve commands', { timeout: 15000 }, async () => {
 for (const mode of ['clean', 'stubborn']) {
  const f = fixture(), old = await standIn(f, mode); writeFileSync(join(f.root, 'out/daemon/index.js'), source(f, 'clean'));
  const r = ctl(f, 'restart'); assert.equal(r.status, 0, r.output); assert.match(r.output, /daemon running/);
  assert.equal((await ended(old))[1], mode === 'clean' ? null : 'SIGKILL');
  const target = await captureStopTarget(Number(readFileSync(f.pid, 'utf8'))); assert.ok(target); targets.push(target);
  assert.equal(await target.handle.hasExited(), false);
  const stop = ctl(f, 'stop'); assert.equal(stop.status, 0, stop.output); assert.match(stop.output, /daemon shut down/);
 }
});
test('Shell start and restart refuse spawn after lifecycle failures even in conditional contexts', { timeout: 5000 }, () => {
 const f = fixture(), marker = join(f.home, 'spawned');
 const definitions = readFileSync(script, 'utf8').split('# Arg parsing')[0]!;
 const harness = join(f.home, 'conditional.sh');
 writeFileSync(harness, definitions + `\nSKIP_SYNC=1; SKIP_INSTALL=1; SKIP_BUILD=1; BRANCH=main\nrequire_daemon_dir() { return 0; }\nstop_managed_daemon() { return 4; }\nspawn_daemon() { touch ${JSON.stringify(marker)}; }\nif cmd_start; then exit 91; fi\nif cmd_restart; then exit 92; fi\nexit 0\n`);
 const r = spawnSync('bash', [harness], { env: { ...process.env, HOME: f.home, INSRC_DAEMON_ROOT: f.root, INSRC_CTL_LOG_DIR: join(f.home, 'logs') }, encoding: 'utf8' });
 assert.equal(r.status, 0, r.stderr); assert.equal(existsSync(marker), false);
 // Missing packaging must also fail through the actual start path.
 rmSync(join(f.root, 'out/bin')); writeFileSync(join(f.root, 'out/daemon/index.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe');`);
 const missing = ctl(f, 'start'); assert.notEqual(missing.status, 0); assert.match(missing.output, /helper missing/); assert.equal(existsSync(marker), false);
});
