package ai.insors.insrc.jetbrains.daemon

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.diagnostic.logger
import java.io.IOException
import java.net.StandardProtocolFamily
import java.net.UnixDomainSocketAddress
import java.nio.ByteBuffer
import java.nio.channels.SocketChannel
import java.nio.charset.StandardCharsets
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicLong

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

    override fun call(method: String, params: Map<String, Any?>): DaemonResult {
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

        return parse(reply)
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
     */
    internal fun parse(reply: String): DaemonResult {
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
        if (structuredError != null) {
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
