package ai.insors.insrc.jetbrains.daemon

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.IOException
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.channels.ServerSocketChannel
import java.nio.channels.SocketChannel
import java.util.concurrent.*

class PersistentDaemonLaneTest {
    private class Fixture : AutoCloseable {
        val server = ServerSocketChannel.open().apply { bind(InetSocketAddress("127.0.0.1", 0)) }
        fun lane(timeout: Long = 3000, firstId: Long = 1, write: (SocketChannel, ByteBuffer) -> Int = { c,b -> c.write(b) }) =
            PersistentDaemonLane(server.localAddress, { SocketChannel.open() }, timeout, firstId, write)
        fun peer(): SocketChannel = server.accept()
        override fun close() { server.close() }
    }
    private fun line(c: SocketChannel): String {
        val out = StringBuilder(); val b = ByteBuffer.allocate(1)
        while (true) { b.clear(); if(c.read(b) < 0) throw IOException(); b.flip(); val v=b.get().toInt(); if(v==10)return out.toString(); out.append(v.toChar()) }
    }
    private fun send(c:SocketChannel,s:String) { val b=ByteBuffer.wrap(s.toByteArray(Charsets.UTF_8)); while(b.hasRemaining())c.write(b) }
    private fun result(call:ConnectionLaneCall) = call.result.toCompletableFuture().get(5,TimeUnit.SECONDS)
    private fun failure(call:ConnectionLaneCall,code:String,written:Boolean) {
        val error=assertThrows(ExecutionException::class.java){result(call)}.cause as ConnectionLaneException
        assertEquals(code,error.code);assertEquals(written,error.written)
        assertEquals("The daemon connection request could not be completed.",error.message)
    }
    private fun closed(lane:PersistentDaemonLane) {lane.close();lane.close();assertTrue(lane.awaitClosed(3000))}

