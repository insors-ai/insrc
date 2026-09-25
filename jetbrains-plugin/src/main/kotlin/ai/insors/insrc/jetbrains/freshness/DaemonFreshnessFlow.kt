package ai.insors.insrc.jetbrains.freshness

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.DaemonUpdateOutcomeResult
import java.time.Instant

/**
 * Story E20260924b6c90b3e:S004 / t2 — the VS-fixture-free daemon-freshness flow.
 *
 * The JetBrains analogue of the VS Code S003 `runDaemonFreshnessCheck`: it keeps the
 * locally-installed insrc daemon current by comparing the daemon's installed source
 * commit (sc2, `daemon.status`.installedCommit) against the upstream default-branch tip
 * from a plugin-side `git ls-remote` (no pull, k1). On drift it either PROMPTS (startup-
 * check) or AUTO-updates (plugin self-update, k4), driving the daemon-owned update+
 * restart IPC (sc1 [FreshnessGateway.update]) — NEVER a daemon-ctl.sh shell-out (k2) —
 * then reconnects and confirms via [FreshnessGateway.updateOutcome]/[FreshnessGateway.
 * installedCommit], surfacing a single failure balloon on error with NO retry/rollback
 * (k5).
 *
 * Every seam is injected so this object imports no platform/IDE type and is JUnit5-unit-
 * testable with fakes (the S003TypesTest/DecidePolicyTest idiom). It is fired fire-and-
 * forget off the EDT from the project-open path and MUST NEVER throw or block startup
 * (k6): [check] wraps everything in a try/catch and records the current plugin version on
 * every terminal path so the self-update path fires exactly once per plugin version.
 */
object DaemonFreshnessFlow {

    /**
     * The ref to `git ls-remote` against — the remote's default-branch HEAD. Mirrors
     * daemon-ctl.sh syncing the daemon checkout against origin's default branch; yields
     * that branch's tip commit with no branch name and no pull (k1).
     */
    const val DEFAULT_DAEMON_BRANCH = "HEAD"

    /**
     * Default bound (ms) for the reconnect-and-confirm loop after an update+restart. The
     * daemon-owned update runs git pull + (conditional) npm install + a full tsc build
     * against heavy native deps before it restarts, which routinely exceeds a minute on a
     * cold build; the budget is set comfortably above a normal rebuild so a still-in-
     * progress rebuild is NOT mis-reported as a failure on the common success path (k5
     * failure is reserved for a genuine non-return / failed outcome).
     */
    const val DEFAULT_RECONNECT_BUDGET_MS = 300_000L

    /** How often (ms) the reconnect-and-confirm loop re-probes the restarting daemon. */
    const val DEFAULT_POLL_INTERVAL_MS = 1_000L

    /**
     * The message shown after a successful daemon update. The daemon is now current, but the
     * MCP connection held by the `claude`/`codex` CLI still points at the pre-update daemon
     * process — the user must restart their CLI session for the new daemon to take effect.
     * Notification-only: the IDE cannot restart the CLI-owned MCP host in place.
     */
    const val RELOAD_NUDGE_MESSAGE =
        "insrc: daemon updated. Restart your claude / codex session to reconnect the insrc MCP connection to the new daemon."

    private data class ConfirmResult(val succeeded: Boolean, val error: String?)

    /**
     * Run one opportunistic freshness check. Never throws (fire-and-forget, k6).
     * `setLastSeen(current)` runs on EVERY terminal path (skip / updated / failed) so the
     * self-update auto-path fires at most once per plugin version.
     */
    fun check(deps: FreshnessDeps) {
        val versionState = deps.versionState
        try {
            // 1. The installed commit (sc2). null = unreachable daemon (skip, k6); '' = pre-
            //    S002 / non-git root, undeterminable (skip). Both degrade silently (ac2).
            val installed = deps.gateway.installedCommit() ?: return
            if (installed.isEmpty()) return

            // 2. The upstream default-branch tip via a plugin-side ls-remote (no pull, k1).
            //    ''/throw -> undeterminable -> skip; == installed -> up to date -> skip.
            val upstream = try {
                deps.gitLsRemote(deps.daemonRoot, DEFAULT_DAEMON_BRANCH)
            } catch (t: Throwable) {
                return
            }
            if (upstream.isEmpty() || upstream == installed) return

            // 3. Drift present. Branch self-update (plugin version changed -> auto, k4) vs
            //    startup-check (same version -> prompt, k4/k7). An undeterminable current
            //    version ('') must NOT opt into the silent auto path -> fall back to prompt.
            val current = versionState.current
            val selfUpdate = current.isNotEmpty() && current != versionState.getLastSeen()
            if (selfUpdate) {
                // Self-update: no prompt, notify-after.
                performUpdate(deps, installed)
            } else {
                // Startup-check: a non-modal Update/Dismiss balloon (k7); update ONLY on Update.
                deps.notify.show(
                    NotifyKind.UPDATE_PROMPT,
                    "insrc: a newer daemon build is available. Update now?",
                ) { performUpdate(deps, installed) }
            }
        } catch (t: Throwable) {
            // Outer backstop: fire-and-forget must never surface an error into project-open.
        } finally {
            // Record the current version on every terminal path so a self-update fires
            // exactly once per plugin version (including across unreachable activations).
            try {
                versionState.setLastSeen(versionState.current)
            } catch (t: Throwable) {
                // a persistence failure must never surface
            }
        }
    }

