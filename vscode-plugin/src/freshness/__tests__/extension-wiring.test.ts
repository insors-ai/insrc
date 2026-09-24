/**
 * Story E20260924b6c90b3e:S003 / t2 — extension.ts wiring source-scan.
 *
 * Mirrors activation.test.ts's source-scan idiom (regex over the sole vscode
 * importer, no vscode runtime): asserts extension.ts constructs the real
 * DaemonFreshnessDeps seams and fires the check fire-and-forget.
 *
 * Run: npx tsx --test vscode-plugin/src/freshness/__tests__/extension-wiring.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_TS = join(HERE, '..', '..', 'extension.ts');

function extensionSource(): string {
  return readFileSync(EXTENSION_TS, 'utf8');
}

test('extension.ts fires runDaemonFreshnessCheck WITHOUT await (fire-and-forget)', () => {
  const src = extensionSource();
  assert.match(src, /from '\.\/freshness\/daemon-freshness\.js'/, 'imports the flow module');
  // Fired as `void runDaemonFreshnessCheck({` — never awaited (must not block activation, k6).
  assert.match(src, /void runDaemonFreshnessCheck\(\{/, 'invoked as void (fire-and-forget)');
  assert.doesNotMatch(src, /await\s+runDaemonFreshnessCheck/, 'never awaited');
});

test('extension.ts wires the notify seam to showInformationMessage(message, {}, ...actions) (no modal, k7)', () => {
  const src = extensionSource();
  assert.match(
    src,
    /notify:\s*\(message,\s*\.\.\.actions\)\s*=>[\s\S]*?vscode\.window\.showInformationMessage\(message,\s*\{\},\s*\.\.\.actions\)/,
    'notify binds showInformationMessage(message, {}, ...actions)',
  );
});

test('extension.ts wires the versionState seam over globalState + packageJSON.version', () => {
  const src = extensionSource();
  assert.match(src, /context\.extension\.packageJSON\.version/, 'current from packageJSON.version');
  assert.match(src, /context\.globalState\.get<string>\(LAST_SEEN_PLUGIN_VERSION_KEY\)/, 'getLastSeen from globalState');
  assert.match(src, /context\.globalState\.update\(LAST_SEEN_PLUGIN_VERSION_KEY,\s*v\)/, 'setLastSeen to globalState');
});

test('extension.ts wires gitLsRemote to a child_process git ls-remote (no pull, k1)', () => {
  const src = extensionSource();
  assert.match(src, /from 'node:child_process'/, 'imports child_process');
  assert.match(src, /execFile\('git',\s*\['-C',\s*root,\s*'ls-remote',\s*'origin',\s*branch\]/, 'runs git ls-remote origin <branch>');
});

test('extension.ts consumes the daemon-owned sc1 IPC (client), never a controller.run(\'update\') shell-out (k2)', () => {
  const src = extensionSource();
  // Extract exactly the runDaemonFreshnessCheck({ ... }); deps block and assert on
  // its contents (not the whole file), so the k2 check is scoped to the flow wiring.
  const block = /void runDaemonFreshnessCheck\(\{([\s\S]*?)\n  \}\);/.exec(src);
  assert.ok(block, 'the runDaemonFreshnessCheck({ ... }); block is present');
  const depsBlock = block![1]!;
  assert.match(depsBlock, /(^|\W)client,/, 'the freshness deps pass the shared ipc client');
  assert.doesNotMatch(depsBlock, /controller\.run\(/, 'no controller.run shell-out inside the freshness deps (k2)');
  assert.doesNotMatch(depsBlock, /daemon-ctl\.sh/, 'no daemon-ctl.sh shell-out inside the freshness deps (k2)');
});

test('the new globalState key constant is defined and referenced for lastSeen persistence', () => {
  const src = extensionSource();
  assert.match(
    src,
    /const LAST_SEEN_PLUGIN_VERSION_KEY\s*=\s*'insrc\.daemonSelfUpdate\.lastSeenPluginVersion'/,
    'the lastSeen key constant is defined',
  );
});
