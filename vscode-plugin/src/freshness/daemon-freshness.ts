/**
 * Story E20260924b6c90b3e:S003 / t1 — the VS-Code-free daemon-freshness flow.
 *
 * `runDaemonFreshnessCheck` keeps the locally-installed insrc daemon current by
 * comparing the daemon's installed source commit (sc2, `daemon.status`.
 * installedCommit) against the upstream default-branch tip from a plugin-side
 * `git ls-remote` (no pull, k1). On drift it either PROMPTS (startup-check) or
 * AUTO-updates (plugin self-update, k4), driving the daemon-owned update+restart
 * IPC (sc1 `client.update()`) — NEVER shelling out to daemon-ctl.sh (k2) — then
 * reconnects and confirms via `client.updateOutcome()`/`client.status()`,
 * surfacing a single failure notification on error with NO retry/rollback (k5).
 *
 * Every seam is injected so this module imports no `vscode` and is unit-testable
 * with fakes (the model-tier-picker / activation idiom). It is fired
 * fire-and-forget from activation and MUST NEVER reject or block startup (k6):
 * an outer try/catch swallows everything and `setLastSeen(current)` runs on every
 * terminal path so the self-update path fires exactly once per plugin version.
 */
import type { IpcClient } from '../../../src/shared/ipc-client.js';

/**
 * The ref to `git ls-remote` against — the remote's default-branch HEAD. This
 * mirrors daemon-ctl.sh syncing the daemon checkout against origin's default
 * branch; `git ls-remote origin HEAD` yields that branch's tip commit without a
 * branch name and without a pull (k1).
 */
export const DEFAULT_DAEMON_BRANCH = 'HEAD';

/**
 * Default bound (ms) for the reconnect-and-confirm loop after an update+restart.
 * The daemon-owned update runs git pull + (conditional) npm install + a full tsc
 * build against heavy native deps (lmdb/lance/duckdb/tree-sitter) before it
 * restarts, which routinely exceeds a minute on a cold build. The budget is set
 * comfortably above a normal rebuild so a still-in-progress rebuild is NOT
 * mis-reported as a failure on the common success path (k5 failure is reserved
 * for a genuine non-return / failed outcome).
 */
export const DEFAULT_RECONNECT_BUDGET_MS = 300_000;

/** How often (ms) the reconnect-and-confirm loop re-probes the restarting daemon. */
export const RECONNECT_POLL_INTERVAL_MS = 1_000;

/**
 * The native-notification seam (mirrors extension.ts's showInformationMessage):
 * `notify(message, ...actions)` resolves the chosen action label, or `undefined`
 * when the notification is dismissed/closed. No modal (k7). The real impl binds
 * `vscode.window.showInformationMessage(message, {}, ...actions)`.
 */
export type FreshnessNotify = (message: string, ...actions: string[]) => Promise<string | undefined>;

/**
 * The per-plugin last-seen-version accessor used for self-update detection (k4).
 * The real impl reads `context.extension.packageJSON.version` for `current` and
 * persists `getLastSeen`/`setLastSeen` in `context.globalState`.
 */
export interface PluginVersionState {
  /** The plugin's own currently-running version (packageJSON.version). */
  current: string;
  /** The version recorded on the previous activation, or undefined on first run. */
  getLastSeen(): string | undefined;
  /** Persist the current version as last-seen (may be async — globalState.update returns PromiseLike). */
  setLastSeen(v: string): void | PromiseLike<void>;
}

/**
 * Injected seams for {@link runDaemonFreshnessCheck}. VS-Code-free: the ipc
 * client (the sc1/sc2 surface), a plugin-side git ls-remote runner, a native
 * notification surface, the per-plugin version accessor, and the daemon checkout
 * root. `reconnectBudgetMs`/`sleep`/`now` are optional (tests inject a no-wait
 * clock); they default to real time.
 */
export interface DaemonFreshnessDeps {
  client: Pick<IpcClient, 'status' | 'reachability' | 'update' | 'updateOutcome'>;
  gitLsRemote(root: string, branch: string): Promise<string> | string;
  notify: FreshnessNotify;
  versionState: PluginVersionState;
  daemonRoot: string;
  /** Bound for the reconnect-and-confirm loop; defaults to {@link DEFAULT_RECONNECT_BUDGET_MS}. */
  reconnectBudgetMs?: number | undefined;
  /** Injectable delay for the reconnect loop (tests pass a no-wait); defaults to setTimeout. */
  sleep?: ((ms: number) => Promise<void>) | undefined;
  /** Injectable epoch-ms clock for the budget + outcome-freshness (tests advance it); defaults to Date.now. */
  now?: (() => number) | undefined;
}

interface ConfirmResult {
  state: 'succeeded' | 'failed';
  error?: string | undefined;
}

/** Wrap a raw error/string into the single user-facing failure line (k5). */
function failureMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  return `insrc daemon update failed: ${raw}`;
}

/**
 * Run one opportunistic freshness check. Never rejects: it is fired
 * fire-and-forget from activation (k6). `setLastSeen(current)` runs on EVERY
 * terminal path (skip / updated / failed) so the self-update auto-path fires at
 * most once per plugin version.
 */
