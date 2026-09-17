package ai.insors.insrc.jetbrains

import com.intellij.openapi.diagnostic.logger

/**
 * The sc1 lifecycle seam (Story S001). Downstream stories (S002 wiring, S003
 * daemon lifecycle, S005 onboarding/cleanup) implement this and subscribe to
 * the [LifecycleBroadcaster]; the platform adapters ([platform]) translate real
 * IDE events into these calls.
 *
 * Both hooks are fire-and-return: they only DELIVER the event. Registration,
 * host wiring, daemon policy, and cleanup are the consumers' concern.
 */
interface PluginLifecycle {
    /** Fired once per opened project window, with that project's context. */
    fun onProjectOpened(ctx: ProjectContext)

    /** Fired only on a true uninstall of the plugin — never on a mere disable. */
    fun onPluginUninstalled()
}

/**
 * The IntelliJ plugin-state transitions the uninstall hook must distinguish.
 * Kept as our own enum so the uninstall-vs-disable rule is unit-testable
 * without constructing platform descriptor objects.
 */
enum class PluginStateEvent {
    INSTALL,
    UPDATE,
    UNINSTALL,
    DISABLE,
}

/** The rule behind [PluginLifecycle.onPluginUninstalled]: fire on UNINSTALL only. */
object UninstallPolicy {
    fun shouldSignalUninstall(event: PluginStateEvent): Boolean =
        event == PluginStateEvent.UNINSTALL
}

/**
 * Application-scoped fan-out of sc1 events to registered [PluginLifecycle]
 * consumers. A single consumer failing must never block project-open or the
 * other consumers, so every delivery is isolated (non-throwing, logged).
 */
object LifecycleBroadcaster {
    private val log = logger<LifecycleBroadcaster>()
    private val listeners = java.util.concurrent.CopyOnWriteArrayList<PluginLifecycle>()

    fun register(listener: PluginLifecycle) {
        listeners.addIfAbsent(listener)
    }

    fun unregister(listener: PluginLifecycle) {
        listeners.remove(listener)
    }

    fun fireProjectOpened(ctx: ProjectContext) {
        for (l in listeners) {
            runCatching { l.onProjectOpened(ctx) }
                .onFailure { log.warn("insrc: onProjectOpened consumer failed for ${ctx.projectRootPath}", it) }
        }
    }

    fun firePluginUninstalled() {
        for (l in listeners) {
            runCatching { l.onPluginUninstalled() }
                .onFailure { log.warn("insrc: onPluginUninstalled consumer failed", it) }
        }
    }

    /** Test/uninstall-cleanup hook: drop all registered consumers. */
    fun clear() = listeners.clear()
}
