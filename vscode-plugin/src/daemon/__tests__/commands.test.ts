/**
 * Story E20260921ad0d45c9:S002 / t2 — registerDaemonCommands wiring tests.
 * Fake sc2/sc3/sc4 + a fake controller; no real shell/daemon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { registerDaemonCommands, restartDaemonAndReport } from '../commands.js';
import type { CommandRegistry, CommandDescriptor, InsrcCommandId } from '../../surfaces/command-registry.js';
import type { ConsentGate, ConsentOutcome, ConsentRequest } from '../../surfaces/consent-gate.js';
import type { StatusSurface, StatusSnapshot } from '../../surfaces/status-surface.js';
import type { DaemonLifecycleController, LifecycleAction, LifecycleResult } from '../controller.js';

class FakeCommands implements CommandRegistry {
  public runs = new Map<InsrcCommandId, () => Promise<void>>();
  register(descriptor: CommandDescriptor, run: () => Promise<void>): void {
    this.runs.set(descriptor.id, run);
  }
}

class FakeStatus implements StatusSurface {
  public snapshots: StatusSnapshot[] = [];
  set(s: StatusSnapshot): void { this.snapshots.push(s); }
  current(): StatusSnapshot { return this.snapshots.at(-1) ?? { state: 'unknown' }; }
}

function fakeConsent(outcome: ConsentOutcome): ConsentGate & { asked: ConsentRequest[] } {
  const asked: ConsentRequest[] = [];
  return { asked, async ask(req: ConsentRequest): Promise<ConsentOutcome> { asked.push(req); return outcome; } };
}

function fakeController(overrides?: Partial<DaemonLifecycleController>): DaemonLifecycleController & { installs: number; runs: LifecycleAction[] } {
  const tracker = { installs: 0, runs: [] as LifecycleAction[] };
  const base: DaemonLifecycleController = {
    isInstalled: async () => true,
    install: async (): Promise<LifecycleResult> => { tracker.installs++; return { ok: true, state: 'running' }; },
    run: async (action: LifecycleAction): Promise<LifecycleResult> => { tracker.runs.push(action); return { ok: true, state: action === 'stop' ? 'stopped' : 'running' }; },
    ...overrides,
  };
  // Live getters so the test observes the closure's mutations (not a copied snapshot).
  return Object.defineProperties(base, {
    installs: { get: () => tracker.installs },
    runs: { get: () => tracker.runs },
  }) as DaemonLifecycleController & { installs: number; runs: LifecycleAction[] };
}

test('registers exactly the five insrc.daemon.* commands', () => {
  const commands = new FakeCommands();
  registerDaemonCommands({ commands, consent: fakeConsent('accepted'), status: new FakeStatus(), controller: fakeController() });
  assert.deepEqual(
    [...commands.runs.keys()].sort(),
    ['insrc.daemon.install', 'insrc.daemon.restart', 'insrc.daemon.start', 'insrc.daemon.stop', 'insrc.daemon.update'],
  );
});

test('the install command asks sc4 and calls install() ONLY on accepted', async () => {
  for (const [outcome, expectInstalls] of [['accepted', 1], ['declined', 0], ['dismissed', 0]] as const) {
    const commands = new FakeCommands();
    const consent = fakeConsent(outcome);
    const controller = fakeController();
    const status = new FakeStatus();
    registerDaemonCommands({ commands, consent, status, controller });

    await commands.runs.get('insrc.daemon.install')!();
    assert.equal(consent.asked.length, 1, 'the install command always asks first');
    assert.equal(controller.installs, expectInstalls, `install() called ${expectInstalls}x on ${outcome}`);
    if (expectInstalls === 0) assert.equal(status.snapshots.length, 0, 'no status change when not accepted');
  }
});

test('each lifecycle command runs the action (no gate) and pushes the resulting state into sc2', async () => {
  const commands = new FakeCommands();
  const consent = fakeConsent('dismissed'); // must be irrelevant for lifecycle actions
  const controller = fakeController();
  const status = new FakeStatus();
  registerDaemonCommands({ commands, consent, status, controller });

  await commands.runs.get('insrc.daemon.stop')!();
  assert.deepEqual(controller.runs, ['stop']);
  assert.equal(consent.asked.length, 0, 'lifecycle actions are not consent-gated');
  assert.deepEqual(status.current(), { state: 'stopped', detail: undefined });
});

test('a failing action pushes errored + the mapped message into the status surface', async () => {
  const commands = new FakeCommands();
  const controller = fakeController({
    run: async (): Promise<LifecycleResult> => ({ ok: false, state: 'errored', message: 'the daemon checkout has uncommitted or diverged changes' }),
  });
  const status = new FakeStatus();
  registerDaemonCommands({ commands, consent: fakeConsent('accepted'), status, controller });

  await commands.runs.get('insrc.daemon.update')!();
  assert.equal(status.current().state, 'errored');
  assert.match(status.current().detail ?? '', /diverged/);
});

test('commands.test.ts: restartDaemonAndReport resolves true only when the daemon is running again and reflects the result like the restart command', async () => {
  const cases: Array<[LifecycleResult | Error, boolean]> = [
    [{ ok: true, state: 'running' }, true],
    [{ ok: false, state: 'running', message: 'ctl exited 1' }, false],
    [{ ok: true, state: 'stopped' }, false],
    [{ ok: false, state: 'errored', message: 'boom' }, false],
    [new Error('spawn failed'), false],
  ];
  for (const [outcome, expected] of cases) {
    // The adapter.
    const status = new FakeStatus();
    const controller = fakeController({ run: async () => { if (outcome instanceof Error) throw outcome; return outcome; } });
    assert.equal(await restartDaemonAndReport({ status, controller }), expected, JSON.stringify(outcome instanceof Error ? outcome.message : outcome));
    // The restart command, for a non-throwing controller, reflects the same snapshot.
    if (!(outcome instanceof Error)) {
      const viaCommand = new FakeStatus();
      const commands = new FakeCommands();
      registerDaemonCommands({ commands, consent: fakeConsent('accepted'), status: viaCommand, controller: fakeController({ run: async () => outcome }) });
      await commands.runs.get('insrc.daemon.restart')!();
      assert.deepEqual(status.snapshots, viaCommand.snapshots, 'the same status as the restart command');
    } else {
      assert.deepEqual(status.snapshots, [{ state: 'errored', detail: 'spawn failed' }]);
    }
  }
});
