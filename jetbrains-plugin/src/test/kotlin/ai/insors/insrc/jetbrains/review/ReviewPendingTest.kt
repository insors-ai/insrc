package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayImpl
import ai.insors.insrc.jetbrains.daemon.DaemonResult
import ai.insors.insrc.jetbrains.daemon.DaemonRpc
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.daemon.PendingArtifactDto
import ai.insors.insrc.jetbrains.daemon.PendingQueryResult
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S001 plugin tests (Epic ide-artifact-review-panel).
 *
 * t3: [DaemonGatewayImpl.pendingArtifacts] over a fake [DaemonRpc] — ok(list) ->
 * Available, ok(empty) -> Available(empty), ok=false / DaemonUnavailable ->
 * Unavailable (never Available(empty)), and verbatim descriptor forwarding (k1).
 *
 * t4: [ReviewListViews.of] — the pure three-state mapping the tool window
 * renders, with Unavailable kept DISTINCT from the empty state (ac2).
 */
class ReviewPendingTest {

    private class FakeDaemonRpc(
        private val handler: (method: String, params: Map<String, Any?>) -> DaemonResult,
    ) : DaemonRpc {
        val calls = mutableListOf<String>()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult {
            calls += method
            return handler(method, params)
        }
    }

    private fun descriptorMap(
        id: String,
        kind: String,
        title: String,
        mdPath: String = "docs/x/LLD.md",
        workItemId: String? = null,
        openQuestionCount: Any = 0,
        state: String = "pending",
    ): Map<String, Any?> = mapOf(
        "artifactId" to id,
        "kind" to kind,
        "title" to title,
        "mdPath" to mdPath,
        "workItemId" to workItemId,
        "openQuestionCount" to openQuestionCount,
        "state" to state,
    )

    // ---- t3 -----------------------------------------------------------------

    @Test
    fun `pendingArtifacts maps ok with a list to Available(list) and forwards descriptors verbatim`() {
        val rpc = FakeDaemonRpc { method, params ->
            assertEquals("workflow.pending", method)
            assertEquals("/home/dev/proj", params["repo"])
            DaemonResult(
                ok = true,
                data = mapOf(
                    "artifacts" to listOf(
                        descriptorMap("LLD-h-s1", "LLD", "Foundation", workItemId = "E20260919h:S001", openQuestionCount = 2),
                        descriptorMap("DEF-h", "DEF", "Definition"),
                    ),
                ),
            )
        }
        val result = DaemonGatewayImpl(rpc).pendingArtifacts("/home/dev/proj")
        val available = assertInstanceOf(PendingQueryResult.Available::class.java, result)
        assertEquals(2, available.artifacts.size)

        val first = available.artifacts[0]
        assertEquals(
            PendingArtifactDto("LLD-h-s1", "LLD", "Foundation", "docs/x/LLD.md", "E20260919h:S001", 2, "pending"),
            first,
        )
        // A missing workItemId is null, not "".
        assertNull(available.artifacts[1].workItemId)
    }

    @Test
    fun `pendingArtifacts maps ok with an empty list to Available(emptyList) — 'nothing pending'`() {
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("artifacts" to emptyList<Any?>())) }
        val result = DaemonGatewayImpl(rpc).pendingArtifacts("/home/dev/proj")
        val available = assertInstanceOf(PendingQueryResult.Available::class.java, result)
        assertTrue(available.artifacts.isEmpty())
    }

    @Test
    fun `pendingArtifacts maps ok=false to Unavailable(reason), never Available(emptyList)`() {
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = false, error = "workflow.pending: `repo` is required") }
        val result = DaemonGatewayImpl(rpc).pendingArtifacts("/home/dev/proj")
        val unavailable = assertInstanceOf(PendingQueryResult.Unavailable::class.java, result)
        assertEquals("workflow.pending: `repo` is required", unavailable.reason)
    }

    @Test
    fun `pendingArtifacts maps a DaemonUnavailableException to Unavailable(reason), never Available(emptyList)`() {
        val rpc = FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        val result = DaemonGatewayImpl(rpc).pendingArtifacts("/home/dev/proj")
        val unavailable = assertInstanceOf(PendingQueryResult.Unavailable::class.java, result)
        assertEquals("socket down", unavailable.reason)
    }

    @Test
    fun `pendingArtifacts does no classification — a malformed payload degrades safely, not throws`() {
        // ok=true but the artifacts payload is not a list -> empty Available (no throw).
        val notAList = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("artifacts" to "oops")) }
        val a = DaemonGatewayImpl(notAList).pendingArtifacts("/home/dev/proj")
        assertTrue(assertInstanceOf(PendingQueryResult.Available::class.java, a).artifacts.isEmpty())

        // openQuestionCount arriving as a JSON double is coerced to Int.
        val doubleCount = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("artifacts" to listOf(descriptorMap("PLAN-h-s1", "PLAN", "Plan", openQuestionCount = 3.0))))
        }
        val b = DaemonGatewayImpl(doubleCount).pendingArtifacts("/home/dev/proj")
        assertEquals(3, assertInstanceOf(PendingQueryResult.Available::class.java, b).artifacts[0].openQuestionCount)
    }

    // ---- t4 -----------------------------------------------------------------

    @Test
    fun `ReviewListViews maps Available(list) to Pending, Available(empty) to NothingPending, Unavailable to Unavailable`() {
        val artifacts = listOf(PendingArtifactDto("LLD-h-s1", "LLD", "Foundation", "docs/x/LLD.md", null, 0, "pending"))

        val pending = ReviewListViews.of(PendingQueryResult.Available(artifacts))
        assertEquals(ReviewListView.Pending(artifacts), pending)

        val nothing = ReviewListViews.of(PendingQueryResult.Available(emptyList()))
        assertEquals(ReviewListView.NothingPending, nothing)

        // Unavailable must NOT collapse to the empty state (ac2).
        val unavailable = ReviewListViews.of(PendingQueryResult.Unavailable("socket down"))
        assertEquals(ReviewListView.Unavailable("socket down"), unavailable)
        assertTrue(unavailable !is ReviewListView.NothingPending)
    }
}
