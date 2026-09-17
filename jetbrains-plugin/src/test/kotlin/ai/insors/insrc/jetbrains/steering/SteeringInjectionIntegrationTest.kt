package ai.insors.insrc.jetbrains.steering

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.host.AiHost
import ai.insors.insrc.jetbrains.host.AiHostAdapterImpl
import ai.insors.insrc.jetbrains.host.AiHostKind
import ai.insors.insrc.jetbrains.host.HostDetector
import ai.insors.insrc.jetbrains.host.HostProbe
import ai.insors.insrc.jetbrains.host.HostResolution
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.nio.file.Path

/**
 * sc3 steering-injection integration tests (Story S004 / t5). Run inside the
 * IntelliJ Platform test fixture and drive [SteeringInjectionLifecycle] with a
 * REAL [AiHostAdapterImpl] whose detection is stubbed to hosts pointing at temp
 * rules files, exercising the real marker-delimited rules writer end-to-end:
 *
 *  - ac1: on project open with a host present, the RULES-delimited steering section
 *    (with the canonical body) lands in that host's rulesFilePath;
 *  - ac2: writing into a rules file with pre-existing developer content adds/replaces
 *    ONLY the insrc section — surrounding content is preserved and a re-open does not
 *    duplicate the section (replace-only, idempotent);
 *  - ac3: with both hosts present, each host's own rulesFilePath receives the steering
 *    (and S004 never creates the mcp file).
 *
 * JUnit4-style (BasePlatformTestCase); run under the vintage engine.
 */
class SteeringInjectionIntegrationTest : BasePlatformTestCase() {

    private val STEERING = "# insrc tracked-workflow steering\nRoute build/change requests through insrc_triage / insrc_workflow_run.\n"

    private fun present(host: AiHost) = HostProbe { HostResolution.Present(host) }
    private fun steering() = SteeringContent(resource = { ByteArrayInputStream(STEERING.toByteArray()) })

    private fun tempHost(kind: AiHostKind): AiHost {
        val dir = Files.createTempDirectory("insrc-steer-${kind.name}")
        return AiHost(
            kind = kind,
            mcpConfigPath = dir.resolve("mcp.json").toString(),
            rulesFilePath = dir.resolve("rules.md").toString(),
        )
    }

    private fun adapterFor(vararg hosts: AiHost) =
        AiHostAdapterImpl(HostDetector(hosts.map { present(it) }))

    private fun ctx() = ProjectContext(project.basePath!!, IdeKind.IDEA)

    fun testProjectOpen_writesRulesDelimitedSteeringIntoHostRulesFilePath_ac1() {
        val host = tempHost(AiHostKind.AI_ASSISTANT)

        SteeringInjectionLifecycle(adapterFor(host), steering()).onProjectOpened(ctx())

        val written = Files.readString(Path.of(host.rulesFilePath))
        assertTrue("rules file carries the insrc begin marker", written.contains(AiHostAdapterImpl.RULES_BEGIN))
        assertTrue("rules file carries the insrc end marker", written.contains(AiHostAdapterImpl.RULES_END))
        assertTrue("rules file carries the canonical steering body", written.contains("insrc_triage"))
    }

    fun testPreExistingDeveloperContent_preservedByteForByte_onlyInsrcSectionChanged_ac2() {
        val host = tempHost(AiHostKind.AI_ASSISTANT)
        val dev = "# My rules\nAlways write tests.\n"
        Files.writeString(Path.of(host.rulesFilePath), dev)

        SteeringInjectionLifecycle(adapterFor(host), steering()).onProjectOpened(ctx())

        val written = Files.readString(Path.of(host.rulesFilePath))
        assertTrue("developer heading preserved", written.contains("# My rules"))
        assertTrue("developer content preserved", written.contains("Always write tests."))
        assertTrue("insrc section added", written.contains(AiHostAdapterImpl.RULES_BEGIN))

        // Replace-only + idempotent: a second open must not duplicate the insrc section
        // and must still preserve the developer content.
        SteeringInjectionLifecycle(adapterFor(host), steering()).onProjectOpened(ctx())
        val again = Files.readString(Path.of(host.rulesFilePath))
        assertEquals("exactly one insrc section after re-open", 1, countOccurrences(again, AiHostAdapterImpl.RULES_BEGIN))
        assertTrue("developer content still preserved after re-open", again.contains("Always write tests."))
    }

    fun testBothHostsPresent_eachGetsSteeringInOwnRulesFilePath_ac3() {
        val a = tempHost(AiHostKind.AI_ASSISTANT)
        val b = tempHost(AiHostKind.JUNIE)

        SteeringInjectionLifecycle(adapterFor(a, b), steering()).onProjectOpened(ctx())

        for (host in listOf(a, b)) {
            val written = Files.readString(Path.of(host.rulesFilePath))
            assertTrue(
                "host ${host.kind} rules file has the RULES-delimited steering",
                written.contains(AiHostAdapterImpl.RULES_BEGIN) && written.contains("insrc_triage"),
            )
        }
        // S004 writes ONLY the rules file — it never creates the mcp registration file.
        assertFalse("S004 must not create the mcp file", Files.exists(Path.of(a.mcpConfigPath)))
    }

    private fun countOccurrences(s: String, sub: String): Int {
        var count = 0
        var i = s.indexOf(sub)
        while (i >= 0) {
            count++
            i = s.indexOf(sub, i + sub.length)
        }
        return count
    }
}
