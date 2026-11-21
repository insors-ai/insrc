/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import policy from '../../../assets/node-runtime-policy.json' with { type: 'json' };

/** Retain TAP from real Linux descriptor/process operations on each qualified architecture. */
export async function sourceLinux(t: TestContext, file: string, project: string, run: () => Promise<void>,
 options: { timeoutMs?: number | undefined } = {}): Promise<void> {
 if (process.platform === 'linux') { await run(); return; }
 assert.equal(process.platform, 'darwin', 'these tests require Linux or the known OrbStack fixtures');
 const inventory = JSON.parse(execFileSync('orb', ['list', '--format=json'], { encoding: 'utf8' })) as Array<{ name: string; state: string }>;
 const stage = mkdtempSync(join(project, '.insrc/tmp/source-transaction-linux-'));
 const bundle = join(stage, 'tests.mjs');
 const { buildSync } = await import('esbuild');
 buildSync({ entryPoints: [file], outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
 for (const [name, target] of [['insrc-node-arm64', 'linux-arm64'], ['insrc-node-x64', 'linux-x64']] as const) {
  const machine = inventory.find(m => m.name === name); assert.ok(machine, `${name} fixture must exist`);
  const started = machine.state === 'stopped';
  try {
   if (started) execFileSync('orb', ['start', name], { stdio: 'pipe', timeout: 30_000 });
   const home = execFileSync('orb', ['-m', name, '/bin/sh', '-c', 'printf "%s" "$HOME"'], { encoding: 'utf8' });
   const node = join(home, 'insrc-node-qualification/home/.insrc/runtimes', `node-v${policy.nodeVersion}-${target}`,
    policy.targets[target].sha256, 'distribution/bin/node');
   const guestRoot = `/mnt/mac${project}`;
   let result: string;
   try { result = execFileSync('orb', ['-m', name, '/usr/bin/env', `INSRC_SOURCE_TEST_REPO=${guestRoot}`, node,
    '--test', '--test-reporter=tap', `--test-name-pattern=^${t.name}$`, `/mnt/mac${bundle}`], {
    encoding: 'utf8', timeout: options.timeoutMs ?? 240_000, maxBuffer: 256 * 1024 }); }
   catch (error) {
    const failed = error as { stdout?: string; stderr?: string; message?: string };
    writeFileSync(join(stage, `${name}-failed.tap`), `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`);
    throw new Error(`${failed.message ?? String(error)}\n${failed.stdout ?? ''}\n${failed.stderr ?? ''}`, { cause: error });
   }
   assert.match(result, /# fail 0\b/); assert.match(result, /# skipped 0\b/);
   writeFileSync(join(stage, `${name}-${createHash('sha256').update(t.name).digest('hex').slice(0, 8)}.tap`), result);
  } finally { if (started) execFileSync('orb', ['stop', name], { stdio: 'pipe', timeout: 30_000 }); }
 }
}
