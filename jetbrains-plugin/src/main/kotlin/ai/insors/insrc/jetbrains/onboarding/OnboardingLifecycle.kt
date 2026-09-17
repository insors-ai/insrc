package ai.insors.insrc.jetbrains.onboarding

import ai.insors.insrc.jetbrains.PluginLifecycle
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.host.AiHostAdapter
import ai.insors.insrc.jetbrains.host.AiHostAdapterImpl
import com.intellij.openapi.diagnostic.logger

/**
 * The sc1 consumer for onboarding + clean removal (Story S005), the epic's final story.
 * Subscribed to the [LifecycleBroadcaster][ai.insors.insrc.jetbrains.LifecycleBroadcaster];
 * mirrors the injected-collaborators + `production()` shape of S003's
 * [DaemonLifecycleService][ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleService]. It owns no
 * shared contract — it composes sc1 (lifecycle), sc2 ([DaemonGateway]) and sc3 ([AiHostAdapter]).
 *
 *  - [onProjectOpened]: off the EDT, `detectPresent()` empty -> silent no-op re-checked on later
 *    opens (ac3); else if the project is not yet registered, surface the one-click
 *    ["Enable insrc for this project"][OnboardingOffer] offer whose accept-callback registers the
 *    project via the strict repo.add contract (ac1/ac2/lc1/k2). Nothing is registered on open — only
 *    on the developer's click. A [DaemonUnavailableException] on either gateway call is caught and
 *    reported, never crashing.
 *  - [onPluginUninstalled]: delivered only on a TRUE uninstall (a mere disable raises no such event),
 *    so a disable leaves the host files in place (ac4). For each detected host it reverses both insrc
 *    writes — [AiHostAdapter.removeMcpRegistration] then [AiHostAdapter.removeRulesBlock] — per-host
 *    isolated, restoring the files to their pre-insrc state (lc2/k4). It never writes host files and
 *    never re-implements detection, repo.add, or the removers.
 *
 * Collaborators are injected so the orchestration is unit-testable; [production] wires the real ones.
 */
class OnboardingLifecycle(
    private val gateway: DaemonGateway,
    private val adapter: AiHostAdapter,
    private val offer: OnboardingOffer,
    private val notify: (message: String) -> Unit,
    private val execute: (Runnable) -> Unit = { r -> DEFAULT_EXECUTOR.execute(r) },
) : PluginLifecycle {

    private val log = logger<OnboardingLifecycle>()

    override fun onProjectOpened(ctx: ProjectContext) {
        // Detection + the registration probe run off the EDT so project opening is never blocked.
        execute {
            try {
                evaluate(ctx)
            } catch (t: Throwable) {
                log.warn("insrc: onboarding evaluation failed for ${ctx.projectRootPath}", t)
            }
        }
    }

    private fun evaluate(ctx: ProjectContext) {
        val hosts = adapter.detectPresent()
        if (hosts.isEmpty()) return // no AI host present -> no visible action, re-checked on later opens (ac3)

        val registered = try {
            gateway.isProjectRegistered(ctx.projectRootPath)
        } catch (e: DaemonUnavailableException) {
            // Daemon unreachable -> show no offer this session; the lifecycle re-checks on a later open.
            log.warn("insrc: could not check registration state for ${ctx.projectRootPath}", e)
            return
        }
        if (registered) return // already enabled -> nothing to offer (ac2)

        // Nothing is registered until the developer clicks Enable (ac1/ac2/lc1); the accept-callback
        // runs the strict repo.add off the EDT. A catch-all guards the executor runnable (mirroring
        // DaemonLifecycleService) so an unexpected throw can't escape into the app pool and leave the
        // click silently doing nothing.
        offer.offerEnable(ctx.projectRootPath) {
            execute {
                try {
                    register(ctx.projectRootPath)
                } catch (t: Throwable) {
                    log.warn("insrc: enabling project ${ctx.projectRootPath} failed", t)
                    runCatching { notify("insrc could not enable this project.") }
                }
            }
        }
    }

    /** The offer accept-callback: register via sc2's strict repo.add and report the outcome. */
    private fun register(projectRootPath: String) {
        val result = try {
            gateway.registerProject(projectRootPath)
        } catch (e: DaemonUnavailableException) {
            log.warn("insrc: could not reach the daemon to enable $projectRootPath", e)
            notify("insrc could not reach the daemon to enable this project.")
            return
        }
        if (result.registered) {
            notify("insrc enabled for this project.")
        } else {
            notify(result.reason ?: "insrc could not enable this project.")
        }
    }

    override fun onPluginUninstalled() {
        // True uninstall only (sc1 routing). Reverse both insrc writes per detected host. The mcp
        // config and the rules file are INDEPENDENT files, so each removal is its own runCatching:
        // a failure removing one host's mcp entry must not skip that same host's (writable) rules
        // block, and one host's failure must not block the other (ac4/lc2 — restore as much as
        // possible to the pre-insrc state).
        for (host in adapter.detectPresent()) {
            runCatching { adapter.removeMcpRegistration(host) }
                .onFailure { e -> log.warn("insrc: failed to remove mcp registration for host ${host.kind}", e) }
            runCatching { adapter.removeRulesBlock(host) }
                .onFailure { e -> log.warn("insrc: failed to remove rules block for host ${host.kind}", e) }
        }
    }

    companion object {
        private val DEFAULT_EXECUTOR = com.intellij.util.concurrency.AppExecutorUtil.getAppExecutorService()

        /**
         * Assemble the production consumer with real collaborators: the app-scoped sc2 gateway, the
         * real sc3 [AiHostAdapterImpl], the IDE notification offer, and IDE info notifications.
         */
        fun production(): OnboardingLifecycle {
            val gateway = com.intellij.openapi.components.service<DaemonGatewayService>()
            return OnboardingLifecycle(
                gateway = gateway,
                adapter = AiHostAdapterImpl(),
                offer = NotificationOnboardingOffer,
                notify = ::showInfoNotification,
            )
        }

        private fun showInfoNotification(message: String) {
            com.intellij.notification.NotificationGroupManager.getInstance()
                .getNotificationGroup("insrc")
                .createNotification(message, com.intellij.notification.NotificationType.INFORMATION)
                .notify(null)
        }
    }
}
