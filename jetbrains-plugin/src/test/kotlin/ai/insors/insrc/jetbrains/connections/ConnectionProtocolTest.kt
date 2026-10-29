package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ConnectionProtocolTest {
    private val corpus = ConnectionCorpus.load()
    private val key = ConnectionKey("/fixture/repo-a", "saved", "warehouse")
    private fun example(kind: String): JsonElement = corpus.getAsJsonArray("wire").first {
        it.asJsonObject["kind"].asString == kind && it.asJsonObject["valid"].asBoolean
    }.asJsonObject["input"].deepCopy()
    private fun refuses(f: () -> Unit) {
        val e = assertThrows(ConnectionReplyException::class.java) { f() }
        assertEquals("The daemon returned an invalid connection response.", e.message)
    }
    private fun decode(kind: String, value: JsonElement): Any = when (kind) {
        "capabilities" -> ConnectionProtocol.capabilities(value)
        "list" -> ConnectionProtocol.list(value, key.repoRoot)
        "read" -> ConnectionProtocol.safeConnection(value)
        "ticket" -> ConnectionProtocol.ticket(value)
        "outcome" -> ConnectionProtocol.mutation(value)
        "status" -> ConnectionProtocol.status(value)
        "test" -> ConnectionProtocol.testResult(value)
        "removal" -> ConnectionProtocol.removal(value)
        else -> error("Unknown fixture kind")
    }

    @Test fun `common valid and invalid wire cases use strict typed decoders`() {
        val actual=JsonArray()
        for (item in corpus.getAsJsonArray("wire")) {
            val c = item.asJsonObject
            if (c["valid"].asBoolean) assertNotNull(decode(c["kind"].asString, c["input"]))
            else refuses { decode(c["kind"].asString, c["input"]) }
            actual.add(JsonObject().apply { addProperty("id",c["id"].asString);addProperty("accepted",runCatching{decode(c["kind"].asString,c["input"])}.isSuccess) })
        }
        assertEquals(2, ConnectionProtocol.capabilities(example("capabilities")).version)
        assertEquals(2, ConnectionProtocol.list(example("list"), key.repoRoot).size)
        System.getenv("INSRC_PARITY_DIR")?.let { java.nio.file.Files.writeString(java.nio.file.Path.of(it,"wire.json"),actual.toString()) }
    }

    @Test fun `all actual daemon descriptors supported and unknown schema stays disabled`() {
        val all = ConnectionProtocol.descriptors(corpus["driverDescriptors"])
        assertEquals(29, all.size)
        assertTrue(all.all { it.editable }, all.filter { !it.editable }.map { it.kind }.toString())
        val changed = corpus.getAsJsonArray("driverDescriptors")[0].deepCopy().asJsonObject
        changed.getAsJsonObject("publicInputSchema").addProperty("unevaluatedProperties", false)
        val disabled = ConnectionProtocol.descriptors(JsonArray().apply { add(changed) }).single()
        assertFalse(disabled.editable)
        assertEquals("This driver requires a newer connection editor.", disabled.unsupportedReason)
        val required = corpus.getAsJsonArray("driverDescriptors")[0].deepCopy().asJsonObject
        required.getAsJsonObject("publicInputSchema").add("required", JsonArray().apply { add("unknownRequired") })
        assertFalse(ConnectionProtocol.descriptors(JsonArray().apply { add(required) }).single().editable)
        refuses { ConnectionProtocol.descriptors(JsonArray().apply { add(changed); add(changed) }) }
    }

    @Test fun `correlation rejects wrong root key operation mode epoch and stale test identity`() {
        refuses { ConnectionProtocol.capabilities(example("capabilities"), "wrong-epoch") }
        refuses { ConnectionProtocol.safeConnection(example("read"), ReplyExpectation(key = key.copy(id = "other"))) }
        refuses { ConnectionProtocol.list(example("list"), "/fixture/other") }
        refuses { ConnectionProtocol.ticket(example("ticket"), ReplyExpectation(key = key.copy(scope = "temporary"))) }
        refuses { ConnectionProtocol.ticket(example("ticket"), ReplyExpectation(mode = "update")) }
        refuses { ConnectionProtocol.mutation(example("outcome"), ReplyExpectation(mode = "create")) }
        refuses { ConnectionProtocol.status(example("outcome"), ReplyExpectation(operationId = "33333333-3333-4333-8333-333333333333")) }
        refuses { ConnectionProtocol.testResult(example("test"), ReplyExpectation(daemonEpoch = "wrong-epoch")) }
        refuses { ConnectionProtocol.testResult(example("test"), ReplyExpectation(draftRevision = 3)) }
        refuses { ConnectionProtocol.removal(example("removal"), ReplyExpectation(key = key.copy(id = "other"))) }
    }

    @Test fun `streaming boundary rejects duplicate fields coercion depth size and cyclic constructed objects`() {
        refuses { ConnectionProtocol.parseData("{\"version\":1,\"version\":2}") }
        refuses { ConnectionProtocol.parseData("{} {}") }
        refuses { ConnectionProtocol.parseData("[".repeat(34) + "0" + "]".repeat(34)) }
        refuses { ConnectionProtocol.parseData("\"" + "x".repeat(ConnectionProtocol.MAX_STRING + 1) + "\"") }
        refuses { ConnectionProtocol.parseData("[" + List(ConnectionProtocol.MAX_ITEMS + 1) { "0" }.joinToString(",") + "]") }
        refuses { ConnectionProtocol.parseData("NaN") }
        refuses { ConnectionProtocol.parseData("{\"__proto__\":{}}") }
        val numeric = example("capabilities").asJsonObject.apply { addProperty("version", "2") }
        refuses { ConnectionProtocol.capabilities(numeric) }
        val scalar = example("read").asJsonObject.apply { getAsJsonObject("credentialPresence").addProperty("url.password", "false") }
        refuses { ConnectionProtocol.safeConnection(scalar) }
        val cyclic = JsonObject(); cyclic.add("self", cyclic)
        refuses { ConnectionProtocol.capabilities(cyclic) }
        var deep = JsonObject(); repeat(34) { deep = JsonObject().apply { add("child", deep) } }
        refuses { ConnectionProtocol.capabilities(deep) }
    }

    @Test fun `private fields references and raw error text never escape`() {
        val raw = example("read").asJsonObject
        raw.getAsJsonObject("publicConfig").addProperty("secretRef", "PRIVATE_SDK_MESSAGE")
        refuses { ConnectionProtocol.safeConnection(raw) }
        val url = example("read").asJsonObject
        url.getAsJsonObject("publicConfig").addProperty("endpoint", "postgresql://secret:password@fixture.invalid/db")
        refuses { ConnectionProtocol.safeConnection(url) }
        for (path in listOf("\${secret:PRIVATE_SDK_MESSAGE}", "%24%7Bsecret%3APRIVATE_SDK_MESSAGE%7D")) {
            val encoded = example("read").asJsonObject
            encoded.add("publicConfig", JsonObject().apply { addProperty("path", path) })
            refuses { ConnectionProtocol.safeConnection(encoded) }
        }
        val rejected = ConnectionProtocol.mutation(JsonParser.parseString("""{"status":"rejected","code":"busy","message":"PRIVATE_SDK_MESSAGE"}"""))
        assertFalse(rejected.toString().contains("PRIVATE_SDK_MESSAGE"))
        val removal = example("removal").asJsonObject.apply { addProperty("safeMessage", "PRIVATE_SDK_MESSAGE") }
        assertFalse(ConnectionProtocol.removal(removal).toString().contains("PRIVATE_SDK_MESSAGE"))
        val legacy = example("read").asJsonObject.apply { addProperty("compatibilityWarning", "PRIVATE_SDK_MESSAGE") }
        assertFalse(ConnectionProtocol.safeConnection(legacy).toString().contains("PRIVATE_SDK_MESSAGE"))
    }

    @Test fun `all current backend draft-test safe messages are accepted without coercion`() {
        for ((_, message) in corpus.getAsJsonObject("draftTestMessages").entrySet()) {
            val value = example("test").asJsonObject.apply { addProperty("status", "failed"); add("safeMessage", message) }
            assertEquals(message.asString, ConnectionProtocol.testResult(value).safeMessage)
        }
        val value = example("test").asJsonObject.apply { addProperty("status", "failed"); addProperty("safeMessage", "PRIVATE_SDK_MESSAGE") }
        refuses { ConnectionProtocol.testResult(value) }
    }
}
