/**
 * Story E20260921ad0d45c9:S001 / t6 — the activation shell (VS-Code-free core).
 *
 * `activateExtension` wires the foundation surfaces together and kicks off a
 * BOUNDED, off-the-critical-path reachability probe whose derived state is pushed
 * into the status surface. It NEVER throws and NEVER modifies the editor: a
 * failed/timed-out probe degrades to 'stopped'/'errored'. This module imports no
 * `vscode` — the entry module (extension.ts) binds the real API and calls in
 * here, so this logic is unit-testable with fakes.
 */
import type { IpcClient, DaemonReachability } from '../../src/shared/ipc-client.js';
import type { StatusSurface, DaemonUiState } from './surfaces/status-surface.js';

/** Default bound for the activation reachability probe (ms). */
export const DEFAULT_PROBE_TIMEOUT_MS = 3000;

export interface ActivationDeps {
  client: IpcClient;
  status: StatusSurface;
  /** Bound for the reachability probe; defaults to {@link DEFAULT_PROBE_TIMEOUT_MS}. */
  probeTimeoutMs?: number | undefined;
}

/** Reachability is a subset of the UI states; map it straight through. */
function toUiState(reachability: DaemonReachability): DaemonUiState {
  return reachability;
}

/**
 * Probe the daemon's reachability under a bounded deadline and push the derived
 * state into the status surface. Never throws: `client.reachability()` already
 * classifies its own failures, and a timeout degrades to 'errored'.
 */
export async function runReachabilityProbe(deps: ActivationDeps): Promise<void> {
  const timeoutMs = deps.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<DaemonReachability>((resolve) => {
    timer = setTimeout(() => resolve('errored'), timeoutMs);
    // Do not keep the process alive for the probe (Node hosts / tests).
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref(): unknown }).unref();
    }
  });

  let reachability: DaemonReachability;
  try {
    reachability = await Promise.race([deps.client.reachability(), deadline]);
  } catch {
    // Defensive: reachability() is documented never-throws, but never let the
    // probe surface an error into activation.
    reachability = 'errored';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  deps.status.set({ state: toUiState(reachability) });
}

/**
 * Activate the extension core: leave the status surface in its initial 'unknown'
 * state and fire the reachability probe WITHOUT awaiting it, so activation never
 * blocks the editor. Any synchronous or asynchronous failure is swallowed —
 * activation must never throw (ac1).
 */
export function activateExtension(deps: ActivationDeps): void {
  try {
    // Fire-and-forget: activation returns immediately; the probe updates status
    // off the critical path. Errors are contained inside the probe.
    void runReachabilityProbe(deps).catch(() => {
      deps.status.set({ state: 'errored' });
    });
  } catch {
    deps.status.set({ state: 'errored' });
  }
}
