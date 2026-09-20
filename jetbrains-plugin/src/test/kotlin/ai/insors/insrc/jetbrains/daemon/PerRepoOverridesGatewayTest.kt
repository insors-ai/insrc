package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S005 tests for DaemonGatewayImpl.perRepoOverrides() + registeredRepos() (Epic
 * expose-daemon-settings). config.show returns the raw config object directly, so
 * data.models.byRepo is the { repoPath -> {coreFloor, tasks, tiers{runner,model}} }
 * override map; repo.list returns data.repos. A present map -> Loaded; missing/non-map
 * -> Loaded empty / entry skipped; a non-string leaf -> null; DaemonUnavailable ->
 * Unavailable (never a throw). Plus the REAL UnixSocketDaemonRpc.parse boundary the
 * fake never crosses.
 */
class PerRepoOverridesGatewayTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        var lastMethod: String? = null
        override fun call(method: String, params: Map<String, Any?>): DaemonResult {
            lastMethod = method
            return handler(method, params)
        }
    }

    @Test
    fun `ok config with a full byRepo entry maps to Loaded with the parsed override`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(
                ok = true,
                data = mapOf(
                    "models" to mapOf(
                        "byRepo" to mapOf(
                            "/work/afm" to mapOf(
                                "coreFloor" to "core",
                                "tasks" to mapOf("review" to "core", "bad" to 3), // non-string tier skipped
                                "tiers" to mapOf(
                                    "core" to mapOf("runner" to "cli-claude", "model" to "opus"),
                                    "cheap" to mapOf("runner" to "ollama"), // model absent -> null
                                    "junk" to "not-a-map", // skipped
                                ),
                            ),
                            "/ghost" to "not-a-map", // whole entry skipped
                        ),
                    ),
                ),
            )
        }
        val result = DaemonGatewayImpl(rpc).perRepoOverrides()
        assertEquals("config.show", rpc.lastMethod)
        val loaded = assertInstanceOf(PerRepoOverridesResult.Loaded::class.java, result)
        assertEquals(setOf("/work/afm"), loaded.overrides.keys)
        val afm = loaded.overrides.getValue("/work/afm")
        assertEquals("core", afm.coreFloor)
        assertEquals(mapOf("review" to "core"), afm.tasks)
        assertEquals(TierSpecDto("cli-claude", "opus"), afm.tiers["core"])
        assertEquals(TierSpecDto("ollama", null), afm.tiers["cheap"])
        assertNull(afm.tiers["junk"])
    }

    @Test
    fun `missing models or byRepo maps to a Loaded empty map (not Unavailable)`() {
        val noModels = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = emptyMap()) }).perRepoOverrides()
        assertTrue(assertInstanceOf(PerRepoOverridesResult.Loaded::class.java, noModels).overrides.isEmpty())

        val nonMapByRepo = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("models" to mapOf("byRepo" to "not-a-map")))
        }).perRepoOverrides()
        assertTrue(assertInstanceOf(PerRepoOverridesResult.Loaded::class.java, nonMapByRepo).overrides.isEmpty())
    }

    @Test
    fun `DaemonUnavailable maps perRepoOverrides to Unavailable`() {
        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") }).perRepoOverrides()
        assertEquals("socket down", assertInstanceOf(PerRepoOverridesResult.Unavailable::class.java, down).reason)
    }

    @Test
    fun `registeredRepos returns Loaded repos from repo-list`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("repos" to listOf("/work/afm", "/plain", 42)))
        }
        val loaded = assertInstanceOf(RegisteredReposResult.Loaded::class.java, DaemonGatewayImpl(rpc).registeredRepos())
        assertEquals("repo.list", rpc.lastMethod)
        assertEquals(listOf("/work/afm", "/plain"), loaded.repos) // non-string skipped
    }

    @Test
    fun `registeredRepos maps an errored or unreachable daemon to Unavailable`() {
        val errored = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = false, error = "boom") }).registeredRepos()
        assertEquals("boom", assertInstanceOf(RegisteredReposResult.Unavailable::class.java, errored).reason)

        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("no socket") }).registeredRepos()
        assertEquals("no socket", assertInstanceOf(RegisteredReposResult.Unavailable::class.java, down).reason)
    }

    // ---- real parse across the framing boundary -----------------------------

    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse a config-show reply yields the full nested byRepo shape`() {
        // config.show frames the raw config object as `result` (no {ok} envelope).
        val payload = """{"id":1,"result":{"models":{"byRepo":{"/p/a.b":{"coreFloor":"core","tasks":{"review":"core"},"tiers":{"core":{"runner":"cli-claude","model":"opus"}}}}}}}"""
        val loaded = assertInstanceOf(
            PerRepoOverridesResult.Loaded::class.java,
            DaemonGatewayImpl(WireRpc(payload)).perRepoOverrides(),
        )
        val entry = loaded.overrides.getValue("/p/a.b") // a dotted/slashed repoPath survives as one key
        assertEquals("core", entry.coreFloor)
        assertEquals(mapOf("review" to "core"), entry.tasks)
        assertEquals(TierSpecDto("cli-claude", "opus"), entry.tiers["core"])
    }

    @Test
    fun `over the real parse a repo-list reply yields Loaded repos`() {
        val payload = """{"id":1,"result":{"repos":["/work/afm","/plain"]}}"""
        val loaded = assertInstanceOf(
            RegisteredReposResult.Loaded::class.java,
            DaemonGatewayImpl(WireRpc(payload)).registeredRepos(),
        )
        assertEquals(listOf("/work/afm", "/plain"), loaded.repos)
    }
}
