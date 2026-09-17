package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * sc2 unit tests (Story S001 / t3). Drive [DaemonGatewayImpl] against a fake
 * [DaemonRpc] — no real socket, so the gateway logic (state mapping, read-only
 * membership, idempotent registration, DaemonUnavailable surfacing) is verified
 * in isolation. The real transport ([UnixSocketDaemonRpc]) is covered by CI.
 */
class Sc2DaemonGatewayTest {

    /** Records every method call so read-only-ness can be asserted. */
    private class FakeDaemonRpc(
        private val handler: (method: String, params: Map<String, Any?>) -> DaemonResult,
    ) : DaemonRpc {
        val calls = mutableListOf<String>()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult {
            calls += method
            return handler(method, params)
        }
    }

    private fun unreachable() = FakeDaemonRpc { _, _ ->
        throw DaemonUnavailableException("socket down")
    }

    @Test
    fun `probe maps reachable-unreachable-unknown-freshness to current-stale-absent`() {
        // unreachable -> ABSENT, and probe never throws
        assertEquals(DaemonState.ABSENT, DaemonGatewayImpl(unreachable()).probe())

        // reachable, affirmatively stale -> STALE
        val stale = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("stale" to true)) }
        assertEquals(DaemonState.STALE, DaemonGatewayImpl(stale).probe())

        // reachable, not stale -> CURRENT
        val current = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("stale" to false)) }
        assertEquals(DaemonState.CURRENT, DaemonGatewayImpl(current).probe())

        // reachable, freshness unknown (no field) -> CURRENT (presence), never invented as stale
        val unknown = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = emptyMap()) }
        assertEquals(DaemonState.CURRENT, DaemonGatewayImpl(unknown).probe())
    }

    @Test
    fun `isProjectRegistered is read-only, surfaces DaemonUnavailable, and never auto-allocates`() {
        val registered = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("repos" to listOf("/home/dev/a", "/home/dev/b")))
        }
        val g = DaemonGatewayImpl(registered)
        assertTrue(g.isProjectRegistered("/home/dev/a"))
        assertFalse(g.isProjectRegistered("/home/dev/unregistered"))
        // read-only: only repo.list was called, never repo.add
        assertTrue(registered.calls.all { it == DaemonGatewayImpl.METHOD_REPO_LIST })
        assertFalse(registered.calls.contains(DaemonGatewayImpl.METHOD_REPO_ADD))

        // daemon down -> surfaced, not swallowed
        assertThrows(DaemonUnavailableException::class.java) {
            DaemonGatewayImpl(unreachable()).isProjectRegistered("/home/dev/a")
        }
    }

    @Test
    fun `registerProject routes repo_add, is idempotent, returns reason on rejection, never auto-allocates others`() {
        // success (and idempotent already-registered both come back ok=true -> registered)
        val ok = FakeDaemonRpc { method, params ->
            assertEquals(DaemonGatewayImpl.METHOD_REPO_ADD, method)
            assertEquals("/home/dev/a", params[DaemonGatewayImpl.PARAM_PATH])
            DaemonResult(ok = true)
        }
        val okGateway = DaemonGatewayImpl(ok)
        assertTrue(okGateway.registerProject("/home/dev/a").registered)
        // idempotent: registering again still succeeds, and only /home/dev/a is ever passed
        assertTrue(okGateway.registerProject("/home/dev/a").registered)
        assertTrue(ok.calls.all { it == DaemonGatewayImpl.METHOD_REPO_ADD })

        // backend rejection -> registered=false with the backend reason
        val rejected = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = false, error = "path is not an indexable repo")
        }
        val result = DaemonGatewayImpl(rejected).registerProject("/tmp/not-a-repo")
        assertFalse(result.registered)
        assertNotNull(result.reason)
        assertEquals("path is not an indexable repo", result.reason)

        // daemon down -> surfaced
        assertThrows(DaemonUnavailableException::class.java) {
            DaemonGatewayImpl(unreachable()).registerProject("/home/dev/a")
        }

        // a successful registration carries no reason
        assertNull(okGateway.registerProject("/home/dev/a").reason)
    }
}
