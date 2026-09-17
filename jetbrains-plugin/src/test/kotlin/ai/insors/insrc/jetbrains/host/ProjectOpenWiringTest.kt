package ai.insors.insrc.jetbrains.host

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.ProjectContext
import com.google.gson.JsonParser
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.io.IOException
import java.nio.file.Files

/**
 * sc3 project-open wiring integration tests (Story S002 / t5). Run inside the
 * IntelliJ Platform test fixture and drive [McpWiringLifecycle] with an
 * [AiHostAdapterImpl] whose detection is stubbed to hosts pointing at temp
 * config files, proving: on project open a VALID, host-consumable JSON
 * registration (parsed, not substring-matched) lands under `mcpServers.insrc`
 * scoped to the opened project (ac1/ac3); no host present is a no-op; and a write
 * failure on one host does not block the other (and S002 issues only mcp writes —
 * never rules, never a remove).
 *
 * JUnit4-style (BasePlatformTestCase); run under the vintage engine.
 */
class ProjectOpenWiringTest : BasePlatformTestCase() {

    private val LAUNCH = "/home/dev/.insrc/daemon/out/bin/insrc-mcp.js"

    private fun present(host: AiHost) = HostProbe { HostResolution.Present(host) }

    private fun tempHost(kind: AiHostKind): AiHost {
        val dir = Files.createTempDirectory("insrc-host-${kind.name}")
        return AiHost(
            kind = kind,
            mcpConfigPath = dir.resolve("mcp.json").toString(),
            rulesFilePath = dir.resolve("rules.md").toString(),
        )
    }

    /** Reads the written mcp.json and returns the insrc server entry, asserting valid JSON. */
    private fun insrcEntry(host: AiHost) =
        JsonParser.parseString(Files.readString(java.nio.file.Path.of(host.mcpConfigPath)))
            .asJsonObject.getAsJsonObject("mcpServers").getAsJsonObject("insrc")

    /** Records every adapter call so we can prove S002 issues ONLY mcp writes. */
    private class RecordingAdapter(private val delegate: AiHostAdapter) : AiHostAdapter {
        val mcpWrites = mutableListOf<AiHost>()
        var mcpRemoveCalls = 0
        var rulesWriteCalls = 0
        var rulesRemoveCalls = 0
        override fun detectPresent(): List<AiHost> = delegate.detectPresent()
        override fun writeMcpRegistration(host: AiHost, serverEntryJson: String) {
            mcpWrites += host
            delegate.writeMcpRegistration(host, serverEntryJson)
        }
        override fun removeMcpRegistration(host: AiHost) { mcpRemoveCalls++; delegate.removeMcpRegistration(host) }
        override fun writeRulesBlock(host: AiHost, block: MarkerDelimitedBlock) { rulesWriteCalls++; delegate.writeRulesBlock(host, block) }
        override fun removeRulesBlock(host: AiHost) { rulesRemoveCalls++; delegate.removeRulesBlock(host) }
    }

    fun testOneHostPresent_writesRegistrationIntoItsMcpConfig() {
        val host = tempHost(AiHostKind.AI_ASSISTANT)
        val adapter = AiHostAdapterImpl(HostDetector(listOf(present(host))), JsonMcpConfigWriter())
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        val entry = insrcEntry(host) // valid JSON with mcpServers.insrc (ac1)
        assertEquals("node", entry.get("command").asString)
        assertEquals("registration launches the stdio insrc-mcp", LAUNCH, entry.getAsJsonArray("args").get(0).asString)
        assertEquals("registration is scoped to the opened project's root via cwd", project.basePath, entry.get("cwd").asString)
        // 'rules' file is S004's — never written by S002
        assertFalse("S002 must not create the rules file", Files.exists(java.nio.file.Path.of(host.rulesFilePath)))
    }

    fun testBothHostsPresent_eachConfigReceivesRegistration() {
        val a = tempHost(AiHostKind.AI_ASSISTANT)
        val b = tempHost(AiHostKind.JUNIE)
        val adapter = AiHostAdapterImpl(HostDetector(listOf(present(a), present(b))), JsonMcpConfigWriter())
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        for (host in listOf(a, b)) {
            val entry = insrcEntry(host) // each is valid JSON with the insrc entry (ac3)
            assertEquals("node", entry.get("command").asString)
            assertEquals(LAUNCH, entry.getAsJsonArray("args").get(0).asString)
        }
    }

    fun testNoHostPresent_nothingWritten_noop() {
        // detection empty -> no-op. Assert the writer's IO is never touched by
        // COUNTING calls (not by throwing — a throw would be swallowed by the
        // lifecycle's per-host runCatching and prove nothing).
        var reads = 0
        var writes = 0
        val countingIo = object : HostFileIo {
            override fun read(path: String): String? { reads++; return null }
            override fun write(path: String, content: String) { writes++ }
        }
        val adapter = AiHostAdapterImpl(HostDetector(listOf(HostProbe { HostResolution.Absent })), JsonMcpConfigWriter(countingIo))
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        assertEquals("no host present -> writer never read", 0, reads)
        assertEquals("no host present -> writer never wrote", 0, writes)
    }

    fun testOneHostWriteFails_otherHostStillWired_onlyMcpFileWritten() {
        val a = tempHost(AiHostKind.AI_ASSISTANT) // this host's write will fail
        val b = tempHost(AiHostKind.JUNIE)        // this host must still be wired
        val store = HashMap<String, String?>()
        val written = mutableListOf<String>()
        val io = object : HostFileIo {
            override fun read(path: String): String? = store[path]
            override fun write(path: String, content: String) {
                if (path == a.mcpConfigPath) throw IOException("permission denied")
                store[path] = content
                written += path
            }
        }
        val adapter = RecordingAdapter(AiHostAdapterImpl(HostDetector(listOf(present(a), present(b))), JsonMcpConfigWriter(io)))
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        // isolation: both hosts were attempted, but only host b's file was actually written
        assertEquals("both present hosts were attempted", 2, adapter.mcpWrites.size)
        assertEquals("only host b's mcp file is written (a failed, isolated)", listOf(b.mcpConfigPath), written)
        // non-tautological proof S002 issues ONLY mcp writes: no rules write, no remove of any kind
        assertEquals("S002 never writes the rules file (that is S004)", 0, adapter.rulesWriteCalls)
        assertEquals("S002 never removes the mcp registration (that is S005)", 0, adapter.mcpRemoveCalls)
        assertEquals("S002 never removes the rules block (that is S005)", 0, adapter.rulesRemoveCalls)
    }
}
