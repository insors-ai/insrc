package ai.insors.insrc.jetbrains.onboarding

import ai.insors.insrc.jetbrains.LifecycleBroadcaster
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.ApproveResult
import ai.insors.insrc.jetbrains.daemon.SettingsCatalogResult
import ai.insors.insrc.jetbrains.daemon.ArtifactContentResult
import ai.insors.insrc.jetbrains.daemon.ResolveCommentResult
import ai.insors.insrc.jetbrains.daemon.ReviewCommentDto
import ai.insors.insrc.jetbrains.daemon.DaemonState
import ai.insors.insrc.jetbrains.daemon.PendingQueryResult
import ai.insors.insrc.jetbrains.daemon.RegistrationResult
import ai.insors.insrc.jetbrains.host.AiHost
import ai.insors.insrc.jetbrains.host.AiHostAdapterImpl
import ai.insors.insrc.jetbrains.host.AiHostKind
import ai.insors.insrc.jetbrains.host.HostDetector
import ai.insors.insrc.jetbrains.host.HostProbe
import ai.insors.insrc.jetbrains.host.HostResolution
import ai.insors.insrc.jetbrains.host.InsrcMcpRegistration
import ai.insors.insrc.jetbrains.host.MarkerDelimitedBlock
import com.google.gson.JsonParser
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.nio.file.Files
import java.nio.file.Path

/**
 * sc3 uninstall-cleanup integration tests (Story S005 / t4 Wave B). Inside the IntelliJ Platform
 * fixture they drive OnboardingLifecycle.onPluginUninstalled over the REAL AiHostAdapterImpl
 * (JsonMcpConfigWriter + MarkerFileWriter) on on-disk temp host files, proving:
 *  - ac4/lc2: a host whose mcp.json + rules.md carry insrc content is restored to its pre-insrc state
 *    (the insrc mcpServers.insrc key and the RULES-delimited section gone, surrounding developer
 *    content preserved);
 *  - a host with developer content but NO insrc section is left byte-unchanged (no-op removal);
 *  - the disable-vs-uninstall distinction: with no uninstall event delivered (a mere disable) the
 *    seeded insrc content stays in place, whereas firePluginUninstalled removes it.
 *
 * JUnit4-style (BasePlatformTestCase); run under the vintage engine.
 */
class OnboardingCleanupIntegrationTest : BasePlatformTestCase() {

    override fun setUp() {
        super.setUp()
        // Isolate from any consumer a dispatched project-open registration may have added, so firePluginUninstalled
        // fans out only to this test's instance (never real cleanup against the machine's host files).
        LifecycleBroadcaster.clear()
    }

    private val RULES_BEGIN = AiHostAdapterImpl.RULES_BEGIN
    private val RULES_END = AiHostAdapterImpl.RULES_END

    private object NoopGateway : DaemonGateway {
        override fun probe(): DaemonState = DaemonState.CURRENT
        override fun isProjectRegistered(projectRootPath: String): Boolean = true
        override fun registerProject(projectRootPath: String): RegistrationResult = RegistrationResult(true)
        override fun pendingArtifacts(projectRootPath: String): PendingQueryResult = PendingQueryResult.Available(emptyList())
        override fun artifactReviewView(projectRootPath: String, mdPath: String): ArtifactContentResult = ArtifactContentResult.Unavailable("not used in this test")
        override fun resolveComment(projectRootPath: String, artifactId: String, comments: List<ReviewCommentDto>): ResolveCommentResult = ResolveCommentResult.Unavailable("not used in this test")
        override fun approve(projectRootPath: String, mdPath: String, overrideReason: String?): ApproveResult = ApproveResult.Unavailable("not used in this test")
        override fun settingsCatalog(): SettingsCatalogResult = SettingsCatalogResult.Unavailable("not used in this test")
    }

    private fun present(host: AiHost) = HostProbe { HostResolution.Present(host) }

    private fun tempHost(kind: AiHostKind): AiHost {
        val dir = Files.createTempDirectory("insrc-onboard-${kind.name}")
        return AiHost(kind, dir.resolve("mcp.json").toString(), dir.resolve("rules.md").toString())
    }

    private fun realAdapter(vararg hosts: AiHost) =
        AiHostAdapterImpl(HostDetector(hosts.map { present(it) }))

