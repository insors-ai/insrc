/**
 * Story E20260921ad0d45c9:S005 / t3 — activation rewrite + k5 scan + uninstall hook.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ONBOARDING_SRC = join(HERE, '..');
const PKG = join(HERE, '..', '..', '..'); // vscode-plugin/

test('extension.ts calls runOnboarding exactly ONCE (guarded fire-and-forget) and NO LONGER fires the three separate offer IIFEs', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  assert.match(entry, /runOnboarding\(\{ controller, registrar, registry, consent, status, folders, prompts, onboarded \}\)/, 'one coalesced runOnboarding call');
  // The scattered offers no longer run directly from activation.
  assert.doesNotMatch(entry, /await offerDaemonInstall\(/, 'offerDaemonInstall no longer fired directly from activation');
  assert.doesNotMatch(entry, /await offerHostWiring\(/, 'offerHostWiring no longer fired directly from activation');
  assert.doesNotMatch(entry, /await offerWorkspaceRegistration\(/, 'offerWorkspaceRegistration no longer fired directly from activation');
  // Exactly one fire-and-forget IIFE remains (the guarded onboarding call).
  const iifes = entry.match(/void \(async \(\) =>/g) ?? [];
  assert.equal(iifes.length, 1, 'the three scattered offer IIFEs collapse into one');
  assert.match(entry, /void \(async \(\) =>[\s\S]*runOnboarding[\s\S]*catch \{/, 'the onboarding call is fire-and-forget + guarded (S001 never-throws)');
  // The OnboardingStore is built over workspaceState, distinct key from the S004 dismissed flag.
  assert.match(entry, /ONBOARDED_KEY/, 'the onboarded flag uses a distinct workspaceState key');
  assert.match(entry, /context\.workspaceState\.(get|update)/, 'the OnboardingStore persists via context.workspaceState');
});

test('package.json declares scripts["vscode:uninstall"] = "node ./out/uninstall.js" (the ac3 hook)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts?.['vscode:uninstall'], 'node ./out/uninstall.js');
});

test('the S002/S003/S004 durable commands remain in contributes.commands (subset check, k6)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  const ids = new Set((pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command));
  for (const id of ['insrc.daemon.install', 'insrc.daemon.start', 'insrc.daemon.stop', 'insrc.daemon.restart', 'insrc.daemon.update', 'insrc.hosts.wire', 'insrc.workspace.register']) {
    assert.ok(ids.has(id), `${id} must stay palette-reachable (k6)`);
  }
});

test('source-scan: vscode-plugin/src/onboarding/ imports only node builtins + the shipped daemon/hosts/workspace command modules + the s1 surfaces (k5)', () => {
  const allowedNode = new Set(['node:fs', 'node:os', 'node:path', 'node:url']);
  for (const f of readdirSync(ONBOARDING_SRC)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(ONBOARDING_SRC, f), 'utf8');
    assert.doesNotMatch(src, /from 'vscode'/, `${f} must not import vscode`);
    assert.doesNotMatch(src, /https?:\/\//, `${f} opens no cloud/HTTP path`);
    for (const line of src.split('\n')) {
      const m = line.match(/from '([^']+)'/);
      if (!m) continue;
      const s = m[1]!;
      const ok =
        allowedNode.has(s) ||
        s.startsWith('./') ||
        s.startsWith('../daemon/') ||
        s.startsWith('../hosts/') ||
        s.startsWith('../workspace/') ||
        s.startsWith('../surfaces/');
      assert.ok(ok, `${f}: unexpected import ${s} (k5 thin boundary — no daemon internals/indexer/storage/vscode)`);
    }
  }
});
