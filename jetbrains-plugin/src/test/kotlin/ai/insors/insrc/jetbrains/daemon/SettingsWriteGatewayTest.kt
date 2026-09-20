package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S003 tests for DaemonGatewayImpl.writeSetting/clearSetting (Epic
 * expose-daemon-settings, sc2). ok=true -> Saved; a returned ok=false -> Rejected;
 * DaemonUnavailable / a transport fault -> Unavailable (never a throw, never a
 * false Saved). writeSetting sends config.write {path: segments, value};
 * clearSetting sends config.write {path: segments} with the value key OMITTED
 * (so the daemon drops the leaf). Plus the REAL UnixSocketDaemonRpc.parse framing
 * boundary the fake tests never cross ({result:{ok:true}} -> Saved;
 * {result:{error}} -> Rejected — the S001 result.error framing, where a returned
 * error is a daemon rejection, not an unreachable socket).
 */
class SettingsWriteGatewayTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        var lastMethod: String? = null
        var lastParams: Map<String, Any?>? = null
        override fun call(method: String, params: Map<String, Any?>): DaemonResult {
            lastMethod = method
            lastParams = params
            return handler(method, params)
        }
    }

    @Test
    fun `writeSetting sends config-write with path segments and value, and maps daemon ok=true to Saved`() {
        // The real config.write handler returns its verdict INSIDE the result envelope:
        // {ok:true} => DaemonResult(ok=true, data={ok:true}).
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("ok" to true)) }
        val result = DaemonGatewayImpl(rpc).writeSetting(listOf("logLevel"), "debug")
        assertInstanceOf(SaveResult.Saved::class.java, result)
        assertEquals("config.write", rpc.lastMethod)
        assertEquals(listOf("logLevel"), rpc.lastParams!!["path"])
        assertEquals("debug", rpc.lastParams!!["value"])
    }

    @Test
    fun `writeSetting maps a bare daemon ok=false to Rejected and DaemonUnavailable to Unavailable`() {
        // config.write's refusal is a BARE {ok:false} in the result envelope, NOT a
        // framed error — so it arrives as DaemonResult(ok=true, data={ok:false}).
        val rejected = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("ok" to false)) })
            .writeSetting(listOf("x"), 1)
        assertInstanceOf(SaveResult.Rejected::class.java, rejected)

        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") })
            .writeSetting(listOf("x"), 1)
        assertEquals("socket down", assertInstanceOf(SaveResult.Unavailable::class.java, down).reason)
    }

    @Test
    fun `clearSetting sends config-write with NO value key and maps daemon ok=true to Saved`() {
        val rpc = FakeDaemonRpc { _, _ -> DaemonResult(ok = true, data = mapOf("ok" to true)) }
        val result = DaemonGatewayImpl(rpc).clearSetting(listOf("models.tasks.design.contract.detail"))
        assertInstanceOf(SaveResult.Saved::class.java, result)
        assertEquals("config.write", rpc.lastMethod)
        assertEquals(listOf("models.tasks.design.contract.detail"), rpc.lastParams!!["path"])
        assertFalse(
            rpc.lastParams!!.containsKey("value"),
            "clearSetting must OMIT the value key so the daemon drops the leaf",
        )
    }

    // ---- real parse across the framing boundary -----------------------------

    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse, an ok reply maps to Saved and a returned error to Rejected`() {
        val ok = """{"id":1,"result":{"ok":true}}"""
        assertInstanceOf(SaveResult.Saved::class.java, DaemonGatewayImpl(WireRpc(ok)).writeSetting(listOf("logLevel"), "warn"))

        // config.write frames a refused path as result.error -> the transport reads
        // ok=false, so the gateway classifies it Rejected (a daemon refusal), NOT
        // Unavailable (which is reserved for an unreachable/thrown socket).
        val error = """{"id":1,"result":{"error":"config path has an empty segment"}}"""
        assertEquals(
            "config path has an empty segment",
            assertInstanceOf(SaveResult.Rejected::class.java, DaemonGatewayImpl(WireRpc(error)).writeSetting(listOf("x"), 1)).reason,
        )

        // A bare {ok:false} (config.write's real refusal shape, no error string) is
        // also Rejected — with a generic reason.
        val bareFalse = """{"id":1,"result":{"ok":false}}"""
        assertInstanceOf(SaveResult.Rejected::class.java, DaemonGatewayImpl(WireRpc(bareFalse)).writeSetting(listOf("x"), 1))
    }
}
