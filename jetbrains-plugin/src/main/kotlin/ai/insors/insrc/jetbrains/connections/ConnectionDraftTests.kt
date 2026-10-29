package ai.insors.insrc.jetbrains.connections

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import java.util.UUID
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicLong

data class DraftTestIdentity(val key:ConnectionKey,val daemonEpoch:String,val viewGeneration:Long)
data class DraftTestView(val status:String,val tookMs:Double?,val message:String,val cleanupUnverified:Boolean)
class DraftTestStateException(val code:String):IllegalStateException("The connection test cannot start in its current state.")
internal interface DraftTestSource {
    fun run(request:JsonObject):CompletionStage<JsonElement>
    fun cancel(requestId:String):CompletionStage<JsonElement>
}
internal fun interface DraftTestPorts {fun source(key:ConnectionKey,epoch:String):CompletionStage<DraftTestSource>}
private class TestReservation(val source:CompletableFuture<DraftTestSource>,val key:ConnectionKey,val epoch:String,val requestId:String) {
    @Volatile var pending=true
    @Volatile var canceled=false
    var started=false
    var subscription:AutoCloseable?=null
}
/** Native Project-memory probe ownership; a canceled/timeout reply is never a drain certificate. */
class ConnectionDraftTests internal constructor(@Transient private val ports:DraftTestPorts):AutoCloseable {
    @Transient private val lock=Any()
    @Transient private var identity:DraftTestIdentity?=null
    @Transient private val reservations=linkedMapOf<Pair<String,String>,TestReservation>()
    @Transient private var visible:TestReservation?=null
    @Transient private var state=DraftTestView("idle",null,"",false)
    @Transient private val listeners=CopyOnWriteArraySet<()->Unit>()
    @Transient private val sequence=AtomicLong()
    @Transient private var disposed=false
    val view:DraftTestView get()=synchronized(lock){state}
    val generation:Long get()=sequence.get()
    fun onChange(listener:()->Unit):AutoCloseable {synchronized(lock){admit();listeners.add(listener)};return AutoCloseable{listeners.remove(listener)}}
    private fun admit(){if(disposed)throw DraftTestStateException("disposed")}
    private fun publish(status:String,cleanup:Boolean=false,took:Double?=null) {
        state=DraftTestView(status,took,when(status){"idle"->"";"testing"->"Testing connection…";"reachable"->"Connection is reachable.";"failed"->"Connection test failed.";"timeout"->"Connection test timed out.";"canceled"->"Connection test canceled.";else->"Connection test unavailable. Retry after cleanup completes."},cleanup)
        sequence.incrementAndGet();listeners.forEach{runCatching{it()}}
    }
    private fun stop(r:TestReservation) {
        synchronized(r){if(r.canceled)return;r.canceled=true;r.subscription?.close();r.subscription=null
            // Source invocation is nonblocking and ordered before its cancellation on the same lane.
            if(r.pending&&r.started)runCatching{r.source.getNow(null)?.cancel(r.requestId)}}
    }
    fun cancel()=synchronized(lock){val r=visible?:return@synchronized
        if(r.canceled)return@synchronized
        stop(r);publish(if(r.pending)"canceled"else"idle",r.pending)}
    fun setView(next:DraftTestIdentity?)=synchronized(lock){admit();if(next!=null&&identity==next)return@synchronized
        cancel();identity=next?.copy(key=next.key.copy());visible=null;publish("idle")}
    fun test(draft:ConnectionDraft,expected:DraftTestIdentity):CompletionStage<DraftTestView> {
        val result=CompletableFuture<DraftTestView>()
        val input:JsonObject;val revision:Long;val r:TestReservation;val slot=expected.key.repoRoot to expected.key.scope
        try {
            val form:ConnectionDraftView
            synchronized(draft){input=draft.serialize();form=draft.view}
            revision=form.draftRevision
            synchronized(lock){admit()
                if(identity!=expected||form.key!=expected.key)throw DraftTestStateException("stale-view")
                val old=reservations[slot]
                if(old?.pending==true)throw DraftTestStateException("busy")
                if(old!=null&&old.epoch!=expected.daemonEpoch)throw DraftTestStateException("stale-view")
                if(old==null&&reservations.size>=128)throw DraftTestStateException("resource-limit")
                cancel()
                r=TestReservation(old?.source?:CompletableFuture(),form.key,expected.daemonEpoch,UUID.randomUUID().toString())
                reservations[slot]=r;visible=r
            }
        }catch(e:Exception){result.completeExceptionally(e);return result.minimalCompletionStage()}
        r.subscription=draft.onChange{synchronized(lock){if(visible===r){cancel();visible=null;publish("idle")}}}
        val request=input.deepCopy().apply{remove("mode");addProperty("requestId",r.requestId);addProperty("draftRevision",revision)}
        // Ports acquire/open sockets on the Project owner's bounded background executor.
        if(!r.source.isDone)try{ports.source(r.key,r.epoch).whenComplete{source,error->if(error!=null)r.source.completeExceptionally(error)else r.source.complete(source)}}catch(e:Exception){r.source.completeExceptionally(e)}
        val response=r.source.thenCompose{source->synchronized(r){
            if(r.canceled)CompletableFuture.failedFuture<JsonElement>(DraftTestStateException("canceled"))
            else{r.started=true;source.run(request)}
        }}
        synchronized(lock){if(!disposed&&visible===r&&!r.canceled)publish("testing")}
        response.whenComplete{reply,error->
            val parsed=if(error==null)runCatching{ConnectionProtocol.testResult(reply,ReplyExpectation(key=r.key,daemonEpoch=r.epoch,requestId=r.requestId,draftRevision=revision))}.getOrNull()else null
            // Never hold the controller lock while acquiring a form's monitor (edit callbacks reverse that order).
            val currentDraft=draft.view
            synchronized(lock){
                if(!disposed&&visible===r&&!r.canceled&&identity==expected&&currentDraft.key==r.key&&currentDraft.draftRevision==revision){
                    if(parsed==null)publish("unavailable",true)else publish(parsed.status,parsed.status!="reachable",parsed.tookMs)
                }
                if(parsed?.status=="reachable"&&reservations[slot]===r)reservations.remove(slot)
                r.pending=false
                if(visible!==r||r.canceled){r.subscription?.close();r.subscription=null}
                result.complete(state)
            }
        }
        return result.minimalCompletionStage()
    }
    fun endTemporary()=synchronized(lock){
        if(visible?.key?.scope=="temporary"){cancel();visible=null;publish("idle")}
        val iterator=reservations.iterator()
        while(iterator.hasNext()){val r=iterator.next().value;if(r.key.scope=="temporary"){stop(r);iterator.remove()}}
    }
    override fun close()=synchronized(lock){if(disposed)return@synchronized
        cancel();disposed=true;reservations.values.forEach(::stop);reservations.clear();identity=null;visible=null;listeners.clear()}
    override fun toString()="ConnectionDraftTests(private)"
}
