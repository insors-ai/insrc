package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.daemon.PersistentDaemonLane
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import org.junit.Assert.*
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.*

/** Actual Node supervisor and one-shot workers; only preparation/reply scheduling is fixture controlled. */
internal class ConnectionTestBackend:AutoCloseable {
    val dir=Files.createTempDirectory("s5t-").toRealPath()
    private val socket=dir.resolve("daemon.sock")
    private val process=ProcessBuilder(System.getenv("INSRC_FIXTURE_NODE")?:"node","--import","tsx","src/shared/__tests__/fixtures/connection-test-server.ts",dir.toString()).directory(Path.of("..").toFile()).redirectErrorStream(true).start()
    private val ready=CompletableFuture<Void>()
    private val output=CopyOnWriteArrayList<String>()
    private val reader=Thread({process.inputStream.bufferedReader().useLines{lines->lines.forEach{line->output.add(line);if(line=="INSRC_PROJECT_FIXTURE_READY")ready.complete(null)}}},"insrc-test-fixture-output").apply{isDaemon=true;start()}
    val lanes=CopyOnWriteArrayList<PersistentDaemonLane>()
    val roots:List<String>
    val path:String
    init{try{ready.get(15,TimeUnit.SECONDS)}catch(e:Exception){process.destroyForcibly();throw AssertionError("Test fixture did not start: "+output.joinToString("\n"),e)}
        val info=command("fixture.info");roots=info.getAsJsonArray("roots").map{it.asString};path=info["path"].asString}
    fun command(method:String,params:JsonObject=JsonObject()):JsonObject=PersistentDaemonLane.open(socket).use{lane->lane.request(method,params).result.toCompletableFuture().get(15,TimeUnit.SECONDS).asJsonObject}
    fun stats()=command("fixture.stats")
    fun until(predicate:(JsonObject)->Boolean){val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15)
        while(!predicate(stats())){check(System.nanoTime()<deadline){"Probe fixture did not settle"};Thread.sleep(5)}}
    fun ports()=ConnectionOwnerPorts(openLane={assertFalse(ApplicationManager.getApplication().isDispatchThread);PersistentDaemonLane.open(socket).also{lanes.add(it)}})
    override fun close(){lanes.forEach{it.close();assertTrue(it.awaitClosed(3000))}
        process.outputStream.bufferedWriter().apply{write("stop\n");flush()}
        if(!process.waitFor(10,TimeUnit.SECONDS)){process.destroyForcibly();throw AssertionError("Test fixture process did not drain")}
        assertEquals(0,process.exitValue());reader.join(3000)
        Files.walk(dir).use{paths->paths.sorted(Comparator.reverseOrder()).forEach{Files.deleteIfExists(it)}}}
}
