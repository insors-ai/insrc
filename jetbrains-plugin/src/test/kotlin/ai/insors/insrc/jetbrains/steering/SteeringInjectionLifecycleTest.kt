package ai.insors.insrc.jetbrains.steering

import ai.insors.insrc.jetbrains.IdeKind
import ai.insors.insrc.jetbrains.ProjectContext
import ai.insors.insrc.jetbrains.host.AiHost
import ai.insors.insrc.jetbrains.host.AiHostAdapter
import ai.insors.insrc.jetbrains.host.AiHostAdapterImpl
import ai.insors.insrc.jetbrains.host.AiHostKind
import ai.insors.insrc.jetbrains.host.HostFileAccessException
import ai.insors.insrc.jetbrains.host.MarkerDelimitedBlock
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream

/**
 * sc-internal steering-injection unit tests (Story S004 / t3) — platform-free,
 * against injected fakes (a recording AiHostAdapter + a fake steering-resource
 * loader). They verify the lifecycle composes the sc3 RULES-marker block with the
 * canonical body and writes it once per detected host; empty detection is a no-op;
 * a missing/empty steering body writes nothing on any host; a HostFileAccessException
 * on one host is isolated so the other host is still written; and S004 issues ONLY
 * rules writes (never mcp, never a remove).
 */
class SteeringInjectionLifecycleTest {

    private val STEERING = "# insrc tracked-workflow steering\nRoute build/change requests through insrc_triage.\n"
    private val CTX = ProjectContext("/work/project", IdeKind.IDEA)

    private fun host(kind: AiHostKind) = AiHost(kind, "/tmp/${kind.name}/mcp.json", "/tmp/${kind.name}/rules.md")
    private fun steeringOf(body: String) = SteeringContent(resource = { ByteArrayInputStream(body.toByteArray()) })
    private fun missingSteering() = SteeringContent(resource = { null })

    /** Records writeRulesBlock calls; throws for a chosen host to prove per-host isolation. */
    private class RecordingAdapter(
        private val hosts: List<AiHost>,
        private val failFor: AiHostKind? = null,
    ) : AiHostAdapter {
        val rulesWrites = mutableListOf<Pair<AiHost, MarkerDelimitedBlock>>()
        var mcpWriteCalls = 0
        var mcpRemoveCalls = 0
        var rulesRemoveCalls = 0
        override fun detectPresent(): List<AiHost> = hosts
        override fun writeMcpRegistration(host: AiHost, serverEntryJson: String) { mcpWriteCalls++ }
        override fun removeMcpRegistration(host: AiHost) { mcpRemoveCalls++ }
        override fun writeRulesBlock(host: AiHost, block: MarkerDelimitedBlock) {
            if (host.kind == failFor) throw HostFileAccessException("insrc-test: simulated rules write failure")
            rulesWrites += host to block
        }
        override fun removeRulesBlock(host: AiHost) { rulesRemoveCalls++ }
    }

    @Test
    fun composesRulesBlockAndWritesOncePerDetectedHost() {
        val a = host(AiHostKind.AI_ASSISTANT)
        val b = host(AiHostKind.JUNIE)
        val adapter = RecordingAdapter(listOf(a, b))

        SteeringInjectionLifecycle(adapter, steeringOf(STEERING)).onProjectOpened(CTX)

        assertEquals(listOf(a, b), adapter.rulesWrites.map { it.first })
        for ((_, block) in adapter.rulesWrites) {
            assertEquals(AiHostAdapterImpl.RULES_BEGIN, block.beginMarker)
            assertEquals(AiHostAdapterImpl.RULES_END, block.endMarker)
            assertEquals(STEERING.trim(), block.body)
        }
        // S004 issues ONLY rules writes — never mcp, never a remove of any kind.
        assertEquals(0, adapter.mcpWriteCalls)
        assertEquals(0, adapter.mcpRemoveCalls)
        assertEquals(0, adapter.rulesRemoveCalls)
    }

    @Test
    fun emptyDetectPresent_noWrite() {
        val adapter = RecordingAdapter(emptyList())
        SteeringInjectionLifecycle(adapter, steeringOf(STEERING)).onProjectOpened(CTX)
        assertTrue(adapter.rulesWrites.isEmpty())
    }

    @Test
    fun steeringBodyThrows_noWriteOnAnyHost() {
        val adapter = RecordingAdapter(listOf(host(AiHostKind.AI_ASSISTANT), host(AiHostKind.JUNIE)))
        // A missing/empty steering resource makes steeringBody() throw BEFORE any write.
        SteeringInjectionLifecycle(adapter, missingSteering()).onProjectOpened(CTX)
        assertTrue(adapter.rulesWrites.isEmpty())
    }

    @Test
    fun perHostHostFileAccessException_isolated_otherHostStillWritten() {
        val a = host(AiHostKind.AI_ASSISTANT) // this host's write fails
        val b = host(AiHostKind.JUNIE)        // this host must still be written
        val adapter = RecordingAdapter(listOf(a, b), failFor = AiHostKind.AI_ASSISTANT)

        SteeringInjectionLifecycle(adapter, steeringOf(STEERING)).onProjectOpened(CTX)

        assertEquals(listOf(b), adapter.rulesWrites.map { it.first })
    }
}