export async function runDaemonFreshnessCheck(deps: DaemonFreshnessDeps): Promise<void> {
  const { versionState } = deps;
  try {
    // 1. Reachability gate (k6): opportunistic ONLY when the daemon is up. No
    //    autostart. reachability() is documented never-throws; guarded anyway.
    let reachable = false;
    try {
      reachable = (await deps.client.reachability()) === 'running';
    } catch {
      reachable = false;
    }
    if (!reachable) return; // skip silently (setLastSeen still runs in finally).

    // 2. The installed commit (sc2). '' (or a pre-S002 daemon → undefined) means
    //    undeterminable → skip; a status failure means effectively unreachable → skip.
    let installed = '';
    try {
      installed = (await deps.client.status()).installedCommit ?? '';
    } catch {
      return;
    }
    if (installed === '') return;

    // 3. The upstream default-branch tip via a plugin-side ls-remote (no pull, k1).
    //    '' or a throw ⇒ undeterminable ⇒ skip.
    let upstream = '';
    try {
      upstream = (await deps.gitLsRemote(deps.daemonRoot, DEFAULT_DAEMON_BRANCH)) ?? '';
    } catch {
      return;
    }
    if (upstream === '' || upstream === installed) return; // up to date / undeterminable.

    // 4. Drift present. Branch self-update (plugin version changed → auto, k4) vs
    //    startup-check (same version → prompt, k4/k7). An undeterminable current
    //    version ('') must NOT opt into the no-prompt auto path — fall back to the
    //    safer prompt path (current === '' would otherwise differ from an undefined
    //    lastSeen on a first activation and auto-update silently).
    const selfUpdate = versionState.current !== '' && versionState.current !== versionState.getLastSeen();
    if (selfUpdate) {
      // Self-update: no prompt, notify-after.
      await performUpdate(deps, installed);
    } else {
      const choice = await deps.notify(
        'A newer insrc daemon build is available. Update now?',
        'Update',
        'Dismiss',
      );
      if (choice === 'Update') {
        await performUpdate(deps, installed);
      }
      // 'Dismiss' / undefined (closed) → nothing changes; re-offered next activation (k6).
    }
  } catch {
    // Outer backstop: fire-and-forget must never surface an unhandled rejection.
  } finally {
    // Record the current version on every terminal path so a self-update fires
    // exactly once per plugin version (including across unreachable activations).
    try {
      await versionState.setLastSeen(versionState.current);
    } catch {
      /* a persistence failure must never surface into activation */
    }
  }
}

/**
 * Drive the daemon-owned update+restart (sc1 `client.update()`), then
 * reconnect-and-confirm. A single failure notify on any error, no retry/rollback
 * (k5). `priorCommit` is the pre-update installed commit — success is confirmed
 * by the commit advancing past it, or a fresh `updateOutcome().state`.
 */
async function performUpdate(deps: DaemonFreshnessDeps, priorCommit: string): Promise<void> {
  const now = deps.now ?? Date.now;
  const startedAtMs = now();

  let launched;
  try {
    launched = await deps.client.update(); // sc1 — the daemon-owned IPC (k2), NOT a shell-out.
  } catch (err) {
    // e.g. the S001 concurrent-launch guard ('update already in progress').
    await deps.notify(failureMessage(err));
    return;
  }
  if (launched.launched === false) {
    await deps.notify(failureMessage(launched.message ?? 'the daemon did not launch an update'));
    return;
  }

  const result = await confirmUpdate(deps, priorCommit, startedAtMs);
  if (result.state === 'succeeded') {
    await deps.notify('insrc daemon updated successfully.');
  } else {
    await deps.notify(failureMessage(result.error ?? 'the daemon did not come back'));
  }
}

/**
 * Poll the restarting daemon under `reconnectBudgetMs`. The socket drops during
 * the restart — transient failures are tolerated until the budget elapses. A
 * fresh `updateOutcome` (finished at/after the update started) is authoritative;
 * otherwise the installed commit advancing past `priorCommit` proves success.
 */
async function confirmUpdate(
  deps: DaemonFreshnessDeps,
  priorCommit: string,
  startedAtMs: number,
): Promise<ConfirmResult> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const budget = deps.reconnectBudgetMs ?? DEFAULT_RECONNECT_BUDGET_MS;
  const deadline = startedAtMs + budget;

  for (;;) {
    // Prefer the explicit terminal outcome record (S001 sc1), but only if it is
    // fresh — a stale record from a prior update must not decide this one.
    try {
      const outcome = await deps.client.updateOutcome();
      if (outcome !== null && Date.parse(outcome.finishedAt) >= startedAtMs) {
        return outcome.state === 'failed'
          ? { state: 'failed', error: outcome.error }
          : { state: 'succeeded' };
      }
    } catch {
      /* daemon still restarting — keep polling */
    }

    // Fallback: the installed commit advanced past the pre-update commit.
    try {
      const { installedCommit } = await deps.client.status();
      if (installedCommit !== '' && installedCommit !== priorCommit) {
        return { state: 'succeeded' };
      }
    } catch {
      /* still restarting — keep polling */
    }

    if (now() >= deadline) {
      return { state: 'failed', error: 'the daemon did not come back within the reconnect budget' };
    }
    await sleep(RECONNECT_POLL_INTERVAL_MS);
  }
}
