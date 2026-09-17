package ai.insors.insrc.jetbrains

/**
 * Marker + shared constants for the insrc JetBrains plugin.
 *
 * Task t1 (scaffold) only stands up the module; sc1 lifecycle (t2) and sc2
 * [DaemonGateway][ai.insors.insrc.jetbrains.daemon] (t3) attach their real
 * behaviour to the surfaces declared in `META-INF/plugin.xml`. This object
 * exists so the module has a compiled Kotlin entry point and a single place
 * for the plugin id used when locating the descriptor.
 */
object InsrcPlugin {
    /** Must match the `<id>` in `META-INF/plugin.xml`. */
    const val PLUGIN_ID: String = "ai.insors.insrc"
}
