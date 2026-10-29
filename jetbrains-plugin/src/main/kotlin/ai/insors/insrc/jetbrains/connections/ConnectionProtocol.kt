package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import java.io.StringReader
import java.net.URI
import java.net.URLDecoder
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import java.util.Collections
import java.util.IdentityHashMap
import kotlin.math.abs
import kotlin.math.floor

/** Consumer DTOs. No session state is added to the application-wide legacy gateway. */
data class ConnectionKey(val repoRoot: String, val scope: String, val id: String)
data class ReplyExpectation(val key: ConnectionKey? = null, val operationId: String? = null, val daemonEpoch: String? = null,
    val mode: String? = null, val requestId: String? = null, val draftRevision: Long? = null)
data class ConnectionCapabilities(val version: Int, val daemonEpoch: String, val features: List<String>, val receiptRetentionDays: Int)
data class ConnectionDriverDescriptor(val kind: String, val family: String, val publicInputSchema: JsonObject,
    val secretSlots: List<String>, val editable: Boolean, val unsupportedReason: String?)
data class SafeConnection(val key: ConnectionKey, val revision: String, val kind: String, val family: String, val effectiveFamily: String,
    val publicConfig: JsonObject, val credentialPresence: Map<String, Boolean>, val label: String?, val declaredFamily: String?,
    val registeredFamily: String?, val compatibilityWarning: String?, val readOnly: Boolean?, val hasUrl: Boolean?, val hasPath: Boolean?, val ephemeral: Boolean?)
data class OperationTicket(val operationId: String, val lookupRoot: String, val scope: String, val connectionId: String,
    val mode: String, val issuedAt: String, val expiresAt: String, val signature: String)
data class CommittedOutcome(val operationId: String, val revision: String, val registration: String, val activation: String, val credentialCleanup: String)
sealed interface MutationReply {
    data class Committed(val value: CommittedOutcome) : MutationReply
    data class Rejected(val code: String, val message: String) : MutationReply
}
sealed interface OperationStatus {
    data class Committed(val value: CommittedOutcome) : OperationStatus
    data class Uncommitted(val status: String) : OperationStatus
}
data class DraftTestResult(val requestId: String, val draftRevision: Long, val repoRoot: String, val daemonEpoch: String,
    val status: String, val tookMs: Double, val safeMessage: String?)
data class RemovalState(val key: ConnectionKey, val operationId: String, val state: String, val credentialCleanup: String?, val resourceCleanup: String?)
class ConnectionReplyException : IllegalArgumentException("The daemon returned an invalid connection response.")

/** Strict connection-manager v2 boundary; old DaemonGateway projections remain separate. */
object ConnectionProtocol {
    const val MAX_BYTES = 16 * 1024 * 1024
    const val MAX_DEPTH = 32
    const val MAX_NODES = 131072
    const val MAX_STRING = 16384
    const val MAX_ITEMS = 16384
    private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
    private val family = setOf("rdbms", "kv", "file")
    private val phases = setOf("complete", "pending")
    private val scopes = setOf("saved", "temporary")
    private val slots = Regex("^(url|options)\\.[a-zA-Z][a-zA-Z0-9]*$")
    private val errorCodes = setOf("invalid-input", "duplicate-id", "conflict", "not-found", "busy", "registry-unreadable", "secret-unavailable",
        "recovery-required", "session-expired", "upgrade-required", "operation-mismatch", "reconciliation-required", "resource-limit", "unsupported-temporary")
    private fun fail(): Nothing = throw ConnectionReplyException()
    private inline fun <T> checked(block: () -> T): T = try { block() } catch (_: Exception) { fail() }
    private fun obj(v: JsonElement?): JsonObject = v?.takeIf { it.isJsonObject }?.asJsonObject ?: fail()
    private fun arr(v: JsonElement?): JsonArray = v?.takeIf { it.isJsonArray }?.asJsonArray ?: fail()
    private fun text(v: JsonElement?, empty: Boolean = false): String {
        if (v == null || !v.isJsonPrimitive || !v.asJsonPrimitive.isString) fail()
        return v.asString.also { if ((!empty && it.isEmpty()) || it.length > MAX_STRING || it.any { c -> c.code < 32 }) fail() }
    }
    private fun bool(v: JsonElement?): Boolean = if (v != null && v.isJsonPrimitive && v.asJsonPrimitive.isBoolean) v.asBoolean else fail()
    private fun number(v: JsonElement?): Double {
        if (v == null || !v.isJsonPrimitive || !v.asJsonPrimitive.isNumber || !v.asDouble.isFinite()) fail()
        return v.asDouble
    }
    private fun integer(v: JsonElement?): Long = number(v).let { if (it != floor(it) || abs(it) > 9007199254740991.0) fail(); it.toLong() }
    private fun one(v: JsonElement?, allowed: Set<String>): String = text(v).also { if (it !in allowed) fail() }
    private fun id(v: JsonElement?, expected: String? = null): String = text(v).also { if (!uuid.matches(it) || expected != null && it != expected) fail() }
    private fun fields(o: JsonObject, required: Set<String>, optional: Set<String> = emptySet()) {
        if (!o.keySet().containsAll(required) || o.keySet().any { it !in required && it !in optional }) fail()
    }
    private fun key(v: JsonElement?, expected: ConnectionKey? = null): ConnectionKey {
        val o = obj(v); fields(o, setOf("repoRoot", "scope", "id"))
        return ConnectionKey(text(o["repoRoot"]), one(o["scope"], scopes), text(o["id"])).also { if (expected != null && expected != it) fail() }
    }

