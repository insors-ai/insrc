/**
 * Story E20260921ad0d45c9:S005 / t1 — runOnboarding orchestration.
 * The REAL offers run over injected fakes; we observe order + gating via the fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runOnboarding, type OnboardingDeps } from '../onboarding.js';
import { createInMemoryOnboardingStore } from '../types.js';
import type { DaemonLifecycleController } from '../../daemon/controller.js';
import type { AiHostAdapter, AiHostRegistry } from '../../hosts/types.js';
import type { ConsentGate, ConsentOutcome, ConsentRequest } from '../../surfaces/consent-gate.js';
import type { StatusSurface, StatusSnapshot } from '../../surfaces/status-surface.js';
import { createInMemoryPromptStore } from '../../workspace/types.js';
import type { RegistrationState, WorkspaceRegistrar } from '../../workspace/types.js';

const ROOT = '/home/u/projects/app';

/** A consent gate whose outcome is decided per prompt by matching the title. */
function fakeConsent(decide: (title: string) => ConsentOutcome): { gate: ConsentGate; asked: ConsentRequest[] } {
  const asked: ConsentRequest[] = [];
  return { gate: { async ask(r) { asked.push(r); return decide(r.title); } }, asked };
}
function fakeStatus(): StatusSurface {
  let snap: StatusSnapshot = { state: 'unknown' };
  return { set: (n) => { snap = n; }, current: () => snap };
}
function fakeController(installed: boolean): DaemonLifecycleController & { installs: number } {
  const c = {
    installs: 0,
    async isInstalled(): Promise<boolean> { return installed; },
    async install() { c.installs += 1; return { ok: true as const, state: 'running' as const }; },
    async run() { return { ok: true as const, state: 'running' as const }; },
  };
  return c;
}
function fakeRegistrar(registered: boolean, opts: { registerThrows?: boolean } = {}): WorkspaceRegistrar & { registers: number } {
  let reg = registered; // state() reflects a successful register()
  const r = {
    registers: 0,
    async state(root: string): Promise<RegistrationState> { return { root, registered: reg }; },
    async register(root: string): Promise<RegistrationState> {
      r.registers += 1;
      if (opts.registerThrows) throw new Error('rejected repo.add: invalid path');
      reg = true;
      return { root, registered: true };
    },
  };
  return r;
}
function fakeRegistry(hostPresent: boolean): AiHostRegistry & { wires: number } {
  const wires = { n: 0 };
  const adapter: AiHostAdapter = {
    descriptor: { id: 'h', displayName: 'Test Host', detection: { kind: 'by-extension-id', extensionId: 'h' } },
    async detectPresent() { return true; },
    async wire() { wires.n += 1; },
    async unwire() {},
  };
  const present = hostPresent ? [adapter] : [];
  return { adapters: () => present, detectPresent: async () => present, get wires() { return wires.n; } } as AiHostRegistry & { wires: number };
}
function deps(over: Partial<OnboardingDeps> & { installed?: boolean; registered?: boolean; registerThrows?: boolean; host?: boolean; decide?: (t: string) => ConsentOutcome; root?: string }): {
  d: OnboardingDeps; asked: ConsentRequest[]; controller: ReturnType<typeof fakeController>; registrar: ReturnType<typeof fakeRegistrar>; registry: ReturnType<typeof fakeRegistry>;
} {
  const controller = fakeController(over.installed ?? false);
  const registrar = fakeRegistrar(over.registered ?? false, { ...(over.registerThrows !== undefined ? { registerThrows: over.registerThrows } : {}) });
  const registry = fakeRegistry(over.host ?? true);
  const consent = fakeConsent(over.decide ?? (() => 'accepted'));
  const rootVal = over.root === undefined ? ROOT : over.root;
  const d: OnboardingDeps = {
    controller, registrar, registry,
    consent: consent.gate,
    status: fakeStatus(),
    folders: () => (rootVal === '' ? [] : [rootVal]),
    prompts: over.prompts ?? createInMemoryPromptStore(),
    onboarded: over.onboarded ?? createInMemoryOnboardingStore(),
  };
  return { d, asked: consent.asked, controller, registrar, registry };
}

const kind = (t: string): string => (/install/i.test(t) ? 'install' : /register/i.test(t) ? 'register' : /wire/i.test(t) ? 'wire' : t);

