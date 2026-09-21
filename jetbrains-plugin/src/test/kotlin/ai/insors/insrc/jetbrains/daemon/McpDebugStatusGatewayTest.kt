package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc-internal unit tests for the debug-status read (Story E2026092157298940:S005 / t1+t5).
 * Drive [DaemonGatewayImpl.debugStatus] against a fake [DaemonRpc] that RECORDS the
 * (method, params) it was called with — no socket, no IDE. The `clients[]` payload is fed
 * as the REAL Gson boundary shape (a List of Maps with Double numbers + omitted optionals),
 * exactly as [UnixSocketDaemonRpc] decodes it, so the parse's Double->Long coercion and the
 * sort/never-throws contract are exercised against production shapes.
 */
class McpDebugStatusGatewayTest {

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

    /** A daemon.debug-status payload shaped exactly as Gson decodes it: Double numbers, clients[] array. */
    private fun gsonClients(): Map<String, Any?> = mapOf(
        "clients" to listOf(
            // OUT OF ORDER by connectedAt to prove the sort; the first omits pid + lastMethod.
            mapOf("id" to 2.0, "label" to "junie", "connectedAt" to 200.0),
            mapOf("id" to 1.0, "label" to "assistant", "pid" to 4242.0, "connectedAt" to 100.0, "lastMethod" to "tools/list"),
        ),
    )

    // ---- Loaded classification + coercion + sort + wire shape ----------------

    @Test
    fun `debugStatus sends METHOD_DEBUG_STATUS with empty params and coerces a Gson-Double reply to Loaded sorted by connectedAtMs`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true, data = gsonClients()) }
        val result = DaemonGatewayImpl(rpc).debugStatus()

        // Read-only: reuse daemon.debug-status with NO params.
        assertEquals(DaemonGatewayImpl.METHOD_DEBUG_STATUS, rpc.lastMethod)
        assertTrue(rpc.lastParams.isEmpty(), "debugStatus takes no params")

        val sessions = (result as DebugStatusResult.Loaded).sessions
        assertEquals(2, sessions.size)
        // Sorted by connectedAtMs ascending -> the id=1 session (connectedAt 100) comes first.
        val first = sessions[0]
        assertEquals(1L, first.id)                 // Double -> Long
        assertEquals("assistant", first.label)
        assertEquals(4242L, first.pid)             // Double -> Long
        assertEquals(100L, first.connectedAtMs)    // Double -> Long
        assertEquals("tools/list", first.lastMethod)
        val second = sessions[1]
        assertEquals(2L, second.id)
        assertEquals(200L, second.connectedAtMs)
        assertNull(second.pid, "an omitted pid is null")
        assertNull(second.lastMethod, "an omitted lastMethod is null")
    }

    @Test
    fun `debugStatus returns an empty-but-Loaded snapshot for a reachable daemon with zero sessions`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true, data = mapOf("clients" to emptyList<Any?>())) }
        val result = DaemonGatewayImpl(rpc).debugStatus()
        assertTrue((result as DebugStatusResult.Loaded).sessions.isEmpty(), "reachable-with-none is Loaded(empty), not Unavailable")
    }

    // ---- Unavailable: unreachable / framed error / malformed -----------------

    @Test
    fun `debugStatus maps an unreachable daemon to Unavailable`() {
        val rpc = RecordingRpc { _, _ -> throw DaemonUnavailableException("socket down") }
        val result = DaemonGatewayImpl(rpc).debugStatus()
        assertEquals("socket down", (result as DebugStatusResult.Unavailable).reason)
    }

    @Test
    fun `debugStatus maps a framed error reply to Unavailable`() {
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = false, error = "boom") }
        val result = DaemonGatewayImpl(rpc).debugStatus()
        assertEquals("boom", (result as DebugStatusResult.Unavailable).reason)
    }

    @Test
    fun `debugStatus tolerates a malformed non-array clients as an empty Loaded without throwing`() {
        // A non-list clients is skipped (parseAttachedSessions returns empty) rather than
        // throwing — the never-throws contract holds for junk-but-ok replies.
        val rpc = RecordingRpc { _, _ -> DaemonResult(ok = true, data = mapOf("clients" to "notalist")) }
        val result = DaemonGatewayImpl(rpc).debugStatus()
        assertTrue((result as DebugStatusResult.Loaded).sessions.isEmpty())
    }
}
