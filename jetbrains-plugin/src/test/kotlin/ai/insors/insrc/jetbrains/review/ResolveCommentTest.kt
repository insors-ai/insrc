package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.CommentAnchorDto
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonResult
import ai.insors.insrc.jetbrains.daemon.DaemonRpc
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.daemon.ResolveCommentResult
import ai.insors.insrc.jetbrains.daemon.ReviewCommentDto
import ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpc
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S004 plugin tests (Epic ide-artifact-review-panel).
 *
 * t5/t7: [DaemonGatewayImpl.resolveComment] over a fake [DaemonRpc] — ok ->
 * Recorded (verbatim), ok=false / DaemonUnavailable / malformed -> Unavailable
 * (never a silent success). Plus the REAL [UnixSocketDaemonRpc.parse] across the
 * framing boundary the fake tests never cross ({result:{recorded,resolutions}}
 * -> Recorded; {result:{error}} -> Unavailable — the S001 lesson). The comment
 * -> ReviewCommentDto wire mapping and the pure [SubmitDecision] are covered
 * headlessly (the JCEF/EDT Submit wiring is the manual/backstopped residual).
 */
class ResolveCommentTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = handler(method, params)
    }

    private fun comment(id: String, body: String, anchor: CommentAnchorDto = CommentAnchorDto()) =
        ReviewCommentDto(id, anchor, body)

    // ---- t5: fake-RPC classification ----------------------------------------

    @Test
    fun `resolveComment maps ok to Recorded, forwarding recorded + resolutions verbatim`() {
        val rpc = FakeDaemonRpc { method, params ->
            assertEquals("workflow.resolveComment", method)
            assertEquals("/home/dev/proj", params["repo"])
            assertEquals("LLD-h-s4", params["artifactId"])
            @Suppress("UNCHECKED_CAST")
            val sent = params["comments"] as List<Map<String, Any?>>
            assertEquals(1, sent.size)
            assertEquals("c1", sent[0]["id"])
            assertEquals("looks off", sent[0]["body"])
            DaemonResult(
                ok = true,
                data = mapOf(
                    "recorded" to 1,
                    "resolutions" to listOf(mapOf("openQuestionId" to "q1", "status" to "resolved")),
                ),
            )
        }
        val result = DaemonGatewayImpl(rpc).resolveComment(
            "/home/dev/proj", "LLD-h-s4",
            listOf(comment("c1", "looks off", CommentAnchorDto(openQuestionId = "q1"))),
        )
        val recorded = assertInstanceOf(ResolveCommentResult.Recorded::class.java, result)
        assertEquals(1, recorded.recorded)
        assertEquals(1, recorded.resolutions.size)
        assertEquals("q1", recorded.resolutions[0].openQuestionId)
        assertEquals("resolved", recorded.resolutions[0].status)
    }

    @Test
    fun `resolveComment maps ok=false to Unavailable, never a silent success`() {
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = false, error = "workflow.resolveComment: unrecognized artifactId 'PLAN-h-s4'") }
        val result = DaemonGatewayImpl(rpc).resolveComment("/home/dev/proj", "PLAN-h-s4", listOf(comment("c1", "x")))
        assertEquals(
            "workflow.resolveComment: unrecognized artifactId 'PLAN-h-s4'",
            assertInstanceOf(ResolveCommentResult.Unavailable::class.java, result).reason,
        )
    }

    @Test
    fun `resolveComment maps DaemonUnavailableException to Unavailable`() {
        val rpc = FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        val result = DaemonGatewayImpl(rpc).resolveComment("/home/dev/proj", "LLD-h-s4", listOf(comment("c1", "x")))
        assertEquals("socket down", assertInstanceOf(ResolveCommentResult.Unavailable::class.java, result).reason)
    }

    @Test
    fun `resolveComment degrades a malformed payload safely (not a throw)`() {
        // ok=true but recorded missing / resolutions absent -> recorded defaults 0, empty list, no crash.
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("unexpected" to 1)) }
        val result = DaemonGatewayImpl(rpc).resolveComment("/home/dev/proj", "LLD-h-s4", listOf(comment("c1", "x")))
        val recorded = assertInstanceOf(ResolveCommentResult.Recorded::class.java, result)
        assertEquals(0, recorded.recorded)
        assertTrue(recorded.resolutions.isEmpty())
    }

    @Test
    fun `resolveComment omits null anchor fields from the wire map`() {
        val rpc = FakeDaemonRpc { _, params ->
            @Suppress("UNCHECKED_CAST")
            val sent = params["comments"] as List<Map<String, Any?>>
            @Suppress("UNCHECKED_CAST")
            val anchor = sent[0]["anchor"] as Map<String, Any?>
            assertEquals(setOf("sectionPath"), anchor.keys)   // quote/openQuestionId null -> omitted
            assertEquals("Contract > api", anchor["sectionPath"])
            DaemonResult(ok = true, data = mapOf("recorded" to 1, "resolutions" to emptyList<Any?>()))
        }
        DaemonGatewayImpl(rpc).resolveComment(
            "/home/dev/proj", "LLD-h-s4",
            listOf(comment("c1", "b", CommentAnchorDto(sectionPath = "Contract > api"))),
        )
    }

    // ---- t7: real parse across the framing boundary -------------------------

    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse, a daemon structured error maps to Unavailable, not a silent success`() {
        val reply = """{"id":1,"result":{"error":"workflow.resolveComment: no comments to record"}}"""
        val result = DaemonGatewayImpl(WireRpc(reply)).resolveComment("/home/dev/proj", "LLD-h-s4", listOf(comment("c1", "x")))
        assertEquals(
            "workflow.resolveComment: no comments to record",
            assertInstanceOf(ResolveCommentResult.Unavailable::class.java, result).reason,
        )
    }

    @Test
    fun `over the real parse, a recorded payload maps to Recorded with the fields`() {
        val reply = """{"id":1,"result":{"recorded":2,"resolutions":[{"openQuestionId":"q1","status":"resolved"},{"status":"resolved"}]}}"""
        val result = DaemonGatewayImpl(WireRpc(reply)).resolveComment("/home/dev/proj", "LLD-h-s4", listOf(comment("c1", "x")))
        val recorded = assertInstanceOf(ResolveCommentResult.Recorded::class.java, result)
        assertEquals(2, recorded.recorded)
        assertEquals(2, recorded.resolutions.size)
        assertEquals("q1", recorded.resolutions[0].openQuestionId)
        assertEquals(null, recorded.resolutions[1].openQuestionId)   // absent -> null
    }

    // ---- t6/t7: the pure submit-outcome decision ----------------------------

    @Test
    fun `SubmitDecision clears the buffer ONLY on a full success (recorded == submitted)`() {
        assertTrue(SubmitDecision.shouldClear(ResolveCommentResult.Recorded(3, emptyList()), 3))
        assertFalse(SubmitDecision.shouldClear(ResolveCommentResult.Recorded(2, emptyList()), 3)) // partial -> keep
        assertFalse(SubmitDecision.shouldClear(ResolveCommentResult.Recorded(0, emptyList()), 3))
        assertFalse(SubmitDecision.shouldClear(ResolveCommentResult.Unavailable("boom"), 3))      // failure -> keep
    }
}
