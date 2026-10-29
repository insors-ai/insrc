package ai.insors.insrc.jetbrains.connections

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.security.MessageDigest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/** Test-only data; never a production capability, release gate or acceptance stamp. */
internal object ConnectionCorpus {
    fun bytes(name: String): ByteArray = checkNotNull(javaClass.getResourceAsStream("/connection-management/v1/$name")) {
        "Missing shared connection corpus resource"
    }.use { it.readBytes() }

    fun verify(bytes: ByteArray, manifest: JsonObject): JsonObject {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        require(manifest["version"].asInt == 1 && manifest["protocolVersion"].asInt == 2 &&
            manifest["file"].asString == "corpus.json" && manifest["digest"].asString == "sha256-bytes" &&
            manifest["sha256"].asString == digest) { "Connection corpus version/digest mismatch" }
        val corpus = JsonParser.parseString(bytes.toString(Charsets.UTF_8)).asJsonObject
        require(corpus["version"].asInt == 1 && corpus["protocolVersion"].asInt == 2 &&
            !corpus["releaseEnabled"].asBoolean && !corpus["fixturesAreAcceptance"].asBoolean) { "Connection corpus version/acceptance mismatch" }
        return corpus
    }

    fun load(): JsonObject = verify(bytes("corpus.json"), JsonParser.parseString(bytes("manifest.json").toString(Charsets.UTF_8)).asJsonObject)
}

class ConnectionCorpusTest {
    @Test fun `shared resource contains synthetic wire and state evidence without claiming native acceptance`() {
        val corpus = ConnectionCorpus.load()
        assertEquals(18, corpus.getAsJsonArray("wire").size())
        assertEquals(8, corpus.getAsJsonArray("wire").count { it.asJsonObject["valid"].asBoolean })
        assertEquals(12, corpus.getAsJsonArray("transcripts").size())
        assertEquals(20, corpus.getAsJsonArray("removalSnapshots").size())
        val coverage = corpus.getAsJsonArray("coverage")
        assertEquals(20, coverage.size())
        assertEquals(20, coverage.map { it.asJsonObject["subject"].asString }.toSet().size)
        assertTrue(coverage.all { it.asJsonObject["acceptance"].asString == "pending" && it.asJsonObject["fixtureEvidenceOnly"].asBoolean })
        assertEquals("/fixture/repo-a", corpus["identity"].asJsonObject["key"].asJsonObject["repoRoot"].asString)
    }

    @Test fun `version and bytes drift fail even for a self-consistent future corpus`() {
        val bytes = ConnectionCorpus.bytes("corpus.json")
        val manifest = JsonParser.parseString(ConnectionCorpus.bytes("manifest.json").toString(Charsets.UTF_8)).asJsonObject
        assertThrows(IllegalArgumentException::class.java) { ConnectionCorpus.verify(bytes + " ".toByteArray(), manifest) }
        val nextManifest = manifest.deepCopy().apply { addProperty("version", 2) }
        assertThrows(IllegalArgumentException::class.java) { ConnectionCorpus.verify(bytes, nextManifest) }
        val next = ConnectionCorpus.load().apply { addProperty("version", 2) }.toString().toByteArray()
        val hash = MessageDigest.getInstance("SHA-256").digest(next).joinToString("") { "%02x".format(it) }
        assertThrows(IllegalArgumentException::class.java) { ConnectionCorpus.verify(next, manifest.deepCopy().apply { addProperty("sha256", hash) }) }
    }
}
