/**
 * Story E20260921ad0d45c9:S003 / t3 — registerHostCommands: combined consent,
 * wire-only-on-accepted, failing-adapter isolation, status push, k5 source-scan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { registerHostCommands } from '../commands.js';
import { HostFileAccessError } from '../fs.js';
import type { CommandRegistry, CommandDescriptor } from '../../surfaces/command-registry.js';
import type { ConsentGate, ConsentOutcome, ConsentRequest } from '../../surfaces/consent-gate.js';
import type { StatusSurface, StatusSnapshot } from '../../surfaces/status-surface.js';
import type { AiHostAdapter, AiHostRegistry } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOSTS_SRC = join(HERE, '..');

// ---- fakes -----------------------------------------------------------------

function fakeCommands(): { registry: CommandRegistry; run: (id: string) => Promise<void> } {
  const bodies = new Map<string, () => Promise<void>>();
  return {
    registry: {
      register(descriptor: CommandDescriptor, body: () => Promise<void>): void {
        bodies.set(descriptor.id, body);
      },
    },
    run: (id) => bodies.get(id)!(),
  };
}

function fakeConsent(outcome: ConsentOutcome): { gate: ConsentGate; asked: ConsentRequest[] } {
  const asked: ConsentRequest[] = [];
  return {
    gate: { async ask(req: ConsentRequest): Promise<ConsentOutcome> { asked.push(req); return outcome; } },
    asked,
  };
}

function fakeStatus(): { surface: StatusSurface; sets: StatusSnapshot[] } {
  const sets: StatusSnapshot[] = [];
  let snap: StatusSnapshot = { state: 'unknown' };
  return {
    surface: {
      set(next: StatusSnapshot): void { snap = next; sets.push(next); },
      current(): StatusSnapshot { return snap; },
    },
    sets,
  };
}

function fakeAdapter(displayName: string, wire: () => Promise<void>): AiHostAdapter & { wired: boolean } {
  const a = {
    descriptor: { id: displayName.toLowerCase(), displayName, detection: { kind: 'by-extension-id', extensionId: 'x' } as const },
    wired: false,
    async detectPresent(): Promise<boolean> { return true; },
    async wire(): Promise<void> { await wire(); a.wired = true; },
    async unwire(): Promise<void> {},
  };
  return a;
}

function fakeRegistry(present: AiHostAdapter[]): AiHostRegistry {
  return { adapters: () => present, detectPresent: async () => present };
}

// ---- tests -----------------------------------------------------------------

test('registerHostCommands registers the insrc.hosts.wire command into the registry', () => {
  const cmds = fakeCommands();
  const registered: string[] = [];
  const registry: CommandRegistry = { register: (d) => { registered.push(d.id); } };
  registerHostCommands({ commands: registry, consent: fakeConsent('dismissed').gate, status: fakeStatus().surface, registry: fakeRegistry([]) });
  assert.deepEqual(registered, ['insrc.hosts.wire']);
  void cmds;
});

test('the wire command asks ONE combined consent (items = detected displayNames) and wires NONE until accepted', async () => {
  for (const outcome of ['declined', 'dismissed'] as const) {
    const cmds = fakeCommands();
    const consent = fakeConsent(outcome);
    const status = fakeStatus();
    const a = fakeAdapter('Claude Code', async () => {});
    const b = fakeAdapter('Cursor', async () => {});
    registerHostCommands({ commands: cmds.registry, consent: consent.gate, status: status.surface, registry: fakeRegistry([a, b]) });
    await cmds.run('insrc.hosts.wire');

    assert.equal(consent.asked.length, 1, 'exactly one combined prompt');
    assert.deepEqual(consent.asked[0]!.items, ['Claude Code', 'Cursor'], 'items = every detected displayName');
    assert.equal(a.wired, false, `nothing wired on ${outcome}`);
    assert.equal(b.wired, false, `nothing wired on ${outcome}`);
  }
});

test('on accepted every detected adapter.wire() runs; a failing adapter does not abort the others; the outcome is pushed to sc2', async () => {
  const cmds = fakeCommands();
  const consent = fakeConsent('accepted');
  const status = fakeStatus();
  const ok1 = fakeAdapter('Claude Code', async () => {});
  const bad = fakeAdapter('Cursor', async () => { throw new HostFileAccessError('read-only'); });
  const ok2 = fakeAdapter('Windsurf', async () => {});
  registerHostCommands({ commands: cmds.registry, consent: consent.gate, status: status.surface, registry: fakeRegistry([ok1, bad, ok2]) });
  await cmds.run('insrc.hosts.wire');

  assert.equal(ok1.wired, true);
  assert.equal(ok2.wired, true, 'a failing adapter did not abort the ones after it');
  assert.equal(bad.wired, false, 'the failing adapter is not marked wired');
  const last = status.sets.at(-1)!;
  assert.match(last.detail ?? '', /wired Claude Code, Windsurf/);
  assert.match(last.detail ?? '', /failed Cursor/);
});

test('no supported host present → the command sets a "no hosts detected" status and wires nothing', async () => {
  const cmds = fakeCommands();
  const consent = fakeConsent('accepted');
  const status = fakeStatus();
  registerHostCommands({ commands: cmds.registry, consent: consent.gate, status: status.surface, registry: fakeRegistry([]) });
  await cmds.run('insrc.hosts.wire');

  assert.equal(consent.asked.length, 0, 'no prompt when nothing is present');
  assert.match(status.sets.at(-1)!.detail ?? '', /no supported AI hosts detected/);
});

test('source-scan: vscode-plugin/src/hosts/ imports only node builtins + the s1 surfaces (+ shared local modules) — no daemon internals/indexer/storage, no cloud/HTTP (k5)', () => {
  const allowedNode = new Set(['node:fs', 'node:os', 'node:path', 'node:url']);
  for (const f of readdirSync(HOSTS_SRC)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(HOSTS_SRC, f), 'utf8');
    assert.doesNotMatch(src, /https?:\/\//, `${f} opens no cloud/HTTP path`);
    assert.doesNotMatch(src, /\bfetch\(|undici|axios\b/, `${f} makes no HTTP call`);
    for (const line of src.split('\n')) {
      const m = line.match(/from '([^']+)'/);
      if (!m) continue;
      const spec = m[1]!;
      const ok = allowedNode.has(spec) || spec.startsWith('./') || spec.startsWith('../surfaces/');
      assert.ok(ok, `${f}: unexpected import ${spec} (k5 thin boundary — no daemon internals/indexer/storage/vscode)`);
    }
  }
});
