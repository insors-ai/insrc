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
 * (and S002 writes only the 'mcp' file — never 'rules', never removeBlock).
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

    fun testProjectOpenWritesRegistrationIntoTheSinglePresentHostMcpConfig() {
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

    fun testBothHostsPresentEachMcpConfigReceivesTheRegistration() {
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

    fun testNoHostPresentWritesNothing() {
        // detection empty -> no-op: a writer that must never be called
        val neverWriter = MarkerFileWriter(object : HostFileIo {
            override fun read(path: String): String? =
                throw AssertionError("read must not be called when no host is present")
            override fun write(path: String, content: String): Unit =
                throw AssertionError("write must not be called when no host is present")
        })
        val adapter = AiHostAdapterImpl(HostDetector(listOf(HostProbe { HostResolution.Absent })), neverWriter)
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        // must simply return without touching the writer
        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))
    }

    fun testOneHostWriteFailsOtherStillWiredAndOnlyMcpFileWritten() {
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
        val adapter = AiHostAdapterImpl(HostDetector(listOf(present(a), present(b))), MarkerFileWriter(io))
        val wiring = McpWiringLifecycle(adapter) { LAUNCH }

        // host a's failure is caught+logged; host b is still wired
        wiring.onProjectOpened(ProjectContext(project.basePath!!, IdeKind.IDEA))

        assertEquals("only host b's mcp file is written (a failed, isolated)", listOf(b.mcpConfigPath), written)
        // S002 writes ONLY the 'mcp' file — no 'rules' file, no removeBlock, for either host
        assertFalse(written.contains(a.rulesFilePath))
        assertFalse(written.contains(b.rulesFilePath))
    }
}