    /**
     * Drive the daemon-owned update+restart (sc1 [FreshnessGateway.update]), then
     * reconnect-and-confirm. A single failure balloon on any error, no retry/rollback
     * (k5). [priorCommit] is the pre-update installed commit — success is confirmed by the
     * commit advancing past it, or a fresh `updateOutcome().state`.
     */
    private fun performUpdate(deps: FreshnessDeps, priorCommit: String) {
        // App-scoped single-flight (k5): the daemon can run only one update at a time, and
        // multiple project windows opening near-simultaneously each fire a check on the
        // shared pool. Without this guard they would all read the still-stale lastSeen,
        // all compute selfUpdate=true, and all call update() — the daemon's sc1 guard would
        // then reject the losers, surfacing a spurious failure balloon during a healthy
        // update. beginUpdate serialises them: the winner runs, the losers skip silently.
        if (!deps.beginUpdate()) return
        try {
            val startedAtMs = deps.now()
            // sc1 — the daemon-owned IPC (k2), never a shell-out. Returns Failed on refusal
            // (e.g. 'update already in progress') / unreachable; never throws.
            when (val launch = deps.gateway.update()) {
                is DaemonActionResult.Failed -> {
                    deps.notify.show(NotifyKind.FAILURE, failureMessage(launch.reason), null)
                    return
                }
                is DaemonActionResult.Ok -> Unit
            }

            val result = confirmUpdate(deps, priorCommit, startedAtMs)
            if (result.succeeded) {
                // The daemon is current, but the MCP connection held by the claude/codex CLI
                // still points at the pre-update daemon process. There is no in-place MCP
                // restart from the IDE, so nudge the user to restart their CLI session
                // (notification-only — no action slot).
                deps.notify.show(NotifyKind.INFO, RELOAD_NUDGE_MESSAGE, null)
            } else {
                deps.notify.show(NotifyKind.FAILURE, failureMessage(result.error ?: "the daemon did not come back"), null)
            }
        } finally {
            deps.endUpdate()
        }
    }

    /**
     * Poll the restarting daemon under `reconnectBudgetMs`. The socket drops during the
     * restart — transient Unavailable/None results are tolerated until the budget elapses.
     * A fresh `updateOutcome` (finished at/after the update started) is authoritative;
     * otherwise the installed commit advancing past [priorCommit] proves success.
     */
    private fun confirmUpdate(deps: FreshnessDeps, priorCommit: String, startedAtMs: Long): ConfirmResult {
        val deadline = startedAtMs + deps.reconnectBudgetMs
        while (true) {
            // Prefer the explicit terminal outcome record (sc1), but only if it is fresh —
            // a stale record from a prior update must not decide this one.
            val outcome = deps.gateway.updateOutcome()
            if (outcome is DaemonUpdateOutcomeResult.Loaded && isFresh(outcome.finishedAt, startedAtMs)) {
                return if (outcome.state == "failed") {
                    ConfirmResult(false, outcome.error)
                } else {
                    ConfirmResult(true, null)
                }
            }

            // Fallback: the installed commit advanced past the pre-update commit.
            val commit = deps.gateway.installedCommit()
            if (commit != null && commit.isNotEmpty() && commit != priorCommit) {
                return ConfirmResult(true, null)
            }

            if (deps.now() >= deadline) {
                return ConfirmResult(false, "the daemon did not come back within the reconnect budget")
            }
            deps.sleep(deps.pollIntervalMs)
        }
    }

