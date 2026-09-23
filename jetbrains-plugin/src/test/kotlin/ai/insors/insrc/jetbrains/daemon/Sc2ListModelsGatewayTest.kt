package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * S004 tests for DaemonGatewayImpl.listModels() (Epic ba132c185fe45860, sc2).
 * The load-bearing distinction: the daemon's OBJECT reply {provider,available,models}
 * lands in DaemonResult.data (ok=true) EVEN when available:false, so a
 * reachable-but-empty provider is Loaded(available=false, []) — NOT Unavailable.
 * Only a framed error (invalid-params) / socket fault is Unavailable. A malformed
 * models entry is skipped, never fabricated. Never throws.
 */
class Sc2ListModelsGatewayTest {

    private class FakeDaemonRpc(private val handler: (String, Map<String, Any?>) -> DaemonResult) : DaemonRpc {
        override fun call(method: String, params: Map<String, Any?>): DaemonResult = handler(method, params)
    }

    @Test
    fun `available true with models maps to Loaded with ids and displayNames`() {
        val rpc = FakeDaemonRpc { method, params ->
            assertEquals("providers.listModels", method)
            assertEquals("cli-claude", params["provider"])
            DaemonResult(
                ok = true,
                data = mapOf(
                    "provider" to "cli-claude",
                    "available" to true,
                    "models" to listOf(
                        mapOf("id" to "claude-opus-5-5", "displayName" to "Claude Opus 5.5"),
                        mapOf("id" to "claude-sonnet-5"),
                    ),
                ),
            )
        }
        val r = assertInstanceOf(ModelListResult.Loaded::class.java, DaemonGatewayImpl(rpc).listModels("cli-claude"))
        assertTrue(r.available)
        assertEquals(listOf("claude-opus-5-5", "claude-sonnet-5"), r.models.map { it.id })
        assertEquals("Claude Opus 5.5", r.models[0].displayName)
        assertEquals(null, r.models[1].displayName)
    }

    @Test
    fun `available false with empty models maps to Loaded false NOT Unavailable`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("provider" to "ollama", "available" to false, "models" to emptyList<Any?>()))
        }
        val r = assertInstanceOf(ModelListResult.Loaded::class.java, DaemonGatewayImpl(rpc).listModels("ollama"))
        assertFalse(r.available)
        assertTrue(r.models.isEmpty())
    }

    @Test
    fun `available true with empty models maps to Loaded true empty`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("provider" to "cli-codex", "available" to true, "models" to emptyList<Any?>()))
        }
        val r = assertInstanceOf(ModelListResult.Loaded::class.java, DaemonGatewayImpl(rpc).listModels("cli-codex"))
        assertTrue(r.available)
        assertTrue(r.models.isEmpty())
    }

    @Test
    fun `a framed error reply (invalid-params) maps to Unavailable`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = false, error = "invalid-params: provider must be one of …")
        }
        assertInstanceOf(ModelListResult.Unavailable::class.java, DaemonGatewayImpl(rpc).listModels("gpt"))
    }

    @Test
    fun `a DaemonUnavailableException maps to Unavailable, never throws`() {
        val rpc = FakeDaemonRpc { _, _ -> throw DaemonUnavailableException("socket refused") }
        assertInstanceOf(ModelListResult.Unavailable::class.java, DaemonGatewayImpl(rpc).listModels("ollama"))
    }

    @Test
    fun `a malformed models entry (missing or blank id, or models not a list) is skipped defensively`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(
                ok = true,
                data = mapOf(
                    "provider" to "ollama",
                    "available" to true,
                    "models" to listOf(
                        mapOf("id" to "llama3"),
                        mapOf("size" to 42),        // no id -> skipped
                        mapOf("id" to "   "),       // blank id -> skipped
                        "not-a-map",                 // wrong shape -> skipped
                    ),
                ),
            )
        }
        val r = assertInstanceOf(ModelListResult.Loaded::class.java, DaemonGatewayImpl(rpc).listModels("ollama"))
        assertEquals(listOf("llama3"), r.models.map { it.id })
    }

    @Test
    fun `models not a list degrades to an empty Loaded, never a throw`() {
        val rpc = FakeDaemonRpc { _, _ ->
            DaemonResult(ok = true, data = mapOf("provider" to "ollama", "available" to true, "models" to "nope"))
        }
        val r = assertInstanceOf(ModelListResult.Loaded::class.java, DaemonGatewayImpl(rpc).listModels("ollama"))
        assertTrue(r.models.isEmpty())
    }
}
