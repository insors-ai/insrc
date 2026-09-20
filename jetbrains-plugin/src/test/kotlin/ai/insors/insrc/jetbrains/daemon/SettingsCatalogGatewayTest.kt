package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S002 tests for DaemonGatewayImpl.settingsCatalog() (Epic expose-daemon-settings).
 * ok+data -> Loaded(SettingsCatalogDto) with values folded into currentValue/isSet;
 * !ok/error / DaemonUnavailable / malformed(options not a list) -> Unavailable
 * (never a blank Loaded, never a throw). Plus the REAL UnixSocketDaemonRpc.parse
 * boundary the fake tests never cross ({result:{payload}} -> Loaded;
 * {result:{error}} -> Unavailable — the S001 result.error framing).
 */
class SettingsCatalogGatewayTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = handler(method, params)
    }

    private fun okPayload(): Map<String, Any?> = mapOf(
        "options" to listOf(
            mapOf("path" to "logLevel", "type" to "enum", "default" to "info", "desc" to "log level",
                  "enumValues" to listOf("error", "warn", "info", "debug"), "group" to "General"),
            mapOf("path" to "ollama.host", "type" to "string", "default" to "http://localhost:11434", "desc" to "host", "group" to "General"),
        ),
        "groups" to listOf("General"),
        "roles" to listOf(mapOf("id" to "design.contract.detail", "defaultTier" to "core")),
        "tierNames" to listOf("cheap", "mid", "core"),
        "values" to mapOf("logLevel" to "debug"), // logLevel set; ollama.host unset
    )

    @Test
    fun `ok+data maps to Loaded with options, roles, tierNames parsed and values folded into currentValue-isSet`() {
        val rpc = FakeDaemonRpc { method, params ->
            assertEquals("config.catalog", method)
            assertTrue(params.isEmpty())   // config.catalog is global — no params
            DaemonResult(ok = true, data = okPayload())
        }
        val result = DaemonGatewayImpl(rpc).settingsCatalog()
        val loaded = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, result)
        val cat = loaded.catalog
        assertEquals(listOf("General"), cat.groups)
        assertEquals(2, cat.options.size)
        assertEquals(listOf("cheap", "mid", "core"), cat.tierNames)
        assertEquals(listOf(RoleDto("design.contract.detail", "core")), cat.roles)

        val logLevel = cat.options.first { it.path == "logLevel" }
        assertTrue(logLevel.isSet)
        assertEquals("debug", logLevel.currentValue)
        assertEquals(listOf("error", "warn", "info", "debug"), logLevel.enumValues)

        val host = cat.options.first { it.path == "ollama.host" }
        assertFalse(host.isSet)                 // absent from values -> using default
        assertEquals(null, host.currentValue)
        assertEquals(null, host.enumValues)     // non-enum row omits enumValues
    }

    @Test
    fun `an empty options list is a valid Loaded, not Unavailable`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("options" to emptyList<Any?>(), "groups" to emptyList<Any?>()))
        }
        val loaded = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, DaemonGatewayImpl(rpc).settingsCatalog())
        assertTrue(loaded.catalog.options.isEmpty())
    }

    @Test
    fun `not-ok, error, DaemonUnavailable, and malformed(options not a list) all map to Unavailable`() {
        val notOk = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> DaemonResult(ok = false, error = "boom") }).settingsCatalog()
        assertEquals("boom", assertInstanceOf(SettingsCatalogResult.Unavailable::class.java, notOk).reason)

        val down = DaemonGatewayImpl(FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket down") }).settingsCatalog()
        assertEquals("socket down", assertInstanceOf(SettingsCatalogResult.Unavailable::class.java, down).reason)

        // ok=true but options is not a list -> malformed -> Unavailable, no throw
        val malformed = DaemonGatewayImpl(FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("options" to "not-a-list"))
        }).settingsCatalog()
        assertInstanceOf(SettingsCatalogResult.Unavailable::class.java, malformed)
    }

    // ---- real parse across the framing boundary -----------------------------

    private class WireRpc(private val reply: String) : DaemonRpc {
        private val parser = UnixSocketDaemonRpc()
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = parser.parse(reply)
    }

    @Test
    fun `over the real parse, a payload maps to Loaded and an error to Unavailable`() {
        val payload = """{"id":1,"result":{"options":[{"path":"logLevel","type":"enum","default":"info","desc":"lvl","enumValues":["error","warn","info","debug"],"group":"General"}],"groups":["General"],"roles":[],"tierNames":["cheap","mid","core"],"values":{"logLevel":"warn"}}}"""
        val loaded = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, DaemonGatewayImpl(WireRpc(payload)).settingsCatalog())
        assertEquals("warn", loaded.catalog.options.first().currentValue)

        val error = """{"id":1,"result":{"error":"config.catalog is not available"}}"""
        assertEquals(
            "config.catalog is not available",
            assertInstanceOf(SettingsCatalogResult.Unavailable::class.java, DaemonGatewayImpl(WireRpc(error)).settingsCatalog()).reason,
        )
    }

    @Test
    fun `over the real parse, a numeric default arrives as a Double (the shape displayValue must render)`() {
        // Guards the S002 numeric-render fix: Gson parses every JSON number to a
        // Double, so an integral default like 40 comes back as 40.0 — the exact
        // shape SettingsView.displayValue collapses back to "40".
        val payload = """{"id":1,"result":{"options":[{"path":"maxToolTurns","type":"number","default":40,"desc":"turns","group":"Models"}],"groups":["Models"],"roles":[],"tierNames":[],"values":{}}}"""
        val loaded = assertInstanceOf(SettingsCatalogResult.Loaded::class.java, DaemonGatewayImpl(WireRpc(payload)).settingsCatalog())
        val default = loaded.catalog.options.first().default
        assertInstanceOf(Number::class.java, default)
        assertEquals(40.0, (default as Number).toDouble())
    }
}
