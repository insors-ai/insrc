package ai.insors.insrc.jetbrains.debug

import ai.insors.insrc.jetbrains.host.AiHost
import ai.insors.insrc.jetbrains.host.AiHostKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

/**
 * Unit tests for the MCP registration reader (Story E2026092157298940:S005 / t2+t5).
 * Platform-free: the reader folds an INJECTED detectPresent() + isInsrcRegistered() seam,
 * so no IDE fixture / real host is needed. Also exercises the default
 * [McpRegistrationReader.mcpServersInsrcPresent] helper over on-disk temp JSON.
 */
class McpRegistrationReaderTest {

    private fun host(kind: AiHostKind, mcp: String = "/tmp/${kind.name}/mcp.json") =
        AiHost(kind, mcp, "/tmp/${kind.name}/rules.md")

    // ---- The fold: one row per detected host, registered from the seam --------

    @Test
    fun `read returns one row per detected host in detectPresent order with registered from the seam`() {
        val hosts = listOf(host(AiHostKind.AI_ASSISTANT), host(AiHostKind.JUNIE))
        // Registered only for AI_ASSISTANT.
        val reader = McpRegistrationReader(
            detectPresent = { hosts },
            isInsrcRegistered = { path -> path.contains("AI_ASSISTANT") },
        )
        val rows = reader.read()
        assertEquals(listOf(AiHostKind.AI_ASSISTANT, AiHostKind.JUNIE), rows.map { it.kind }, "in detectPresent order")
        assertTrue(rows.all { it.present }, "a detected host is always present")
        assertTrue(rows[0].registered, "AI_ASSISTANT has mcpServers.insrc")
        assertFalse(rows[1].registered, "JUNIE does not")
    }

    @Test
    fun `read folds a per-host registration-read failure to registered=false, not a throw`() {
        val reader = McpRegistrationReader(
            detectPresent = { listOf(host(AiHostKind.JUNIE)) },
            isInsrcRegistered = { throw RuntimeException("insrc-test: config unreadable") },
        )
        val rows = reader.read()
        assertEquals(1, rows.size)
        assertTrue(rows[0].present)
        assertFalse(rows[0].registered, "a config read failure -> present-but-not-registered")
    }

    @Test
    fun `read yields an empty list when host-detection itself fails`() {
        val reader = McpRegistrationReader(
            detectPresent = { throw RuntimeException("insrc-test: detection probe failed") },
            isInsrcRegistered = { true },
        )
        assertTrue(reader.read().isEmpty(), "a detectPresent() failure -> empty list")
    }

    @Test
    fun `read yields an empty list when no hosts are detected`() {
        val reader = McpRegistrationReader(detectPresent = { emptyList() }, isInsrcRegistered = { true })
        assertTrue(reader.read().isEmpty())
    }

    // ---- The default mcpServers.insrc key-read helper over temp JSON ----------

    @Test
    fun `mcpServersInsrcPresent is true only when the mcpServers-insrc key is present`() {
        val dir = Files.createTempDirectory("insrc-mcp-reg")

        val present = writeJson(dir, "present.json", """{"mcpServers":{"insrc":{"command":"x"},"other":{"command":"y"}}}""")
        assertTrue(McpRegistrationReader.mcpServersInsrcPresent(present))

        val absent = writeJson(dir, "absent.json", """{"mcpServers":{"other":{"command":"y"}}}""")
        assertFalse(McpRegistrationReader.mcpServersInsrcPresent(absent))

        val noServers = writeJson(dir, "noservers.json", """{"somethingElse":true}""")
        assertFalse(McpRegistrationReader.mcpServersInsrcPresent(noServers))
    }

    @Test
    fun `mcpServersInsrcPresent folds a malformed or missing file to false without throwing`() {
        val dir = Files.createTempDirectory("insrc-mcp-reg")
        val malformed = writeJson(dir, "malformed.json", """{ not json at all """)
        assertFalse(McpRegistrationReader.mcpServersInsrcPresent(malformed), "malformed JSON -> false")
        assertFalse(
            McpRegistrationReader.mcpServersInsrcPresent(dir.resolve("does-not-exist.json").toString()),
            "a missing file -> false",
        )
    }

    private fun writeJson(dir: Path, name: String, content: String): String {
        val f = dir.resolve(name)
        Files.writeString(f, content)
        return f.toString()
    }
}