    /** Streaming parse checks depth, item count and duplicate fields before constructing an unbounded Gson tree. */
    fun parseData(json: String): JsonElement = checked {
        if (json.length > MAX_BYTES || json.toByteArray(Charsets.UTF_8).size > MAX_BYTES) fail()
        var nodes = 0
        val reader = JsonReader(StringReader(json)).apply { isLenient = false }
        fun read(depth: Int): JsonElement {
            if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail()
            return when (reader.peek()) {
                JsonToken.BEGIN_OBJECT -> JsonObject().also { out ->
                    reader.beginObject()
                    while (reader.hasNext()) {
                        val name = reader.nextName()
                        if (name.length > MAX_STRING || name in setOf("__proto__", "prototype", "constructor") || out.has(name) || out.size() >= MAX_ITEMS) fail()
                        out.add(name, read(depth + 1))
                    }
                    reader.endObject()
                }
                JsonToken.BEGIN_ARRAY -> JsonArray().also { out ->
                    reader.beginArray(); while (reader.hasNext()) { if (out.size() >= MAX_ITEMS) fail(); out.add(read(depth + 1)) }; reader.endArray()
                }
                JsonToken.STRING -> JsonPrimitive(reader.nextString().also { if (it.length > MAX_STRING) fail() })
                JsonToken.NUMBER -> JsonPrimitive(reader.nextString().toDouble().also { if (!it.isFinite()) fail() })
                JsonToken.BOOLEAN -> JsonPrimitive(reader.nextBoolean())
                JsonToken.NULL -> { reader.nextNull(); JsonNull.INSTANCE }
                else -> fail()
            }
        }
        reader.use { val value = read(0); if (reader.peek() != JsonToken.END_DOCUMENT) fail(); value }
    }
    private fun data(value: JsonElement): JsonElement {
        var nodes = 0; var bytes = 0
        val active = Collections.newSetFromMap(IdentityHashMap<JsonElement, Boolean>())
        fun add(n: Int) { bytes += n; if (bytes > MAX_BYTES) fail() }
        fun visit(v: JsonElement, depth: Int) {
            if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail()
            if (v.isJsonNull) { add(4); return }
            if (v.isJsonPrimitive) {
                val p = v.asJsonPrimitive
                if (p.isString && p.asString.length > MAX_STRING || p.isNumber && !p.asDouble.isFinite()) fail()
                add(p.toString().toByteArray(Charsets.UTF_8).size); return
            }
            if (!active.add(v)) fail()
            add(2)
            if (v.isJsonArray) { if (v.asJsonArray.size() > MAX_ITEMS) fail(); v.asJsonArray.forEach { add(1); visit(it, depth + 1) } }
            else if (v.isJsonObject) {
                if (v.asJsonObject.size() > MAX_ITEMS) fail()
                for ((k, child) in v.asJsonObject.entrySet()) {
                    if (k.length > MAX_STRING || k in setOf("__proto__", "prototype", "constructor")) fail()
                    add(JsonPrimitive(k).toString().toByteArray(Charsets.UTF_8).size + 2); visit(child, depth + 1)
                }
            } else fail()
            active.remove(v)
        }
        visit(value, 0)
        return value.deepCopy()
    }

