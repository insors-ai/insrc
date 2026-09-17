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

    private fun parse(reply: String): DaemonResult {
        if (reply.isBlank()) {
            log.warn("insrc: empty daemon reply")
            return DaemonResult(ok = false, error = "empty daemon reply")
        }
        val obj = JsonParser.parseString(reply).asJsonObject
        obj.getAsJsonObject("error")?.let { err ->
            val message = err.get("message")?.asString ?: "daemon error"
            return DaemonResult(ok = false, error = message)
        }
        val result = obj.getAsJsonObject("result") ?: JsonObject()
        @Suppress("UNCHECKED_CAST")
        val data = gson.fromJson(result, Map::class.java) as? Map<String, Any?> ?: emptyMap()
        return DaemonResult(ok = true, data = data)
    }
}
