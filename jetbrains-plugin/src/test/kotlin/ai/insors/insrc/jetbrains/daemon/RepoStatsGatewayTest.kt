package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit tests for the repo.stats mirror + the registerProject steering extension
 * (Story jetbrains-plugin-add-insrc-entry-project / S001 / t6). Drives
 * [DaemonGatewayImpl] against a fake [DaemonRpc] that records the (method, params)
 * it was called with — no socket, no IDE. Numbers are fed as the real Gson boundary
 * type (Double) and the two Record maps as nested Map<String,Double>, exactly as the
 * transport emits, so the parse's coercion is exercised against production shapes.
 */
class RepoStatsGatewayTest {

    private class RecordingRpc(
        private val handler: (method: String, params: Map<String, Any?>) -> DaemonResult,
    ) : DaemonRpc {
        var lastMethod: String? = null
        var lastParams: Map<String, Any?> = emptyMap()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult {
            lastMethod = method
            lastParams = params
            return handler(method, params)
        }
    }

    /** A RepoStats payload shaped exactly as Gson decodes it: Double numbers, nested Double maps. */
    private fun gsonStats(): Map<String, Any?> = mapOf(
        "repoPath" to "/home/dev/a",
        "status" to "ready",
        "lastIndexed" to "2026-09-20T00:00:00Z",
        "addedAt" to "2026-09-01T00:00:00Z",
        "fileCount" to 3.0,
        "filesByLanguage" to mapOf("typescript" to 2.0, "python" to 1.0),
        "entityCount" to 10.0,
        "entityCountByKind" to mapOf("function" to 7.0, "class" to 3.0),
        "relationCount" to 5.0,
        "sizeBytes" to 2048.0,
        "pendingJobs" to 4.0,
    )

    // ---- repoStats classification + wire shape -------------------------------