    fun capabilities(value: JsonElement, expectedEpoch: String? = null): ConnectionCapabilities = checked {
        val o = obj(data(value)); fields(o, setOf("version", "daemonEpoch", "features", "receiptRetentionDays"))
        if (integer(o["version"]) != 2L || integer(o["receiptRetentionDays"]) != 30L) fail()
        val epoch = text(o["daemonEpoch"]); if (expectedEpoch != null && epoch != expectedEpoch) fail()
        val features = arr(o["features"]).map { text(it).also { s -> if (!Regex("^[a-z][a-z0-9-]{1,64}$").matches(s)) fail() } }
        if (features.toSet().size != features.size) fail()
        ConnectionCapabilities(2, epoch, features, 30)
    }
    private val schemaKeys = setOf("type", "properties", "required", "additionalProperties", "items", "minItems", "maxItems", "minLength", "maxLength", "pattern", "minimum", "maximum", "enum", "const", "anyOf")
    private fun supportedSchema(v: JsonElement): Boolean {
        val o = obj(v)
        if (o.keySet().any { it !in schemaKeys }) return false
        if (o.has("type") && (!o["type"].isJsonPrimitive || !o["type"].asJsonPrimitive.isString || o["type"].asString !in setOf("object", "array", "string", "boolean", "number", "integer"))) return false
        for (k in listOf("minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum")) {
            if (o.has(k) && (!o[k].isJsonPrimitive || !o[k].asJsonPrimitive.isNumber || !o[k].asDouble.isFinite())) return false
        }
        for (k in listOf("minItems", "maxItems", "minLength", "maxLength")) if (o.has(k) && (o[k].asDouble < 0 || o[k].asDouble != floor(o[k].asDouble) || o[k].asDouble > 9007199254740991.0)) return false
        if (o.has("pattern") && (!o["pattern"].isJsonPrimitive || !o["pattern"].asJsonPrimitive.isString)) return false
        if (o.has("enum") && (!o["enum"].isJsonArray || arr(o["enum"]).isEmpty || arr(o["enum"]).any { !it.isJsonNull && !it.isJsonPrimitive })) return false
        if (o.has("const") && !o["const"].isJsonNull && !o["const"].isJsonPrimitive) return false
        if (o.has("anyOf") && (!o["anyOf"].isJsonArray || arr(o["anyOf"]).isEmpty || !arr(o["anyOf"]).all { supportedSchema(it) })) return false
        val type = o["type"]?.asString
        if (type == "object") {
            if (!o.has("additionalProperties") || !o["additionalProperties"].isJsonPrimitive || !o["additionalProperties"].asJsonPrimitive.isBoolean || o["additionalProperties"].asBoolean || !o.has("properties") || !o.has("required") || !o["required"].isJsonArray) return false
            val props = obj(o["properties"])
            if (arr(o["required"]).any { !it.isJsonPrimitive || !it.asJsonPrimitive.isString || !props.has(it.asString) } || !props.entrySet().all { supportedSchema(it.value) }) return false
        } else if (listOf("properties", "required", "additionalProperties").any { o.has(it) }) return false
        if (type == "array" && (!o.has("items") || !supportedSchema(o["items"]))) return false
        if (type != "array" && o.has("items")) return false
        return type != null || o.has("enum") || o.has("const") || o.has("anyOf")
    }
    fun descriptors(value: JsonElement): List<ConnectionDriverDescriptor> = checked {
        val seen = mutableSetOf<String>()
        arr(data(value)).map { v ->
            val o = obj(v); fields(o, setOf("kind", "family", "publicInputSchema", "secretSlots"))
            val kind = text(o["kind"]); if (!seen.add(kind)) fail()
            val family = one(o["family"], family); val schema = obj(o["publicInputSchema"])
            val secretSlots = arr(o["secretSlots"]).map { text(it).also { s -> if (!slots.matches(s)) fail() } }
            if (secretSlots.toSet().size != secretSlots.size) fail()
            val kindSchema = schema["properties"]?.takeIf { it.isJsonObject }?.asJsonObject?.get("kind")?.takeIf { it.isJsonObject }?.asJsonObject
            val editable = supportedSchema(schema) && schema["type"]?.asString == "object" &&
                kindSchema?.get("const")?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString == kind
            ConnectionDriverDescriptor(kind, family, schema, secretSlots, editable, if (editable) null else "This driver requires a newer connection editor.")
        }
    }
    private fun safePublicFields(config: JsonObject) {
        if (config.keySet().any { it !in setOf("kind", "label", "endpoint", "path", "schemaSource", "namespace", "pii", "options", "recursive", "partitioning") }) fail()
        fun walk(v: JsonElement) {
            if (v.isJsonPrimitive && v.asJsonPrimitive.isString) {
                var decoded = v.asString
                repeat(8) {
                    if (decoded.contains("\${secret:")) fail()
                    val next = URLDecoder.decode(decoded.replace("+", "%2B").replace(Regex("%(?![0-9a-fA-F]{2})"), "%25"), Charsets.UTF_8)
                    if (next == decoded) return
                    decoded = next
                }
                fail()
            }
            if (v.isJsonArray) v.asJsonArray.forEach { walk(it) }
            if (v.isJsonObject) for ((k, child) in v.asJsonObject.entrySet()) {
                if (k in setOf("secretRef", "password", "credentials", "capability", "sessionHandle", "runtimeAuth")) fail()
                if (k == "endpoint" && child.isJsonPrimitive && child.asJsonPrimitive.isString) {
                    val uri = URI(child.asString); if (uri.scheme == null || uri.rawUserInfo != null) fail()
                }
                walk(child)
            }
        }
        walk(config)
    }
    private fun safe(v: JsonElement, expected: ReplyExpectation): SafeConnection {
        val o = obj(v); fields(o, setOf("key", "revision", "kind", "family", "effectiveFamily", "publicConfig", "credentialPresence"),
            setOf("label", "declaredFamily", "registeredFamily", "compatibilityWarning", "readOnly", "hasUrl", "hasPath", "ephemeral"))
        val key = key(o["key"], expected.key); val family = one(o["family"], family); val effective = one(o["effectiveFamily"], this.family)
        if (family != effective) fail()
        val config = obj(o["publicConfig"]); safePublicFields(config)
        val presence = obj(o["credentialPresence"]).entrySet().associate { (k, v) -> if (!slots.matches(k)) fail(); k to bool(v) }
        val warning = if (o.has("compatibilityWarning")) { text(o["compatibilityWarning"]); "This legacy connection has compatibility restrictions; its stored configuration is preserved." } else null
        val ephemeral = o["ephemeral"]?.let { bool(it).also { b -> if (!b) fail() } }
        return SafeConnection(key, id(o["revision"]), text(o["kind"]), family, effective, config, presence,
            o["label"]?.let { text(it, true) }, o["declaredFamily"]?.let { one(it, this.family) }, o["registeredFamily"]?.let { one(it, this.family) }, warning,
            o["readOnly"]?.let { bool(it) }, o["hasUrl"]?.let { bool(it) }, o["hasPath"]?.let { bool(it) }, ephemeral)
    }
    fun safeConnection(value: JsonElement, expected: ReplyExpectation = ReplyExpectation()): SafeConnection = checked { safe(data(value), expected) }
    fun list(value: JsonElement, root: String): List<SafeConnection> = checked {
        val seen = mutableSetOf<Pair<String, String>>()
        arr(data(value)).map { safe(it, ReplyExpectation()).also { row -> if (row.key.repoRoot != root || !seen.add(row.key.scope to row.key.id)) fail() } }
    }
    fun ticket(value: JsonElement, expected: ReplyExpectation = ReplyExpectation()): OperationTicket = checked {
        val o = obj(data(value)); fields(o, setOf("operationId", "lookupRoot", "scope", "connectionId", "mode", "issuedAt", "expiresAt", "signature"))
        val target = ConnectionKey(text(o["lookupRoot"]), one(o["scope"], scopes), text(o["connectionId"]))
        if (expected.key != null && expected.key != target) fail()
        val mode = one(o["mode"], setOf("create", "update", "remove")); if (expected.mode != null && mode != expected.mode) fail()
        val issued = text(o["issuedAt"]); val expires = text(o["expiresAt"]); val format = DateTimeFormatterBuilder().appendInstant(3).toFormatter()
        val start = Instant.parse(issued); val end = Instant.parse(expires)
        if (format.format(start) != issued || format.format(end) != expires || !end.isAfter(start)) fail()
        val signature = text(o["signature"]); if (!Regex("^[A-Za-z0-9_-]{43}$").matches(signature)) fail()
        OperationTicket(id(o["operationId"], expected.operationId), target.repoRoot, target.scope, target.id, mode, issued, expires, signature)
    }
    private fun committed(v: JsonElement, e: ReplyExpectation): CommittedOutcome {
        val o = obj(v); fields(o, setOf("operationId", "revision", "registration", "activation", "credentialCleanup"))
        val registration = one(o["registration"], setOf("persisted", "session-added", "removed")); val activation = one(o["activation"], setOf("active", "pending", "failed", "not-applicable"))
        if ((registration == "removed") != (activation == "not-applicable")) fail()
        if (e.mode != null && (e.mode == "remove") != (registration == "removed")) fail()
        if (e.key != null && registration != "removed" && registration != if (e.key.scope == "saved") "persisted" else "session-added") fail()
        return CommittedOutcome(id(o["operationId"], e.operationId), id(o["revision"]), registration, activation, one(o["credentialCleanup"], phases))
    }
    fun mutation(value: JsonElement, e: ReplyExpectation = ReplyExpectation()): MutationReply = checked {
        val o = obj(data(value))
        if (text(o["status"]) == "committed") { fields(o, setOf("status", "value")); MutationReply.Committed(committed(o["value"], e)) }
        else { fields(o, setOf("status", "code", "message")); if (text(o["status"]) != "rejected") fail(); text(o["message"])
            MutationReply.Rejected(one(o["code"], errorCodes), "The connection operation was rejected. Review its status before retrying.") }
    }
    fun status(value: JsonElement, e: ReplyExpectation = ReplyExpectation()): OperationStatus = checked {
        val o = obj(data(value))
        if (text(o["status"]) == "committed") { fields(o, setOf("status", "value")); OperationStatus.Committed(committed(o["value"], e)) }
        else { fields(o, setOf("status")); OperationStatus.Uncommitted(one(o["status"], setOf("pending", "not-seen", "reconciliation-required"))) }
    }
    fun testResult(value: JsonElement, e: ReplyExpectation = ReplyExpectation()): DraftTestResult = checked {
        val o = obj(data(value)); fields(o, setOf("requestId", "draftRevision", "repoRoot", "daemonEpoch", "status", "tookMs"), setOf("safeMessage"))
        val request = id(o["requestId"], e.requestId); val revision = integer(o["draftRevision"]); val root = text(o["repoRoot"]); val epoch = text(o["daemonEpoch"])
        if (revision < 0 || e.draftRevision != null && revision != e.draftRevision || e.key != null && root != e.key.repoRoot || e.daemonEpoch != null && epoch != e.daemonEpoch) fail()
        val status = one(o["status"], setOf("reachable", "failed", "timeout", "canceled")); val took = number(o["tookMs"]); if (took < 0) fail()
        val message = o["safeMessage"]?.let { text(it) }
        val allowed = setOf("Connection test failed.", "Connection test timed out. Retry when cleanup completes.", "Connection test canceled.",
            "Connection test exceeded the memory limit. Use a smaller input or a saved connection.",
            "This input cannot be tested without persistent storage. Use a saved connection.")
        if (message != null && (message !in allowed || status == "reachable")) fail()
        DraftTestResult(request, revision, root, epoch, status, took, message)
    }
    fun removal(value: JsonElement, e: ReplyExpectation = ReplyExpectation()): RemovalState = checked {
        val o = obj(data(value)); fields(o, setOf("key", "operationId", "state"), setOf("safeMessage", "credentialCleanup", "resourceCleanup"))
        val state = one(o["state"], setOf("confirming", "removing", "busy", "conflict", "unknown", "removed-cleanup-pending", "removed"))
        if (o.has("safeMessage")) text(o["safeMessage"])
        val removed = state == "removed" || state == "removed-cleanup-pending"
        val credentials = o["credentialCleanup"]?.let { one(it, phases) }; val resources = o["resourceCleanup"]?.let { one(it, phases) }
        if (removed && (credentials == null || resources == null || (state == "removed") != (credentials == "complete" && resources == "complete"))) fail()
        if (!removed && (credentials != null || resources != null)) fail()
        RemovalState(key(o["key"], e.key), id(o["operationId"], e.operationId), state, credentials, resources)
    }
}
