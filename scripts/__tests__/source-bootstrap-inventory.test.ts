/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import policy from '../../src/assets/node-runtime-policy.json' with { type: 'json' };

const exec = promisify(execFile);
test('Packaged bootstrap inventories damaged predecessors without incumbent dependencies', { timeout: 240_000 }, async t => {
 const project = await realpath(resolve('.'));
 const root = await realpath(await mkdtemp(join(project, '.insrc/tmp/bootstrap-inventory-')));
 t.after(() => rm(root, { recursive: true, force: true }));
 const old = join(root, 'incumbent'), tools = join(root, 'hostile'), trace = join(root, 'executed-old-code');
 const git = async (...args: string[]) => (await exec('/usr/bin/git', ['-C', old, '-c', 'user.name=Inventory test',
  '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args])).stdout.trim();
 await mkdir(old); await mkdir(tools);
 await git('init', '-qb', 'main');
 await writeFile(join(old, '.gitignore'), 'out/\nnode_modules/\npackages/\n');
 await writeFile(join(old, 'package.json'), JSON.stringify({ name: 'damaged-incumbent', type: 'module',
  scripts: { preinstall: 'exit 99', build: 'exit 99' } }));
 await writeFile(join(old, 'package-lock.json'), '{}\n');
 await git('add', '.'); await git('commit', '-qm', 'old built source');
 const prior = await git('rev-parse', 'HEAD');
 for (const path of ['out/daemon', 'node_modules', 'packages/project-memory']) await mkdir(join(old, path), { recursive: true });
 await writeFile(join(old, 'out/daemon/index.js'), 'throw new Error("incumbent must never execute during inventory");');
 await writeFile(join(old, 'out/release-compatibility.json'), JSON.stringify({ version: 1, releaseId: prior, graphSchema: 10,
  startup: 'rollback-compatible', formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } }));
 await git('commit', '--allow-empty', '-qm', 'source ahead of compiled output');
 const head = await git('rev-parse', 'HEAD');
 const lock = '{"locallyEdited":true}\n'; await writeFile(join(old, 'package-lock.json'), lock);
 for (const name of ['node', 'npm', 'fsmonitor']) await writeFile(join(tools, name), '#!/bin/sh\nprintf invoked >> "$INSRC_INVENTORY_TRACE"\nexit 97\n', { mode: 0o700 });
 await git('config', 'core.fsmonitor', join(tools, 'fsmonitor'));
 const key = join(root, 'fixture-key'), installer = join(root, 'installer.sh'), verifier = join(root, 'verifier.mjs');
 await exec('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
 await exec(process.execPath, ['scripts/bundle-release-bootstrap.mjs', key + '.pub', installer]);
 const encoded = (await readFile(installer, 'utf8')).match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
 assert.ok(encoded);
 const bytes = Buffer.from(encoded, 'base64'); assert.ok(bytes.length <= 1024 * 1024, 'independent verifier must retain its delivery size bound');
 await writeFile(verifier, bytes, { mode: 0o600 });
 type Report = { authority: string; activationPermitted: boolean; inventory: {
  sourceHead: string; builtCommit?: string; declaration: { releaseId: string }; issues: string[]; changes: string[];
 } };
 const check = (stdout: string, incomplete: boolean) => {
  const report = JSON.parse(stdout) as Report;
  assert.equal(report.authority, 'diagnostic-only'); assert.equal(report.activationPermitted, false);
  assert.equal(report.inventory.sourceHead, head); assert.equal(report.inventory.declaration.releaseId, prior);
  assert.equal(report.inventory.builtCommit, undefined, 'editable declaration and newer HEAD cannot establish built provenance');
  assert.ok(report.inventory.issues.includes('built-provenance-unproven'));
  assert.ok(report.inventory.issues.includes('install-marker-missing'));
  assert.ok(report.inventory.changes.some(path => path.includes('package-lock.json')));
  if (incomplete) assert.ok(report.inventory.issues.includes('compiled-output-or-dependencies-incomplete'));
 };
 const env = { ...process.env, PATH: `${tools}:/usr/bin:/bin`, INSRC_INVENTORY_TRACE: trace };
 delete env.NODE_OPTIONS; delete env.NODE_PATH;
 for (const incomplete of [false, true]) {
  if (incomplete) await rm(join(old, 'out/daemon/index.js'));
  check((await exec(process.execPath, [verifier, 'inventory', old, await realpath(process.execPath)], { env })).stdout, incomplete);
  assert.equal(await readFile(join(old, 'package-lock.json'), 'utf8'), lock);
  await assert.rejects(readFile(trace), { code: 'ENOENT' });
 }
 // The same delivered bytes run on both real Linux targets with no target checkout dependencies.
 if (process.platform === 'darwin') {
  const machines = JSON.parse((await exec('orb', ['list', '--format=json'])).stdout) as Array<{ name: string; state: string }>;
  for (const [name, target] of [['insrc-node-arm64', 'linux-arm64'], ['insrc-node-x64', 'linux-x64']] as const) {
   const machine = machines.find(item => item.name === name); assert.ok(machine);
   const started = machine.state === 'stopped';
   try {
    if (started) await exec('orb', ['start', name], { timeout: 30_000 });
    const home = (await exec('orb', ['-m', name, '/bin/sh', '-c', 'printf "%s" "$HOME"'])).stdout;
    const node = join(home, 'insrc-node-qualification/home/.insrc/runtimes', `node-v${policy.nodeVersion}-${target}`,
     policy.targets[target].sha256, 'distribution/bin/node');
    const mapped = (path: string) => `/mnt/mac${path}`;
    const result = await exec('orb', ['-m', name, '/usr/bin/env', `PATH=${mapped(tools)}:/usr/bin:/bin`,
     `INSRC_INVENTORY_TRACE=${mapped(trace)}`, node, mapped(verifier), 'inventory', mapped(old), node], { timeout: 30_000 });
    check(result.stdout, true);
   } finally { if (started) await exec('orb', ['stop', name], { timeout: 30_000 }); }
  }
 }
 assert.equal(await readFile(join(old, 'package-lock.json'), 'utf8'), lock);
 await assert.rejects(readFile(trace), { code: 'ENOENT' });
 await assert.rejects(exec(process.execPath, [verifier, 'inventory', old, process.execPath, 'extra']), /usage: inventory/);
 assert.equal(dirname(verifier), root); // Delivered outside the incumbent and its missing modules.
});
