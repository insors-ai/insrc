package ai.insors.insrc.jetbrains.host

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.ProjectContext
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.io.IOException
import java.nio.file.Files

/**
 * sc3 project-open wiring integration tests (Story S002 / t5). Run inside the
 * IntelliJ Platform test fixture and drive [McpWiringLifecycle] with an
 * [AiHostAdapterImpl] whose detection is stubbed to hosts pointing at temp
 * config files, proving: on project open the marker-delimited insrc-mcp
 * registration is written into each present host's mcp file (ac1/ac3); no host
 * present is a no-op; and a write failure on one host does not block the other
 * (and S002 issues only 'mcp' writes — never 'rules', never removeBlock).
 *
 * JUnit4-style (BasePlatformTestCase); run under the vintage engine.
 */
class ProjectOpenWiringTest : BasePlatformTestCase() {

    private val LAUNCH = "/home/dev/.insrc/daemon/out/bin/insrc-mcp.js"

    /** A stub probe that reports the given host present. */
    private fun present(host: AiHost) = HostProbe { HostResolution.Present(host) }

    private fun tempHost(kind: AiHostKind): AiHost {
        val dir = Files.createTempDirectory("insrc-host-${kind.name}")
        return AiHost(
            kind = kind,
            mcpConfigPath = dir.resolve("mcp.json").toString(),
            rulesFilePath = dir.resolve("rules.md").toString(),
        )
    }

    /** Records every (host,file) write and any removeBlock call, then delegates. */
    private class RecordingAdapter(private val delegate: AiHostAdapter) : AiHostAdapter {
        val writes = mutableListOf<Pair<AiHost, HostFile>>()
        var removeCalls = 0
        override fun detectPresent(): List<AiHost> = delegate.detectPresent()
        override fun writeBlock(host: AiHost, file: HostFile, block: MarkerDelimitedBlock) {
            writes += host to file
            delegate.writeBlock(host, file, block)
        }
        override fun removeBlock(host: AiHost, file: HostFile) {
            removeCalls++
            delegate.removeBlock(host, file)
        }
    }

    fun testOneHostPresent_writesRegistrationIntoItsMcpConfig() {
        val host = tempHost(AiHostKind.AI_ASSISTANT)
        val adapter = AiHostAdapterImpl(HostDetector(listOf(present(host))), MarkerFileWriter())
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        val written = Files.readString(java.nio.file.Path.of(host.mcpConfigPath))
        assertTrue("mcp config carries the marker-delimited insrc block (ac1)", written.contains(InsrcMcpRegistration.MCP_BEGIN))
        assertTrue("registration launches the stdio insrc-mcp", written.contains(LAUNCH))
        assertTrue("registration is scoped to the opened project's root", written.contains(project.basePath!!))
        // 'rules' file is S004's — never written by S002
        assertFalse("S002 must not create the rules file", Files.exists(java.nio.file.Path.of(host.rulesFilePath)))
    }

    fun testBothHostsPresent_eachConfigReceivesRegistration() {
        val a = tempHost(AiHostKind.AI_ASSISTANT)
        val b = tempHost(AiHostKind.JUNIE)
        val adapter = AiHostAdapterImpl(HostDetector(listOf(present(a), present(b))), MarkerFileWriter())
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        for (host in listOf(a, b)) {
            val written = Files.readString(java.nio.file.Path.of(host.mcpConfigPath))
            assertTrue("each present host's mcp config receives the registration (ac3)", written.contains(InsrcMcpRegistration.MCP_BEGIN))
            assertTrue(written.contains(LAUNCH))
        }
    }

    fun testNoHostPresent_nothingWritten_noop() {
        // detection empty -> no-op. Assert the writer's IO is never touched by
        // COUNTING calls (not by throwing — a throw inside writeBlock would be
        // swallowed by the lifecycle's per-host runCatching and prove nothing).
        var reads = 0
        var writes = 0
        val countingIo = object : HostFileIo {
            override fun read(path: String): String? { reads++; return null }
            override fun write(path: String, content: String) { writes++ }
        }
        val adapter = AiHostAdapterImpl(HostDetector(listOf(HostProbe { HostResolution.Absent })), MarkerFileWriter(countingIo))
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
        val adapter = RecordingAdapter(AiHostAdapterImpl(HostDetector(listOf(present(a), present(b))), MarkerFileWriter(io)))
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        // host a's failure is caught+logged; host b is still wired
        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        // isolation: only host b's mcp file actually got written (a failed)
        assertEquals("only host b's mcp file is written (a failed, isolated)", listOf(b.mcpConfigPath), written)
        // non-tautological proof that S002 issues ONLY 'mcp' writes and NO removeBlock:
        // inspect what the lifecycle actually asked the adapter to do.
        assertEquals("both present hosts were asked to be wired", 2, adapter.writes.size)
        assertTrue("every write the lifecycle issued targets the mcp file only", adapter.writes.all { it.second == HostFile.MCP })
        assertEquals("S002 never invokes removeBlock (that is S005)", 0, adapter.removeCalls)
    }
}
