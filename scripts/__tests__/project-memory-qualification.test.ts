// Verifies archived external-run evidence; this does not substitute a macOS run
// for Linux execution. The run URL and exact qualified source revision are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = root + 'docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/linux/';
function qualified() {
  const run = JSON.parse(readFileSync(evidence + 'run.json', 'utf8'));
  assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
  assert.match(run.url, /^https:\/\/github\.com\/insors-ai\/insrc\/actions\/runs\/\d+$/);
  assert.match(run.headSha, /^[a-f0-9]{40}$/);
  assert.equal(execFileSync('git', ['diff', run.headSha, '--', 'packages/project-memory/src', 'packages/project-memory/package.json', 'packages/project-memory/tsconfig.json', '.github/workflows/project-memory.yml'], { cwd: root, encoding: 'utf8' }), '', 'qualification must cover the current package implementation and fixtures');
  return readFileSync(evidence + 'platform.log', 'utf8');
}
function passed(file: string, count: number, names: string[]) {
  const tap = readFileSync(evidence + file, 'utf8');
  assert.match(tap, new RegExp('^# pass ' + count + '$', 'm'));
  for (const field of ['fail', 'cancelled', 'skipped', 'todo']) assert.match(tap, new RegExp('^# ' + field + ' 0$', 'm'));
  for (const name of names) assert.ok(tap.includes(' - ' + name + '\n'), name);
  assert.doesNotMatch(tap, /^not ok /m);
}
test('manual-linux-ext4-node22-native-and-lifecycle', () => {
  const platform = qualified();
  assert.match(platform, /Linux/); assert.match(platform, /"node":"22\.22\.1"/); assert.match(platform, /"modules":"127"/); assert.match(platform, /ext4/);
  passed('native-lifecycle.tap', 12, ['layout-state-is-decided-under-ownership-after-one-preflight', 'node22-fs-ext-abi-and-separate-descriptor-probe', 'same-process-package-copy-thread-process-contention', 'killed-owner-release-stopped-owner-exclusion-and-aliases', 'foundation-data-methods-return-not-ready']);
});
test('manual-linux-packed-consumer-and-natural-exit', () => {
  qualified();
  passed('packed-consumer.tap', 3, ['packed-isolated-node22-consumer', 'packed-native-missing-import-versus-open', 'tarball-public-dependency-and-asset-allowlist']);
});