test('runOnboarding awaits the three offers IN ORDER install->register->wire, then markOnboarded(root)', async () => {
  const onboarded = createInMemoryOnboardingStore();
  const { d, asked, controller, registrar, registry } = deps({ installed: false, registered: false, host: true, onboarded });
  await runOnboarding(d);
  assert.deepEqual(asked.map((r) => kind(r.title)), ['install', 'register', 'wire'], 'coherent ordered sequence, not concurrent');
  assert.equal(controller.installs, 1);
  assert.equal(registrar.registers, 1);
  assert.equal(registry.wires, 1);
  assert.equal(onboarded.wasOnboarded(ROOT), true, 'markOnboarded after a rooted run');
});

test('runOnboarding no-ops (no offer runs, no prompt) when the workspace is already onboarded', async () => {
  const onboarded = createInMemoryOnboardingStore();
  onboarded.markOnboarded(ROOT);
  const { d, asked, controller, registrar, registry } = deps({ onboarded });
  await runOnboarding(d);
  assert.equal(asked.length, 0, 'no prompts');
  assert.equal(controller.installs + registrar.registers + registry.wires, 0);
});

test('a step that internally no-ops is silently skipped while the needed steps still run', async () => {
  // Already installed + already registered + no host present -> only the (no-op) steps skip; nothing prompts.
  const { d, asked } = deps({ installed: true, registered: true, host: false });
  await runOnboarding(d);
  assert.deepEqual(asked.map((r) => kind(r.title)), [], 'every step self-guarded to a no-op -> no prompts');
});

test('one step throwing does NOT abort the sequence; the later steps still run; runOnboarding never throws', async () => {
  // consent.ask throws for the INSTALL prompt only; register + wire still fire.
  const decide = (t: string): ConsentOutcome => { if (/install/i.test(t)) throw new Error('boom in install'); return 'accepted'; };
  const { d, asked, registrar, registry } = deps({ installed: false, registered: false, host: true, decide });
  await runOnboarding(d); // must not throw
  const kinds = asked.map((r) => kind(r.title));
  assert.ok(kinds.includes('register') && kinds.includes('wire'), 'later steps ran despite the install step throwing');
  assert.equal(registrar.registers, 1);
  assert.equal(registry.wires, 1);
});

test('no workspace folder open -> register is skipped and markOnboarded is NOT set, while global install/wire still run', async () => {
  const onboarded = createInMemoryOnboardingStore();
  const { d, asked, controller, registrar, registry } = deps({ root: '', installed: false, host: true, onboarded });
  await runOnboarding(d);
  const kinds = asked.map((r) => kind(r.title));
  assert.ok(kinds.includes('install') && kinds.includes('wire'), 'global steps run with no folder open');
  assert.equal(kinds.includes('register'), false, 'register skipped with no root');
  assert.equal(registrar.registers, 0);
  assert.equal(controller.installs, 1);
  assert.equal(registry.wires, 1);
  assert.equal(onboarded.wasOnboarded(''), false, 'no per-root onboarded flag when no folder open');
});

test('an accepted-but-register-FAILS first run does NOT mark onboarded (retryable) — a transient failure never permanently suppresses the register prompt', async () => {
  const onboarded = createInMemoryOnboardingStore();
  const { d, registrar } = deps({ installed: false, registered: false, registerThrows: true, host: true, onboarded });
  await runOnboarding(d);
  assert.equal(registrar.registers, 1, 'register was attempted (accepted)');
  assert.equal(onboarded.wasOnboarded(ROOT), false, 'a failed register leaves the workspace un-onboarded so the sequence re-runs + re-prompts');
});

test('a DECLINED register (persisted dismissal) DOES settle the workspace as onboarded (no infinite re-prompt)', async () => {
  const onboarded = createInMemoryOnboardingStore();
  // Decline only register; install/wire accepted. offerWorkspaceRegistration persists the dismissal.
  const decide = (t: string): ConsentOutcome => (/register/i.test(t) ? 'declined' : 'accepted');
  const { d } = deps({ installed: false, registered: false, host: true, decide, onboarded });
  await runOnboarding(d);
  assert.equal(onboarded.wasOnboarded(ROOT), true, 'a declined (dismissed) register settles onboarding — the register step self-suppresses thereafter');
});

test('each step keeps its OWN sc4 consent (no mega-consent): declining install still offers register + wire (k4)', async () => {
  const decide = (t: string): ConsentOutcome => (/install/i.test(t) ? 'declined' : 'accepted');
  const { d, asked, controller, registrar, registry } = deps({ installed: false, registered: false, host: true, decide });
  await runOnboarding(d);
  assert.deepEqual(asked.map((r) => kind(r.title)), ['install', 'register', 'wire'], 'all three prompted independently');
  assert.equal(controller.installs, 0, 'declined install did NOT install');
  assert.equal(registrar.registers, 1, 'register still offered + accepted after install was declined');
  assert.equal(registry.wires, 1);
});
