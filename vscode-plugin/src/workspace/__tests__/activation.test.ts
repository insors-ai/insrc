/**
 * Story E20260921ad0d45c9:S004 / t3 — extension.ts workspace wiring +
 * contributes.commands palette reachability (source scan, mirroring S002/S003).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..', '..', '..'); // vscode-plugin/

test('extension.ts constructs the WorkspaceRegistrar over the shared client + real WorkspaceFolders/PromptStore and wires registerWorkspaceCommands with the s1 surfaces', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  assert.match(entry, /createWorkspaceRegistrar\(\{\s*client\s*\}\)/, 'registrar built over the shared client (no new IPC)');
  assert.match(entry, /vscode\.workspace\.workspaceFolders\?\.map\(/, 'real WorkspaceFolders from vscode.workspace.workspaceFolders');
  assert.match(entry, /context\.workspaceState\.(get|update)/, 'PromptStore persists via context.workspaceState');
  assert.match(entry, /registerWorkspaceCommands\(\{\s*commands,\s*consent,\s*status,\s*registrar,\s*folders\s*\}\)/, 'wires the durable command with the s1 surfaces');
});

test('the activation-time workspace register runs through the guarded runOnboarding sequence (S005 coalescing; S001 never-throws)', () => {
  // S005 replaced the standalone activation-time offerWorkspaceRegistration IIFE
  // with the coalesced runOnboarding capstone, which drives the register step
  // (over the same registrar/folders/prompts) inside one guarded fire-and-forget IIFE.
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  assert.match(entry, /runOnboarding\(\{[^}]*registrar[^}]*folders[^}]*prompts[^}]*\}\)/, 'the register step flows through runOnboarding');
  assert.match(entry, /void \(async \(\) =>[\s\S]*runOnboarding[\s\S]*catch \{/, 'onboarding (incl. the register step) is fire-and-forget + guarded');
});

test('contributes.commands includes insrc.workspace.register alongside the S002 daemon + S003 hosts entries (k6)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  const ids = (pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command);
  // Subset check: the config-track (settings-UI epic) appends insrc.settings.refresh.
  for (const id of [
    'insrc.daemon.install', 'insrc.daemon.restart', 'insrc.daemon.start', 'insrc.daemon.stop', 'insrc.daemon.update',
    'insrc.hosts.wire', 'insrc.workspace.register',
  ]) {
    assert.ok(ids.includes(id), `${id} must stay palette-reachable (k6)`);
  }
});
