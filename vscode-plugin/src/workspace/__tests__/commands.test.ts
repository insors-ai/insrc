/**
 * Story E20260921ad0d45c9:S004 / t2 — registerWorkspaceCommands +
 * offerWorkspaceRegistration: consent-gated, one-time, never silent + k5 scan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { registerWorkspaceCommands, offerWorkspaceRegistration } from '../commands.js';
import { createInMemoryPromptStore } from '../types.js';
import type { RegistrationState, WorkspaceRegistrar } from '../types.js';
import type { CommandRegistry, CommandDescriptor } from '../../surfaces/command-registry.js';
import type { ConsentGate, ConsentOutcome, ConsentRequest } from '../../surfaces/consent-gate.js';
import type { StatusSurface, StatusSnapshot } from '../../surfaces/status-surface.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WS_SRC = join(HERE, '..');
const ROOT = '/home/u/projects/app';

function fakeConsent(outcome: ConsentOutcome): { gate: ConsentGate; asked: ConsentRequest[] } {
  const asked: ConsentRequest[] = [];
  return { gate: { async ask(r) { asked.push(r); return outcome; } }, asked };
}
function fakeStatus(): { surface: StatusSurface; sets: StatusSnapshot[] } {
  const sets: StatusSnapshot[] = [];
  let snap: StatusSnapshot = { state: 'unknown' };
  return { surface: { set: (n) => { snap = n; sets.push(n); }, current: () => snap }, sets };
}
function fakeRegistrar(opts: { registered?: boolean; registerThrows?: boolean }): WorkspaceRegistrar & { registerCalls: string[] } {
  const registerCalls: string[] = [];
  return {
    registerCalls,
    async state(root): Promise<RegistrationState> { return { root, registered: opts.registered ?? false }; },
    async register(root): Promise<RegistrationState> {
      registerCalls.push(root);
      if (opts.registerThrows) throw new Error('rejected repo.add: invalid path');
      return { root, registered: true };
    },
  };
}

test('registerWorkspaceCommands registers the insrc.workspace.register command into the registry', () => {
  const ids: string[] = [];
  const commands: CommandRegistry = { register: (d: CommandDescriptor) => { ids.push(d.id); } };
  registerWorkspaceCommands({
    commands, consent: fakeConsent('dismissed').gate, status: fakeStatus().surface,
    registrar: fakeRegistrar({}), folders: () => [ROOT],
  });
  assert.deepEqual(ids, ['insrc.workspace.register']);
});

test('offerWorkspaceRegistration shows NO prompt when no root is open, when already registered, or when previously dismissed (lc1)', async () => {
  // no folder open
  const c1 = fakeConsent('accepted');
  await offerWorkspaceRegistration({ consent: c1.gate, status: fakeStatus().surface, registrar: fakeRegistrar({}), folders: () => [], prompts: createInMemoryPromptStore() });
  assert.equal(c1.asked.length, 0, 'no folder → no prompt');

  // already registered
  const c2 = fakeConsent('accepted');
  await offerWorkspaceRegistration({ consent: c2.gate, status: fakeStatus().surface, registrar: fakeRegistrar({ registered: true }), folders: () => [ROOT], prompts: createInMemoryPromptStore() });
  assert.equal(c2.asked.length, 0, 'already registered → no prompt');

  // previously dismissed
  const c3 = fakeConsent('accepted');
  const prompts = createInMemoryPromptStore();
  prompts.markDismissed(ROOT);
  await offerWorkspaceRegistration({ consent: c3.gate, status: fakeStatus().surface, registrar: fakeRegistrar({}), folders: () => [ROOT], prompts });
  assert.equal(c3.asked.length, 0, 'previously dismissed → no prompt (lc1)');
});

test('on accepted offerWorkspaceRegistration calls registrar.register(root) exactly once and pushes the outcome to StatusSurface.set', async () => {
  const consent = fakeConsent('accepted');
  const status = fakeStatus();
  const registrar = fakeRegistrar({});
  await offerWorkspaceRegistration({ consent: consent.gate, status: status.surface, registrar, folders: () => [ROOT], prompts: createInMemoryPromptStore() });
  assert.deepEqual(registrar.registerCalls, [ROOT], 'register called exactly once');
  assert.match(status.sets.at(-1)!.detail ?? '', /workspace registered/);
});

test('on declined/dismissed it calls markDismissed(root), NEVER registers, and writes nothing to the registry (k4)', async () => {
  for (const outcome of ['declined', 'dismissed'] as const) {
    const registrar = fakeRegistrar({});
    const prompts = createInMemoryPromptStore();
    await offerWorkspaceRegistration({ consent: fakeConsent(outcome).gate, status: fakeStatus().surface, registrar, folders: () => [ROOT], prompts });
    assert.deepEqual(registrar.registerCalls, [], `nothing registered on ${outcome} (k4)`);
    assert.equal(prompts.wasDismissed(ROOT), true, `dismissal persisted on ${outcome} (lc1)`);
  }
});

test('on an accepted-but-register-fails path it does NOT markDismissed (retryable) and reflects an errored status', async () => {
  const status = fakeStatus();
  const prompts = createInMemoryPromptStore();
  await offerWorkspaceRegistration({ consent: fakeConsent('accepted').gate, status: status.surface, registrar: fakeRegistrar({ registerThrows: true }), folders: () => [ROOT], prompts });
  assert.equal(prompts.wasDismissed(ROOT), false, 'accepted-then-failed is NOT dismissed (retryable)');
  const last = status.sets.at(-1)!;
  assert.equal(last.state, 'errored');
  assert.match(last.detail ?? '', /registration failed/);
});

test('the durable command offers even when previously dismissed (k6 — a dismissed prompt stays actionable)', async () => {
  const consent = fakeConsent('accepted');
  const registrar = fakeRegistrar({});
  const commands: { run?: () => Promise<void> } = {};
  registerWorkspaceCommands({
    commands: { register: (_d, run) => { commands.run = run; } },
    consent: consent.gate, status: fakeStatus().surface, registrar, folders: () => [ROOT],
  });
  await commands.run!();
  assert.equal(consent.asked.length, 1, 'the command asks regardless of any dismissed flag');
  assert.deepEqual(registrar.registerCalls, [ROOT]);
});

test('source-scan: vscode-plugin/src/workspace/ imports only node builtins + the shared ipc-client + the s1 surfaces (k5)', () => {
  const allowedNode = new Set(['node:path']);
  for (const f of readdirSync(WS_SRC)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(WS_SRC, f), 'utf8');
    assert.doesNotMatch(src, /https?:\/\//, `${f} opens no cloud/HTTP path`);
    assert.doesNotMatch(src, /\bfetch\(|undici|axios\b/, `${f} makes no HTTP call`);
    for (const line of src.split('\n')) {
      const m = line.match(/from '([^']+)'/);
      if (!m) continue;
      const spec = m[1]!;
      const ok =
        allowedNode.has(spec) ||
        spec.startsWith('./') ||
        spec.startsWith('../surfaces/') ||
        spec === '../../../src/shared/ipc-client.js';
      assert.ok(ok, `${f}: unexpected import ${spec} (k5 thin boundary — no daemon internals/indexer/storage/vscode)`);
    }
  }
});
