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

test('the activation-time offerWorkspaceRegistration is fire-and-forget + guarded (never throws/blocks, S001)', () => {
  const entry = readFileSync(join(PKG, 'src', 'extension.ts'), 'utf8');
  assert.match(entry, /offerWorkspaceRegistration\(\{ consent, status, registrar, folders, prompts \}\)/, 'the offer runs the shared flow');
  assert.match(entry, /void \(async \(\) =>[\s\S]*offerWorkspaceRegistration[\s\S]*catch \{/, 'the register offer is fire-and-forget + guarded');
});

test('contributes.commands includes insrc.workspace.register alongside the S002 daemon + S003 hosts entries (k6)', () => {
  const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
  const ids = (pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command).sort();
  assert.deepEqual(ids, [
    'insrc.daemon.install', 'insrc.daemon.restart', 'insrc.daemon.start', 'insrc.daemon.stop', 'insrc.daemon.update',
    'insrc.hosts.wire', 'insrc.workspace.register',
  ], 'the register command is palette-reachable and the S002/S003 entries are untouched');
});
