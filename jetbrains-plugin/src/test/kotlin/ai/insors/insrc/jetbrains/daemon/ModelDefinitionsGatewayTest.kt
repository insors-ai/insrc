package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Epic ce99b72065d03b1b, Story s7 / t3: DaemonGatewayImpl.modelDefinitions / checkModel /
 * decideModel over a fake DaemonRpc — the parse of each answer and the failure
 * classification (not running, older daemon, other). Fixture names match nothing the
 * daemon ships, so a hard-coded list in the plugin could not pass.
 */
class ModelDefinitionsGatewayTest {

    private class FakeRpc(private val handler: (String, Map<String, Any?>, Boolean) -> DaemonResult) : DaemonRpc {
        val calls = mutableListOf<Triple<String, Map<String, Any?>, Boolean>>()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = call(method, params, true)
        override fun call(method: String, params: Map<String, Any?>, resultErrorIsFailure: Boolean): DaemonResult {
            calls += Triple(method, params, resultErrorIsFailure)
            return handler(method, params, resultErrorIsFailure)
        }
    }

    private fun ok(data: Map<String, Any?>) = FakeRpc { _, _, _ -> DaemonResult(ok = true, data = data) }

    private val answer: Map<String, Any?> = mapOf(
        "version" to 1.0,
        "defaultFamily" to "cli-codex",
        "families" to listOf(
            mapOf(
                "id" to "cli-codex", "cliKind" to "codex", "displayName" to "FakeX",
                "tierDefaults" to mapOf("core" to mapOf("model" to "x-a", "effort" to "lo"), "mid" to mapOf("model" to "x-b"), "junk" to "not-an-object"),
                "models" to listOf(
                    mapOf("id" to "x-a", "aliases" to listOf("xa"), "efforts" to listOf("lo", "turbo"), "source" to "shipped"),
                    mapOf("id" to "x-new", "aliases" to emptyList<String>(), "efforts" to listOf("lo"), "source" to "user-approved"),
                    mapOf("aliases" to listOf("no-id")), // malformed: skipped
                    "not-a-model", // malformed: skipped
                ),
            ),
            mapOf(
                "id" to "ollama", "displayName" to "FakeLocal", "toolLoopModel" to "loc:1",
                "models" to listOf(
                    mapOf("id" to "loc:1", "aliases" to emptyList<String>(), "efforts" to emptyList<String>(), "source" to "shipped", "installed" to true),
                    mapOf("id" to "loc:2", "aliases" to emptyList<String>(), "efforts" to emptyList<String>(), "source" to "shipped", "installed" to false),
                ),
            ),
            mapOf("displayName" to "no id"), // malformed: skipped
        ),
    )

