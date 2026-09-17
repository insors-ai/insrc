package ai.insors.insrc.jetbrains.platform

import ai.insors.insrc.jetbrains.InsrcPlugin
import ai.insors.insrc.jetbrains.LifecycleBroadcaster
import ai.insors.insrc.jetbrains.PluginStateEvent
import ai.insors.insrc.jetbrains.UninstallPolicy
import ai.insors.insrc.jetbrains.host.McpWiringLifecycle
import ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleService
import ai.insors.insrc.jetbrains.steering.SteeringInjectionLifecycle
import com.intellij.ide.AppLifecycleListener
import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.ide.plugins.PluginInstaller
import com.intellij.ide.plugins.PluginStateListener

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
 * Registers the application-scoped sc1 consumers once the application has
 * started. Wired via `applicationListeners` in `plugin.xml`.
 *
 * - [InsrcPluginStateListener] routes true uninstalls to `onPluginUninstalled`;
 * - [McpWiringLifecycle] (Story S002 / t5) subscribes to the broadcaster so it
 *   wires insrc-mcp into each detected host on every project open;
 * - [DaemonLifecycleService] (Story S003 / t7) subscribes so it keeps the backing
 *   daemon present/current on every project open;
 * - [SteeringInjectionLifecycle] (Story S004 / t4) subscribes so it injects the
 *   tracked-workflow steering into each detected host's rules file on every project open.
 */
internal class InsrcAppLifecycle : AppLifecycleListener {
    override fun appStarted() {
        PluginInstaller.addStateListener(InsrcPluginStateListener())
        LifecycleBroadcaster.register(McpWiringLifecycle())
        LifecycleBroadcaster.register(DaemonLifecycleService.production())
        LifecycleBroadcaster.register(SteeringInjectionLifecycle())
    }
}
