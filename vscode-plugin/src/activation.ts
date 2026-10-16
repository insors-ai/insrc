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
import type { DaemonLifecycleController } from './daemon/controller.js';

/** Default bound for the activation reachability probe (ms). */
export const DEFAULT_PROBE_TIMEOUT_MS = 3000;

export interface ActivationDeps {
  client: IpcClient;
  status: StatusSurface;
  /** Bound for the reachability probe; defaults to {@link DEFAULT_PROBE_TIMEOUT_MS}. */
  probeTimeoutMs?: number | undefined;
  /**
   * Story E202610160e1265ed:S001: lets activation start an installed daemon the probe finds
   * stopped. Absent -> activation only probes, as before.
   */
  controller?: Pick<DaemonLifecycleController, 'isInstalled' | 'run'> | undefined;
  /**
   * Called once when the probe and any automatic start have finished, whatever their outcome, so
   * work that needs a reachable daemon (the settings pull, the update check, onboarding) can follow.
   */
  onSettled?: (() => void) | undefined;
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
export async function runReachabilityProbe(deps: ActivationDeps): Promise<DaemonUiState> {
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

  const state = toUiState(reachability);
  deps.status.set({ state });
  return state;
}

/** Shown when a start reports success but the daemon still does not answer. */
const NO_ANSWER_AFTER_START = 'the daemon did not answer after start';

/**
 * Story E202610160e1265ed:S001: start an installed daemon that the probe found stopped, once, as
 * a plain start (nothing is pulled, installed or built) and show the result. It starts nothing for
 * any other probed state, for a daemon that is not installed, or when another window has already
 * brought the daemon up since the probe. Never rejects: a failed start is an errored status.
 */
export async function startDaemonIfStopped(deps: ActivationDeps, probed: DaemonUiState): Promise<void> {
  const controller = deps.controller;
  if (controller === undefined || probed !== 'stopped') return;
  try {
    if (!(await controller.isInstalled())) return;
    // Another window may have started it since the probe: do not restart what is now up.
    if ((await deps.client.reachability()) === 'running') {
      deps.status.set({ state: 'running' });
      return;
    }
    const result = await controller.run('start', { plain: true });
    if (result.ok && result.state !== 'running') {
      deps.status.set({ state: 'errored', detail: NO_ANSWER_AFTER_START });
    } else {
      deps.status.set({ state: result.state, detail: result.message });
    }
  } catch {
    deps.status.set({ state: 'errored' });
  }
}

/**
 * Activate the extension core: leave the status surface in its initial 'unknown'
 * state and fire the reachability probe WITHOUT awaiting it, so activation never
 * blocks the editor. Any synchronous or asynchronous failure is swallowed —
 * activation must never throw (ac1).
 */
export function activateExtension(deps: ActivationDeps): void {
  let settledCalled = false;
  const settle = (): void => {
    if (settledCalled) return;
    settledCalled = true;
    try {
      deps.onSettled?.();
    } catch {
      /* a throwing onSettled must never surface into activation */
    }
  };
  try {
    // Fire-and-forget: activation returns immediately; the probe updates status
    // off the critical path. Errors are contained inside the probe.
    void runReachabilityProbe(deps)
      .then((probed) => startDaemonIfStopped(deps, probed))
      .catch(() => {
        deps.status.set({ state: 'errored' });
      })
      .finally(settle);
  } catch {
    deps.status.set({ state: 'errored' });
    settle();
  }
}
