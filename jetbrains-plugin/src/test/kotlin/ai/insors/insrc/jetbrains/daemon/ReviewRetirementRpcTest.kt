package ai.insors.insrc.jetbrains.daemon

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import java.net.StandardProtocolFamily
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.ServerSocketChannel
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

class ReviewRetirementRpcTest {
    @Test
    fun `rewrite exceptions surface from real transport without review polling`() {
        val directory = Files.createTempDirectory(Path.of("/tmp"), "insrc-review-unavailable-")
        val socket = directory.resolve("daemon.sock")
        try {
            ServerSocketChannel.open(StandardProtocolFamily.UNIX).use { listener ->
                listener.bind(UnixDomainSocketAddress.of(socket))
                val methods = listOf("designReview.start", "codeReview.task.start")
                val received = mutableListOf<String>()
                val daemon = CompletableFuture.runAsync {
                    for ((index, method) in methods.withIndex()) {
                        listener.accept().use { channel ->
                            val line = Channels.newInputStream(channel).bufferedReader().readLine()
                            val request = com.google.gson.JsonParser.parseString(line).asJsonObject
                            received.add(request.get("method").asString)
                            val family = if (index == 0) "Design" else "Code"
                            val reply = """{"id":${request.get("id")},"error":"$family review functionality is being rewritten."}""" + "\n"
                            Channels.newOutputStream(channel).write(reply.toByteArray())
                        }
                    }
                }
                for ((index, method) in methods.withIndex()) {
                    val result = UnixSocketDaemonRpc(socket).call(method, emptyMap())
                    assertFalse(result.ok)
                    assertEquals("${if (index == 0) "Design" else "Code"} review functionality is being rewritten.", result.error)
                }
                daemon.get(3, TimeUnit.SECONDS)
                assertEquals(methods, received)
            }
        } finally {
            Files.deleteIfExists(socket)
            Files.deleteIfExists(directory)
        }
    }
}
