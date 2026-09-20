package ai.insors.insrc.jetbrains.host

import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.extensions.PluginId
import java.nio.file.Files
import java.nio.file.Path

/**
 * The real per-host probes for the two JetBrains agentic hosts (Story S002 / t3)
 * — the one external (`c8`) surface. Each probe answers, for its host: is the
 * host plugin installed+enabled, is its config shape one we can safely anchor
 * into, and where are its MCP-config and rules files.
 *
 * Everything host-specific (plugin id, file layout, recognised shape) is isolated
 * here behind [HostProbe] so the rest of sc3 stays host-agnostic. All resolution
 * is fail-safe: anything we cannot confirm yields [HostResolution.Absent] or
 * [HostResolution.Unrecognised] rather than a broken host — the [HostDetector]
 * omits those, so the writer only ever sees a recognised, anchored file.
 *
 * NOTE: the plugin ids and config/rules locations below are the external
 * assumption this seam encapsulates; they are the single place to adjust as the
 * hosts evolve, and every unknown is treated fail-safe.
 */
object JetBrainsHostProbes {

    /** External assumption (c8): the host plugin ids and their host-owned files. */
    private data class HostSpec(
        val kind: AiHostKind,
        val pluginIds: List<String>,
        val mcpConfigPath: Path,
        val rulesFilePath: Path,
    )

    private fun userHome(): Path = Path.of(System.getProperty("user.home"))

    private fun specFor(kind: AiHostKind): HostSpec {
        val home = userHome()
        return when (kind) {
            AiHostKind.AI_ASSISTANT -> HostSpec(
                kind = kind,
                pluginIds = listOf("com.intellij.ml.llm"),
                mcpConfigPath = home.resolve(".config").resolve("insrc-ai-assistant").resolve("mcp.json"),
                rulesFilePath = home.resolve(".config").resolve("insrc-ai-assistant").resolve("rules.md"),
            )
            AiHostKind.JUNIE -> HostSpec(
                kind = kind,
                pluginIds = listOf("com.intellij.ml.llm.junie", "com.jetbrains.junie"),
                mcpConfigPath = home.resolve(".junie").resolve("mcp.json"),
                rulesFilePath = home.resolve(".junie").resolve("guidelines.md"),
            )
        }
    }

    /** The probes for every host kind, in a stable order. */
    fun all(): List<HostProbe> = AiHostKind.entries.map { kind -> probeFor(specFor(kind)) }

    private fun probeFor(spec: HostSpec): HostProbe = HostProbe {
        if (!isInstalledAndEnabled(spec.pluginIds)) {
            HostResolution.Absent
        } else {
            val mcp = recogniseAnchorable(spec.mcpConfigPath)
                ?: return@HostProbe HostResolution.Unrecognised(
                    "${spec.kind} mcp config not safely anchorable: ${spec.mcpConfigPath}",
                )
            HostResolution.Present(
                AiHost(
                    kind = spec.kind,
                    mcpConfigPath = mcp,
                    rulesFilePath = spec.rulesFilePath.toAbsolutePath().toString(),
                ),
            )
        }
    }

    /** Installed AND enabled — a disabled or absent plugin is treated as not present. */
    private fun isInstalledAndEnabled(pluginIds: List<String>): Boolean {
        // Public, non-deprecated API: getLoadedPlugins() is the set of installed AND
        // enabled plugins (a disabled plugin is not loaded) — same semantics we need,
        // without the @ApiStatus.Internal PluginManager.findEnabledPlugin (which the
        // Plugin Verifier flags) or the deprecated PluginManager.getPlugin.
        val loaded = PluginManager.getLoadedPlugins()
        return pluginIds.any { id ->
            val pid = PluginId.getId(id)
            loaded.any { it.pluginId == pid }
        }
    }

    /**
     * Recognise a host file we can safely anchor a marker block into (c8), or
     * `null` to fail-safe skip. An ABSENT file is fine — the writer creates it.
     * A present file must be readable and look like the expected JSON container;
     * an unreadable or unexpected shape is skipped rather than written into.
     * Returns the absolute path when anchorable.
     */
    private fun recogniseAnchorable(path: Path): String? {
        val abs = path.toAbsolutePath()
        if (!Files.exists(abs)) return abs.toString() // absent -> will be created
        return try {
            val text = Files.readString(abs).trim()
            // Recognised shapes: empty, or a JSON object/array container we can
            // sit a marker-delimited block alongside. Anything else -> skip.
            if (text.isEmpty() || text.startsWith("{") || text.startsWith("[")) abs.toString() else null
        } catch (e: java.io.IOException) {
            null // unreadable -> fail-safe skip
        }
    }
}
