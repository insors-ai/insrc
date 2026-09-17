package ai.insors.insrc.jetbrains.lifecycle

import ai.insors.insrc.jetbrains.PluginLifecycle
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import com.intellij.openapi.diagnostic.logger
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The sc1 consumer that keeps insrc's backing daemon present/current on project
 * open (Story S003 / t7). Subscribed to the [LifecycleBroadcaster][ai.insors.insrc.jetbrains.LifecycleBroadcaster];
 * `onProjectOpened` is delivered from the off-EDT project-open ProjectActivity,
 * and the work is additionally dispatched through [execute] so project opening is
 * never blocked.
 *
 * It probes sc2, applies [DaemonSetupPolicy] with the persisted consent, and:
 *  - NoOp when CURRENT;
 *  - OfferSetup -> surfaces a single one-click action ([offerSetup]); on accept it
 *    records consent and runs (ac1);
 *  - RunSilently -> runs directly (ac2), reporting a failure via a non-modal [notify].
 * A single-flight guard serialises concurrent project-open triggers so the
 * app-scoped daemon is never double-installed. It owns no shared contract, never
 * calls registerProject (S005), and never touches sc3 (S002).
 *
 * All collaborators are injected so the orchestration is unit/integration-testable;
 * [production] wires the real defaults.
 */
class DaemonLifecycleService(
    private val gateway: DaemonGateway,
    private val consent: SetupConsentStore,
    private val resolver: NodeRuntimeResolver,
    private val provisioner: DaemonProvisioner,
    private val offerSetup: (kind: ProvisionKind, onAccept: () -> Unit) -> Unit,
    private val notify: (message: String) -> Unit,
    private val policy: DaemonSetupPolicy = DefaultDaemonSetupPolicy,
    private val execute: (Runnable) -> Unit = { r -> DEFAULT_EXECUTOR.execute(r) },
) : PluginLifecycle {

    private val log = logger<DaemonLifecycleService>()
    private val inFlight = AtomicBoolean(false)

    override fun onProjectOpened(ctx: ProjectContext) {
        // Probe + decide runs off the EDT (project opening is never blocked). The
        // single-flight guard is NOT taken here — it protects the actual setup
        // ([startSetup]), so a passive OfferSetup offer never holds it, and the
        // RunSilently and the (later, on-EDT) OfferSetup-accept paths are BOTH
        // guarded + dispatched off-EDT.
        execute {
            try {
                evaluate()
            } catch (t: Throwable) {
                log.warn("insrc: daemon-lifecycle evaluation failed", t)
            }
        }
    }

    /** Uninstall cleanup is S005's concern; S003 does nothing here. */
    override fun onPluginUninstalled() {
        // no-op
    }

    private fun evaluate() {
        val state = gateway.probe() // never throws: unreachable -> ABSENT
        when (val action = policy.decide(state, consent.isConsented())) {
            DaemonSetupAction.NoOp -> Unit
            // Surface the passive one-click offer; the ACCEPT (which may fire later
            // on the EDT) re-enters the guarded, off-EDT setup path.
            is DaemonSetupAction.OfferSetup -> offerSetup(action.kind) {
                startSetup(action.kind, recordConsent = true)
            }
            is DaemonSetupAction.RunSilently -> startSetup(action.kind, recordConsent = false)
        }
    }

    /**
     * Single-flight + off-EDT dispatch for the actual install/update. A second
     * (near-)concurrent trigger — whether a silent re-check or a second window's
     * accepted offer — observes the in-flight run and no-ops, so the app-scoped
     * daemon is never double-installed; the work always runs off the EDT.
     */
    private fun startSetup(kind: ProvisionKind, recordConsent: Boolean) {
        if (!inFlight.compareAndSet(false, true)) return
        execute {
            try {
                if (recordConsent) consent.recordConsent()
                performSetup(kind)
            } catch (t: Throwable) {
                log.warn("insrc: daemon $kind failed", t)
            } finally {
                inFlight.set(false)
            }
        }
    }

    private fun performSetup(kind: ProvisionKind) {
        val node = try {
            resolver.resolve()
        } catch (e: NodeProvisioningException) {
            notify("insrc could not set up the runtime it needs: ${e.message}")
            return
        }
        val outcome = provisioner.run(kind, node)
        if (!outcome.ok) {
            notify(outcome.reason ?: "insrc daemon setup did not complete")
        } else {
            log.info("insrc: daemon $kind completed")
        }
    }

    companion object {
        private val DEFAULT_EXECUTOR = com.intellij.util.concurrency.AppExecutorUtil.getAppExecutorService()

        /**
         * Assemble the production service with real collaborators: the app-scoped
         * sc2 gateway + consent store, the tiered runtime resolver over the system
         * Node / a provisioned private Node, the script-delegating provisioner, and
         * IDE notifications for the one-click offer / failure reports.
         *
         * NOTE (external): [DefaultDaemonScriptLocator] resolves the backend scripts
         * under `~/.insrc/daemon/scripts`; when the daemon is entirely absent the
         * install script is not yet on disk, so a first install surfaces the
         * "tooling unavailable" outcome until the scripts are provisioned. Shipping
         * the install script to a fresh machine is a follow-up on this seam.
         */
        fun production(): DaemonLifecycleService {
            val gateway = com.intellij.openapi.components.service<ai.insors.insrc.jetbrains.daemon.DaemonGatewayService>()
            val consent = com.intellij.openapi.components.service<SetupConsentStoreService>()
            val resolver = DefaultNodeRuntimeResolver(RealSystemNodeProbe, DefaultPrivateNodeProvisioner())
            val provisioner = ScriptDaemonProvisioner(
                ScriptDaemonProvisioner.ProcessBuilderRunner(),
                DefaultDaemonScriptLocator(),
            )
            return DaemonLifecycleService(
                gateway = gateway,
                consent = consent,
                resolver = resolver,
                provisioner = provisioner,
                offerSetup = ::showOfferSetupNotification,
                notify = ::showInfoNotification,
            )
        }

        private fun notificationGroup() =
            com.intellij.notification.NotificationGroupManager.getInstance().getNotificationGroup("insrc")

        private fun showOfferSetupNotification(kind: ProvisionKind, onAccept: () -> Unit) {
            val verb = if (kind == ProvisionKind.INSTALL) "set up" else "update"
            val n = notificationGroup().createNotification(
                "insrc: $verb the backing service?",
                com.intellij.notification.NotificationType.INFORMATION,
            )
            n.addAction(com.intellij.notification.NotificationAction.createSimple(verb.replaceFirstChar { it.uppercase() }) {
                n.expire()
                onAccept()
            })
            n.notify(null)
        }

        private fun showInfoNotification(message: String) {
            notificationGroup()
                .createNotification(message, com.intellij.notification.NotificationType.INFORMATION)
                .notify(null)
        }
    }
}

