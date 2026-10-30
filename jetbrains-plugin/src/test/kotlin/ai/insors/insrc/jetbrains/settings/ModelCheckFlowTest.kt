package ai.insors.insrc.jetbrains.settings

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.DaemonFailure
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonStatusDto
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.DefinedFamilyDto
import ai.insors.insrc.jetbrains.daemon.DefinedModelDto
import ai.insors.insrc.jetbrains.daemon.EffortCheckDto
import ai.insors.insrc.jetbrains.daemon.LifecycleCommand
import ai.insors.insrc.jetbrains.daemon.ModelCheckDto
import ai.insors.insrc.jetbrains.daemon.ModelCheckOutcome
import ai.insors.insrc.jetbrains.daemon.ModelDecisionResult
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsDto
import ai.insors.insrc.jetbrains.daemon.ModelDefinitionsResult
import ai.insors.insrc.jetbrains.daemon.TierDefaultDto
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy

/**
 * Epic ce99b72065d03b1b, Story s7 / t7: the headless check controller behind the Check
 * model… dialog, over a proxy DaemonGateway that records every call. Fixture names match
 * nothing the daemon ships.
 */
class ModelCheckFlowTest {

    private fun m(id: String, efforts: List<String>) = DefinedModelDto(id, emptyList(), null, efforts, "shipped", null)

    private val defs = ModelDefinitionsDto(
        defaultFamily = "fam-x",
        families = listOf(
            DefinedFamilyDto("fam-x", "codex", "FakeX", mapOf("core" to TierDefaultDto("x-a", null)), null, listOf(m("x-a", listOf("lo", "turbo")), m("x-b", listOf("lo", "ultra")))),
            DefinedFamilyDto("fam-local", null, "FakeLocal", emptyMap(), "loc:1", listOf(m("loc:1", emptyList()))),
        ),
    )

    private class Recorder {
        val calls = mutableListOf<Pair<String, List<Any?>>>()
        var check: ModelCheckOutcome = ModelCheckOutcome.Failed(DaemonFailure.Other("unset"))
        var decision: ModelDecisionResult = ModelDecisionResult.Recorded
        var status: DaemonStatusResult = DaemonStatusResult.Stopped
        var definitions: ModelDefinitionsResult = ModelDefinitionsResult.Failed(DaemonFailure.Other("unset"))
    }

    private fun gateway(r: Recorder): DaemonGateway =
        Proxy.newProxyInstance(javaClass.classLoader, arrayOf(DaemonGateway::class.java)) { _, method, args ->
            r.calls += method.name to (args?.toList() ?: emptyList())
            when (method.name) {
                "checkModel" -> r.check
                "decideModel" -> r.decision
                "daemonStatus" -> r.status
                "modelDefinitions" -> r.definitions
                else -> throw AssertionError("unexpected gateway call: ${method.name}")
            }
        } as DaemonGateway

    private fun checked(runs: Boolean, error: String? = null) = ModelCheckOutcome.Checked(
        ModelCheckDto(
            checkId = "c-1", family = "fam-x", modelId = "x-new", runs = runs, inputLimit = if (runs) "200000 tokens" else null,
            efforts = listOf(EffortCheckDto("lo", "accepted", "ok"), EffortCheckDto("turbo", "recognised-unconfirmed", "no warning"), EffortCheckDto("ultra", "rejected", "unsupported effort")),
            error = error,
        ),
    )

