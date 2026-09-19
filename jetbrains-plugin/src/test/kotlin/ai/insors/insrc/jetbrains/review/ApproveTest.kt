package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.ApproveResult
import ai.insors.insrc.jetbrains.daemon.ArtifactReviewViewDto
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonResult
import ai.insors.insrc.jetbrains.daemon.DaemonRpc
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpc
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S005 plugin tests (Epic ide-artifact-review-panel).
 *
 * t1/t4: [DaemonGatewayImpl.approve] over a fake [DaemonRpc] — approved[] ->
 * Approved, skipped[] -> Withheld(reason) (the block gate, NOT a success),
 * ok=false / DaemonUnavailable / both-empty -> Unavailable (never a false
 * Approved). Plus the REAL [UnixSocketDaemonRpc.parse] across the framing
 * boundary the fake tests never cross ({result:{approved}} -> Approved;
 * {result:{skipped:[{reason}]}} -> Withheld; {result:{error}} -> Unavailable —
 * the S001 lesson). And the pure [ApproveDecision] (the load-bearing UI logic).
 */
class ApproveTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = handler(method, params)
    }

    private fun view(approvable: Boolean, blockReason: String? = null) =
        ArtifactReviewViewDto("LLD-h-s5", "LLD", "# T", emptyList(), approvable, blockReason)

    // ---- gateway classification over a fake DaemonRpc ------------------------

    @Test
    fun `approve maps ok+approved to Approved and composes the absolute artifactPath (no override)`() {
        val rpc = FakeDaemonRpc { method, params ->
            assertEquals("workflow.approve", method)
            assertEquals("/home/dev/proj", params["repo"])
            assertEquals("/home/dev/proj/docs/epics/x/S005/LLD.md", params["artifactPath"])   // repo + '/' + mdPath
            assertFalse(params.containsKey("overrideReview"))   // null override -> omitted
            DaemonResult(ok = true, data = mapOf("approved" to listOf(mapOf("path" to "…/LLD-h-s5.json")), "skipped" to emptyList<Any?>()))
        }
        val result = DaemonGatewayImpl(rpc).approve("/home/dev/proj", "docs/epics/x/S005/LLD.md", null)
        assertInstanceOf(ApproveResult.Approved::class.java, result)
    }

    @Test
    fun `approve forwards an ABSOLUTE mdPath UNCHANGED (never doubles the repo prefix)`() {
        // workflow.pending emits an absolute mdPath; prefixing projectRootPath would
        // double the repo prefix and the daemon would never find the artifact.
        val abs = "/home/dev/proj/docs/epics/x/S005/LLD.md"
        val rpc = FakeDaemonRpc { _, params ->
            assertEquals(abs, params["artifactPath"])   // passed through, NOT "/home/dev/proj//home/dev/proj/…"
            DaemonResult(ok = true, data = mapOf("approved" to listOf(mapOf("path" to "p"))))
        }
        assertInstanceOf(ApproveResult.Approved::class.java, DaemonGatewayImpl(rpc).approve("/home/dev/proj", abs, null))
    }

    @Test
    fun `approve forwards a non-null overrideReason as overrideReview`() {
        val rpc = FakeDaemonRpc { _, params ->
            assertEquals("because", params["overrideReview"])
            DaemonResult(ok = true, data = mapOf("approved" to listOf(mapOf("path" to "p"))))
        }
        DaemonGatewayImpl(rpc).approve("/home/dev/proj", "docs/x/LLD.md", "because")
    }

    @Test
    fun `approve maps ok+skipped to Withheld(reason), never Approved`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("approved" to emptyList<Any?>(), "skipped" to listOf(mapOf("path" to "p", "reason" to "Review blocks approval — 1 HIGH"))))
        }
        val result = DaemonGatewayImpl(rpc).approve("/home/dev/proj", "docs/x/LLD.md", null)
        val withheld = assertInstanceOf(ApproveResult.Withheld::class.java, result)
        assertEquals("Review blocks approval — 1 HIGH", withheld.reason)
    }

    @Test
    fun `approve maps ok=false and DaemonUnavailable and both-empty to Unavailable`() {
        val err = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = false, error = "No artifact at …") })
            .approve("/home/dev/proj", "docs/x/LLD.md", null)
        assertEquals("No artifact at …", assertInstanceOf(ApproveResult.Unavailable::class.java, err).reason)

        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") })
            .approve("/home/dev/proj", "docs/x/LLD.md", null)
        assertEquals("socket down", assertInstanceOf(ApproveResult.Unavailable::class.java, down).reason)

        // ok=true but neither approved nor skipped -> defensive Unavailable, never Approved
        val empty = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("codeReview" to emptyList<Any?>())) })
            .approve("/home/dev/proj", "docs/x/LLD.md", null)
        assertInstanceOf(ApproveResult.Unavailable::class.java, empty)
    }

    // ---- real parse across the framing boundary -----------------------------

    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse, an approved payload maps to Approved`() {
        val reply = """{"id":1,"result":{"approved":[{"path":"a.json","result":{"approvedAt":"t"}}],"skipped":[],"codeReview":[]}}"""
        assertInstanceOf(ApproveResult.Approved::class.java, DaemonGatewayImpl(WireRpc(reply)).approve("/r", "docs/x/LLD.md", null))
    }

    @Test
    fun `over the real parse, a skipped payload maps to Withheld and an error to Unavailable`() {
        val skipped = """{"id":1,"result":{"approved":[],"skipped":[{"path":"a.json","reason":"blocked: 1 HIGH"}],"codeReview":[]}}"""
        assertEquals("blocked: 1 HIGH", assertInstanceOf(ApproveResult.Withheld::class.java, DaemonGatewayImpl(WireRpc(skipped)).approve("/r", "docs/x/LLD.md", null)).reason)

        val error = """{"id":1,"result":{"error":"workflow.approve: `repo` is required for an epicHash batch"}}"""
        assertInstanceOf(ApproveResult.Unavailable::class.java, DaemonGatewayImpl(WireRpc(error)).approve("/r", "docs/x/LLD.md", null))
    }

    // ---- pure ApproveDecision ------------------------------------------------

    @Test
    fun `ApproveDecision enabled follows view approvable`() {
        assertTrue(ApproveDecision.enabled(view(approvable = true)))
        assertFalse(ApproveDecision.enabled(view(approvable = false, blockReason = "blocked")))
    }

    @Test
    fun `ApproveDecision normalizeOverride treats blank as no override and trims otherwise`() {
        assertNull(ApproveDecision.normalizeOverride(null))
        assertNull(ApproveDecision.normalizeOverride(""))
        assertNull(ApproveDecision.normalizeOverride("   "))
        assertEquals("looks wrong", ApproveDecision.normalizeOverride("  looks wrong  "))
    }

    @Test
    fun `ApproveDecision shouldRefresh only on Approved`() {
        assertTrue(ApproveDecision.shouldRefresh(ApproveResult.Approved))
        assertFalse(ApproveDecision.shouldRefresh(ApproveResult.Withheld("r")))
        assertFalse(ApproveDecision.shouldRefresh(ApproveResult.Unavailable("r")))
    }

    @Test
    fun `ApproveDecision latchApproved only when the approved artifact is still shown`() {
        assertTrue(ApproveDecision.latchApproved("/r/docs/A.md", "/r/docs/A.md"))
        // a mid-flight switch: A's reply lands while B is shown -> do NOT latch B
        assertFalse(ApproveDecision.latchApproved("/r/docs/A.md", "/r/docs/B.md"))
        assertFalse(ApproveDecision.latchApproved("/r/docs/A.md", null))
    }
}
