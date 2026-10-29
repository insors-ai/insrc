package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import com.google.gson.*
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.nio.file.Files
import java.util.concurrent.*

class ConnectionsIsolationTest : BasePlatformTestCase() {
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private fun <T> await(stage:CompletionStage<T>):T=stage.toCompletableFuture().get(25,TimeUnit.SECONDS)
    private fun form(root:String,label:String):ConnectionDraft = ConnectionDraft(ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"]).first{it.kind=="postgres"},ConnectionKey(root,"temporary","shared-id")).apply{
        setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/database"));setField(listOf("label"),JsonPrimitive(label))
    }
    private fun list(s:ConnectionsSessionService,root:String)=ConnectionProtocol.list(await(s.requestTemporary(root,s.view,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",root)}).result),root)
    private fun rejected(code:String,stage:CompletionStage<*>){val error=try{await(stage);null}catch(e:ExecutionException){e.cause};assertTrue(error is ConnectionOwnerException);assertEquals(code,(error as ConnectionOwnerException).code)}
    fun testActualProjectsSameRootIdIndependentRepliesRootRetentionAndOwnedDisposal() {
        ConnectionMutationBackend().use{b->
            val pm=ProjectManager.getInstance();val a=pm.createProject("same-display-name",Files.createDirectory(b.dir.resolve("project-a")).toString())!!
            val z=pm.createProject("same-display-name",Files.createDirectory(b.dir.resolve("project-b")).toString())!!
            val first=a.service<ConnectionsSessionService>();val second=z.service<ConnectionsSessionService>()
            for(s in listOf(first,second)){s.installFixturePorts(b.ports());s.installMutationFixtureTiming(MutationTiming(now=b.wall::get));s.setRegisteredRoots(listOf(b.root,b.otherRoot))}
            try{
                assertNotSame(first,second);await(first.selectRoot(b.root));await(second.selectRoot(b.root))
                val one=first.mutations().submit(form(b.root,"first-project"));val two=second.mutations().submit(form(b.root,"second-project"))
                val x=await(one);val y=await(two);assertEquals("committed",x.phase);assertEquals("committed",y.phase);assertTrue(x.outcome?.revision!=y.outcome?.revision)
                // Both persistent lanes start their private request counters at 1. Replies remain lane-owned.
                val readA=first.requestTemporary(b.root,first.view,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.root)})
                val readB=second.requestTemporary(b.root,second.view,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.root)})
                assertEquals("first-project",ConnectionProtocol.list(await(readA.result),b.root).single().label)
                assertEquals("second-project",ConnectionProtocol.list(await(readB.result),b.root).single().label)
                val before=b.stats()["lists"].asInt;val identity=second.view
                rejected("stale-view",second.requestTemporary(b.root,identity.copy(generation=identity.generation+1),"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.root)}).result)
                rejected("invalid-request",second.requestTemporary(b.root,identity,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.otherRoot)}).result)
                rejected("invalid-request",second.requestTemporary(b.root,identity,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.root);addProperty("capability","forged-owner")}).result)
                assertEquals(before,b.stats()["lists"].asInt)
                await(second.selectRoot(b.otherRoot));assertEquals("committed",await(second.mutations().submit(form(b.otherRoot,"other-root"))).phase);assertEquals("other-root",list(second,b.otherRoot).single().label)
                await(second.selectRoot(b.root));assertEquals("second-project",list(second,b.root).single().label)
                assertEquals(0,ConnectionProtocol.list(await(second.requestSaved(b.root,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.root)}).result),b.root).size)
                val app=ApplicationManager.getApplication().getService(DaemonGatewayService::class.java);assertSame(app,ApplicationManager.getApplication().getService(DaemonGatewayService::class.java))
                assertTrue(DaemonGatewayService::class.java.declaredFields.none{it.name.contains("capability",true)||it.type==ConnectionsSessionService::class.java})
                assertTrue(pm.closeAndDispose(a));await(first.whenDisposed());assertEquals("ready",second.view.status);assertEquals("second-project",list(second,b.root).single().label)
                await(second.selectRoot(b.otherRoot));assertEquals("other-root",list(second,b.otherRoot).single().label)
            }finally{if(!a.isDisposed)pm.closeAndDispose(a);if(!z.isDisposed)pm.closeAndDispose(z);await(first.whenDisposed());await(second.whenDisposed())}
        }
    }
}
