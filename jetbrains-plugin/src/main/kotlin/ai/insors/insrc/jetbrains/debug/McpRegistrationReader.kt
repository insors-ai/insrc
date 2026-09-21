package ai.insors.insrc.jetbrains.debug

import ai.insors.insrc.jetbrains.host.AiHost
import ai.insors.insrc.jetbrains.host.AiHostAdapterImpl
import ai.insors.insrc.jetbrains.host.AiHostKind
import com.google.gson.JsonParser
import java.nio.file.Files
import java.nio.file.Path

/**
 * Per-host MCP registration status (Story E2026092157298940:S005) — one row per AI
 * host the plugin's own host-detection reports. [present] is always true for a detected
 * host (the plugin only sees installed+enabled hosts); [registered] is whether that
 * host's mcp config JSON carries the `mcpServers.insrc` key. The closed [AiHostKind]
 * union {AI_ASSISTANT, JUNIE} is the plugin's MCP-client universe — NOT the CLI's
 * claude/codex. Rendered read-only as one MCP-client row.
 */
data class McpHostStatusDto(
    val kind: AiHostKind,
    val present: Boolean,
    val registered: Boolean,
)

/**
 * Assembles the per-host [McpHostStatusDto] list for the Debug MCP section (Story
 * E2026092157298940:S005 / ac1). A pure fold over the plugin's EXISTING host-detection
 * ([detectPresent], defaulting to the real [AiHostAdapterImpl]) plus a read-only
 * `mcpServers.insrc` key check ([isInsrcRegistered], defaulting to
 * [mcpServersInsrcPresent]). Strictly read-only — it inspects host installations and
 * reads their config files, writing nothing and never reaching into JsonMcpConfigWriter
 * internals (k3). Never throws: a [detectPresent] failure yields an empty list, and a
 * per-host config read that fails (missing / unreadable / malformed JSON) folds to
 * `registered = false` for that host. Every provider is injectable so the fold is
 * unit-testable off the platform.
 */
class McpRegistrationReader(
    private val detectPresent: () -> List<AiHost> = { AiHostAdapterImpl().detectPresent() },
    private val isInsrcRegistered: (mcpConfigPath: String) -> Boolean = ::mcpServersInsrcPresent,
) {

    fun read(): List<McpHostStatusDto> {
        val hosts = try {
            detectPresent()
        } catch (e: Exception) {
            // A host-detection probe failure surfaces as an empty registration table,
            // never a crash (the attached-sessions table is unaffected — it comes from
            // the gateway).
            return emptyList()
        }
        return hosts.map { host ->
            val registered = try {
                isInsrcRegistered(host.mcpConfigPath)
            } catch (e: Exception) {
                // A host with an unreadable/absent/malformed mcp config shows as
                // present-but-not-registered rather than dropping the whole table.
                false
            }
            McpHostStatusDto(kind = host.kind, present = true, registered = registered)
        }
    }

    companion object {
        /**
         * True iff the JSON file at [mcpConfigPath] carries the `mcpServers.insrc` key
         * (mirrors the onboarding registration convention — a JSON key-merge under
         * `mcpServers.insrc`, not a marker block). Read-only; a missing / unreadable /
         * non-object / malformed file yields false, never a throw.
         */
        fun mcpServersInsrcPresent(mcpConfigPath: String): Boolean {
            return try {
                val path: Path = Path.of(mcpConfigPath)
                if (!Files.isRegularFile(path)) return false
                val root = JsonParser.parseString(Files.readString(path))
                if (!root.isJsonObject) return false
                val servers = root.asJsonObject.get("mcpServers") ?: return false
                servers.isJsonObject && servers.asJsonObject.has("insrc")
            } catch (e: Exception) {
                // Unreadable (permissions) / malformed JSON -> not registered, never a throw.
                false
            }
        }
    }
}