    @Test fun `actual socket multiplexing partial writes and split UTF8`() {
        Fixture().use { f ->
            val lane=f.lane(write={c,b -> val limit=b.limit();b.limit(minOf(limit,b.position()+2));try{c.write(b)}finally{b.limit(limit)} })
            f.peer().use { peer ->
                val a=lane.request("connection.list");val b=lane.request("connection.read")
                val first=JsonParser.parseString(line(peer)).asJsonObject["id"].asLong
                val second=JsonParser.parseString(line(peer)).asJsonObject["id"].asLong
                // Send every byte separately, including within the multibyte codepoint.
                for(byte in "{\"id\":$second,\"result\":\"é水\"}\n{\"id\":$first,\"result\":true}\n".toByteArray()) {
                    val buffer=ByteBuffer.wrap(byteArrayOf(byte));while(buffer.hasRemaining())peer.write(buffer)
                }
                assertEquals("é水",result(b).asString);assertTrue(result(a).asBoolean)
            };closed(lane)
        }
    }
    @Test fun `cancel late reply never aliases another request`() {
        Fixture().use { f -> val lane=f.lane();f.peer().use { peer ->
            val a=lane.request("connection.read");val aid=JsonParser.parseString(line(peer)).asJsonObject["id"].asLong
            assertTrue(a.cancel());assertFalse(a.cancel());failure(a,"canceled",true)
            val b=lane.request("connection.list");val bid=JsonParser.parseString(line(peer)).asJsonObject["id"].asLong
            assertNotEquals(aid,bid);send(peer,"{\"id\":$aid,\"result\":false}\n{\"id\":$bid,\"result\":true}\n")
            assertTrue(result(b).asBoolean);assertFalse(lane.isClosed)
        };closed(lane) }
    }
    @Test fun `queued cancellation and capacity never write refused calls`() {
        Fixture().use { f ->
            val entered=CountDownLatch(1);val release=CountDownLatch(1)
            val lane=f.lane(write={c,b ->entered.countDown();check(release.await(5,TimeUnit.SECONDS));c.write(b)})
            f.peer().use { peer ->
                val first=lane.request("connection.read");assertTrue(entered.await(3,TimeUnit.SECONDS))
                val queued=lane.request("connection.read");assertTrue(queued.cancel());failure(queued,"canceled",false)
                val pending=(1..63).map{lane.request("connection.list")}
                failure(lane.request("connection.list"),"capacity",false)
                pending.forEach{assertTrue(it.cancel());failure(it,"canceled",false)}
                release.countDown();val id=JsonParser.parseString(line(peer)).asJsonObject["id"].asLong
                send(peer,"{\"id\":$id,\"result\":true}\n");assertTrue(result(first).asBoolean)
            };closed(lane)
        }
    }
    @Test fun `deadline and partial write failures retain uncertainty`() {
        Fixture().use { f -> val lane=f.lane(timeout=150);f.peer().use {peer ->
            val call=lane.request("connection.create");line(peer);failure(call,"timeout",true)
        };closed(lane) }
        Fixture().use { f ->val lane=f.lane(write={c,b -> b.limit(b.position()+1);c.write(b);throw IOException("private canary")})
            f.peer().use {val call=lane.request("connection.create");failure(call,"disconnected",true)};closed(lane)
        }
    }
    @Test fun `malformed unsolicited duplicate and invalid UTF8 close owned lane`() {
        val frames=listOf("{\"id\":1,\"id\":1,\"result\":true}\n".toByteArray(),
            "{\"id\":2,\"result\":true}\n".toByteArray(),"{\"id\":1,\"result\":true,\"error\":\"canary\"}\n".toByteArray(),
            byteArrayOf(0xc3.toByte(),0x28,10), ("[".repeat(34)+"0"+"]".repeat(34)+"\n").toByteArray())
        for(frame in frames) Fixture().use { f -> val lane=f.lane();f.peer().use {peer ->
            val call=lane.request("connection.read");line(peer);val buffer=ByteBuffer.wrap(frame);while(buffer.hasRemaining())peer.write(buffer)
            failure(call,"invalid-response",true)
        };closed(lane) }
    }
    @Test fun `ID exhaustion teardown and independent sockets`() {
        Fixture().use { f -> val lane=f.lane(firstId=PersistentDaemonLane.MAX_ID);f.peer().use {peer ->
            val call=lane.request("connection.list");assertEquals(PersistentDaemonLane.MAX_ID,JsonParser.parseString(line(peer)).asJsonObject["id"].asLong)
            val notified=CompletableFuture<String>();lane.onClose {notified.complete(it)}
            failure(lane.request("connection.list"),"closed",false);failure(call,"closed",true)
            assertEquals("closed",notified.get(3,TimeUnit.SECONDS))
        };closed(lane) }
        Fixture().use { f ->val a=f.lane();val pa=f.peer();val b=f.lane();f.peer().use {pb ->
            closed(a);pa.close();val call=b.request("connection.list");val id=JsonParser.parseString(line(pb)).asJsonObject["id"].asLong
            send(pb,"{\"id\":$id,\"result\":true}\n");assertTrue(result(call).asBoolean)
        };closed(b) }
    }
    @Test fun `bounded request data and aggregate capacity`() {
        Fixture().use { f ->
            val entered=CountDownLatch(1);val release=CountDownLatch(1)
            val lane=f.lane(write={c,b ->entered.countDown();check(release.await(5,TimeUnit.SECONDS));c.write(b)})
            f.peer().use {
                failure(lane.request("invalid method"),"invalid-request",false)
                failure(lane.request("connection.read",JsonObject().apply{addProperty("x","a".repeat(16385))}),"invalid-request",false)
                val first=lane.request("connection.read");assertTrue(entered.await(3,TimeUnit.SECONDS))
                val payload=JsonObject().apply{repeat(512){addProperty("k$it","x".repeat(16000))}}
                val a=lane.request("connection.read",payload);val b=lane.request("connection.read",payload)
                failure(lane.request("connection.read",payload),"capacity",false)
                assertTrue(a.cancel());assertTrue(b.cancel());release.countDown();closed(lane);failure(first,"closed",true)
            }
        }
    }
    @Test fun `queued deadline and canceled blocked write drain without leaking`() {
        Fixture().use { f ->
            val entered=CountDownLatch(1)
            val lane=f.lane(timeout=200,write={_,_ -> entered.countDown(); 0})
            f.peer().use {
                val written=lane.request("connection.create");assertTrue(entered.await(3,TimeUnit.SECONDS))
                val queued=lane.request("connection.read")
                assertTrue(written.cancel());failure(written,"canceled",true)
                // A queued call is never reported written even when the writer watchdog closes the lane.
                val error=assertThrows(ExecutionException::class.java){result(queued)}.cause as ConnectionLaneException
                assertFalse(error.written);assertEquals("timeout",error.code)
                assertTrue(lane.awaitClosed(3000))
            };closed(lane)
        }
    }
    @Test fun `oversized receive frame fails before decoding`() {
        Fixture().use { f ->val lane=f.lane();f.peer().use {peer ->
            val call=lane.request("connection.read");line(peer)
            val chunk=ByteBuffer.wrap(ByteArray(8192){32})
            repeat(PersistentDaemonLane.MAX_BYTES/8192){chunk.rewind();while(chunk.hasRemaining())peer.write(chunk)}
            send(peer," ")
            failure(call,"invalid-response",true)
        };closed(lane) }
    }
    @Test fun `production Unix factory coexists with original one shot call`() {
        val path=java.nio.file.Files.createTempDirectory("insrc-lane-").resolve("daemon.sock")
        try {
            ServerSocketChannel.open(java.net.StandardProtocolFamily.UNIX).use { server ->
                server.bind(java.net.UnixDomainSocketAddress.of(path))
                val lane=PersistentDaemonLane.open(path)
                server.accept().use {peer ->
                    val call=lane.request("connection.list");val id=JsonParser.parseString(line(peer)).asJsonObject["id"].asLong
                    send(peer,"{\"id\":$id,\"result\":true}\n");assertTrue(result(call).asBoolean)
                };closed(lane)
                val executor=Executors.newSingleThreadExecutor()
                try {
                    val old=executor.submit<DaemonResult>{UnixSocketDaemonRpc(path).call("repo.list",emptyMap())}
                    server.accept().use {peer ->
                        val id=JsonParser.parseString(line(peer)).asJsonObject["id"].asLong
                        send(peer,"{\"id\":$id,\"result\":[]}\n")
                    }
                    assertTrue(old.get(3,TimeUnit.SECONDS).ok)
                } finally {executor.shutdownNow();assertTrue(executor.awaitTermination(3,TimeUnit.SECONDS))}
            }
        } finally {java.nio.file.Files.deleteIfExists(path);java.nio.file.Files.deleteIfExists(path.parent)}
    }

}
