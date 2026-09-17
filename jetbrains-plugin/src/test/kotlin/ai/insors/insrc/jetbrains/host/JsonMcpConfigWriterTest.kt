package ai.insors.insrc.jetbrains.host

import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

/**
 * sc3 JSON mcp-writer unit tests (Story S002 / t2, k4) — platform-free. They
 * drive [JsonMcpConfigWriter] over an in-memory [HostFileIo] and assert the
 * result is ALWAYS valid, host-consumable JSON (parsed, not substring-matched):
 * the insrc entry lands under `mcpServers.insrc`, every other key/server is
 * preserved, the write is idempotent, remove restores prior content, an IO
 * failure surfaces [HostFileAccessException] with no partial write, and a
 * non-JSON config is refused rather than clobbered.
 */
class JsonMcpConfigWriterTest {

    private val ENTRY = """{"command":"node","args":["/d/insrc-mcp.js"],"cwd":"/proj"}"""

    private class FakeIo(
        var content: String? = null,
        val failRead: Boolean = false,
        val failWrite: Boolean = false,
    ) : HostFileIo {
        var writes = 0
        override fun read(path: String): String? {
            if (failRead) throw IOException("read denied")
            return content
        }
        override fun write(path: String, content: String) {
            if (failWrite) throw IOException("write denied")
            this.content = content
            writes++
        }
    }

    @Test
    fun writesValidJson_underMcpServersInsrc_preservingOtherServersAndKeys() {
        val io = FakeIo(
            content = """{"mcpServers":{"other":{"command":"foo"}},"theme":"dark"}""",
        )
        JsonMcpConfigWriter(io).writeInsrcServer("/host/mcp.json", ENTRY)

        val root = JsonParser.parseString(io.content!!).asJsonObject // must be valid JSON
        val servers = root.getAsJsonObject("mcpServers")
        // insrc entry installed with its composed content
        assertEquals("node", servers.getAsJsonObject("insrc").get("command").asString)
        assertEquals("/proj", servers.getAsJsonObject("insrc").get("cwd").asString)
        // other server + unrelated top-level key preserved verbatim
        assertEquals("foo", servers.getAsJsonObject("other").get("command").asString)
        assertEquals("dark", root.get("theme").asString)
    }

    @Test
    fun createsConfigWhenAbsent_andIsIdempotent() {
        val io = FakeIo(content = null)
        val writer = JsonMcpConfigWriter(io)
        writer.writeInsrcServer("/host/mcp.json", ENTRY)
        val root = JsonParser.parseString(io.content!!).asJsonObject
        assertTrue(root.getAsJsonObject("mcpServers").has("insrc"))

        // idempotent: re-writing the identical entry performs no second write
        val writesAfterFirst = io.writes
        writer.writeInsrcServer("/host/mcp.json", ENTRY)
        assertEquals(writesAfterFirst, io.writes, "identical re-write must be a no-op")
    }

    @Test
    fun removeStripsOnlyInsrc_preservesOthers_noopWhenAbsent() {
        val io = FakeIo(content = """{"mcpServers":{"insrc":{"command":"node"},"other":{"command":"foo"}}}""")
        JsonMcpConfigWriter(io).removeInsrcServer("/host/mcp.json")
        val servers = JsonParser.parseString(io.content!!).asJsonObject.getAsJsonObject("mcpServers")
        assertFalse("insrc entry removed", servers.has("insrc"))
        assertTrue("other server preserved", servers.has("other"))

        // no-op when insrc absent / file absent
        val noInsrc = FakeIo(content = """{"mcpServers":{"other":{"command":"foo"}}}""")
        JsonMcpConfigWriter(noInsrc).removeInsrcServer("/host/mcp.json")
        assertEquals(0, noInsrc.writes)
        val absent = FakeIo(content = null)
        JsonMcpConfigWriter(absent).removeInsrcServer("/host/mcp.json")
        assertEquals(0, absent.writes)
    }

    @Test
    fun ioFailure_surfacesHostFileAccessException_noPartialWrite() {
        val original = """{"mcpServers":{}}"""
        val io = FakeIo(content = original, failWrite = true)
        assertThrows(HostFileAccessException::class.java) {
            JsonMcpConfigWriter(io).writeInsrcServer("/host/mcp.json", ENTRY)
        }
        assertEquals(original, io.content, "no partial write — file unchanged on write failure")
    }

    @Test
    fun nonJsonConfig_isRefused_notClobbered() {
        // a config we cannot parse must fail-safe (surface), never be overwritten
        val io = FakeIo(content = "this is not json {{{")
        assertThrows(HostFileAccessException::class.java) {
            JsonMcpConfigWriter(io).writeInsrcServer("/host/mcp.json", ENTRY)
        }
        assertEquals("this is not json {{{", io.content, "malformed config left untouched")
    }
}