/** Real system-Node probe (Story S003) — runs `node -v`, returning null when node is absent/erroring. */
object RealSystemNodeProbe : SystemNodeProbe {
    override fun detect(): SystemNode? =
        try {
            val process = ProcessBuilder("node", "-v").redirectErrorStream(true).start()
            val output = process.inputStream.bufferedReader().readText().trim()
            if (process.waitFor() == 0 && output.isNotEmpty()) SystemNode(executablePath = "node", versionOutput = output) else null
        } catch (e: Exception) {
            null
        }
}

/**
 * Locates the backend scripts under `~/.insrc/daemon/scripts` (Story S003):
 * INSTALL -> insrc-daemon-install.sh, UPDATE -> daemon-ctl.sh; `null` when absent
 * so the provisioner fail-safes rather than reproducing their logic (lc1/k5).
 */
class DefaultDaemonScriptLocator(
    homeDir: java.nio.file.Path = java.nio.file.Path.of(System.getProperty("user.home")),
) : DaemonScriptLocator {
    private val scriptsDir = homeDir.resolve(".insrc").resolve("daemon").resolve("scripts")

    override fun scriptFor(kind: ProvisionKind): java.nio.file.Path? {
        val name = when (kind) {
            ProvisionKind.INSTALL -> "insrc-daemon-install.sh"
            ProvisionKind.UPDATE -> "daemon-ctl.sh"
        }
        val path = scriptsDir.resolve(name)
        return if (java.nio.file.Files.exists(path)) path else null
    }
}
