package ai.insors.insrc.jetbrains.daemon

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonElement
import ai.insors.insrc.jetbrains.connections.ConnectionProtocol
import com.intellij.openapi.diagnostic.logger
import java.io.IOException
import java.net.StandardProtocolFamily
import java.net.UnixDomainSocketAddress
import java.net.SocketAddress
import java.nio.ByteBuffer
import java.nio.channels.SocketChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.nio.charset.CodingErrorAction
import java.io.ByteArrayOutputStream

/** The daemon's socket location. Local-only — the plugin never opens a cloud/REST path (k1). */
object DaemonSocket {
    /** `~/.insrc/daemon.sock`. */
    fun defaultPath(): Path =
        Path.of(System.getProperty("user.home"), ".insrc", "daemon.sock")
}

/**
 * Real sc2 transport: one JSON-RPC round-trip over the daemon's Unix domain
 * socket. This is the ONLY place the socket wire format lives — it stays private
 * to S001. Any connect/IO failure becomes a [DaemonUnavailableException], never
 * a swallowed error and never a fabricated answer.
 *
 * Not exercised by the sc2 unit tests (which drive a fake [DaemonRpc]); it is
 * covered by CI where a real/socket fixture is available.
 */
class UnixSocketDaemonRpc(
    private val socketPath: Path = DaemonSocket.defaultPath(),
    private val gson: Gson = Gson(),
) : DaemonRpc {

    private val log = logger<UnixSocketDaemonRpc>()
    private val ids = AtomicLong(0)

    override fun call(method: String, params: Map<String, Any?>): DaemonResult = call(method, params, resultErrorIsFailure = true)

    override fun call(method: String, params: Map<String, Any?>, resultErrorIsFailure: Boolean): DaemonResult {
        val request = JsonObject().apply {
            addProperty("jsonrpc", "2.0")
            addProperty("id", ids.incrementAndGet())
            addProperty("method", method)
            add("params", gson.toJsonTree(params))
        }
        val line = gson.toJson(request) + "\n"

        val reply =
            try {
                SocketChannel.open(StandardProtocolFamily.UNIX).use { channel ->
                    channel.connect(UnixDomainSocketAddress.of(socketPath))
                    channel.write(ByteBuffer.wrap(line.toByteArray(StandardCharsets.UTF_8)))
                    readLine(channel)
                }
            } catch (e: IOException) {
                throw DaemonUnavailableException("daemon socket unreachable at $socketPath", e)
            } catch (e: UnsupportedOperationException) {
                // Platform without AF_UNIX support — treat as unreachable rather than crash.
                throw DaemonUnavailableException("unix domain sockets unsupported on this platform", e)
            }

        return parse(reply, resultErrorIsFailure)
    }

    private fun readLine(channel: SocketChannel): String {
        val buf = ByteBuffer.allocate(64 * 1024)
        val sb = StringBuilder()
        while (true) {
            buf.clear()
            val n = channel.read(buf)
            if (n < 0) break
            buf.flip()
            val chunk = StandardCharsets.UTF_8.decode(buf).toString()
            val newline = chunk.indexOf('\n')
            if (newline >= 0) {
                sb.append(chunk, 0, newline)
                break
            }
            sb.append(chunk)
        }
        return sb.toString()
    }

    /**
     * Map a raw JSON-RPC reply to a [DaemonResult]. `internal` + testable
     * without a socket: it touches no I/O, so the wire→result contract can be
     * driven directly by a unit test (the fake-[DaemonRpc] gateway tests never
     * cross this boundary, so the two framings below MUST be tested here).
     *
     * Two failure framings collapse to `ok=false`:
     *  1. A TOP-LEVEL `error` — what the server emits when a handler THROWS or
     *     the method is unknown (server.ts). It is a STRING there (not an
     *     object), so we read it as a primitive first — reading it as an object
     *     (the old code) threw ClassCastException on every real daemon error,
     *     e.g. a version-skew "unknown method".
     *  2. A STRUCTURED `result.error` — the daemon-wide failure convention: a
     *     handler that RETURNS `{ error: '...' }` (workflow.pending, repo.*,
     *     …). The server frames a returned value as `result`, so this never
     *     reaches the top-level `error` field; without surfacing it here, a
     *     structured error would read as an empty success and (for
     *     workflow.pending) render as "nothing awaiting review" — the exact
     *     silent-empty-list the feature forbids (S001 / ac2).
     *     With [resultErrorIsFailure] false (a caller whose answer has its own
     *     `error` field, e.g. models.check) the object is returned whole instead.
     */
    internal fun parse(reply: String, resultErrorIsFailure: Boolean = true): DaemonResult {
        if (reply.isBlank()) {
            log.warn("insrc: empty daemon reply")
            return DaemonResult(ok = false, error = "empty daemon reply")
        }
        val obj = JsonParser.parseString(reply).asJsonObject

        obj.get("error")?.takeUnless { it.isJsonNull }?.let { err ->
            return DaemonResult(ok = false, error = topLevelErrorMessage(err))
        }

        // The result payload may be a JSON OBJECT or a bare JSON ARRAY. Some
        // handlers frame their result as an array (e.g. `repo.list` returns
        // `[{path,…}]` directly), so `getAsJsonObject("result")` — which force-casts
        // — threw ClassCastException (JsonArray cannot be cast to JsonObject) on
        // every such call. Read the element by kind instead: an array becomes
        // [DaemonResult.list], an object (or absent/other) the usual [data].
        val resultEl = obj.get("result")
        if (resultEl != null && resultEl.isJsonArray) {
            @Suppress("UNCHECKED_CAST")
            val list = gson.fromJson(resultEl, List::class.java) as? List<Any?> ?: emptyList()
            return DaemonResult(ok = true, list = list)
        }
        val result = resultEl?.takeIf { it.isJsonObject }?.asJsonObject ?: JsonObject()

        // Structured failure convention: a non-empty string `result.error`.
        val structuredError = result.get("error")
            ?.takeIf { it.isJsonPrimitive }?.asString?.takeIf { it.isNotEmpty() }
        if (structuredError != null && resultErrorIsFailure) {
            return DaemonResult(ok = false, error = structuredError)
        }

        @Suppress("UNCHECKED_CAST")
        val data = gson.fromJson(result, Map::class.java) as? Map<String, Any?> ?: emptyMap()
        return DaemonResult(ok = true, data = data)
    }

    /** A top-level `error` is a string (server.ts); tolerate an object `{message}` too. */
    private fun topLevelErrorMessage(err: com.google.gson.JsonElement): String = when {
        err.isJsonPrimitive -> err.asString
        err.isJsonObject -> err.asJsonObject.get("message")?.asString ?: "daemon error"
        else -> "daemon error"
    }
}

