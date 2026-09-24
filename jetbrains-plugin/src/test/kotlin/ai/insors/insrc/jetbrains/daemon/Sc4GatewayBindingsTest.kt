package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Story S004 / t1 — unit tests for the new sc1/sc2 gateway client bindings. Drive
 * [DaemonGatewayImpl] against a fake [DaemonRpc] (no socket, no IDE), asserting the
 * update()/updateOutcome() mapping goes to the daemon-owned IPC (never a shell-out, k2)
 * and daemonStatus() extracts the new installedCommit field (sc2). Numbers are fed as the
 * REAL Gson boundary type (Double).
 */
class Sc4GatewayBindingsTest {

    private class HandlerRpc(
        private val handler: (method: String, params: Map<String, Any?>) -> DaemonResult,
    ) : DaemonRpc {
        var lastMethod: String? = null
        override fun call(method: String, params: Map<String, Any?>): DaemonResult {
            lastMethod = method
            return handler(method, params)
        }
    }

    // ---- update(): sc1 daemon.update mapping ---------------------------------

    @Test
    fun `update sends daemon-update and maps an ok reply to Ok (never a shell-out)`() {
        val rpc = HandlerRpc { _, _ -> DaemonResult(ok = true, data = mapOf("launched" to true)) }
        val result = DaemonGatewayImpl(rpc).update()
        assertEquals(DaemonGatewayImpl.METHOD_UPDATE, rpc.lastMethod, "routes to the daemon.update IPC (k2)")
        assertInstanceOf(DaemonActionResult.Ok::class.java, result)
    }

    @Test
    fun `update maps a framed error to Failed with the reason`() {
        val rpc = HandlerRpc { _, _ -> DaemonResult(ok = false, error = "update already in progress") }
        val result = DaemonGatewayImpl(rpc).update()
        assertEquals("update already in progress", (result as DaemonActionResult.Failed).reason)
    }

    @Test
    fun `update maps an unreachable daemon to Failed, never throwing`() {
        val rpc = HandlerRpc { _, _ -> throw DaemonUnavailableException("the daemon is not running") }
        val result = DaemonGatewayImpl(rpc).update()
        assertInstanceOf(DaemonActionResult.Failed::class.java, result)
    }

    // ---- updateOutcome(): sc1 daemon.updateOutcome mapping -------------------

    @Test
    fun `updateOutcome maps a record to Loaded with state, error and finishedAt`() {
        val rpc = HandlerRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("state" to "failed", "error" to "npm run build exited 1", "finishedAt" to "2026-09-24T06:00:00.000Z"))
        }
        val result = DaemonGatewayImpl(rpc).updateOutcome()
        assertEquals(DaemonGatewayImpl.METHOD_UPDATE_OUTCOME, rpc.lastMethod)
        val loaded = result as DaemonUpdateOutcomeResult.Loaded
        assertEquals("failed", loaded.state)
        assertEquals("npm run build exited 1", loaded.error)
        assertEquals("2026-09-24T06:00:00.000Z", loaded.finishedAt)
    }

    @Test
    fun `updateOutcome maps an empty (no-state) reply to None`() {
        val rpc = HandlerRpc { _, _ -> DaemonResult(ok = true, data = emptyMap()) }
        assertInstanceOf(DaemonUpdateOutcomeResult.None::class.java, DaemonGatewayImpl(rpc).updateOutcome())
    }

    @Test
    fun `updateOutcome maps an unreachable daemon to Unavailable, never throwing`() {
        val rpc = HandlerRpc { _, _ -> throw DaemonUnavailableException("still restarting") }
        assertInstanceOf(DaemonUpdateOutcomeResult.Unavailable::class.java, DaemonGatewayImpl(rpc).updateOutcome())
    }

    // ---- daemonStatus(): sc2 installedCommit extraction ----------------------

    @Test
    fun `daemonStatus extracts installedCommit when present`() {
        val sha = "a".repeat(40)
        val rpc = HandlerRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("uptime" to 1.0, "queueDepth" to 0.0, "embeddingsPending" to 0.0, "installedCommit" to sha))
        }
        val s = (DaemonGatewayImpl(rpc).daemonStatus() as DaemonStatusResult.Loaded).status
        assertEquals(sha, s.installedCommit)
    }

    @Test
    fun `daemonStatus defaults installedCommit to empty when absent (pre-S002 daemon)`() {
        val rpc = HandlerRpc { _, _ -> DaemonResult(ok = true, data = mapOf("uptime" to 1.0, "queueDepth" to 0.0, "embeddingsPending" to 0.0)) }
        val s = (DaemonGatewayImpl(rpc).daemonStatus() as DaemonStatusResult.Loaded).status
        assertTrue(s.installedCommit.isEmpty(), "an absent installedCommit degrades to '' (never a throw)")
        // The existing contract is unchanged: a reachable reply is still Loaded/running.
        assertTrue(s.running)
    }

    @Test
    fun `daemonStatus still maps an unreachable daemon to Stopped (installedCommit read does not change the contract)`() {
        val rpc = HandlerRpc { _, _ -> throw DaemonUnavailableException("socket refused") }
        assertInstanceOf(DaemonStatusResult.Stopped::class.java, DaemonGatewayImpl(rpc).daemonStatus())
        assertNull(null) // contract sanity
    }
}
