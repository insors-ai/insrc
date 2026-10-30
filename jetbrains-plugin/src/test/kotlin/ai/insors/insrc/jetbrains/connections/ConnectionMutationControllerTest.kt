package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import com.intellij.openapi.components.service
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.fixtures.IdeaTestFixtureFactory
import com.intellij.util.ui.UIUtil
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import java.nio.file.Files
import java.util.concurrent.*

class ConnectionMutationControllerTest:BasePlatformTestCase() {
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private val descriptor get()=ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"]).first{it.kind=="postgres"}
    private fun <T> await(stage:CompletionStage<T>):T=stage.toCompletableFuture().get(25,TimeUnit.SECONDS)
    private fun draft(b:ConnectionMutationBackend,id:String,scope:String="saved")=ConnectionDraft(descriptor,ConnectionKey(b.root,scope,id)).apply{
        setField(listOf("endpoint"),JsonPrimitive("postgres://fixture.invalid/db"));setCredential("url.password","replace","fixture-only-private-replacement")
    }
    private fun failed(code:String,stage:CompletionStage<*>) {
        val error=try{await(stage);null}catch(e:ExecutionException){e.cause}
        assertTrue(error is MutationStateException);assertEquals(code,(error as MutationStateException).code)
    }
    private fun fixture(name:String,body:(ConnectionMutationBackend,ConnectionsSessionService,ConnectionMutationController)->Unit) {
        ConnectionMutationBackend().use{b->
            val fixture=IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder(name).fixture
            fixture.setUp();val service=fixture.project.service<ConnectionsSessionService>()
            service.installFixturePorts(b.ports());service.installMutationFixtureTiming(MutationTiming(now=b.wall::get));service.setRegisteredRoots(listOf(b.root))
            try{await(service.selectRoot(b.root));body(b,service,service.mutations())}
            finally{service.dispose();await(service.whenDisposed());fixture.tearDown()}
        }
    }
    fun testProjectMemoryUnknownSurvivesViewCloseAndLostReplyReconcilesWithoutAnotherCreate()=fixture("s5-recovery"){b,s,c->
        val form=draft(b,"lost");b.fault("after");var notifications=0
        val view=s.onMutationChange{notifications++}
        val pending=c.submit(form);failed("busy",c.submit(form))
        var r=await(pending);assertEquals("unknown",r.phase);assertFalse(r.canReplay);assertTrue(form.view.dirty)
        val beforeClose=notifications;view.close();UIUtil.dispatchAllInvocationEvents();assertEquals(beforeClose,notifications)
        assertEquals("unknown",c.record(r.recordId).phase);assertSame(c,s.mutations());assertEquals(1,b.stats()["savedRows"].asInt)
        s.setRegisteredRoots(listOf(b.root,b.otherRoot));await(s.selectRoot(b.otherRoot))
        r=await(c.reconcile(r.recordId));assertEquals("committed",r.phase);assertEquals("failed",r.refresh);assertEquals(b.otherRoot,s.view.repoRoot)
        await(s.selectRoot(b.root));r=await(c.retryRefresh(r.recordId))
        assertEquals("persisted",r.outcome?.registration);assertEquals("complete",r.refresh);assertTrue(form.view.discarded)
        assertEquals(1,b.stats()["mutations"].asInt);assertEquals(1,b.stats()["tickets"].asInt)
        assertEquals("{}",Gson().toJson(c));assertFalse(Gson().toJson(c.records).contains("fixture-only-private"));assertFalse(Gson().toJson(c.records).contains("signature"))
        failed("invalid-state",c.replay(r.recordId))
    }
    fun testSameTicketReplayIsExplicitAndIdenticalWhileExpiredUnknownBlocksNewMutation()=fixture("s5-replay"){b,_,c->
        val form=draft(b,"replay");b.fault("before");var r=await(c.submit(form));assertEquals("unknown",r.phase)
        failed("invalid-state",c.replay(r.recordId));r=await(c.reconcile(r.recordId));assertEquals("not-seen",r.phase);assertTrue(r.canReplay)
        form.setField(listOf("label"),JsonPrimitive("Changed after capture"));r=await(c.replay(r.recordId));assertEquals("committed",r.phase)
        assertTrue(b.stats()["identicalReplay"].asBoolean);assertEquals(2,b.stats()["mutations"].asInt);assertEquals(1,b.stats()["tickets"].asInt)
        val form2=draft(b,"expired");b.fault("before");var expired=await(c.submit(form2));expired=await(c.reconcile(expired.recordId));assertEquals("not-seen",expired.phase)
        b.wallClock(b.wall.get()+TimeUnit.DAYS.toMillis(31));val calls=b.stats()["mutations"].asInt
        expired=await(c.replay(expired.recordId));assertEquals("reconciliation-required",expired.phase);assertFalse(expired.canReplay);assertEquals(calls,b.stats()["mutations"].asInt)
        failed("busy",c.submit(form2));assertEquals("reconciliation-required",await(c.reconcile(expired.recordId)).phase)
    }
    fun testPostcommitActivationCleanupAndRefreshRemainSeparateFromRegistration()=fixture("s5-phases"){b,_,c->
        b.command("fixture.fault",JsonObject().apply{addProperty("activationFail",true);addProperty("cleanupFail",true);addProperty("refreshFail",true)})
        val form=draft(b,"phases");var r=await(c.submit(form));assertEquals("committed",r.phase);assertEquals("failed",r.outcome?.activation);assertEquals("pending",r.outcome?.credentialCleanup);assertEquals("failed",r.refresh);assertTrue(form.view.discarded)
        val revision=r.outcome!!.revision
        b.command("fixture.fault",JsonObject().apply{addProperty("activationFail",false)})
        r=await(c.retryActivation(r.recordId));assertEquals("active",r.outcome?.activation);assertEquals(revision,r.outcome?.revision);assertEquals("failed",r.refresh)
        b.command("fixture.fault",JsonObject().apply{addProperty("cleanupFail",false)})
        r=await(c.retryCleanup(r.recordId));assertEquals("complete",r.outcome?.credentialCleanup)
        b.command("fixture.fault",JsonObject().apply{addProperty("refreshFail",false)})
        r=await(c.retryRefresh(r.recordId));assertEquals("complete",r.refresh);assertTrue(r.canDismiss);assertEquals(revision,r.outcome?.revision)
        assertEquals(1,b.stats()["mutations"].asInt);assertEquals(1,b.stats()["tickets"].asInt);assertEquals(1,b.stats()["savedRows"].asInt)
    }
    fun testPendingAndMalformedOutcomesRecoverByStatusWithoutRecreating()=fixture("s5-pending"){b,_,c->
        b.fault("pending");var r=await(c.submit(draft(b,"pending")));assertEquals("unknown",r.phase)
        r=await(c.reconcile(r.recordId));assertEquals("pending",r.phase);assertFalse(r.canReplay)
        b.command("fixture.release");val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5)
        while(c.record(r.recordId).busy){check(System.nanoTime()<deadline);Thread.yield()}
        r=await(c.reconcile(r.recordId));assertEquals("committed",r.phase);assertEquals(1,b.stats()["mutations"].asInt)
        b.fault("malformed");var malformed=await(c.submit(draft(b,"malformed")));assertEquals("unknown",malformed.phase)
        malformed=await(c.reconcile(malformed.recordId));assertEquals("committed",malformed.phase);assertEquals(2,b.stats()["savedRows"].asInt);assertEquals(2,b.stats()["mutations"].asInt)
    }
    fun testTemporaryExpiryErasesOnlyItsAttemptAndNewProjectReloadCannotInventLostTicketOutcome() {
        ConnectionMutationBackend().use{b->
            val fixture=IdeaTestFixtureFactory.getFixtureFactory().createFixtureBuilder("s5-loss").fixture
            fixture.setUp();var tornDown=false
            val s=fixture.project.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());s.installMutationFixtureTiming(MutationTiming(now=b.wall::get));s.setRegisteredRoots(listOf(b.root))
            val c=s.mutations()
            try{
                await(s.selectRoot(b.root));b.fault("before");val saved=await(c.submit(draft(b,"saved-pending")))
                b.fault("before");val form=draft(b,"temporary-pending","temporary");val temporary=await(c.submit(form))
                assertEquals("unknown",saved.phase);assertEquals("unknown",temporary.phase)
                b.command("fixture.clock",JsonObject().apply{addProperty("now",90000)})
                assertEquals("session-ended",await(c.reconcile(temporary.recordId)).phase);assertTrue(form.view.discarded);assertEquals("unknown",c.record(saved.recordId).phase)
                failed("invalid-state",c.replay(temporary.recordId));await(s.selectRoot(b.root))
                b.fault("after");val lost=await(c.submit(draft(b,"after-project-loss")));assertEquals("unknown",lost.phase)
                tornDown=true;fixture.tearDown();await(s.whenDisposed());assertTrue(c.records.isEmpty())
                val path=Files.createDirectory(b.dir.resolve("fresh-project"));val fresh=ProjectManager.getInstance().createProject("s5-fresh",path.toString())!!
                val next=fresh.service<ConnectionsSessionService>();next.installFixturePorts(b.ports());next.setRegisteredRoots(listOf(b.root))
                try{
                    assertTrue(next.mutations().records.isEmpty());org.junit.Assert.assertThrows(MutationStateException::class.java){next.mutations().record(lost.recordId)}
                    val rows=await(next.requestSaved(b.root,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.root)}).result).asJsonArray
                    assertEquals(1,rows.size());assertEquals("after-project-loss",rows[0].asJsonObject.getAsJsonObject("key")["id"].asString);assertTrue(next.mutations().records.isEmpty())
                }finally{assertTrue(ProjectManager.getInstance().closeAndDispose(fresh));await(next.whenDisposed())}
            }finally{if(!tornDown)fixture.tearDown();s.dispose();await(s.whenDisposed())}
        }
    }
    fun testFiniteRecordsRefuseBeforeTicketWithoutEvictingUnknowns()=fixture("s5-limit"){b,_,c->
        repeat(64){b.fault("before");assertEquals("unknown",await(c.submit(draft(b,"bounded-$it"))).phase)}
        val tickets=b.stats()["tickets"].asInt;failed("resource-limit",c.submit(draft(b,"overflow")))
        assertEquals(tickets,b.stats()["tickets"].asInt);assertEquals(64,c.records.size);assertTrue(c.records.all{it.phase=="unknown"})
        org.junit.Assert.assertThrows(MutationStateException::class.java){c.dismiss(c.records[0].recordId)}
    }
}
