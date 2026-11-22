/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import policy from '../../assets/node-runtime-policy.json' with { type: 'json' };
import { SourceNativeActor } from '../source-actor-client.js';
import { processIdentityState, requireProcessIdentity } from '../daemon-process.js';
import type { ProcessIdentity } from '../daemon-process.js';

const exec = promisify(execFile), project = fileURLToPath(new URL('../../../', import.meta.url));
const worker = process.env['INSRC_SOURCE_ACTOR_BOOT'];
if (worker) {
 const { mode, root, project } = JSON.parse(worker) as { mode: string; root: string; project: string };
 const metadata = join(root, 'fixture.json');
 if (mode === 'setup') {
  const release = join(root, 'release'), binary = join(root, 'actor'), broker = join(root, 'broker');
  mkdirSync(join(release, 'out/daemon'), { recursive: true, mode: 0o700 });
  writeFileSync(join(release, 'package.json'), '{"type":"module"}');
  writeFileSync(join(release, 'out/daemon/index.js'), `import fs from 'node:fs';import{spawn}from'node:child_process';
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});
fs.writeFileSync('child.pid',String(child.pid));setInterval(()=>{},1000);`);
  execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(project, 'src/native/source-actor/main.c'), '-o', binary]);
  execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(project, 'src/native/process-broker/main.c'), join(project, 'src/native/process-broker/linux.c'), '-o', broker]);
  const options = { binary, broker, barrier: join(project, 'out/bin/insrc-source-startup-barrier.js'), directory: join(root, 'actors'),
   release: { root: release, runtime: process.execPath, commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64) }, transactionId: 'reboot-fixture', role: 'candidate' as const };
  const actor = await SourceNativeActor.launch(options);
  await actor.grant();
  for (let i = 0; !existsSync(join(release, 'child.pid')) && i < 200; i++) await delay(10);
  const child = requireProcessIdentity(Number(readFileSync(join(release, 'child.pid'), 'utf8')));
  await actor.commit();
  const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  writeFileSync(metadata, JSON.stringify({ options, directory: actor.directory, boot, root: actor.ticket.root, child }), { mode: 0o600 });
  await actor.close(); process.stdout.write(JSON.stringify({ boot, root }) + '\n');
 } else if (mode === 'verify') {
  const fixture = JSON.parse(readFileSync(metadata, 'utf8')) as { options: Parameters<typeof SourceNativeActor.launch>[0]; directory: string; boot: string; root: ProcessIdentity; child: ProcessIdentity };
  const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  assert.notEqual(boot, fixture.boot, 'the actual fixture OS/kernel incarnation must change');
  assert.notEqual(processIdentityState(fixture.root), 'same'); assert.notEqual(processIdentityState(fixture.child), 'same');
  // Simulate loss of the terminal receipt during power loss. Kernel-incarnation proof must stand alone.
  rmSync(join(fixture.directory, 'closed'), { force: true });
  const actor = await SourceNativeActor.reopen(fixture.directory, fixture.options.binary);
  assert.equal(await actor.target.handle.hasExited(), true); await actor.childrenClosed(); await actor.kill(); await actor.close();
  // The old ticket cannot cause a signal to any new occupant of its old PID.
  const fresh = await SourceNativeActor.launch(fixture.options);
  try {
   assert.equal(await fresh.target.handle.hasExited(), false);
   await fresh.grant(); await fresh.kill(); await fresh.childrenClosed();
  } finally { await fresh.close(); }
  process.stdout.write(JSON.stringify({ before: fixture.boot, after: boot, closed: true }) + '\n');
  rmSync(root, { recursive: true, force: true });
 } else throw new Error('Invalid actor boot fixture phase');
} else {
test('Native source actor proves old subtree closure after an actual Linux fixture restart', {
 timeout: 300_000, skip: process.platform !== 'darwin' ? 'actual restart qualification runs on the dedicated OrbStack host' : false,
}, async t => {
 const inventory = JSON.parse((await exec('orb', ['list', '--format=json'])).stdout) as Array<{ name: string; state: string }>;
 const stage = mkdtempSync(join(project, '.insrc/tmp/source-actor-boot-')), bundle = join(stage, 'test.mjs');
 const { buildSync } = await import('esbuild');
 buildSync({ entryPoints: [fileURLToPath(import.meta.url)], outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
 for (const [name, target] of [['insrc-node-arm64', 'linux-arm64'], ['insrc-node-x64', 'linux-x64']] as const) {
  const machine = inventory.find(item => item.name === name); assert.ok(machine);
  assert.equal(machine.state, 'stopped', 'reboot qualification requires an initially stopped dedicated fixture');
  await exec('orb', ['start', name], { timeout: 30_000 });
  try {
   const home = (await exec('orb', ['-m', name, '/bin/sh', '-c', 'printf "%s" "$HOME"'])).stdout;
   const root = (await exec('orb', ['-m', name, '/usr/bin/mktemp', '-d', join(home, 'insrc-source-actor-boot-XXXXXX')])).stdout.trim();
   const node = join(home, 'insrc-node-qualification/home/.insrc/runtimes', `node-v${policy.nodeVersion}-${target}`,
    policy.targets[target].sha256, 'distribution/bin/node');
   const invoke = (mode: string) => exec('orb', ['-m', name, '/usr/bin/env',
    `INSRC_SOURCE_ACTOR_BOOT=${JSON.stringify({ mode, root, project: `/mnt/mac${project}` })}`, node, `/mnt/mac${bundle}`], { timeout: 60_000 });
   const before = JSON.parse((await invoke('setup')).stdout) as { boot: string };
   await exec('orb', ['stop', name], { timeout: 30_000 }); await exec('orb', ['start', name], { timeout: 30_000 });
   const after = JSON.parse((await invoke('verify')).stdout) as { before: string; after: string; closed: boolean };
   assert.equal(after.before, before.boot); assert.notEqual(after.after, before.boot); assert.equal(after.closed, true);
   writeFileSync(join(stage, `${target}.json`), JSON.stringify(after) + '\n');
  } finally { await exec('orb', ['stop', name], { timeout: 30_000 }); }
 }
 t.diagnostic(`OS/kernel incarnation and closure receipts retained at ${stage}`);
});
}
