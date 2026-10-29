package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import com.intellij.openapi.components.service
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import java.nio.file.Files
import java.util.concurrent.*

class ConnectionRemovalsTest:BasePlatformTestCase() {
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private fun <T> await(value:CompletionStage<T>):T=value.toCompletableFuture().get(25,TimeUnit.SECONDS)
    private val descriptor get()=ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"]).first{it.kind=="postgres"}
    private fun draft(b:ConnectionMutationBackend,id:String,scope:String="saved")=ConnectionDraft(descriptor,ConnectionKey(b.root,scope,id)).apply{
        setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/database"));setCredential("url.password","replace","fixture-only-private-replacement")}
    private fun rows(b:ConnectionMutationBackend,s:ConnectionsSessionService)=ConnectionProtocol.list(await(s.requestTemporary(b.root,s.view,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",b.root)}).result),b.root)
    private fun row(b:ConnectionMutationBackend,s:ConnectionsSessionService,id:String,scope:String="saved")=rows(b,s).first{it.key.id==id&&it.key.scope==scope}
    private fun fixture(name:String,body:(ConnectionMutationBackend,ConnectionsSessionService,ConnectionMutationController,ConnectionRemovals)->Unit){
        ConnectionMutationBackend().use{b->val project=ProjectManager.getInstance().createProject(name,Files.createDirectory(b.dir.resolve("project")).toString())!!
            val s=project.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());s.installMutationFixtureTiming(MutationTiming(now=b.wall::get));s.setRegisteredRoots(listOf(b.root))
            try{await(s.selectRoot(b.root));body(b,s,s.mutations(),s.removals())}
            finally{b.command("fixture.releaseLease");assertTrue(ProjectManager.getInstance().closeAndDispose(project));await(s.whenDisposed())}}
    }
    fun testTwentyUnchangedSc6SnapshotsHaveExactNativeCopyAndState() {
        val cases=ConnectionCorpus.load().getAsJsonArray("removalSnapshots");assertEquals(20,cases.size())
        val gson=Gson()
        for(element in cases){val c=element.asJsonObject
            if(c.has("confirmation")){val expected=c.getAsJsonObject("confirmation");val k=expected.getAsJsonObject("key");val confirmation=removalConfirmation(ConnectionKey(k["repoRoot"].asString,k["scope"].asString,k["id"].asString),expected["expectedRevision"].asString)
                assertEquals(expected,gson.toJsonTree(confirmation));assertEquals(c["confirmedSelection"],gson.toJsonTree(removalDecision(confirmation,"confirm")));assertNull(removalDecision(confirmation,"cancel"));continue}
            val expected=c.getAsJsonObject("state");val k=expected.getAsJsonObject("key")
            val ticket=OperationTicket(expected["operationId"].asString,k["repoRoot"].asString,k["scope"].asString,k["id"].asString,"remove","2026-10-29T00:00:00.000Z","2026-11-28T00:00:00.000Z","A".repeat(43))
            val value=when(val phase=c["phase"].asString){
                "removing"->removalInProgress(ticket)
                "busy","conflict"->projectRemovalRejection(ticket,phase)
                "unknown"->projectRemovalState(ticket,OperationStatus.Uncommitted(c["genericStatus"].asString))
                else->projectRemovalState(ticket,OperationStatus.Committed(CommittedOutcome(ticket.operationId,"33333333-3333-4333-8333-333333333333","removed","not-applicable",expected["credentialCleanup"].asString)),expected["resourceCleanup"].asString)
            }
            assertEquals(expected,gson.toJsonTree(value))
        }
    }
    fun testDirtyCancelBusyConflictAndAbsentRowNeverInventRemoval()=fixture("s5-native-remove"){b,s,c,r->
        await(c.submit(draft(b,"selected")));val original=row(b,s,"selected");val dirty=draft(b,"other");val before=dirty.serialize();val tickets=b.stats()["tickets"].asInt
        r.begin(original,dirty);assertTrue(r.view.resolveDirty);assertNull(r.view.confirmation);r.resolveDirty("cancel");assertTrue(before==dirty.serialize());assertEquals(tickets,b.stats()["tickets"].asInt)
        r.begin(original,dirty);r.resolveDirty("discard");assertTrue(dirty.view.discarded);assertEquals(removalConfirmation(original.key,original.revision),r.view.confirmation);await(r.decide("cancel"));assertEquals(tickets,b.stats()["tickets"].asInt)
        val form=ConnectionDraft(descriptor,original.key,original);val formBefore=form.serialize();b.command("fixture.lease",JsonObject().apply{addProperty("id","selected")})
        try{r.begin(original,form);val busy=await(r.decide("confirm"))!!;assertEquals("busy",busy.removal?.state);assertEquals(original.revision,row(b,s,"selected").revision);assertEquals(formBefore,form.serialize())}
        finally{b.command("fixture.releaseLease")}
        val update=ConnectionDraft(descriptor,original.key,original);update.setField(listOf("label"),JsonPrimitive("new generation"));await(c.submit(update));val current=row(b,s,"selected")
        r.begin(original,form);assertEquals("conflict",await(r.decide("confirm"))?.removal?.state);assertEquals(current.revision,row(b,s,"selected").revision);assertEquals(formBefore,form.serialize())
        val error=try{await(r.decide("confirm"));null}catch(e:ExecutionException){e.cause};assertTrue(error is MutationStateException)
        r.begin(current);assertEquals(current.revision,r.view.confirmation?.expectedRevision);b.fault("before");var unknown=await(r.decide("confirm"))!!;assertEquals("unknown",unknown.removal?.state)
        org.junit.Assert.assertThrows(MutationStateException::class.java){r.begin(current)};assertTrue(b.stats()["removeFieldsValid"].asBoolean)
        assertTrue(b.command("fixture.commitOriginalRemoval")["committed"].asBoolean);assertTrue(rows(b,s).isEmpty());assertEquals("unknown",c.record(unknown.recordId).removal?.state)
        r.cancel();assertEquals("unknown",r.records.last().removal?.state);val mutations=b.stats()["mutations"].asInt;unknown=await(c.reconcile(unknown.recordId));assertEquals("removed",unknown.removal?.state);assertEquals(mutations,b.stats()["mutations"].asInt)
        assertEquals("{}",Gson().toJson(r));assertFalse(Gson().toJson(r.records).contains("fixture-only-private"));assertFalse(Gson().toJson(r.records).contains("signature"))
    }
    fun testCredentialAndResourceCleanupUseOriginalTicketAcrossSameIdRecreation()=fixture("s5-native-cleanup"){b,s,c,r->
        await(c.submit(draft(b,"same-id")));val original=row(b,s,"same-id");b.command("fixture.instantiate",JsonObject().apply{addProperty("id","same-id")})
        b.command("fixture.fault",JsonObject().apply{addProperty("credentialFail",true);addProperty("resourceFail",true)})
        r.begin(original);var removed=await(r.decide("confirm"))!!;val revision=removed.outcome!!.revision
        assertEquals("removed-cleanup-pending",removed.removal?.state);assertEquals("pending",removed.removal?.credentialCleanup);assertEquals("pending",removed.removal?.resourceCleanup);assertFalse(removed.canDismiss);assertTrue(rows(b,s).isEmpty());assertEquals(1,r.records.size)
        b.command("fixture.fault",JsonObject().apply{addProperty("credentialFail",false)})
        removed=await(c.retryCleanup(removed.recordId));assertEquals("complete",removed.removal?.credentialCleanup);assertEquals("pending",removed.removal?.resourceCleanup);assertEquals(revision,removed.outcome?.revision)
        val recreated=await(c.submit(draft(b,"same-id")));b.command("fixture.instantiate",JsonObject().apply{addProperty("id","same-id")});val mutations=b.stats()["mutations"].asInt
        b.command("fixture.fault",JsonObject().apply{addProperty("resourceFail",false)})
        removed=await(c.retryCleanup(removed.recordId));assertEquals("removed",removed.removal?.state);assertTrue(removed.canDismiss);assertEquals(revision,removed.outcome?.revision)
        val stats=b.stats();assertEquals(mutations,stats["mutations"].asInt);assertTrue(stats["ticketOnlyCleanup"].asBoolean);assertTrue(stats["originalCleanup"].asBoolean);assertTrue(stats["oldCloses"].asInt>=2);assertEquals(0,stats["newCloses"].asInt);assertTrue(stats["sourcePreserved"].asBoolean)
        assertEquals(recreated.outcome!!.revision,row(b,s,"same-id").revision)
    }
    fun testTemporaryDiscardPreservesSavedAndDuplicateIdsFailClosed()=fixture("s5-native-discard"){b,s,c,r->
        val saved=await(c.submit(draft(b,"same-id")));val duplicate=await(c.submit(draft(b,"same-id","temporary")));assertEquals("duplicate-id",duplicate.errorCode)
        val added=await(c.submit(draft(b,"temporary","temporary")));assertEquals("session-added",added.outcome?.registration);val temporary=row(b,s,"temporary","temporary");val tickets=b.stats()["tickets"].asInt
        r.begin(temporary);assertEquals("Discard",r.view.confirmation?.action);assertTrue(r.view.confirmation!!.message.contains("Source files, databases, tables and remote data will be preserved"));await(r.decide("cancel"));assertEquals(tickets,b.stats()["tickets"].asInt);assertEquals(2,rows(b,s).size)
        r.begin(temporary);val removed=await(r.decide("confirm"))!!;assertEquals("removed",removed.removal?.state);assertEquals("temporary",removed.key.scope);assertEquals(saved.outcome!!.revision,row(b,s,"same-id").revision);assertEquals(1,rows(b,s).size)
        assertTrue(b.stats()["removeFieldsValid"].asBoolean);assertTrue(b.stats()["ticketOnlyCleanup"].asBoolean);assertTrue(b.stats()["sourcePreserved"].asBoolean)
    }
}