    @Test
    fun `approve disabled when not run, reject with the check's id, only ticked non-rejected efforts sent, unknown-check offers check again, no tier write, restart confirmed then definitions re-read`() {
        val r = Recorder()
        val restarts = mutableListOf<LifecycleCommand>()
        var restartResult: DaemonActionResult = DaemonActionResult.Ok("daemon restarted")
        val gw = gateway(r)
        val flow = ModelCheckFlow(gw, defs, DaemonRestart({ restarts += it; restartResult }, gw))

        // Only CLI families can be checked; the claimed efforts are the family's served ones.
        assertEquals(listOf("fam-x"), flow.families().map { it.id })
        assertEquals(listOf("lo", "turbo", "ultra"), flow.claimedEfforts("fam-x"))

        // A model that did not run: Approve disabled, Reject works with that check's id.
        r.check = checked(runs = false, error = "codex refused x-new")
        flow.runCheck("fam-x", " x-new ")
        assertEquals("checkModel" to listOf<Any?>("fam-x", "x-new", listOf("lo", "turbo", "ultra")), r.calls.last())
        assertFalse(flow.canApprove())
        assertTrue(flow.canReject())
        assertTrue(flow.message!!.contains("did not run — codex refused x-new"), flow.message)
        flow.approve(listOf("lo"))
        assertTrue(r.calls.none { it.first == "decideModel" }, "no approval for a model that did not run")
        flow.reject()
        assertEquals("decideModel" to listOf<Any?>("c-1", false, emptyList<String>()), r.calls.last())
        assertFalse(flow.restartPending, "a rejection offers no restart")

        // A model that ran: only ticked, non-rejected efforts are sent.
        r.check = checked(runs = true)
        flow.runCheck("fam-x", "x-new")
        assertTrue(flow.canApprove())
        assertEquals(listOf("lo", "turbo"), flow.approvableEfforts(), "a rejected effort cannot be ticked")
        flow.approve(listOf("lo", "ultra", "made-up"))
        assertEquals("decideModel" to listOf<Any?>("c-1", true, listOf("lo")), r.calls.last())
        assertTrue(flow.restartPending)

        // unknown-check: the daemon no longer holds it — offer Check again, nothing else.
        r.decision = ModelDecisionResult.Refused("unknown-check", "no pending check c-1; run models.check again")
        flow.runCheck("fam-x", "x-new")
        flow.approve(listOf("lo"))
        assertTrue(flow.checkAgain)
        assertFalse(flow.canApprove())
        assertFalse(flow.canReject())
        assertTrue(flow.message!!.contains("check the model again"), flow.message)

        // Other refusals and failures show the daemon's reason and detail.
        r.decision = ModelDecisionResult.Refused("write-failed", "disk full")
        flow.runCheck("fam-x", "x-new")
        flow.approve(listOf("lo"))
        assertEquals("the daemon refused — write-failed — disk full", flow.message)
        r.decision = ModelDecisionResult.Failed(DaemonFailure.NotRunning)
        flow.reject()
        assertEquals("could not record the decision — the daemon is not running or the connection was lost", flow.message)
        r.check = ModelCheckOutcome.Failed(DaemonFailure.Other("x-a is already a model or alias of fam-x"))
        flow.runCheck("fam-x", "x-a")
        assertNull(flow.check)
        assertEquals("could not check the model — x-a is already a model or alias of fam-x", flow.message)

        // Restart: a failed restart re-reads nothing.
        r.check = checked(runs = true)
        r.decision = ModelDecisionResult.Recorded
        flow.runCheck("fam-x", "x-new")
        flow.approve(listOf("lo"))
        restartResult = DaemonActionResult.Failed("the daemon install is missing")
        assertNull(flow.restartAndReload())
        assertEquals("the daemon did not restart — the daemon install is missing", flow.message)
        assertTrue(r.calls.none { it.first == "modelDefinitions" })
        // A restart whose status read finds no daemon is not confirmed.
        restartResult = DaemonActionResult.Ok("daemon restarted")
        r.status = DaemonStatusResult.Stopped
        assertNull(flow.restartAndReload())
        assertEquals("the daemon is not running after the restart", flow.message)
        assertTrue(r.calls.none { it.first == "modelDefinitions" })
        // A confirmed restart re-reads the definitions; the approved model is now offered.
        r.status = DaemonStatusResult.Loaded(statusDto())
        val withNew = defs.copy(families = defs.families.map { f -> if (f.id == "fam-x") f.copy(models = f.models + m("x-new", listOf("lo"))) else f })
        r.definitions = ModelDefinitionsResult.Loaded(withNew)
        val fresh = flow.restartAndReload()
        assertNotNull(fresh)
        assertTrue(fresh!!.families.first { it.id == "fam-x" }.models.any { it.id == "x-new" })
        assertEquals("The daemon restarted; x-new can now be picked for a tier", flow.message)
        assertFalse(flow.restartPending)
        assertEquals(List(3) { LifecycleCommand.RESTART }, restarts)

        // The flow never writes a tier.
        assertTrue(r.calls.none { it.first == "writeSetting" || it.first == "clearSetting" })
    }

    private fun statusDto() = DaemonStatusDto(
        running = true, uptimeSec = 1, queueDepth = 0, embeddingsPending = 0,
        modelPullStatus = "ready", modelPullPct = null, lmdbFileSizeMb = null, repoCount = 0,
    )

    @Test
    fun `keeps the host family out of Check model and offers it again when the answer has no host`() {
        // Epic b220bb61, Story s5: a CLI family that runs on Ollama takes only its listed models.
        val hosted = defs.copy(families = defs.families + listOf(
            DefinedFamilyDto("fam-hosted", "claude", "FakeH", emptyMap(), null, listOf(DefinedModelDto("h:cloud", emptyList(), null, emptyList(), "shipped", null, hosting = "cloud")), host = "ollama"),
            DefinedFamilyDto("fam-y", "claude", "FakeY", emptyMap(), null, listOf(m("y-a", listOf("lo")))),
        ))
        val gw = gateway(Recorder())
        val flow = ModelCheckFlow(gw, hosted, DaemonRestart({ DaemonActionResult.Ok() }, gw))
        assertEquals(listOf("fam-x", "fam-y"), flow.families().map { it.id }, "vendor CLI families only, in order")

        // An older daemon answers without host: the same family is a vendor CLI family again.
        val older = hosted.copy(families = hosted.families.map { it.copy(host = null) })
        val oldFlow = ModelCheckFlow(gw, older, DaemonRestart({ DaemonActionResult.Ok() }, gw))
        assertEquals(listOf("fam-x", "fam-hosted", "fam-y"), oldFlow.families().map { it.id })
    }
}
