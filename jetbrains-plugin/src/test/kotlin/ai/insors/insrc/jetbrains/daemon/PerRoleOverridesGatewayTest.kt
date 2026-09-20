package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S004 tests for DaemonGatewayImpl.perRoleOverrides() (Epic expose-daemon-settings).
 * config.show returns the raw config object directly, so data.models.tasks is the
 * { roleId -> tier } override map. A present map -> Loaded; missing/non-map -> Loaded
 * empty; a non-string tier is skipped; DaemonUnavailable -> Unavailable (never a
 * throw). Plus the REAL UnixSocketDaemonRpc.parse boundary the fake never crosses.
 */
class PerRoleOverridesGatewayTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        var lastMethod: String? = null
        override fun call(method: String, params: Map<String, Any?>): DaemonResult {
            lastMethod = method
            return handler(method, params)
        }
    }

    @Test
    fun `ok config with models-tasks maps to Loaded with the override map`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(
                ok = true,
                data = mapOf("models" to mapOf("tasks" to mapOf(
                    "design.contract.detail" to "core",
                    "classify" to "cheap",
                    "bad" to 3, // non-string tier -> skipped, never throws
                ))),
            )
        }
        val result = DaemonGatewayImpl(rpc).perRoleOverrides()
        assertEquals("config.show", rpc.lastMethod)
        val loaded = assertInstanceOf(PerRoleOverridesResult.Loaded::class.java, result)
        assertEquals(mapOf("design.contract.detail" to "core", "classify" to "cheap"), loaded.overrides)
    }

    @Test
    fun `missing models or tasks maps to a Loaded empty map (not Unavailable)`() {
        val noModels = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = emptyMap()) }).perRoleOverrides()
        assertTrue(assertInstanceOf(PerRoleOverridesResult.Loaded::class.java, noModels).overrides.isEmpty())

        val nonMapTasks = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("models" to mapOf("tasks" to "not-a-map")))
        }).perRoleOverrides()
        assertTrue(assertInstanceOf(PerRoleOverridesResult.Loaded::class.java, nonMapTasks).overrides.isEmpty())
    }

    @Test
    fun `DaemonUnavailable maps to Unavailable`() {
        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") }).perRoleOverrides()
        assertEquals("socket down", assertInstanceOf(PerRoleOverridesResult.Unavailable::class.java, down).reason)
    }

    // ---- real parse across the framing boundary -----------------------------

    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse, a config-show reply yields the override map`() {
        // config.show frames the raw config object as `result` (no {ok} envelope).
        val payload = """{"id":1,"result":{"models":{"tasks":{"design.contract.detail":"core","classify":"cheap"}}}}"""
        val loaded = assertInstanceOf(
            PerRoleOverridesResult.Loaded::class.java,
            DaemonGatewayImpl(WireRpc(payload)).perRoleOverrides(),
        )
        assertEquals("core", loaded.overrides["design.contract.detail"])
        assertEquals("cheap", loaded.overrides["classify"])
    }
}
