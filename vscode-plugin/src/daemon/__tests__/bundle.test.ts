/**
 * Story E20260921ad0d45c9:S002 / t3+t4 — bundle-fidelity + activation-wiring source scan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..', '..', '..'); // vscode-plugin/
const REPO = join(PKG, '..'); // repo root

// ---- t3: bundle fidelity + repeatable copy step ---------------------------

test('the bundled installer asset byte-matches scripts/insrc-daemon-install.sh (no drift)', () => {
  const source = readFileSync(join(REPO, 'scripts', 'insrc-daemon-install.sh'));
  const bundled = readFileSync(join(PKG, 'assets', 'insrc-daemon-install.sh'));
  assert.ok(source.equals(bundled), 'assets/insrc-daemon-install.sh must byte-match scripts/insrc-daemon-install.sh (run `npm run sync-assets`)');
});

test('the asset is produced by a repeatable copy step, not a one-off manual copy', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  assert.match(pkg.scripts?.['sync-assets'] ?? '', /insrc-daemon-install\.sh/, 'a sync-assets script regenerates the bundled installer');
  assert.match(pkg.scripts?.build ?? '', /sync-assets/, 'build runs sync-assets so the asset stays in sync');
});

test('the five daemon commands are declared in contributes.commands so they are Command-Palette reachable (k6)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  const ids = new Set((pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command));
  // Subset check: later stories (S003 host wiring, …) add their own commands to
  // the same array — assert the five daemon entries are present, not the exact set.
  for (const id of ['insrc.daemon.install', 'insrc.daemon.start', 'insrc.daemon.stop', 'insrc.daemon.restart', 'insrc.daemon.update']) {
    assert.ok(ids.has(id), `${id} must stay palette-reachable (k6 — a dismissed Install offer has no dead end)`);
  }
});

// ---- t4: activation wiring uses the daemon lifecycle over injectable seams -

test('extension.ts wires the daemon controller (real runner + DaemonPaths from extensionPath) + the Install offer', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  assert.match(entry, /createDaemonLifecycleController\(/, 'constructs the sc6 controller');
  assert.match(entry, /defaultDaemonPaths\(context\.extensionPath\)/, 'resolves DaemonPaths from context.extensionPath');
  assert.match(entry, /registerDaemonCommands\(/, 'registers the durable lifecycle commands');
  assert.match(entry, /offerDaemonInstall\(/, 'fires the activation-time Install offer');
  // The offer must be off the critical path (fire-and-forget) + guarded so activate never throws.
  assert.match(entry, /void \(async \(\) =>/, 'the Install offer is fire-and-forget (does not block activate)');
  assert.match(entry, /catch \{/, 'the Install offer is guarded so activation never throws');
});
