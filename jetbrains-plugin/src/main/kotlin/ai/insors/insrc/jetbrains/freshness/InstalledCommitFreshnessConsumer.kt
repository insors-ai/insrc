package ai.insors.insrc.jetbrains.freshness

import ai.insors.insrc.jetbrains.InsrcPlugin
import ai.insors.insrc.jetbrains.PluginLifecycle
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.DaemonUpdateOutcomeResult
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.extensions.PluginId
import java.util.concurrent.TimeUnit

/**
 * Story E20260924b6c90b3e:S004 / t3 — the app-scoped sc1/sc2 consumer that keeps the
 * backing daemon current from JetBrains. Registered on the LifecycleBroadcaster alongside
 * [DaemonLifecycleService][ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleService] via
 * `AppScopedConsumers.ensureRegistered()`; `onProjectOpened` schedules the pure
 * [DaemonFreshnessFlow.check] fire-and-forget off the EDT (via [execute]) and returns
 * immediately, so project opening is never blocked (k6).
 *
 * It owns no shared contract — it CONSUMES sc1 (the daemon-owned update+restart IPC) and
 * sc2 (installedCommit) through the gateway, never shelling out to daemon-ctl.sh (k2). All
 * collaborators are injected so the scheduling is unit-testable; [production] wires the
 * real seams (the insrc NotificationGroup balloon, the running plugin version + the
 * persisted last-seen store, a ProcessBuilder git ls-remote).
 */
