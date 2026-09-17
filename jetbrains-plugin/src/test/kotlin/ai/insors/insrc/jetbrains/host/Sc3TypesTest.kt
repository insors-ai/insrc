package ai.insors.insrc.jetbrains.host

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * sc3 type-surface unit tests (Story S002 / t1) — platform-free. They pin the
 * closed unions ([AiHostKind], [HostFile]) to exactly their declared members and
 * assert the value types ([AiHost], [MarkerDelimitedBlock]) are immutable data
 * carriers with the fields the LLD names. No behaviour is exercised here — the
 * writer, detection, and wiring land in t2..t5.
 */
class Sc3TypesTest {

    @Test
    fun `AiHostKind is the closed union of exactly the two agentic hosts`() {
        assertEquals(
            listOf(AiHostKind.AI_ASSISTANT, AiHostKind.JUNIE),
            AiHostKind.entries.toList(),
        )
    }

    @Test
    fun `HostFile is the closed union of exactly mcp and rules`() {
        assertEquals(
            listOf(HostFile.MCP, HostFile.RULES),
            HostFile.entries.toList(),
        )
    }

    @Test
    fun `AiHost carries kind plus absolute mcp and rules paths`() {
        val host = AiHost(
            kind = AiHostKind.AI_ASSISTANT,
            mcpConfigPath = "/home/dev/.config/host/mcp.json",
            rulesFilePath = "/home/dev/.config/host/rules.md",
        )
        assertEquals(AiHostKind.AI_ASSISTANT, host.kind)
        assertEquals("/home/dev/.config/host/mcp.json", host.mcpConfigPath)
        assertEquals("/home/dev/.config/host/rules.md", host.rulesFilePath)
        // data class: value equality over the declared fields (immutability of the carrier)
        assertEquals(
            host,
            AiHost(AiHostKind.AI_ASSISTANT, "/home/dev/.config/host/mcp.json", "/home/dev/.config/host/rules.md"),
        )
    }

    @Test
    fun `MarkerDelimitedBlock carries beginMarker endMarker and body`() {
        val block = MarkerDelimitedBlock(
            beginMarker = "<!-- insrc:mcp:start -->",
            endMarker = "<!-- insrc:mcp:end -->",
            body = "{ }",
        )
        assertEquals("<!-- insrc:mcp:start -->", block.beginMarker)
        assertEquals("<!-- insrc:mcp:end -->", block.endMarker)
        assertEquals("{ }", block.body)
        assertEquals(
            block,
            MarkerDelimitedBlock("<!-- insrc:mcp:start -->", "<!-- insrc:mcp:end -->", "{ }"),
        )
    }
}