    private fun onboarding(adapter: AiHostAdapterImpl) =
        OnboardingLifecycle(NoopGateway, adapter, OnboardingOffer { _, _ -> }, {}, { it.run() })

    /** Seed a host's files: developer content + the insrc mcp entry and rules section. */
    private fun seedInsrc(adapter: AiHostAdapterImpl, host: AiHost) {
        // mcp.json starts with a developer-owned server; writing insrc must key-merge, not clobber it.
        Files.writeString(Path.of(host.mcpConfigPath), """{"mcpServers":{"other":{"command":"x"}}}""")
        adapter.writeMcpRegistration(host, InsrcMcpRegistration.composeServerEntry(project.basePath!!, "/x/insrc-mcp.js")!!)
        // rules.md starts with developer content; writing the steering appends the RULES section.
        Files.writeString(Path.of(host.rulesFilePath), "# My rules\nAlways write tests.\n")
        adapter.writeRulesBlock(host, MarkerDelimitedBlock(RULES_BEGIN, RULES_END, "insrc steering body"))
    }

    fun testUninstall_restoresMcpAndRulesToPreInsrcBytes_realAdapter() {
        val host = tempHost(AiHostKind.AI_ASSISTANT)
        val adapter = realAdapter(host)
        seedInsrc(adapter, host)
        // sanity: insrc content is present before cleanup
        assertTrue(mcpJson(host).getAsJsonObject("mcpServers").has("insrc"))
        assertTrue(Files.readString(Path.of(host.rulesFilePath)).contains(RULES_BEGIN))

        onboarding(adapter).onPluginUninstalled()

        val mcp = mcpJson(host).getAsJsonObject("mcpServers")
        assertFalse("insrc mcp entry removed", mcp.has("insrc"))
        assertTrue("developer's other mcp server preserved", mcp.has("other"))
        val rules = Files.readString(Path.of(host.rulesFilePath))
        assertFalse("insrc rules section removed", rules.contains(RULES_BEGIN))
        assertTrue("developer rules content preserved", rules.contains("Always write tests."))
    }

    fun testHostWithNoInsrcSection_leftByteUnchanged() {
        val host = tempHost(AiHostKind.AI_ASSISTANT)
        val adapter = realAdapter(host)
        val mcpDev = """{"mcpServers":{"other":{"command":"x"}}}"""
        val rulesDev = "# My rules\nNo insrc here.\n"
        Files.writeString(Path.of(host.mcpConfigPath), mcpDev)
        Files.writeString(Path.of(host.rulesFilePath), rulesDev)

        onboarding(adapter).onPluginUninstalled()

        assertEquals("mcp.json byte-unchanged when no insrc entry", mcpDev, Files.readString(Path.of(host.mcpConfigPath)))
        assertEquals("rules.md byte-unchanged when no insrc section", rulesDev, Files.readString(Path.of(host.rulesFilePath)))
    }

    fun testDisable_deliversNoUninstallEvent_filesLeftInPlace() {
        val host = tempHost(AiHostKind.JUNIE)
        val adapter = realAdapter(host)
        seedInsrc(adapter, host)
        val lifecycle = onboarding(adapter)

        LifecycleBroadcaster.register(lifecycle)
        try {
            // A mere disable delivers NO uninstall event -> insrc content stays in place.
            assertTrue("disable leaves the insrc rules section", Files.readString(Path.of(host.rulesFilePath)).contains(RULES_BEGIN))
            assertTrue("disable leaves the insrc mcp entry", mcpJson(host).getAsJsonObject("mcpServers").has("insrc"))

            // A true uninstall fires firePluginUninstalled -> cleanup removes it.
            LifecycleBroadcaster.firePluginUninstalled()
            assertFalse("uninstall removes the insrc rules section", Files.readString(Path.of(host.rulesFilePath)).contains(RULES_BEGIN))
            assertFalse("uninstall removes the insrc mcp entry", mcpJson(host).getAsJsonObject("mcpServers").has("insrc"))
        } finally {
            LifecycleBroadcaster.unregister(lifecycle)
        }
    }

    private fun mcpJson(host: AiHost) =
        JsonParser.parseString(Files.readString(Path.of(host.mcpConfigPath))).asJsonObject
}