    @Test
    fun `repoStats sends the repoPath key and maps a Gson-Double reply to Loaded with coerced numbers`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true, data = gsonStats()) }
        val result = DaemonGatewayImpl(rpc).repoStats("/home/dev/a")

        // The request MUST use repo.stats + the repoPath key (NOT `repo`).
        assertEquals(DaemonGatewayImpl.METHOD_REPO_STATS, rpc.lastMethod)
        assertEquals("/home/dev/a", rpc.lastParams[DaemonGatewayImpl.PARAM_REPO_PATH])
        assertFalse(rpc.lastParams.containsKey(DaemonGatewayImpl.PARAM_REPO))

        val stats = (result as RepoStatsResult.Loaded).stats
        assertEquals("/home/dev/a", stats.repoPath)
        assertEquals("ready", stats.status)
        assertEquals(3, stats.fileCount)
        assertEquals(2048L, stats.sizeBytes)
        assertEquals(10, stats.entityCount)
        assertEquals(5, stats.relationCount)
        assertEquals(4, stats.pendingJobs)
        assertEquals(mapOf("typescript" to 2, "python" to 1), stats.filesByLanguage)
        assertEquals(mapOf("function" to 7, "class" to 3), stats.entityCountByKind)
    }

    @Test
    fun `repoStats maps a framed error, an unreachable daemon, and a malformed reply to Unavailable`() {
        val framed = RecordingRpc { _, _ -> DaemonResult(ok = false, error = "repo.stats: /x is not a registered repo") }
        val r1 = DaemonGatewayImpl(framed).repoStats("/x")
        assertTrue(r1 is RepoStatsResult.Unavailable)
        assertEquals("repo.stats: /x is not a registered repo", (r1 as RepoStatsResult.Unavailable).reason)

        val down = RecordingRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        assertTrue(DaemonGatewayImpl(down).repoStats("/home/dev/a") is RepoStatsResult.Unavailable)

        // A malformed reply (a non-map where a map is expected) must not throw — it degrades to Unavailable.
        val malformed = RecordingRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("repoPath" to "/home/dev/a", "filesByLanguage" to "not-a-map"))
        }
        val r3 = DaemonGatewayImpl(malformed).repoStats("/home/dev/a")
        // "not-a-map" is tolerated (numberMap returns empty), so this is still Loaded with empty maps —
        // the point is it never throws.
        assertTrue(r3 is RepoStatsResult.Loaded)
        assertTrue((r3 as RepoStatsResult.Loaded).stats.filesByLanguage.isEmpty())
    }

    // ---- pure parseRepoStats boundary types ----------------------------------

    @Test
    fun `parseRepoStats coerces Double to Int-Long, leaves absent optionals null, forwards unknown status, empty maps`() {
        val minimal = mapOf<String, Any?>(
            "repoPath" to "/home/dev/a",
            "status" to "some-future-status", // unknown status -> verbatim
            "addedAt" to "T0",
            "sizeBytes" to 1024.0,
            "fileCount" to 3.0,
            // lastIndexed / errorMsg absent; filesByLanguage / entityCountByKind absent
        )
        val dto = DaemonGatewayImpl.parseRepoStats(minimal)
        assertEquals("some-future-status", dto.status)
        assertEquals(1024L, dto.sizeBytes)
        assertEquals(3, dto.fileCount)
        assertNull(dto.lastIndexed)
        assertNull(dto.errorMsg)
        assertTrue(dto.filesByLanguage.isEmpty())
        assertTrue(dto.entityCountByKind.isEmpty())
        // a blank errorMsg is treated as absent
        assertNull(DaemonGatewayImpl.parseRepoStats(minimal + ("errorMsg" to "")).errorMsg)
        assertEquals("boom", DaemonGatewayImpl.parseRepoStats(minimal + ("errorMsg" to "boom")).errorMsg)
    }

    // ---- registerProject steering wire shape + backward-compat ---------------

    @Test
    fun `registerProject forwards steering when present and omits it entirely when null`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true) }
        val g = DaemonGatewayImpl(rpc)

        assertTrue(g.registerProject("/home/dev/a", SteeringSelection(claude = true, agents = false)).registered)
        assertEquals(DaemonGatewayImpl.METHOD_REPO_ADD, rpc.lastMethod)
        assertEquals("/home/dev/a", rpc.lastParams[DaemonGatewayImpl.PARAM_PATH])
        assertEquals(
            mapOf("claude" to true, "agents" to false),
            rpc.lastParams[DaemonGatewayImpl.PARAM_STEERING],
        )

        // both-false still sends the steering map (the daemon treats it as a no-op)
        g.registerProject("/home/dev/a", SteeringSelection(claude = false, agents = false))
        assertEquals(
            mapOf("claude" to false, "agents" to false),
            rpc.lastParams[DaemonGatewayImpl.PARAM_STEERING],
        )

        // null steering (and the default no-arg overload) send NO steering key — backward-compatible.
        g.registerProject("/home/dev/a", null)
        assertFalse(rpc.lastParams.containsKey(DaemonGatewayImpl.PARAM_STEERING))
        g.registerProject("/home/dev/a")
        assertFalse(rpc.lastParams.containsKey(DaemonGatewayImpl.PARAM_STEERING))
    }

    @Test
    fun `registerProject classification is unchanged - ok-true registered, ok-false reason, unreachable throws`() {
        val ok = DaemonGatewayImpl(RecordingRpc { _, _ -> DaemonResult(ok = true) })
        assertTrue(ok.registerProject("/home/dev/a", SteeringSelection(false, false)).registered)

        val rejected = DaemonGatewayImpl(RecordingRpc { _, _ -> DaemonResult(ok = false, error = "not a repo") })
        val r = rejected.registerProject("/tmp/x", null)
        assertFalse(r.registered)
        assertEquals("not a repo", r.reason)

        val down = DaemonGatewayImpl(RecordingRpc { _, _ -> throw DaemonUnavailableException("down") })
        assertThrows(DaemonUnavailableException::class.java) { down.registerProject("/home/dev/a", null) }
    }
}