    @Test
    fun `modelDefinitions, checkModel and decideModel parse their answers and classify failures`() {
        // --- models.definitions ---
        val rpc = ok(answer)
        val defs = assertInstanceOf(ModelDefinitionsResult.Loaded::class.java, DaemonGatewayImpl(rpc).modelDefinitions()).definitions
        assertEquals("models.definitions", rpc.calls.single().first)
        assertEquals("cli-codex", defs.defaultFamily)
        assertEquals(listOf("cli-codex", "ollama"), defs.families.map { it.id })
        val codex = defs.families[0]
        assertEquals("codex", codex.cliKind)
        assertEquals("FakeX", codex.displayName)
        assertEquals(listOf("x-a", "x-new"), codex.models.map { it.id })
        assertEquals(listOf("xa"), codex.models[0].aliases)
        assertEquals(listOf("lo", "turbo"), codex.models[0].efforts)
        assertEquals("user-approved", codex.models[1].source)
        assertEquals(mapOf("core" to TierDefaultDto("x-a", "lo"), "mid" to TierDefaultDto("x-b", null)), codex.tierDefaults)
        assertNull(codex.toolLoopModel)
        val local = defs.families[1]
        assertNull(local.cliKind)
        assertEquals("loc:1", local.toolLoopModel)
        assertEquals(emptyMap<String, TierDefaultDto>(), local.tierDefaults)
        assertEquals(listOf(true, false), local.models.map { it.installed })

        // No family survives the parse: Failed(Other).
        val none = DaemonGatewayImpl(ok(mapOf("families" to listOf("x")))).modelDefinitions()
        assertInstanceOf(DaemonFailure.Other::class.java, assertInstanceOf(ModelDefinitionsResult.Failed::class.java, none).failure)

        // --- failure classification ---
        val down = DaemonGatewayImpl(FakeRpc { _, _, _ -> throw DaemonUnavailableException("daemon socket unreachable at /x") }).modelDefinitions()
        val notRunning = assertInstanceOf(ModelDefinitionsResult.Failed::class.java, down).failure
        assertEquals(DaemonFailure.NotRunning, notRunning)
        assertEquals("the daemon is not running or the connection was lost", notRunning.text)

        val older = DaemonGatewayImpl(FakeRpc { _, _, _ -> DaemonResult(ok = false, error = "unknown method: models.definitions") }).modelDefinitions()
        val olderFailure = assertInstanceOf(DaemonFailure.OlderDaemon::class.java, assertInstanceOf(ModelDefinitionsResult.Failed::class.java, older).failure)
        assertTrue(olderFailure.text.contains("update the daemon"), olderFailure.text)

        val other = DaemonGatewayImpl(FakeRpc { _, _, _ -> DaemonResult(ok = false, error = "registry not ready") }).modelDefinitions()
        assertEquals(DaemonFailure.Other("registry not ready"), assertInstanceOf(ModelDefinitionsResult.Failed::class.java, other).failure)
        assertTrue(!other.toString().contains("update the daemon"), "only an unknown method says to update")

        val empty = DaemonGatewayImpl(FakeRpc { _, _, _ -> DaemonResult(ok = false, error = "empty daemon reply") }).modelDefinitions()
        assertEquals(DaemonFailure.Other("empty daemon reply"), assertInstanceOf(ModelDefinitionsResult.Failed::class.java, empty).failure)

        // --- models.check: read whole, so a not-run check keeps its error, id and evidence ---
        val checkRpc = ok(mapOf(
            "checkId" to "c-1", "family" to "cli-codex", "modelId" to "x-newer", "runs" to false,
            "efforts" to listOf(mapOf("effort" to "lo", "verdict" to "rejected", "evidence" to "model not found")),
            "error" to "codex refused x-newer",
        ))
        val checked = assertInstanceOf(ModelCheckOutcome.Checked::class.java, DaemonGatewayImpl(checkRpc).checkModel("cli-codex", "x-newer", listOf("lo", "turbo"))).check
        val (method, params, resultErrorIsFailure) = checkRpc.calls.single()
        assertEquals("models.check", method)
        assertEquals(mapOf("family" to "cli-codex", "modelId" to "x-newer", "claimedEfforts" to listOf("lo", "turbo")), params)
        assertEquals(false, resultErrorIsFailure)
        assertEquals(ModelCheckDto("c-1", "cli-codex", "x-newer", false, null, listOf(EffortCheckDto("lo", "rejected", "model not found")), "codex refused x-newer"), checked)

        val ran = DaemonGatewayImpl(ok(mapOf(
            "checkId" to "c-2", "family" to "cli-codex", "modelId" to "x-newer", "runs" to true,
            "inputLimit" to mapOf("unit" to "tokens", "max" to 200000.0), "efforts" to emptyList<Any>(),
        ))).checkModel("cli-codex", "x-newer", emptyList())
        assertEquals("200000 tokens", assertInstanceOf(ModelCheckOutcome.Checked::class.java, ran).check.inputLimit)

        // An invalid-params reply has no checkId: Failed(Other) with the daemon's text.
        val invalid = DaemonGatewayImpl(ok(mapOf("error" to "x-a is already a model or alias of cli-codex", "recoverable" to false)))
            .checkModel("cli-codex", "x-a", listOf("lo"))
        assertEquals(DaemonFailure.Other("x-a is already a model or alias of cli-codex"), assertInstanceOf(ModelCheckOutcome.Failed::class.java, invalid).failure)
        assertEquals(DaemonFailure.NotRunning, assertInstanceOf(ModelCheckOutcome.Failed::class.java,
            DaemonGatewayImpl(FakeRpc { _, _, _ -> throw DaemonUnavailableException("x") }).checkModel("cli-codex", "m", emptyList())).failure)

        // --- models.approve / models.reject ---
        val approveRpc = ok(mapOf("ok" to true, "restartRequired" to true))
        assertEquals(ModelDecisionResult.Recorded, DaemonGatewayImpl(approveRpc).decideModel("c-2", approve = true, efforts = listOf("lo")))
        assertEquals("models.approve" to mapOf("checkId" to "c-2", "efforts" to listOf("lo")), approveRpc.calls.single().let { it.first to it.second })

        val rejectRpc = ok(mapOf("ok" to true, "restartRequired" to true))
        assertEquals(ModelDecisionResult.Recorded, DaemonGatewayImpl(rejectRpc).decideModel("c-1", approve = false, efforts = emptyList()))
        assertEquals("models.reject" to mapOf("checkId" to "c-1"), rejectRpc.calls.single().let { it.first to it.second })

        val refused = DaemonGatewayImpl(ok(mapOf("ok" to false, "reason" to "unknown-check", "detail" to "no pending check c-9; run models.check again")))
            .decideModel("c-9", approve = true, efforts = listOf("lo"))
        assertEquals(ModelDecisionResult.Refused("unknown-check", "no pending check c-9; run models.check again"), refused)

        val olderDecision = DaemonGatewayImpl(FakeRpc { _, _, _ -> DaemonResult(ok = false, error = "unknown method: models.approve") })
            .decideModel("c-1", approve = true, efforts = emptyList())
        assertInstanceOf(DaemonFailure.OlderDaemon::class.java, assertInstanceOf(ModelDecisionResult.Failed::class.java, olderDecision).failure)
    }

