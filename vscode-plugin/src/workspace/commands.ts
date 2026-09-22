/**
 * Story E20260921ad0d45c9:S004 / t2 — the workspace-register command wiring (sc7).
 *
 * Registers the durable insrc.workspace.register command (sc3, k6) + the shared
 * one-time offerWorkspaceRegistration flow (activation-time). Enrolment is
 * consent-gated (k4): nothing calls registrar.register until sc4 returns
 * 'accepted'. The one-time gate (lc1) lives in the activation offer via the
 * PromptStore; the durable command always offers (a user who invoked it wants to
 * register). Mirrors S002 registerDaemonCommands + S003 registerHostCommands.
 */
import type { CommandRegistry } from '../surfaces/command-registry.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';
import type { PromptStore, WorkspaceFolders, WorkspaceRegistrar } from './types.js';

export interface WorkspaceCommandDeps {
  commands: CommandRegistry;
  consent: ConsentGate;
  status: StatusSurface;
  registrar: WorkspaceRegistrar;
  folders: WorkspaceFolders;
}

export interface WorkspaceOfferDeps {
  consent: ConsentGate;
  status: StatusSurface;
  registrar: WorkspaceRegistrar;
  folders: WorkspaceFolders;
  prompts: PromptStore;
}

/** Set a status detail without changing the daemon state the surface already shows. */
function detail(status: StatusSurface, text: string): void {
  status.set({ state: status.current().state, detail: text });
}

/**
 * The core register flow shared by the durable command and the activation offer:
 * if the root is already registered → no prompt; else ask sc4 and register ONLY
 * on 'accepted' (k4). `onDeclined` (the activation offer's markDismissed) runs
 * when the developer declines/dismisses; a register failure is surfaced as an
 * errored status and does NOT trigger onDeclined (retryable).
 */
async function runRegisterFlow(
  deps: Pick<WorkspaceOfferDeps, 'consent' | 'status' | 'registrar'>,
  root: string,
  onDeclined?: () => void,
): Promise<void> {
  const current = await deps.registrar.state(root);
  if (current.registered) {
    detail(deps.status, 'workspace already registered');
    return;
  }

  const outcome = await deps.consent.ask({
    title: 'Register this workspace with insrc?',
    detail:
      'insrc scopes its code-knowledge to this repository by enrolling it with the local daemon (via repo.add). Nothing is enrolled until you accept.',
    acceptLabel: 'Register',
  });
  if (outcome !== 'accepted') {
    onDeclined?.();
    return; // nothing enrolled (k4)
  }

  try {
    await deps.registrar.register(root);
    detail(deps.status, 'workspace registered');
  } catch (err) {
    // Surfaced, not swallowed; NOT dismissed (the developer opted in — retryable).
    const message = err instanceof Error ? err.message : String(err);
    deps.status.set({ state: 'errored', detail: `workspace registration failed: ${message}` });
  }
}

/**
 * The activation-time one-time offer (lc1): resolve the primary root; no root →
 * no-op; previously dismissed → no prompt; else run the shared flow, persisting a
 * dismissal so it is not re-nagged.
 */
export async function offerWorkspaceRegistration(deps: WorkspaceOfferDeps): Promise<void> {
  const root = deps.folders()[0];
  if (root === undefined) return; // no workspace folder open — nothing to offer
  if (deps.prompts.wasDismissed(root)) return; // one-time: respect a prior dismissal (lc1)
  await runRegisterFlow(deps, root, () => deps.prompts.markDismissed(root));
}

/**
 * Register the durable insrc.workspace.register command (sc3, k6). Running it
 * always offers (no dismissed gate) — a developer who invoked it wants to enrol.
 */
export function registerWorkspaceCommands(deps: WorkspaceCommandDeps): void {
  const { commands, consent, status, registrar, folders } = deps;

  commands.register({ id: 'insrc.workspace.register', title: 'insrc: Register workspace' }, async () => {
    const root = folders()[0];
    if (root === undefined) {
      detail(status, 'no workspace folder open');
      return;
    }
    await runRegisterFlow({ consent, status, registrar }, root);
  });
}
