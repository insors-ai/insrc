/**
 * Story E20260921ad0d45c9:S003 / t3 — the host-wiring command wiring (sc5, k4/k6).
 *
 * Registers the durable insrc.hosts.wire command into sc3 (so a dismissed prompt
 * is never a dead end, k6). On run: detect present hosts, present ONE combined
 * sc4 consent naming them, and wire each ONLY on 'accepted' (k4). A failing
 * adapter (HostFileAccessError) does not abort the others; the aggregate outcome
 * is pushed into sc2. Mirrors S002's registerDaemonCommands + offerDaemonInstall.
 */
import type { CommandRegistry } from '../surfaces/command-registry.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';
import type { AiHostRegistry } from './types.js';

export interface HostCommandDeps {
  commands: CommandRegistry;
  consent: ConsentGate;
  status: StatusSurface;
  registry: AiHostRegistry;
}

/**
 * The prompt-gated wire flow, shared by the durable insrc.hosts.wire command and
 * the activation-time wire offer: detect present hosts, ask sc4 ONE combined
 * prompt naming them, and wire each only on 'accepted' (k4). Nothing is written
 * on decline/dismiss. The daemon state is not re-derived here — the wire outcome
 * is reflected as a status detail; wiring never changes daemon reachability.
 */
export async function offerHostWiring(
  deps: Pick<HostCommandDeps, 'consent' | 'status' | 'registry'>,
): Promise<void> {
  const present = await deps.registry.detectPresent();

  if (present.length === 0) {
    deps.status.set({ state: deps.status.current().state, detail: 'no supported AI hosts detected' });
    return;
  }

  const displayNames = present.map((a) => a.descriptor.displayName);
  const outcome = await deps.consent.ask({
    title: 'Wire insrc into your AI hosts?',
    detail:
      'insrc adds a local MCP server registration + tracked-workflow guidance to each detected AI host, reversibly (your other settings are preserved). Nothing is written until you accept.',
    acceptLabel: 'Wire',
    items: displayNames,
  });
  if (outcome !== 'accepted') return; // declined/dismissed → nothing written (k4)

  const wired: string[] = [];
  const failed: string[] = [];
  for (const adapter of present) {
    try {
      await adapter.wire();
      wired.push(adapter.descriptor.displayName);
    } catch {
      // One host's HostFileAccessError (or any wire failure) must not abort the rest.
      failed.push(adapter.descriptor.displayName);
    }
  }

  deps.status.set({ state: deps.status.current().state, detail: summarise(wired, failed) });
}

/** A concise wire outcome for the status detail. */
function summarise(wired: readonly string[], failed: readonly string[]): string {
  const parts: string[] = [];
  if (wired.length > 0) parts.push(`wired ${wired.join(', ')}`);
  if (failed.length > 0) parts.push(`failed ${failed.join(', ')}`);
  return parts.length > 0 ? `hosts: ${parts.join('; ')}` : 'hosts: nothing to wire';
}

/**
 * Register the durable insrc.hosts.wire command (k6) that runs the shared
 * consent-gated wire flow. s3 owns the wire capability + command; the
 * install→register→wire coalescing + the uninstall unwire driver are s5's.
 */
export function registerHostCommands(deps: HostCommandDeps): void {
  const { commands, consent, status, registry } = deps;

  commands.register({ id: 'insrc.hosts.wire', title: 'insrc: Wire AI hosts' }, async () => {
    await offerHostWiring({ consent, status, registry });
  });
}