    /** An outcome is fresh iff its ISO-8601 finishedAt parses to at/after the update start. */
    private fun isFresh(finishedAt: String, startedAtMs: Long): Boolean {
        val ms = runCatching { Instant.parse(finishedAt).toEpochMilli() }.getOrNull() ?: return false
        return ms >= startedAtMs
    }

    /** Wrap a raw reason into the single user-facing failure line (k5). */
    private fun failureMessage(reason: String): String = "insrc: daemon update failed: $reason"
}

/** The kind of freshness notification (Story S004 / t2). */
enum class NotifyKind {
    /** A non-modal Update/Dismiss balloon offering the update (startup-check, k7). */
    UPDATE_PROMPT,

    /** A plain informational balloon (e.g. update succeeded). */
    INFO,

    /** A single failure balloon carrying the raw error (k5). */
    FAILURE,
}

/**
 * The native-balloon seam (Story S004 / t2). For [NotifyKind.UPDATE_PROMPT] the real impl
 * shows an insrc balloon with an Update action that invokes [onUpdate] and a Dismiss
 * action; for INFO/FAILURE it shows a plain balloon and [onUpdate] is null. VS-fixture-
 * free — no platform import here.
 */
fun interface FreshnessNotify {
    fun show(kind: NotifyKind, message: String, onUpdate: (() -> Unit)?)
}

/**
 * The per-plugin last-seen-version accessor used for self-update detection (Story S004 /
 * t2, k4). The real impl reads the running plugin version for [current] and persists
 * [getLastSeen]/[setLastSeen] in the app-scoped
 * [LastSeenPluginVersionStore].
 */
interface PluginVersionState {
    /** The plugin's own currently-running version (or "" when undeterminable). */
    val current: String

    /** The version recorded on the previous activation, or null on first run. */
    fun getLastSeen(): String?

    /** Persist the current version as last-seen. */
    fun setLastSeen(version: String)
}

/**
 * The daemon read/act seam the flow drives (Story S004 / t2) — a freshness-facing view of
 * the sc1/sc2 gateway. All three methods never throw (the gateway maps faults to sealed
 * results); the real impl wraps `DaemonGateway.daemonStatus()`/`update()`/`updateOutcome()`.
 */
interface FreshnessGateway {
    /**
     * The daemon's currently-installed commit, or `null` when the daemon is unreachable
     * (Stopped/Unavailable). `""` when reachable but the commit is undeterminable (sc2).
     */
    fun installedCommit(): String?

    /** Launch the daemon-owned update+restart (sc1). Ok = launched; Failed = refused/unreachable. */
    fun update(): DaemonActionResult

    /** Read the terminal update outcome (sc1) during reconnect-and-confirm. */
    fun updateOutcome(): DaemonUpdateOutcomeResult
}

/**
 * The injected-seams container for [DaemonFreshnessFlow.check] (Story S004 / t2) — the
 * JetBrains analogue of S003's DaemonFreshnessDeps. `reconnectBudgetMs`/`pollIntervalMs`/
 * `sleep`/`now` default to real values; tests inject a no-wait sleep + an advanceable
 * clock. VS-fixture-free.
 */
class FreshnessDeps(
    val gateway: FreshnessGateway,
    val gitLsRemote: (root: String, branch: String) -> String,
    val notify: FreshnessNotify,
    val versionState: PluginVersionState,
    val daemonRoot: String,
    val reconnectBudgetMs: Long = DaemonFreshnessFlow.DEFAULT_RECONNECT_BUDGET_MS,
    val pollIntervalMs: Long = DaemonFreshnessFlow.DEFAULT_POLL_INTERVAL_MS,
    val sleep: (Long) -> Unit = { ms -> Thread.sleep(ms) },
    val now: () -> Long = { System.currentTimeMillis() },
    /**
     * App-scoped single-flight (k5): returns true if THIS check may launch the update,
     * false if another update is already in flight (the loser skips it silently). The
     * default always-acquire suits a single check; the consumer wires a shared AtomicBoolean
     * so concurrent multi-window opens never fire competing updates. [endUpdate] releases it.
     */
    val beginUpdate: () -> Boolean = { true },
    val endUpdate: () -> Unit = {},
)
