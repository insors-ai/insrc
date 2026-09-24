package ai.insors.insrc.jetbrains.platform

import ai.insors.insrc.jetbrains.InsrcPlugin
import ai.insors.insrc.jetbrains.LifecycleBroadcaster
import ai.insors.insrc.jetbrains.PluginStateEvent
import ai.insors.insrc.jetbrains.UninstallPolicy
import ai.insors.insrc.jetbrains.freshness.InstalledCommitFreshnessConsumer
import ai.insors.insrc.jetbrains.host.McpWiringLifecycle
import ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleService
import ai.insors.insrc.jetbrains.onboarding.OnboardingLifecycle
import ai.insors.insrc.jetbrains.steering.SteeringInjectionLifecycle
import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.ide.plugins.PluginInstaller
import com.intellij.ide.plugins.PluginStateListener
import com.intellij.openapi.diagnostic.logger
import org.jetbrains.annotations.TestOnly
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * sc1 uninstall adapter (Story S001 / t2).
 *
 * The platform calls [PluginStateListener.uninstall] ONLY when a plugin is
 * actually uninstalled — a mere *disable* raises no such event — so routing
 * `onPluginUninstalled` off this callback is precisely the uninstall-vs-disable
 * distinction the contract requires. [UninstallPolicy] makes that rule explicit
 * and unit-testable.
 */
internal class InsrcPluginStateListener : PluginStateListener {
    override fun install(descriptor: IdeaPluginDescriptor) {
        // Not our concern.
    }

    override fun uninstall(descriptor: IdeaPluginDescriptor) {
        if (descriptor.pluginId?.idString != InsrcPlugin.PLUGIN_ID) return
        if (UninstallPolicy.shouldSignalUninstall(PluginStateEvent.UNINSTALL)) {
            LifecycleBroadcaster.firePluginUninstalled()
        }
    }
}

/**
 * A one-shot guard: [run] executes its action AT MOST ONCE across the process,
 * even under concurrent callers — the first `compareAndSet` winner runs it. A
 * throwable from the action is caught + logged; the flag stays claimed so the
 * app never spin-retries on later calls. Extracted as an instantiable class so
 * the exactly-once behaviour is unit-testable off-platform (Story S001).
 */
internal class RunOnce {
    private val done = AtomicBoolean(false)
    private val complete = CountDownLatch(1)

    /**
     * Runs [action] iff this is the first call; returns whether it ran now. A
     * concurrent LOSER blocks until the winner's action has fully completed, so
     * no caller ever proceeds while the winner is mid-run (e.g. observing a
     * half-registered consumer list). The `finally` guarantees the latch drops
     * even if the action throws, so losers never hang.
     */
    fun run(action: () -> Unit): Boolean {
        if (!done.compareAndSet(false, true)) {
            complete.await()
            return false
        }
        try {
            action()
        } catch (t: Throwable) {
            log.warn("insrc: app-scoped consumer registration failed", t)
        } finally {
            complete.countDown()
        }
        return true
    }

    private companion object {
        private val log = logger<RunOnce>()
    }
}

/**
 * Registers the application-scoped sc1 consumers EXACTLY ONCE per process,
 * lazily on the first project open (invoked from [InsrcProjectOpenActivity]):
 *
 * - [InsrcPluginStateListener] routes true uninstalls to `onPluginUninstalled`;
 * - [McpWiringLifecycle] (Story S002 / t5) wires insrc-mcp into each detected host;
 * - [DaemonLifecycleService] (Story S003 / t7) keeps the backing daemon present/current;
 * - [SteeringInjectionLifecycle] (Story S004 / t4) injects the tracked-workflow steering;
 * - [OnboardingLifecycle] (Story S005 / t3) offers one-click registration + uninstall cleanup;
 * - [InstalledCommitFreshnessConsumer] (daemon-auto-update S004) keeps the daemon at the
 *   upstream commit (git-commit freshness check + self-update over the daemon-owned IPC).
 *
 * This replaces the former `InsrcAppLifecycle : AppLifecycleListener.appStarted()`
 * (an `@ApiStatus.Internal` hook flagged by the Plugin Verifier). The consumers act
 * only on project-open / uninstall, so first-project-open registration is equivalent
 * in effect while using only stable public platform APIs (ProjectActivity + a run-once
 * guard).
 */
internal object AppScopedConsumers {
    @Volatile private var guard = RunOnce()

    /** Idempotent: registers the five consumers on the first call, no-ops after. */
    fun ensureRegistered() = guard.run {
        PluginInstaller.addStateListener(InsrcPluginStateListener())
        LifecycleBroadcaster.register(McpWiringLifecycle())
        LifecycleBroadcaster.register(DaemonLifecycleService.production())
        LifecycleBroadcaster.register(SteeringInjectionLifecycle())
        LifecycleBroadcaster.register(OnboardingLifecycle.production())
        // S004: keep the backing daemon current (git-commit freshness check + self-update).
        LifecycleBroadcaster.register(InstalledCommitFreshnessConsumer.production())
    }

    /**
     * Test seam: claim the guard with a no-op so a fixture test that drives
     * [InsrcProjectOpenActivity].execute stays hermetic — the real production
     * consumers are never registered (no writes to a developer's real host files).
     */
    @TestOnly
    fun claimForTest() = guard.run { }

    /** Test seam: re-arm the guard for the next test. */
    @TestOnly
    fun resetForTest() { guard = RunOnce() }
}
