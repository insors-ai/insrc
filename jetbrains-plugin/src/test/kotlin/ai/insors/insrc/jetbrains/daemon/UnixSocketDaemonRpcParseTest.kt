package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Real-transport wire-framing tests for [UnixSocketDaemonRpc.parse] — the
 * boundary the fake-[DaemonRpc] gateway tests never cross. The cold review of
 * S001 found the ac2 guarantee broken precisely HERE: the server frames a
 * handler's returned `{ error }` as `result:{error}` (a top-level `error`
 * appears only when a handler THROWS), so without surfacing `result.error` the
 * plugin read a daemon error as an empty success and showed "nothing awaiting
 * review". These tests pin both framings, driving `parse` on canned replies with
 * no socket.
 */
class UnixSocketDaemonRpcParseTest {

    private val rpc = UnixSocketDaemonRpc()

    @Test
    fun `a normal result object parses to ok=true with its data`() {
        val r = rpc.parse("""{"id":1,"result":{"artifacts":[{"kind":"LLD"}]}}""")
        assertTrue(r.ok)
        assertTrue((r.data["artifacts"] as List<*>).isNotEmpty())
    }

    @Test
    fun `a STRUCTURED result_error (returned value) parses to ok=false — never a silent empty success (ac2)`() {
        val r = rpc.parse("""{"id":1,"result":{"error":"workflow.pending: `repo` is required"}}""")
        assertFalse(r.ok, "a structured result.error must be surfaced as not-ok")
        assertEquals("workflow.pending: `repo` is required", r.error)
    }

    @Test
    fun `a TOP-LEVEL string error (thrown handler or unknown method) parses to ok=false, no ClassCastException`() {
        // This is what the server emits for a throw / unknown method — a STRING,
        // which the old object-cast crashed on (e.g. version-skew rollout).
        val r = rpc.parse("""{"id":1,"error":"unknown method: workflow.pending"}""")
        assertFalse(r.ok)
        assertEquals("unknown method: workflow.pending", r.error)
    }

    @Test
    fun `a top-level object error with a message is tolerated too`() {
        val r = rpc.parse("""{"id":1,"error":{"message":"boom"}}""")
        assertFalse(r.ok)
        assertEquals("boom", r.error)
    }

    @Test
    fun `a blank reply parses to ok=false`() {
        assertFalse(rpc.parse("").ok)
    }

    @Test
    fun `an empty result_error string is NOT treated as a failure`() {
        val r = rpc.parse("""{"id":1,"result":{"error":"","artifacts":[]}}""")
        assertTrue(r.ok, "an empty error string is not a failure signal")
    }

    @Test
    fun `a BARE ARRAY result parses to ok=true with list, NOT a ClassCastException (repo_list shape)`() {
        // repo.list frames its result as a bare array of repo objects. The old
        // getAsJsonObject("result") force-cast crashed here (JsonArray -> JsonObject).
        val r = rpc.parse("""{"id":1,"result":[{"path":"/home/dev/a","name":"a"},{"path":"/home/dev/b"}]}""")
        assertTrue(r.ok)
        assertEquals(2, r.list?.size)
        assertTrue(r.data.isEmpty(), "an array result leaves data empty; the payload is in list")
        assertEquals("/home/dev/a", (r.list?.get(0) as Map<*, *>)["path"])
    }

    // ---- end-to-end: real parse -> gateway -> view (the hollow-test gap) -----

    /** A [DaemonRpc] that runs the REAL [UnixSocketDaemonRpc.parse] over a canned reply. */
    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse, a daemon structured error maps to Unavailable, NOT NothingPending`() {
        val reply = """{"id":1,"result":{"error":"workflow.pending: store unreadable"}}"""
        val result = DaemonGatewayImpl(WireRpc(reply)).pendingArtifacts("/home/dev/proj")
        val unavailable = assertInstanceOf(PendingQueryResult.Unavailable::class.java, result)
        assertEquals("workflow.pending: store unreadable", unavailable.reason)
    }

    @Test
    fun `over the real parse, a pending list maps to Available with the descriptors`() {
        val reply = """{"id":1,"result":{"artifacts":[{"artifactId":"LLD-h-s1","kind":"LLD","title":"Foundation","mdPath":"docs/x/LLD.md","workItemId":null,"openQuestionCount":2,"state":"pending"}]}}"""
        val result = DaemonGatewayImpl(WireRpc(reply)).pendingArtifacts("/home/dev/proj")
        val available = assertInstanceOf(PendingQueryResult.Available::class.java, result)
        assertEquals(1, available.artifacts.size)
        assertEquals("LLD", available.artifacts[0].kind)
        assertEquals(2, available.artifacts[0].openQuestionCount)
    }

    @Test
    fun `over the real parse, repo_list's bare array maps to registeredRepos Loaded with the paths`() {
        // The daemon returns repo.list as [{path,…}] — the array framing that crashed
        // perRepoOverrides' registeredRepos read with a JsonArray->JsonObject cast.
        val reply = """{"id":1,"result":[{"path":"/home/dev/a","name":"a","status":"ready"},{"path":"/home/dev/b","name":"b"}]}"""
        val result = DaemonGatewayImpl(WireRpc(reply)).registeredRepos()
        val loaded = assertInstanceOf(RegisteredReposResult.Loaded::class.java, result)
        assertEquals(listOf("/home/dev/a", "/home/dev/b"), loaded.repos)
    }

    @Test
    fun `over the real parse, isProjectRegistered reads the bare-array repo paths`() {
        val reply = """{"id":1,"result":[{"path":"/home/dev/a"},{"path":"/home/dev/b"}]}"""
        val gateway = DaemonGatewayImpl(WireRpc(reply))
        assertTrue(gateway.isProjectRegistered("/home/dev/b"))
        assertFalse(gateway.isProjectRegistered("/home/dev/zzz"))
    }

    @Test
    fun `over the real parse, an empty repo_list array is Loaded(emptyList), NOT Unavailable`() {
        val result = DaemonGatewayImpl(WireRpc("""{"id":1,"result":[]}""")).registeredRepos()
        val loaded = assertInstanceOf(RegisteredReposResult.Loaded::class.java, result)
        assertTrue(loaded.repos.isEmpty())
    }
}