    @Test
    fun `DaemonGatewayService forwards modelDefinitions, checkModel and decideModel to its delegate`() {
        val src = java.io.File("src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt").readText()
        assertTrue(src.contains("override fun modelDefinitions(): ModelDefinitionsResult = delegate.modelDefinitions()"))
        assertTrue(src.contains("delegate.checkModel(family, modelId, claimedEfforts)"))
        assertTrue(src.contains("delegate.decideModel(checkId, approve, efforts)"))
    }

    @Test
    fun `parses a family's host and its models' hosting, and null when the answer has neither`() {
        // Epic b220bb61, Story s5: a family running its CLI on Ollama, with a cloud and a local model.
        val hosted = answer + ("families" to (answer["families"] as List<*>) + mapOf(
            "id" to "ollama-claude", "cliKind" to "claude", "host" to "ollama", "displayName" to "FakeH",
            "models" to listOf(
                mapOf("id" to "hc:cloud", "aliases" to listOf("hc"), "efforts" to listOf("low", "max"), "source" to "shipped", "hosting" to "cloud"),
                mapOf("id" to "hl:7b", "aliases" to emptyList<String>(), "efforts" to emptyList<String>(), "source" to "shipped", "hosting" to "local"),
                mapOf("id" to "hb:1", "aliases" to emptyList<String>(), "efforts" to emptyList<String>(), "source" to "shipped", "hosting" to " "),
            ),
        ))
        val defs = assertInstanceOf(ModelDefinitionsResult.Loaded::class.java, DaemonGatewayImpl(ok(hosted)).modelDefinitions()).definitions
        assertEquals(listOf("cli-codex", "ollama", "ollama-claude"), defs.families.map { it.id }, "malformed entries still skipped")
        val h = defs.families[2]
        assertEquals("ollama", h.host)
        assertEquals("claude", h.cliKind)
        assertEquals(listOf("cloud", "local", null), h.models.map { it.hosting }, "a blank hosting reads as none")

        // Today's families, and an answer from an older daemon, carry neither mark.
        assertEquals(listOf(null, null), defs.families.take(2).map { it.host })
        assertTrue(defs.families.take(2).flatMap { it.models }.all { it.hosting == null })
        val older = assertInstanceOf(ModelDefinitionsResult.Loaded::class.java, DaemonGatewayImpl(ok(answer)).modelDefinitions()).definitions
        assertTrue(older.families.all { it.host == null } && older.families.flatMap { it.models }.all { it.hosting == null })
    }
}
