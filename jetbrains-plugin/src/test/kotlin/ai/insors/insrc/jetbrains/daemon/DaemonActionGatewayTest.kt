package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc2-adjacent unit tests for the Daemon-page lifecycle IPC methods (Story
 * E2026092157298940:S002 / t2). Drive [DaemonGatewayImpl.backup]/[compact]/[shutdown]
 * against a fake [DaemonRpc] that records the (method, params) it was called with — no
 * socket, no IDE — asserting the DaemonActionResult classification + the wire shape.
 */
class DaemonActionGatewayTest {

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

    // ---- backup --------------------------------------------------------------

    @Test
    fun `backup sends the path param and maps an ok reply to Ok`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true) }
        val result = DaemonGatewayImpl(rpc).backup("/tmp/insrc-backup")

        assertEquals(DaemonGatewayImpl.METHOD_BACKUP, rpc.lastMethod)
        assertEquals("/tmp/insrc-backup", rpc.lastParams[DaemonGatewayImpl.PARAM_PATH])
        assertTrue(result is DaemonActionResult.Ok)
    }

    @Test
    fun `backup maps a framed 'target path required' error to Failed`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = false, error = "daemon.backup: target path required") }
        val result = DaemonGatewayImpl(rpc).backup("")
        assertEquals("daemon.backup: target path required", (result as DaemonActionResult.Failed).reason)
    }

    // ---- compact -------------------------------------------------------------

    @Test
    fun `compact sends METHOD_COMPACT with no params and maps ok to Ok`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true) }
        val result = DaemonGatewayImpl(rpc).compact()
        assertEquals(DaemonGatewayImpl.METHOD_COMPACT, rpc.lastMethod)
        assertTrue(rpc.lastParams.isEmpty())
        assertTrue(result is DaemonActionResult.Ok)
    }

    @Test
    fun `compact forwards the indexer-busy refusal verbatim as Failed`() {
        val busy = "daemon.compact: indexer is busy (queue=3, processing=true). Wait for indexing to drain before compacting."
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = false, error = busy) }
        val result = DaemonGatewayImpl(rpc).compact()
        assertEquals(busy, (result as DaemonActionResult.Failed).reason)
    }

    // ---- shutdown ------------------------------------------------------------

    @Test
    fun `shutdown sends METHOD_SHUTDOWN and maps ok to Ok`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true) }
        val result = DaemonGatewayImpl(rpc).shutdown()
        assertEquals(DaemonGatewayImpl.METHOD_SHUTDOWN, rpc.lastMethod)
        assertTrue(result is DaemonActionResult.Ok)
    }

    @Test
    fun `shutdown treats an unreachable daemon as already-stopped Ok (never throws)`() {
        val rpc = RecordingRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        assertTrue(DaemonGatewayImpl(rpc).shutdown() is DaemonActionResult.Ok)
    }

    // ---- never-throws contract ----------------------------------------------

    @Test
    fun `backup and compact map an unreachable daemon to Failed, never a throw`() {
        val rpc = RecordingRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        val gw = DaemonGatewayImpl(rpc)
        assertTrue(gw.backup("/tmp/x") is DaemonActionResult.Failed)
        assertTrue(gw.compact() is DaemonActionResult.Failed)
    }

    @Test
    fun `a malformed RuntimeException reply maps to Failed, never a throw`() {
        val rpc = RecordingRpc { _, _ -> throw IllegalStateException("boom") }
        val result = DaemonGatewayImpl(rpc).compact()
        assertTrue(result is DaemonActionResult.Failed)
        assertFalse(result is DaemonActionResult.Ok)
    }
}
