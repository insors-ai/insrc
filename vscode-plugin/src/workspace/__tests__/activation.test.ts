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

test('S004 sc9: extension.ts wires the status-bar click + both panels as first-class commands (ac1/ac3)', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  // The status-bar item's click opens the 2-item menu (the raw item's command; sc2 handle untouched).
  assert.match(entry, /statusItem\.command\s*=\s*'insrc\.status\.menu'/, 'the status-bar item command is insrc.status.menu (ac1)');
  // The host + gateway are built over the shared client + the panel factory/menu picker.
  assert.match(entry, /createDaemonDataGateway\(\{/, 'the read-only DaemonDataGateway is constructed');
  assert.match(entry, /createWebviewPanelHost\(\{/, 'the WebviewPanelHost is constructed');
  // Each of the three commands is registered via the sc3 registry (menu + 2 panels, ac3).
  for (const id of ['insrc.status.menu', 'insrc.status.detailed', 'insrc.status.repoConfig']) {
    assert.match(entry, new RegExp(`register\\(\\{\\s*id:\\s*'${id.replace(/\./g, '\\.')}'`), `${id} is registered`);
  }
});

test('S004 sc9: both panel commands are palette-reachable (k6) and the menu command is not', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  const ids = (pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command);
  assert.ok(ids.includes('insrc.status.detailed'), 'Open Detailed Status is palette-reachable (k6)');
  assert.ok(ids.includes('insrc.status.repoConfig'), 'Open Repo Configuration is palette-reachable (k6)');
  assert.ok(!ids.includes('insrc.status.menu'), 'the status-bar menu command is not a palette entry');
});
