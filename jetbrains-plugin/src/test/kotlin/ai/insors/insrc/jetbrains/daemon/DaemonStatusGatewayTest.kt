package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc2 unit tests for the rich daemon-status read (Story E2026092157298940:S001 / t5).
 * Drive [DaemonGatewayImpl.daemonStatus] against a fake [DaemonRpc] that RECORDS the
 * (method, params) it was called with — no socket, no IDE. Numbers are fed as the REAL
 * Gson boundary type (Double), exactly as [UnixSocketDaemonRpc] decodes them, so the
 * parse's coercion is exercised against production shapes.
 */
class DaemonStatusGatewayTest {

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

    /** A daemon.status payload shaped exactly as Gson decodes it: Double numbers, repos[] array. */
    private fun gsonStatus(): Map<String, Any?> = mapOf(
        "uptime" to 12.0,
        "repos" to listOf(mapOf("path" to "/a"), mapOf("path" to "/b")),
        "queueDepth" to 3.0,
        "embeddingsPending" to 3.0,
        "modelPullStatus" to "ready",
        "modelPullPct" to 50.0,
        "lmdbFileSizeMb" to 8.0,
    )

    // ---- Loaded classification + coercion + wire shape -----------------------

    @Test
    fun `daemonStatus sends METHOD_STATUS with empty params and coerces a Gson-Double reply to Loaded`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true, data = gsonStatus()) }
        val result = DaemonGatewayImpl(rpc).daemonStatus()

        // The request MUST reuse daemon.status with NO params (no new method constant).
        assertEquals(DaemonGatewayImpl.METHOD_STATUS, rpc.lastMethod)
        assertTrue(rpc.lastParams.isEmpty(), "daemonStatus takes no repo/params")

        val s = (result as DaemonStatusResult.Loaded).status
        assertTrue(s.running, "a decoded reply means the daemon is running")
        assertEquals(12L, s.uptimeSec)          // Double -> Long
        assertEquals(3, s.queueDepth)           // Double -> Int
        assertEquals(3, s.embeddingsPending)
        assertEquals("ready", s.modelPullStatus)
        assertEquals(50, s.modelPullPct)
        assertEquals(8, s.lmdbFileSizeMb)
        assertEquals(2, s.repoCount)            // derived from repos[].size
    }

    @Test
    fun `daemonStatus defaults modelPullStatus, nulls absent optionals, and zeroes an empty repos array`() {
        val rpc = RecordingRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("uptime" to 0.0, "repos" to emptyList<Any?>(), "queueDepth" to 0.0, "embeddingsPending" to 0.0))
        }
        val s = (DaemonGatewayImpl(rpc).daemonStatus() as DaemonStatusResult.Loaded).status
        assertEquals("ready", s.modelPullStatus)     // absent -> default
        assertNull(s.modelPullPct)                   // absent -> null
        assertNull(s.lmdbFileSizeMb)                 // absent -> null
        assertEquals(0, s.repoCount)                 // empty repos[] -> 0, still Loaded
        assertTrue(s.running)
    }

    // ---- Stopped vs Unavailable ---------------------------------------------

    @Test
    fun `daemonStatus maps an unreachable daemon to the distinct Stopped state`() {
        val rpc = RecordingRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        assertEquals(DaemonStatusResult.Stopped, DaemonGatewayImpl(rpc).daemonStatus())
    }

    @Test
    fun `daemonStatus maps a framed error reply to Unavailable`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = false, error = "boom") }
        val result = DaemonGatewayImpl(rpc).daemonStatus()
        assertEquals("boom", (result as DaemonStatusResult.Unavailable).reason)
    }

    @Test
    fun `daemonStatus coerces a junk-but-ok reply to a zeroed Loaded without throwing`() {
        // Non-numeric where a number is expected + a non-collection repos: coercion
        // defaults numerics to 0 and repoCount to 0, so this still decodes to Loaded
        // (never a throw) — the never-throws contract holds for junk-but-ok replies.
        val rpc = RecordingRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("uptime" to "nope", "repos" to "notalist"))
        }
        val result = DaemonGatewayImpl(rpc).daemonStatus()
        val s = (result as DaemonStatusResult.Loaded).status
        assertEquals(0L, s.uptimeSec)
        assertEquals(0, s.repoCount)
    }

    @Test
    fun `daemonStatus does not disturb probe classification`() {
        // The same reachable reply drives both reads: probe() reports presence,
        // daemonStatus() reports the rich snapshot — probe() is untouched by S001.
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true, data = gsonStatus() + ("stale" to false)) }
        val gw = DaemonGatewayImpl(rpc)
        assertEquals(DaemonState.CURRENT, gw.probe())
        assertTrue(gw.daemonStatus() is DaemonStatusResult.Loaded)
    }
}