class InstalledCommitFreshnessConsumer(
    private val deps: FreshnessDeps,
    private val execute: (Runnable) -> Unit = { r -> DEFAULT_EXECUTOR.execute(r) },
) : PluginLifecycle {

    private val log = logger<InstalledCommitFreshnessConsumer>()

    override fun onProjectOpened(ctx: ProjectContext) {
        // Fire-and-forget off the EDT: project opening is never blocked (k6). The pure flow
        // never throws, so this is a plain dispatch; the try guards a dispatch-time failure.
        try {
            execute {
                try {
                    DaemonFreshnessFlow.check(deps)
                } catch (t: Throwable) {
                    log.warn("insrc: daemon-freshness check failed", t)
                }
            }
        } catch (t: Throwable) {
            log.warn("insrc: could not dispatch the daemon-freshness check", t)
        }
    }

    /** Freshness is app-scoped; uninstall cleanup is S005's concern. */
    override fun onPluginUninstalled() {
        // no-op
    }

    companion object {
        private val log = logger<InstalledCommitFreshnessConsumer>()
        private val DEFAULT_EXECUTOR = com.intellij.util.concurrency.AppExecutorUtil.getAppExecutorService()

        /** Bound (ms) for the plugin-side git ls-remote so a hung network never lingers. */
        private const val LS_REMOTE_TIMEOUT_MS = 15_000L

        /**
         * Assemble the production consumer with real seams: a [FreshnessGateway] over the
         * app-scoped sc2 gateway; the insrc NotificationGroup balloon (k7); the running
         * plugin version + the persisted last-seen store (k4); and a ProcessBuilder git
         * ls-remote against the daemon checkout (no pull, k1).
         */
        fun production(): InstalledCommitFreshnessConsumer {
            val gateway = service<DaemonGatewayService>()
            val store = service<LastSeenPluginVersionStore>()
            // App-scoped single-flight: one daemon updates at a time, so concurrent
            // multi-window opens serialise through this shared flag (MED-1). The loser
            // skips the update silently rather than triggering the daemon's reject path.
            val inFlight = java.util.concurrent.atomic.AtomicBoolean(false)
            val deps = FreshnessDeps(
                gateway = GatewayFreshnessView(gateway),
                gitLsRemote = ::gitLsRemote,
                notify = ::showBalloon,
                versionState = object : PluginVersionState {
                    override val current: String = runningPluginVersion()
                    override fun getLastSeen(): String? = store.getLastSeen()
                    override fun setLastSeen(version: String) = store.setLastSeen(version)
                },
                daemonRoot = daemonRoot(),
                beginUpdate = { inFlight.compareAndSet(false, true) },
                endUpdate = { inFlight.set(false) },
            )
            return InstalledCommitFreshnessConsumer(deps)
        }

        /** The daemon checkout root under the insrc home (`~/.insrc/daemon`). */
        private fun daemonRoot(): String =
            java.nio.file.Path.of(System.getProperty("user.home"), ".insrc", "daemon").toString()

        /** The plugin's own currently-running version, or "" when undeterminable. */
        private fun runningPluginVersion(): String =
            PluginManagerCore.getPlugin(PluginId.getId(InsrcPlugin.PLUGIN_ID))?.version ?: ""

        /**
         * Run `git -C <root> ls-remote origin <branch>` and return the first ref's sha, or
         * "" on any failure/timeout (undeterminable -> the flow skips). Never throws (k1;
         * no pull, no mutation).
         */
        private fun gitLsRemote(root: String, branch: String): String {
            return try {
                val process = ProcessBuilder("git", "-C", root, "ls-remote", "origin", branch)
                    .redirectErrorStream(true)
                    .start()
                // Bound the wait BEFORE reading (MED-2): readText() blocks until EOF, so a
                // hung git (network black-hole / credential prompt) would defeat the timeout
                // if we read first. waitFor(timeout) enforces the bound and destroyForcibly()
                // kills a hung process; ls-remote HEAD output is a single small line, so
                // reading after the process has exited cannot deadlock on the pipe buffer.
                if (!process.waitFor(LS_REMOTE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                    process.destroyForcibly()
                    ""
                } else if (process.exitValue() != 0) {
                    ""
                } else {
                    val output = process.inputStream.bufferedReader().readText()
                    // `<sha>\t<ref>` — take the first line's first whitespace-delimited token.
                    output.lineSequence().firstOrNull { it.isNotBlank() }
                        ?.trim()?.split(Regex("\\s+"))?.firstOrNull().orEmpty()
                }
            } catch (t: Throwable) {
                log.warn("insrc: git ls-remote failed", t)
                ""
            }
        }

        private fun notificationGroup() =
            NotificationGroupManager.getInstance().getNotificationGroup("insrc")

        /**
         * The real notify seam: an Update/Dismiss balloon for [NotifyKind.UPDATE_PROMPT]
         * (k7, no modal), a plain INFORMATION balloon for INFO, an ERROR balloon for the
         * single FAILURE (k5).
         */
        private fun showBalloon(kind: NotifyKind, message: String, onUpdate: (() -> Unit)?) {
            when (kind) {
                NotifyKind.UPDATE_PROMPT -> {
                    val n = notificationGroup().createNotification(message, NotificationType.INFORMATION)
                    n.addAction(NotificationAction.createSimple("Update") {
                        n.expire()
                        // A NotificationAction callback fires on the EDT; onUpdate drives the
                        // blocking update()+reconnect loop (up to reconnectBudgetMs), so it MUST
                        // run off the EDT or the IDE freezes for the whole rebuild (HIGH-1).
                        // Mirrors DaemonLifecycleService's off-EDT re-dispatch on accept.
                        onUpdate?.let { action -> DEFAULT_EXECUTOR.execute { action() } }
                    })
                    n.addAction(NotificationAction.createSimple("Dismiss") { n.expire() })
                    n.notify(null)
                }
                NotifyKind.INFO ->
                    notificationGroup().createNotification(message, NotificationType.INFORMATION).notify(null)
                NotifyKind.FAILURE ->
                    notificationGroup().createNotification(message, NotificationType.ERROR).notify(null)
            }
        }
    }
}

/**
 * The real [FreshnessGateway] over the app-scoped [DaemonGateway] (Story S004 / t3):
 * maps `daemonStatus()` to the installed commit (Loaded -> the sha, Stopped/Unavailable ->
 * null so the flow skips), and forwards `update()`/`updateOutcome()` verbatim. Never
 * throws (the gateway maps every fault to a sealed result).
 */
internal class GatewayFreshnessView(private val gateway: DaemonGateway) : FreshnessGateway {
    override fun installedCommit(): String? =
        when (val r = gateway.daemonStatus()) {
            is DaemonStatusResult.Loaded -> r.status.installedCommit
            DaemonStatusResult.Stopped -> null
            is DaemonStatusResult.Unavailable -> null
        }

    override fun update(): DaemonActionResult = gateway.update()

    override fun updateOutcome(): DaemonUpdateOutcomeResult = gateway.updateOutcome()
}