/** A fixed safe transport outcome. written=true is uncertainty, never a refusal proof. */
class ConnectionLaneException(val code: String, val written: Boolean) : IOException("The daemon connection request could not be completed.")
class ConnectionLaneCall internal constructor(val result: CompletionStage<JsonElement>, private val cancelAction: () -> Boolean) {
    fun cancel(): Boolean = cancelAction()
}

/** Persistent manager transport at the existing socket boundary; no mutable APP gateway state.
 * Reader/writer are owned background threads. Completion callbacks must be nonblocking and hop to the EDT for UI work.
 */
class PersistentDaemonLane internal constructor(
    private val address: SocketAddress,
    private val newChannel: () -> SocketChannel,
    private val deadlineMillis: Long = 15000,
    firstRequestId: Long = 1,
    private val write: (SocketChannel, ByteBuffer) -> Int = { channel, buffer -> channel.write(buffer) },
) : AutoCloseable {
    companion object {
        const val MAX_PENDING = 64
        const val MAX_BYTES = 16 * 1024 * 1024
        const val MAX_ABANDONED = 256
        const val MAX_ID = 9007199254740991L
        fun open(path: Path = DaemonSocket.defaultPath()): PersistentDaemonLane = PersistentDaemonLane(
            UnixDomainSocketAddress.of(path), { SocketChannel.open(StandardProtocolFamily.UNIX) },
        )
    }
    private class Pending(val id: Long, var frame: ByteArray, val size: Int) {
        val response = CompletableFuture<JsonElement>()
        var written = false
        var timer: ScheduledFuture<*>? = null
    }
    private val lock = Object()
    private val pending = linkedMapOf<Long, Pending>()
    private val abandoned = mutableSetOf<Long>()
    private val listeners = mutableSetOf<(String) -> Unit>()
    private var nextId = firstRequestId
    private var bytes = 0
    private var channel: SocketChannel? = null
    private var closedReason: String? = null
    private var writing: Long? = null
    private val timers = ScheduledThreadPoolExecutor(1) { task -> Thread(task, "insrc-connection-deadline").apply { isDaemon = true } }.apply {
        removeOnCancelPolicy = true
    }
    private val reader = Thread({ readLoop() }, "insrc-connection-read").apply { isDaemon = true }
    private val writer = Thread({ writeLoop() }, "insrc-connection-write").apply { isDaemon = true }
    init {
        require(firstRequestId in 1..MAX_ID && deadlineMillis in 1..60000)
        writer.start()
    }
    val isClosed: Boolean get() = synchronized(lock) { closedReason != null }
    fun onClose(listener: (String) -> Unit): AutoCloseable {
        val reason = synchronized(lock) { closedReason.also { if (it == null) listeners.add(listener) } }
        if (reason != null) runCatching { listener(reason) }
        return AutoCloseable { synchronized(lock) { listeners.remove(listener) } }
    }
    private fun failed(code: String, written: Boolean = false): ConnectionLaneCall = ConnectionLaneCall(
        CompletableFuture.failedFuture<JsonElement>(ConnectionLaneException(code, written)).minimalCompletionStage(), { false },
    )
    fun request(method: String, params: JsonElement = JsonObject()): ConnectionLaneCall {
        if (!Regex("^[a-zA-Z][a-zA-Z0-9._-]{0,127}$").matches(method)) return failed("invalid-request")
        var p: Pending? = null
        synchronized(lock) {
            if (closedReason != null) return failed("closed")
            if (pending.size >= MAX_PENDING) return failed("capacity")
            if (nextId > MAX_ID) return@synchronized
            val frame = try {
                val safe = ConnectionProtocol.requestData(params)
                val envelope = JsonObject().apply {
                    addProperty("id", nextId); addProperty("method", method); add("params", safe)
                }
                (envelope.toString() + "\n").toByteArray(Charsets.UTF_8)
            } catch (_: Exception) { return failed("invalid-request") }
            if (frame.size > MAX_BYTES) return failed("invalid-request")
            if (bytes + frame.size > MAX_BYTES) return failed("capacity")
            val entry = Pending(nextId++, frame, frame.size)
            p = entry
            pending[entry.id] = entry; bytes += entry.size
            entry.timer = timers.schedule({ abandon(entry, "timeout") }, deadlineMillis, TimeUnit.MILLISECONDS)
            lock.notifyAll()
        }
        val entry = p ?: run { terminate("closed"); return failed("closed") }
        return ConnectionLaneCall(entry.response.minimalCompletionStage()) { abandon(entry, "canceled") }
    }
    private fun take(p: Pending): Boolean {
        if (pending[p.id] !== p) return false
        pending.remove(p.id); bytes -= p.size; p.frame = ByteArray(0); p.timer?.cancel(false)
        return true
    }
    private fun abandon(p: Pending, reason: String): Boolean {
        val written: Boolean; val full: Boolean
        synchronized(lock) {
            if (!take(p)) return false
            written = p.written
            if (written) abandoned.add(p.id)
            full = abandoned.size >= MAX_ABANDONED
        }
        p.response.completeExceptionally(ConnectionLaneException(reason, written))
        if (full) terminate("capacity")
        return true
    }
    private fun terminate(reason: String) {
        val entries: List<Pending>; val owned: SocketChannel?; val subscribers: List<(String) -> Unit>
        synchronized(lock) {
            if (closedReason != null) return
            closedReason = reason; entries = pending.values.toList(); entries.forEach { take(it) }; abandoned.clear()
            owned = channel; channel = null; subscribers = listeners.toList(); listeners.clear(); lock.notifyAll()
        }
        runCatching { owned?.close() }; timers.shutdownNow()
        entries.forEach { it.response.completeExceptionally(ConnectionLaneException(reason, it.written)) }
        subscribers.forEach { runCatching { it(reason) } }
    }
    private fun writeLoop() {
        try {
            val socket = newChannel()
            synchronized(lock) { if (closedReason != null) { socket.close(); return }; channel = socket }
            socket.configureBlocking(true); if (!socket.isConnected) socket.connect(address)
            synchronized(lock) { if (closedReason != null) return; reader.start() }
            while (true) {
                val p: Pending; val frame: ByteArray
                synchronized(lock) {
                    while (closedReason == null && pending.values.none { !it.written }) lock.wait()
                    if (closedReason != null) return
                    p = pending.values.first { !it.written }; frame = p.frame; p.frame = ByteArray(0); p.written = true; writing = p.id
                }
                // This watchdog survives request cancellation until the actual write finishes.
                val watchdog = timers.schedule({ if (synchronized(lock) { writing == p.id }) terminate("timeout") }, deadlineMillis, TimeUnit.MILLISECONDS)
                try {
                    val buffer = ByteBuffer.wrap(frame)
                    while (buffer.hasRemaining()) {
                        if (isClosed) return
                        val n = write(socket, buffer)
                        if (n < 0) throw IOException()
                        if (n == 0) java.util.concurrent.locks.LockSupport.parkNanos(1_000_000)
                    }
                } finally { synchronized(lock) { writing = null }; watchdog.cancel(false) }
            }
        } catch (_: Exception) { terminate("disconnected") }
    }
    private fun readLoop() {
        var partial = ByteArrayOutputStream(8192)
        try {
            val socket = synchronized(lock) { channel } ?: return
            val input = ByteBuffer.allocate(8192)
            while (!isClosed) {
                input.clear(); val read = socket.read(input)
                if (read < 0) { terminate(if (partial.size() == 0) "disconnected" else "invalid-response"); return }
                input.flip(); val raw = ByteArray(read); input.get(raw)
                var offset = 0
                while (offset < raw.size) {
                    var end = offset; while (end < raw.size && raw[end] != 10.toByte()) end++
                    if (partial.size() + end - offset > MAX_BYTES) { terminate("invalid-response"); return }
                    partial.write(raw, offset, end - offset); offset = end + 1
                    if (end == raw.size) break
                    try {
                        val text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                            .decode(ByteBuffer.wrap(partial.toByteArray())).toString()
                        partial = ByteArrayOutputStream(8192)
                        deliver(ConnectionProtocol.parseData(text))
                    } catch (_: Exception) { terminate("invalid-response"); return }
                }
            }
        } catch (_: Exception) { terminate("disconnected") }
    }
    private fun deliver(value: JsonElement) {
        if (!value.isJsonObject) throw IOException()
        val o = value.asJsonObject
        if (o.keySet().any { it !in setOf("id", "result", "error") } || !o.has("id") || o.has("result") == o.has("error")) throw IOException()
        val rawId = o["id"]
        if (!rawId.isJsonPrimitive || !rawId.asJsonPrimitive.isNumber || !rawId.asDouble.isFinite() || rawId.asDouble != kotlin.math.floor(rawId.asDouble) || rawId.asDouble < 1 || rawId.asDouble > MAX_ID) throw IOException()
        if (o.has("error") && (!o["error"].isJsonPrimitive || !o["error"].asJsonPrimitive.isString)) throw IOException()
        val id = rawId.asLong; val p: Pending
        synchronized(lock) {
            val found = pending[id]
            if (found == null) { if (abandoned.remove(id)) return; throw IOException() }
            if (!found.written) throw IOException()
            p = found; take(p)
        }
        if (o.has("error")) p.response.completeExceptionally(ConnectionLaneException("remote-error", true)) else p.response.complete(o["result"])
    }
    override fun close() = terminate("closed")
    /** Join only from background teardown/tests, never the EDT. */
    fun awaitClosed(timeoutMillis: Long): Boolean {
        val until = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis)
        for (thread in listOf(writer, reader)) if (thread !== Thread.currentThread() && thread.isAlive) {
            val remaining = until - System.nanoTime(); if (remaining <= 0) return false
            thread.join(maxOf(1, TimeUnit.NANOSECONDS.toMillis(remaining)))
        }
        return !writer.isAlive && !reader.isAlive && timers.awaitTermination(maxOf(0, until - System.nanoTime()), TimeUnit.NANOSECONDS)
    }
}
