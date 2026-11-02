// Archived external-run proof is checked separately from the portable package.
// A local pass never substitutes for actual Linux/ext4 execution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = root + 'docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/evidence/';
const scope = ['packages/project-memory/src', 'packages/project-memory/package.json', 'packages/project-memory/tsconfig.json', '.github/workflows/project-memory.yml'];
function fresh(sha: string): void {
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.equal(execFileSync('git', ['diff', sha, '--', ...scope], { cwd: root, encoding: 'utf8' }), '', 'native qualification must cover current package source/fixtures');
}
function crashProof(directory: string, tapFile: string): void {
  const tap = readFileSync(directory + tapFile, 'utf8'), crash = JSON.parse(readFileSync(directory + 'queue-crash.json', 'utf8'));
  assert.equal(crash.scenarios.length, 55); assert.equal(new Set(crash.scenarios).size, 55);
  assert.match(tap, /ok \d+ - accepted-set-survives-process-kill-at-every-boundary/);
  assert.match(tap, /ok \d+ - macos-apfs-linux-ext4-node22-queue-qualification/);
  assert.match(tap, /^# pass [1-9][0-9]*$/m);
  for (const field of ['fail', 'cancelled', 'skipped', 'todo']) assert.match(tap, new RegExp('^# ' + field + ' 0$', 'm'));
  assert.doesNotMatch(tap, /^not ok /m);
  assert.equal(crash.scenarios.includes('after-observed-accepted-reply'), true);
}
test('current-source-macos-apfs-node22-crash-qualification', () => {
  const dir = evidence + 'macos/', run = JSON.parse(readFileSync(dir + 'run.json', 'utf8'));
  fresh(run.sourceCommit); crashProof(dir, 'queue-crash.tap');
  const crash = JSON.parse(readFileSync(dir + 'queue-crash.json', 'utf8'));
  assert.equal(crash.platform, 'darwin'); assert.match(crash.node, /^22\./);
  assert.match(readFileSync(dir + 'queue-crash.tap', 'utf8'), /"filesystemType":26/);
});
test('current-source-linux-ext4-node22-crash-qualification', () => {
  const dir = evidence + 'linux/', run = JSON.parse(readFileSync(dir + 'run.json', 'utf8'));
  assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
  assert.match(run.url, /^https:\/\/github\.com\/insors-ai\/insrc\/actions\/runs\/\d+$/);
  fresh(run.headSha); crashProof(dir, 'queue-suite.tap');
  const platform = readFileSync(dir + 'platform.log', 'utf8');
  assert.match(platform, /Linux/); assert.match(platform, /"node":"22\.22\.1"/); assert.match(platform, /"modules":"127"/); assert.match(platform, /ext4/);
  assert.equal(JSON.parse(readFileSync(dir + 'queue-crash.json', 'utf8')).platform, 'linux');
});
