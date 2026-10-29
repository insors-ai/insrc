package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.daemon.ConnectionLaneException
import ai.insors.insrc.jetbrains.daemon.PersistentDaemonLane
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.*

/** Real platform Project services and real daemon sockets, with fixture-only registered roots/gates. */
class ConnectionsSessionServiceTest : BasePlatformTestCase() {
    override fun setUp() {super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown() {try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private class Clock {
        @Volatile var now=0L
        private val sequence=java.util.concurrent.atomic.AtomicLong()
        val jobs=ConcurrentHashMap<Long,Pair<Long,()->Unit>>()
        val timer: (()->Unit,Long)->AutoCloseable = {callback,ms->
            val id=sequence.incrementAndGet();jobs[id]=(now+ms) to callback;AutoCloseable{jobs.remove(id)}
        }
        fun fire(to:Long) {
            now=to
            val futures=jobs.entries.toList().filter{it.value.first<=to}.mapNotNull{entry->
                if(jobs.remove(entry.key,entry.value))CompletableFuture.runAsync{entry.value.second()}else null
            }
            futures.forEach{it.get(10,TimeUnit.SECONDS)}
        }
    }
    private class Backend : AutoCloseable {
        val dir=Files.createTempDirectory("s5-project-").toRealPath()
        val socket=dir.resolve("daemon.sock");val root=dir.resolve("a").toString()
        private val process=ProcessBuilder(System.getenv("INSRC_FIXTURE_NODE")?:"node","--import","tsx","src/shared/__tests__/fixtures/connection-project-server.ts",dir.toString())
            .directory(Path.of("..").toFile()).redirectErrorStream(true).start()
        private val output=CopyOnWriteArrayList<String>()
        private val ready=CompletableFuture<Void>()
        private val reader=Thread({process.inputStream.bufferedReader().useLines {lines->lines.forEach {line->
            output.add(line);if(line=="INSRC_PROJECT_FIXTURE_READY")ready.complete(null)
        }}},"insrc-fixture-output").apply{isDaemon=true;start()}
        val lanes=CopyOnWriteArrayList<PersistentDaemonLane>()
        init {try{ready.get(15,TimeUnit.SECONDS)}catch(e:Exception){process.destroyForcibly();throw AssertionError("Backend fixture did not start: "+output.joinToString("\n"),e)}}
        val clock=Clock()
        fun ports(manualClock:Boolean=false)=ConnectionOwnerPorts(
            openLane={assertFalse(ApplicationManager.getApplication().isDispatchThread);PersistentDaemonLane.open(socket).also{lanes.add(it)}},
            now=if(manualClock)({clock.now})else({System.nanoTime()/1_000_000}),timer=if(manualClock)clock.timer else null,
        )
        fun advance(to:Long) {
            PersistentDaemonLane.open(socket).use{lane->lane.request("fixture.clock",JsonObject().apply{addProperty("now",to)}).result.toCompletableFuture().get(5,TimeUnit.SECONDS)}
            clock.fire(to)
        }
        fun stats():JsonObject = PersistentDaemonLane.open(socket).use {lane->lane.request("fixture.stats").result.toCompletableFuture().get(5,TimeUnit.SECONDS).asJsonObject}
        override fun close() {
            lanes.forEach{it.close();assertTrue(it.awaitClosed(3000))}
            process.outputStream.bufferedWriter().apply{write("stop\n");flush()}
            if(!process.waitFor(10,TimeUnit.SECONDS)){process.destroyForcibly();throw AssertionError("Fixture process did not drain")}
            reader.join(3000)
            Files.walk(dir).use{paths->paths.sorted(Comparator.reverseOrder()).forEach{Files.deleteIfExists(it)}}
        }
    }
    private fun <T> await(stage:CompletionStage<T>):T = stage.toCompletableFuture().get(20,TimeUnit.SECONDS)
    private fun list(service:ConnectionsSessionService,root:String)=await(service.requestTemporary(root,service.view,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",root)}).result)

    fun testActualProjectContainerOwnsServiceAndViewDisposalLeavesSessionAlive() {
        Backend().use {backend->
            val fixture=IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder("s5-view-project").fixture
            fixture.setUp()
            val service=fixture.project.service<ConnectionsSessionService>()
            assertSame(service,fixture.project.service<ConnectionsSessionService>())
            service.installFixturePorts(backend.ports());service.setRegisteredRoots(listOf(backend.root))
            try {
                assertEquals("ready",await(service.selectRoot(backend.root)).status)
                assertEquals(0,list(service,backend.root).asJsonArray.size())
                val view=service.onChange { }
                view.close();assertEquals(0,backend.stats()["ended"].asInt)
                assertEquals("ready",service.view.status)
                // The unrelated legacy service remains application scoped and unclaimed.
                val app=ApplicationManager.getApplication().getService(DaemonGatewayService::class.java)
                assertSame(app,ApplicationManager.getApplication().getService(DaemonGatewayService::class.java))
                assertFalse(service.view.toString().contains("capability"))
                service.dispose();service.dispose();await(service.whenDisposed())
                assertEquals("disposed",service.view.status);assertEquals(1,backend.stats()["ended"].asInt)
                assertTrue(backend.lanes.all{it.isClosed})
            } finally {service.dispose();await(service.whenDisposed());fixture.tearDown()}
        }
    }
    fun testTwoActualProjectsWithSameRegisteredRootHaveIndependentOwnersAndProjectTeardown() {
        Backend().use {backend->
            val firstFixture=IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder("s5-first-project").fixture
            firstFixture.setUp()
            val first=firstFixture.project.service<ConnectionsSessionService>();first.installFixturePorts(backend.ports());first.setRegisteredRoots(listOf(backend.root))
            val secondPath=Files.createDirectory(backend.dir.resolve("ide-second"))
            val secondProject=ProjectManager.getInstance().createProject("s5-second-project",secondPath.toString())!!
            var tornDown=false
            try {
                assertNotSame(firstFixture.project,secondProject)
                val second=secondProject.service<ConnectionsSessionService>()
                assertNotSame(first,second);second.installFixturePorts(backend.ports());second.setRegisteredRoots(listOf(backend.root))
                await(first.selectRoot(backend.root));await(second.selectRoot(backend.root));list(first,backend.root);list(second,backend.root)
                assertEquals(2,backend.stats()["opened"].asInt);assertEquals(2,backend.stats()["active"].asInt)
                tornDown=true;assertTrue(ProjectManager.getInstance().closeAndDispose(secondProject));await(second.whenDisposed())
                assertEquals("disposed",second.view.status);assertEquals(1,backend.stats()["ended"].asInt)
                assertEquals("ready",first.view.status);assertEquals(0,list(first,backend.root).asJsonArray.size())
                first.dispose();await(first.whenDisposed());assertEquals(2,backend.stats()["ended"].asInt)
            } finally {if(!tornDown)ProjectManager.getInstance().closeAndDispose(secondProject);first.dispose();await(first.whenDisposed());firstFixture.tearDown()}
        }
    }
    fun testBackgroundHeartbeatSameEpochResumeAndAuthoritativeLeaseExpiry() {
        Backend().use {backend->
            val fixture=IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder("s5-lease-project").fixture
            fixture.setUp();val service=fixture.project.service<ConnectionsSessionService>()
            service.installFixturePorts(backend.ports(true));service.setRegisteredRoots(listOf(backend.root))
            val erased=java.util.concurrent.atomic.AtomicInteger();service.onTemporaryInvalidated{erased.incrementAndGet()}
            try {
                await(service.selectRoot(backend.root));val epoch=service.view.daemonEpoch
                backend.advance(30000);assertEquals(1,backend.stats()["heartbeats"].asInt)
                backend.lanes.first().close();assertEquals("offline",service.view.status)
                await(service.selectRoot(backend.root));assertEquals(epoch,service.view.daemonEpoch)
                assertEquals(1,backend.stats()["resumed"].asInt);assertEquals(1,backend.stats()["opened"].asInt);assertEquals(0,erased.get())
                backend.advance(120000);assertEquals("expired",service.view.status);assertEquals(1,erased.get())
                val error=try{list(service,backend.root);null}catch(e:ExecutionException){e.cause}
                assertTrue(error is ConnectionOwnerException)
                await(service.selectRoot(backend.root));assertEquals(2,backend.stats()["opened"].asInt)
                assertEquals(1,backend.stats()["active"].asInt)
            } finally {service.dispose();await(service.whenDisposed());fixture.tearDown()}
            assertEquals(0,backend.clock.jobs.size)
        }
    }

    fun testPendingRequestDoesNotBlockCancellationOrOtherCallsAndDisposalKeepsWriteTruth() {
        Backend().use {backend->
            val fixture=IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder("s5-cancel-project").fixture
            fixture.setUp();val service=fixture.project.service<ConnectionsSessionService>()
            service.installFixturePorts(backend.ports());service.setRegisteredRoots(listOf(backend.root))
            fun request()=service.requestTemporary(backend.root,service.view,"db.connections.v2.read",JsonObject().apply {
                add("key",JsonObject().apply{addProperty("repoRoot",backend.root);addProperty("scope","temporary");addProperty("id","pending")})
            })
            fun observed(count:Int) {
                val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5)
                while(backend.stats()["reading"].asInt<count){check(System.nanoTime()<deadline);Thread.yield()}
            }
            try {
                await(service.selectRoot(backend.root));val first=request();observed(1)
                assertEquals(0,list(service,backend.root).asJsonArray.size())
                assertTrue(first.cancel())
                val canceled=try{await(first.result);null}catch(e:ExecutionException){e.cause}
                assertTrue(canceled is ConnectionLaneException);assertEquals("canceled",(canceled as ConnectionLaneException).code);assertTrue(canceled.written)
                val second=request();observed(2);service.dispose()
                val closed=try{await(second.result);null}catch(e:ExecutionException){e.cause}
                assertTrue(closed is ConnectionLaneException);assertEquals("closed",(closed as ConnectionLaneException).code);assertTrue(closed.written)
                await(service.whenDisposed());assertEquals("disposed",service.view.status)
            } finally {service.dispose();await(service.whenDisposed());fixture.tearDown()}
        }
    }

}
