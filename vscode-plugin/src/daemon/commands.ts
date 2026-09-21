/**
 * Story E20260921ad0d45c9:S002 / t2 — the daemon-lifecycle command wiring (sc6).
 *
 * Registers the five durable insrc.daemon.* commands into sc3 (so a dismissed
 * prompt is never a dead end, k6). The Install command is prompt-gated by sc4
 * (nothing provisions until 'accepted', k4); the four lifecycle actions act on an
 * already-installed daemon (no gate). Every command pushes its resulting
 * LifecycleResult.state into the sc2 status surface.
 */
import type { CommandRegistry, InsrcCommandId } from '../surfaces/command-registry.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';
import type { DaemonLifecycleController, LifecycleAction, LifecycleResult } from './controller.js';

export interface DaemonCommandDeps {
  commands: CommandRegistry;
  consent: ConsentGate;
  status: StatusSurface;
  controller: DaemonLifecycleController;
}

/** The four lifecycle actions and their durable command ids + titles. */
const LIFECYCLE: ReadonlyArray<{ id: InsrcCommandId; title: string; action: LifecycleAction }> = [
  { id: 'insrc.daemon.start', title: 'insrc: Start daemon', action: 'start' },
  { id: 'insrc.daemon.stop', title: 'insrc: Stop daemon', action: 'stop' },
  { id: 'insrc.daemon.restart', title: 'insrc: Restart daemon', action: 'restart' },
  { id: 'insrc.daemon.update', title: 'insrc: Update daemon', action: 'update' },
];

/** Reflect a lifecycle outcome in the status surface. */
function reflect(status: StatusSurface, result: LifecycleResult): void {
  status.set({ state: result.state, detail: result.message });
}

/**
 * The prompt-gated Install flow, shared by the durable insrc.daemon.install
 * command and the activation-time Install offer: ask sc4, and provision via the
 * controller ONLY on 'accepted' (k4), reflecting the result in sc2. Performs
 * nothing on decline/dismiss.
 */
export async function offerDaemonInstall(
  deps: Pick<DaemonCommandDeps, 'consent' | 'status' | 'controller'>,
): Promise<void> {
  const outcome = await deps.consent.ask({
    title: 'Install the insrc daemon?',
    detail: 'insrc runs a local background daemon. This provisions it from an installer bundled with the extension (Node.js 20+ and git required). Nothing is installed until you accept.',
    acceptLabel: 'Install',
  });
  if (outcome !== 'accepted') return;
  reflect(deps.status, await deps.controller.install());
}

/**
 * Register the daemon lifecycle commands. The Install command runs the shared
 * consent-gated install flow; the four lifecycle commands act on an
 * already-installed daemon (no gate). Every command reflects its result in sc2.
 */
export function registerDaemonCommands(deps: DaemonCommandDeps): void {
  const { commands, consent, status, controller } = deps;

  commands.register({ id: 'insrc.daemon.install', title: 'insrc: Install daemon' }, async () => {
    await offerDaemonInstall({ consent, status, controller });
  });

  for (const { id, title, action } of LIFECYCLE) {
    commands.register({ id, title }, async () => {
      reflect(status, await controller.run(action));
    });
  }
}
