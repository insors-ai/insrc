package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.daemon.PersistentDaemonLane
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import org.junit.Assert.*
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicLong

/** Owned subprocess fixture; all production authority is exercised, with fixture-only storage/gates/drivers. */
internal class ConnectionMutationBackend:AutoCloseable {
    val dir=Files.createTempDirectory("s5m-").toRealPath()
    val socket=dir.resolve("daemon.sock")
    private val process=ProcessBuilder(System.getenv("INSRC_FIXTURE_NODE")?:"node","--import","tsx","src/shared/__tests__/fixtures/connection-mutation-server.ts",dir.toString()).directory(Path.of("..").toFile()).redirectErrorStream(true).start()
    private val ready=CompletableFuture<Void>()
    private val output=CopyOnWriteArrayList<String>()
    private val reader=Thread({process.inputStream.bufferedReader().useLines{lines->lines.forEach{line->output.add(line);if(line=="INSRC_PROJECT_FIXTURE_READY")ready.complete(null)}}},"insrc-mutation-fixture-output").apply{isDaemon=true;start()}
    val lanes=CopyOnWriteArrayList<PersistentDaemonLane>()
    val wall=AtomicLong()
    val root:String
    val otherRoot:String
    init {
        try{ready.get(15,TimeUnit.SECONDS)}catch(e:Exception){process.destroyForcibly();throw AssertionError("Mutation fixture did not start: "+output.joinToString("\n"),e)}
        val info=command("fixture.info");root=info.getAsJsonArray("roots")[0].asString;otherRoot=info.getAsJsonArray("roots")[1].asString;wall.set(info["wallNow"].asLong)
    }
    fun command(method:String,params:JsonObject=JsonObject()):JsonObject=PersistentDaemonLane.open(socket).use{lane->lane.request(method,params).result.toCompletableFuture().get(15,TimeUnit.SECONDS).asJsonObject}
    fun stats()=command("fixture.stats")
    fun fault(mode:String)=command("fixture.fault",JsonObject().apply{addProperty("mode",mode)})
    fun wallClock(now:Long){command("fixture.wallClock",JsonObject().apply{addProperty("now",now)});wall.set(now)}
    fun ports()=ConnectionOwnerPorts(openLane={assertFalse(ApplicationManager.getApplication().isDispatchThread);PersistentDaemonLane.open(socket).also{lanes.add(it)}})
    override fun close(){
        lanes.forEach{it.close();assertTrue(it.awaitClosed(3000))}
        process.outputStream.bufferedWriter().apply{write("stop\n");flush()}
        if(!process.waitFor(10,TimeUnit.SECONDS)){process.destroyForcibly();throw AssertionError("Mutation fixture process did not drain")}
        reader.join(3000)
        Files.walk(dir).use{paths->paths.sorted(Comparator.reverseOrder()).forEach{Files.deleteIfExists(it)}}
    }
}
