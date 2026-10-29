package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.ui.UIUtil
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import java.util.UUID
import java.nio.file.Files
import java.util.concurrent.*

class ConnectionDraftTestsTest:BasePlatformTestCase() {
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private fun <T> await(value:CompletionStage<T>):T=value.toCompletableFuture().get(25,TimeUnit.SECONDS)
    private val descriptors get()=ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"])
    private fun key(b:ConnectionTestBackend,scope:String="saved",id:String="fixture")=ConnectionKey(b.roots[0],scope,id)
    private fun identity(s:ConnectionsSessionService,k:ConnectionKey,generation:Long)=DraftTestIdentity(k,s.view.daemonEpoch!!,generation)
    private fun draft(b:ConnectionTestBackend,k:ConnectionKey=key(b),edit:Boolean=false):ConnectionDraft {
        val public=JsonObject().apply{addProperty("kind","csv");addProperty("path",b.path)}
        val current=if(edit)ConnectionProtocol.safeConnection(JsonObject().apply{
            add("key",JsonObject().apply{addProperty("repoRoot",k.repoRoot);addProperty("scope",k.scope);addProperty("id",k.id)})
            addProperty("revision",UUID.randomUUID().toString());addProperty("kind","csv");addProperty("family","file");addProperty("effectiveFamily","file")
            add("publicConfig",public);add("credentialPresence",JsonObject())})else null
        return ConnectionDraft(descriptors.first{it.kind=="csv"},k,current).apply{if(!edit)setField(listOf("path"),JsonPrimitive(b.path))}
    }
    private fun failed(code:String,value:CompletionStage<*>) {
        val cause=try{await(value);null}catch(e:ExecutionException){e.cause}
        assertTrue(cause is DraftTestStateException);assertEquals(code,(cause as DraftTestStateException).code)
    }
    private fun fixture(name:String,body:(ConnectionTestBackend,ConnectionsSessionService,ConnectionDraftTests)->Unit) {
        ConnectionTestBackend().use{b->val project=ProjectManager.getInstance().createProject(name,Files.createDirectory(b.dir.resolve("project")).toString())!!
            val s=project.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());s.setRegisteredRoots(b.roots)
            try{await(s.selectRoot(b.roots[0]));body(b,s,s.tests())}
            finally{b.command("fixture.release");assertTrue(ProjectManager.getInstance().closeAndDispose(project));await(s.whenDisposed())}}
    }
    fun testSameSerializerOptionalTestRepeatedClickEditAndCloseRetainOriginalSource()=fixture("s5-native-test"){b,s,c->
        val d=draft(b,edit=true);val i=identity(s,d.view.key,1);c.setView(i)
        val save=d.serialize();assertTrue(save.has("expectedRevision"));assertEquals(0,b.stats()["tests"].asInt)
        b.command("fixture.expect",save);b.command("fixture.prepare")
        val started=System.nanoTime();val pending=c.test(d,i);assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started)<500)
        b.until{it["tests"].asInt==1};assertTrue(b.stats()["matchesExpected"].asBoolean);failed("busy",c.test(d,i));assertEquals(1,b.stats()["tests"].asInt)
        d.setField(listOf("label"),JsonPrimitive("edited"));assertEquals("idle",c.view.status);await(pending)
        assertEquals(1,b.stats()["active"].asInt);assertEquals(1,b.stats()["cancels"].asInt)
        val sources=b.lanes.size;await(c.test(d,i));assertEquals("unavailable",c.view.status);assertTrue(c.view.cleanupUnverified);assertEquals(sources,b.lanes.size);assertEquals(1,b.stats()["sources"].asInt)
        b.command("fixture.release");b.until{it["active"].asInt==0};await(c.test(d,i));assertEquals("reachable",c.view.status);assertFalse(c.view.cleanupUnverified);assertTrue(c.view.tookMs!!>=0)
        d.setField(listOf("label"),JsonPrimitive("stale success"));assertEquals("idle",c.view.status)
        b.command("fixture.prepare");val closing=c.test(d,i);b.until{it["active"].asInt==1};c.setView(null);await(closing);assertEquals("idle",c.view.status)
        val reopened=i.copy(viewGeneration=2);c.setView(reopened);await(c.test(d,reopened));assertEquals("unavailable",c.view.status);assertEquals(sources,b.lanes.size)
        b.command("fixture.release");b.until{it["active"].asInt==0};await(c.test(d,reopened));assertEquals("reachable",c.view.status)
        val credentialsKey=key(b,id="private-intent");val form=ConnectionDraft(descriptors.first{it.kind=="postgres"},credentialsKey)
        form.setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/database"));form.setCredential("url.password","replace","fixture-only-private-intent")
        val ci=identity(s,credentialsKey,3);c.setView(ci);b.command("fixture.expect",form.serialize());b.command("fixture.prepare")
        val credentialTest=c.test(form,ci);b.until{it["active"].asInt==1};assertTrue(b.stats()["matchesExpected"].asBoolean)
        assertFalse(Gson().toJson(c.view).contains("fixture-only-private-intent"));assertEquals("{}",Gson().toJson(c));assertEquals("{}",Gson().toJson(form))
        c.setView(null);await(credentialTest);assertTrue(b.stats()["cancelSourcesMatch"].asBoolean)
    }
    fun testExactTupleLateAbaAndNativeEdtViewDelivery()=fixture("s5-native-stale"){b,s,c->
        val d=draft(b);val i=identity(s,d.view.key,1);c.setView(i);var delivered=0
        val subscription=s.onTestChange{assertTrue(ApplicationManager.getApplication().isDispatchThread);delivered++}
        await(c.test(d,i));UIUtil.dispatchAllInvocationEvents();assertEquals("reachable",c.view.status);assertTrue(delivered>0)
        b.command("fixture.delivery");val late=c.test(d,i);b.until{it["tests"].asInt==2&&it["active"].asInt==0}
        c.setView(i.copy(key=i.key.copy(id="other"),viewGeneration=2));val returned=i.copy(viewGeneration=3);c.setView(returned)
        b.command("fixture.release");await(late);UIUtil.dispatchAllInvocationEvents();assertEquals("idle",c.view.status)
        failed("stale-view",c.test(d,i));failed("stale-view",c.test(draft(b,key(b,id="other")),returned));failed("stale-view",c.test(draft(b,key(b,"temporary")),returned))
        for(field in listOf("requestId","draftRevision","repoRoot","daemonEpoch","safeMessage")){
            b.command("fixture.corrupt",JsonObject().apply{addProperty("field",field)});await(c.test(d,returned));assertEquals("unavailable",c.view.status)
            assertEquals("Connection test unavailable. Retry after cleanup completes.",c.view.message)
        }
        b.command("fixture.corrupt",JsonObject().apply{addProperty("field","")});await(c.test(d,returned))
        val beforeClose=delivered;subscription.close();UIUtil.dispatchAllInvocationEvents();assertEquals(beforeClose,delivered)
        assertSame(c,s.tests())
    }
    fun testTemporaryRootSwitchCancelsOriginalLaneAndRealTimeoutNeverCertifiesDrain()=fixture("s5-native-timeout"){b,s,c->
        val d=draft(b,key(b,"temporary"));val i=identity(s,d.view.key,1);c.setView(i);b.command("fixture.prepare")
        val pending=c.test(d,i);b.until{it["active"].asInt==1};assertTrue(b.stats()["claimed"].asBoolean)
        await(s.selectRoot(b.roots[1]));c.setView(i.copy(key=i.key.copy(repoRoot=b.roots[1]),viewGeneration=2));await(pending)
        assertEquals("idle",c.view.status);assertEquals(1,b.stats()["active"].asInt);assertTrue(b.stats()["cancelSourcesMatch"].asBoolean)
        b.command("fixture.release");b.until{it["active"].asInt==0};await(s.selectRoot(b.roots[0]))
        val next=i.copy(viewGeneration=3);c.setView(next);b.command("fixture.prepare")
        val start=System.nanoTime();val timeout=c.test(d,next);assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<500)
        await(timeout);assertEquals("timeout",c.view.status);assertTrue(c.view.cleanupUnverified);assertEquals(1,b.stats()["active"].asInt)
        val sources=b.lanes.size;await(c.test(d,next));assertEquals("unavailable",c.view.status);assertEquals(sources,b.lanes.size);assertEquals(1,b.stats()["sources"].asInt)
        b.command("fixture.release");b.until{it["active"].asInt==0};await(c.test(d,next));assertEquals("reachable",c.view.status)
    }
    fun testActualProjectDisposalSuppressesQueuedStatusAndClosesOwnedLanes() {
        ConnectionTestBackend().use{b->val project=ProjectManager.getInstance().createProject("s5-native-dispose",Files.createDirectory(b.dir.resolve("project")).toString())!!
            var tornDown=false;val s=project.service<ConnectionsSessionService>()
            s.installFixturePorts(b.ports());s.setRegisteredRoots(b.roots);await(s.selectRoot(b.roots[0]));val c=s.tests();val d=draft(b);val i=identity(s,d.view.key,1);c.setView(i)
            var delivered=0;val view=s.onTestChange{delivered++}
            try{
                b.command("fixture.prepare");val pending=c.test(d,i);b.until{it["active"].asInt==1}
                val beforeDispose=delivered;tornDown=true;assertTrue(ProjectManager.getInstance().closeAndDispose(project));await(s.whenDisposed());await(pending);UIUtil.dispatchAllInvocationEvents()
                assertEquals(beforeDispose,delivered);assertTrue(b.lanes.all{it.isClosed});assertEquals("{}",Gson().toJson(c));failed("disposed",c.test(d,i))
                org.junit.Assert.assertThrows(DraftTestStateException::class.java){s.tests()}
            }finally{view.close();b.command("fixture.release");s.dispose();await(s.whenDisposed());if(!tornDown)assertTrue(ProjectManager.getInstance().closeAndDispose(project))}
        }
    }
}
