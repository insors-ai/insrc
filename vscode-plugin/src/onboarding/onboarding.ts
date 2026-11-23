
import { offerHostWiring } from '../hosts/commands.js';
import { offerWorkspaceRegistration } from '../workspace/commands.js';
import type { AiHostRegistry } from '../hosts/types.js';
import type { ConsentGate } from '../surfaces/consent-gate.js';
import type { StatusSurface } from '../surfaces/status-surface.js';
import type { PromptStore, WorkspaceFolders, WorkspaceRegistrar } from '../workspace/types.js';
import type { OnboardingStore } from './types.js';

export interface OnboardingDeps {
  registrar: WorkspaceRegistrar;
  registry: AiHostRegistry;
  consent: ConsentGate;
  status: StatusSurface;
  folders: WorkspaceFolders;
  prompts: PromptStore;
  onboarded: OnboardingStore;
}

/** Run one onboarding step; a step's failure never aborts the sequence (runOnboarding never throws). */
async function step(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch {
    /* the offers already reflect their own errors into sc2; the sequence continues */
  }
}

/**
 * The coalesced first-run flow. When a workspace root is open and already
 * onboarded, it no-ops. Otherwise it runs, IN ORDER: the install offer (only
 * when the daemon is not installed — offerDaemonInstall itself performs no
 * isInstalled gate), then (only when a root is open) the register offer, then the
 * host-wire offer; each offer self-guards to a no-op when its step is not needed,
 * so the sequence degrades to only the prompts the developer actually needs.
 * The per-workspace onboarded flag is set only after a rooted run completes.
 */
export async function runOnboarding(deps: OnboardingDeps): Promise<void> {
  const { registrar, registry, consent, status, folders, prompts, onboarded } = deps;
  const root = folders()[0];

  // One-time gate (lc1): a previously-onboarded workspace re-runs nothing.
  if (root !== undefined && onboarded.wasOnboarded(root)) return;

  // Register (per-workspace). Only when a folder is open; the offer self-guards
  //    already-registered / previously-dismissed to a no-op.
  if (root !== undefined) {
    await step(() => offerWorkspaceRegistration({ consent, status, registrar, folders, prompts }));
  }

  // 3. Wire (global). The offer self-guards 'no supported host present' to a no-op.
  await step(() => offerHostWiring({ consent, status, registry }));

  // Mark the workspace onboarded ONLY once the first-run sequence has SETTLED —
  // i.e. NOT while the register step is left in an accepted-but-errored (RETRYABLE)
  // state. The register offer distinguishes a decline (persists a dismissal, so it
  // self-suppresses) from a failure (no dismissal — intentionally retryable); the
  // coarse per-workspace onboarded flag must not seal that retryable state, or a
  // transient first-run registration failure would permanently suppress the auto
  // register prompt. So: settled = registered OR previously-dismissed. A success or
  // a decline both settle; an accepted-but-failed register leaves the workspace
  // un-onboarded, and the (idempotent, self-guarded) sequence re-prompts next time.
  if (root !== undefined) {
    let registerRetryable = false;
    try {
      const settled = (await registrar.state(root)).registered || prompts.wasDismissed(root);
      registerRetryable = !settled;
    } catch {
      registerRetryable = false; // indeterminate ⇒ don't block onboarding
    }
    if (!registerRetryable) onboarded.markOnboarded(root);
  }
}
