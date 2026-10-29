package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import java.time.Instant
import java.util.Collections
import java.util.concurrent.*

class MutationStateException(val code:String):IllegalStateException("The connection operation cannot proceed in its current state.")
data class MutationRecordView(val recordId:String,val key:ConnectionKey,val mode:String,val phase:String,val operationId:String?,val outcome:CommittedOutcome?,val busy:Boolean,val refresh:String,val errorCode:String?,val canReplay:Boolean,val canDismiss:Boolean,val removal:RemovalCard?=null)
interface MutationRefreshDelivery {fun success(rows:List<SafeConnection>)
    fun failed()}
internal data class MutationPorts(
    val call:(ConnectionKey,String,JsonElement,String?)->CompletionStage<JsonElement>,
    val refresh:(ConnectionKey,String)->CompletionStage<JsonElement>,
    val sessionStamp:(ConnectionKey)->String?,
    val now:()->Long=System::currentTimeMillis,
    val timer:((()->Unit,Long)->AutoCloseable)?=null,
    val expireTemporary:()->Unit={},
)

/** Project-memory signed attempts; no Settings, disk, logs or JavaScript runtime. */
class ConnectionMutationController internal constructor(@Transient private val ports:MutationPorts):AutoCloseable {
    companion object {
        const val MAX_RECORDS=64
        const val MAX_ATTEMPT_BYTES=16*1024*1024
        const val MAX_POLLS=5
        private const val PREFIX="db.connections.v2."
        private val blocking=setOf("ticketing","submitting","unknown","pending","not-seen","reconciliation-required")
    }
    private class Attempt(val id:String,val key:ConnectionKey,val mode:String,val stamp:String?,var input:String?,var clearDraft:(()->Unit)?,var bytes:Int) {
        var phase="ticketing"
        var busy=true
        var operationId:String?=null
        var ticket:OperationTicket?=null
        var request:String?=null
        var outcome:CommittedOutcome?=null
        var removal:RemovalCard?=null
        var refresh="not-started"
        var errorCode:String?=null
        var polls=0
        var timer:AutoCloseable?=null
        override fun toString()="Attempt(private)"
    }
    @Transient private val lock=Any()
    @Transient private var closed=false
    @Transient private var next=0L
    @Transient private var bytes=0
    @Transient private val attempts=linkedMapOf<String,Attempt>()
    @Transient private val listeners=CopyOnWriteArraySet<()->Unit>()
    @Transient private val observers=CopyOnWriteArraySet<(ConnectionKey,String)->MutationRefreshDelivery?>()
    @Transient private val pending=ConcurrentHashMap.newKeySet<CompletableFuture<*>>()
    @Transient private val worker=ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue(64),{task->Thread(task,"insrc-project-mutations").apply{isDaemon=true}})
    @Transient private val scheduler=ScheduledThreadPoolExecutor(1){task->Thread(task,"insrc-project-mutation-status").apply{isDaemon=true}}.apply{removeOnCancelPolicy=true}
    @Transient private var disposal=CompletableFuture.completedFuture<Void>(null)
    private fun admit(){if(closed)throw MutationStateException("disposed")}
    private fun active(r:Attempt)=synchronized(lock){!closed&&attempts[r.id]===r&&r.phase!="session-ended"}
    private fun unexpired(r:Attempt)=r.ticket?.let{ports.now()<Instant.parse(it.expiresAt).toEpochMilli()}==true
    private fun view(r:Attempt):MutationRecordView=synchronized(lock){
        val dismiss=!r.busy&&(r.phase in setOf("ticket-error","rejected","session-ended")||r.phase=="committed"&&r.outcome?.credentialCleanup=="complete"&&r.outcome?.activation in setOf("active","not-applicable")&&r.refresh=="complete"&&(r.mode!="remove"||r.removal?.state=="removed"))
        MutationRecordView(r.id,r.key.copy(),r.mode,r.phase,r.operationId,r.outcome?.copy(),r.busy,r.refresh,r.errorCode,!r.busy&&r.phase=="not-seen"&&r.request!=null&&unexpired(r),dismiss,r.removal?.copy(key=r.key.copy()))
    }
    val records:List<MutationRecordView> get()=synchronized(lock){Collections.unmodifiableList(attempts.values.map{view(it)})}
    fun record(id:String):MutationRecordView=synchronized(lock){admit()
        view(attempts[id]?:throw MutationStateException("invalid-state"))}
    fun isBlocked(key:ConnectionKey)=synchronized(lock){attempts.values.any{it.key==key&&(it.busy||it.phase in blocking)}}
    fun onChange(listener:()->Unit):AutoCloseable{synchronized(lock){admit()
            listeners.add(listener)}
        return AutoCloseable{listeners.remove(listener)}}
    fun observeRefresh(observer:(ConnectionKey,String)->MutationRefreshDelivery?):AutoCloseable{synchronized(lock){admit()
            observers.add(observer)}
        return AutoCloseable{observers.remove(observer)}}
    private fun emit(){listeners.forEach{runCatching{it()}}}
    private fun release(r:Attempt){bytes-=r.bytes
        r.bytes=0
        r.input=null
        r.request=null}
    private fun clear(r:Attempt){val clear=r.clearDraft
        r.clearDraft=null
        runCatching{clear?.invoke()}}
    private fun expectation(r:Attempt)=ReplyExpectation(key=r.key,operationId=r.operationId,mode=r.mode)
    private fun await(stage:CompletionStage<JsonElement>):JsonElement=try{stage.toCompletableFuture().get(16,TimeUnit.SECONDS)}catch(e:ExecutionException){throw e.cause?:e}
    private fun ticketJson(t:OperationTicket)=JsonObject().apply{addProperty("operationId",t.operationId)
        addProperty("lookupRoot",t.lookupRoot)
        addProperty("scope",t.scope)
        addProperty("connectionId",t.connectionId)
        addProperty("mode",t.mode)
        addProperty("issuedAt",t.issuedAt)
        addProperty("expiresAt",t.expiresAt)
        addProperty("signature",t.signature)}
    private fun keyJson(k:ConnectionKey)=JsonObject().apply{addProperty("repoRoot",k.repoRoot)
        addProperty("scope",k.scope)
        addProperty("id",k.id)}
    private fun launch(r:Attempt,body:()->Unit):CompletionStage<MutationRecordView>{
        val result=CompletableFuture<MutationRecordView>()
        pending.add(result)
        try{worker.execute{
            var failure:Throwable?=null
            try{synchronized(lock){admit()}
                    body()}catch(e:Throwable){failure=e}
            finally{synchronized(lock){r.busy=false}
                    pending.remove(result)
                    emit()}
            if(failure!=null)result.completeExceptionally(failure)else result.complete(view(r))
        }}catch(_:RejectedExecutionException){
            synchronized(lock){r.busy=false
                if(r.phase=="ticketing"){r.phase="ticket-error"
                    r.errorCode="resource-limit"
                    release(r)}}
            pending.remove(result)
            result.completeExceptionally(MutationStateException("resource-limit"))
            emit()
        }
        return result.minimalCompletionStage()
    }
    fun submit(draft:ConnectionDraft):CompletionStage<MutationRecordView> = try{submitInput(draft.serialize()){draft.clear()}}catch(e:Exception){CompletableFuture.failedFuture(e)}
    fun remove(selection:RemovalSelection):CompletionStage<MutationRecordView> = try {
        val captured=removalConfirmation(selection.key,selection.expectedRevision)
        submitInput(JsonObject().apply{add("key",keyJson(captured.key));addProperty("mode","remove");addProperty("expectedRevision",captured.expectedRevision)},null)
    }catch(e:Exception){CompletableFuture.failedFuture(e)}
    private fun submitInput(value:JsonObject,clearDraft:(()->Unit)?):CompletionStage<MutationRecordView> = try {
        val input=ConnectionProtocol.requestData(value).asJsonObject
        val key=input.getAsJsonObject("key").let{ConnectionKey(it["repoRoot"].asString,it["scope"].asString,it["id"].asString)}
        val text=input.toString()
        val size=text.toByteArray(Charsets.UTF_8).size
        val r=synchronized(lock){
            admit()
            if(isBlocked(key))throw MutationStateException("busy")
            if(attempts.size>=MAX_RECORDS||bytes+size>MAX_ATTEMPT_BYTES||next>=9007199254740991L)throw MutationStateException("resource-limit")
            Attempt("operation-${++next}",key,input["mode"].asString,ports.sessionStamp(key),text,clearDraft,size).also{attempts[it.id]=it
                bytes+=size}
        }
        emit()
        launch(r){
            try{
                val raw=await(ports.call(r.key,PREFIX+"ticket",JsonObject().apply{add("key",keyJson(r.key))
                    addProperty("mode",r.mode)},r.stamp))
                if(!active(r))return@launch
                val ticket=ConnectionProtocol.ticket(raw,ReplyExpectation(key=r.key,mode=r.mode))
                synchronized(lock){
                    if(!active(r))return@launch
                    if(attempts.values.any{it!==r&&it.operationId==ticket.operationId})throw MutationStateException("invalid-state")
                    r.ticket=ticket
                    r.operationId=ticket.operationId
                    if(!unexpired(r)){r.phase="reconciliation-required"
                        r.errorCode="reconciliation-required"
                        release(r)
                        return@launch}
                    val request=ConnectionProtocol.parseData(text).asJsonObject.apply{add("ticket",ticketJson(ticket))
                        addProperty("operationId",ticket.operationId)}.toString()
                    val requestBytes=request.toByteArray(Charsets.UTF_8).size
                    if(bytes-r.bytes+requestBytes>MAX_ATTEMPT_BYTES)throw MutationStateException("resource-limit")
                    bytes+=requestBytes-r.bytes
                    r.bytes=requestBytes
                    r.request=request
                    r.input=null
                }
                mutate(r)
            }catch(_:Exception){synchronized(lock){if(active(r)&&r.phase=="ticketing"){r.phase="ticket-error"
                        r.errorCode="invalid-response"
                        r.ticket=null
                        release(r)}}}
        }
    }catch(e:Exception){CompletableFuture.failedFuture<MutationRecordView>(e).minimalCompletionStage()}
    private fun mutate(r:Attempt){
        val request=synchronized(lock){if(!active(r)||r.request==null)return
            if(r.mode=="remove")r.removal=removalInProgress(r.ticket!!)
            r.phase="submitting"
            r.errorCode=null
            r.request!!}
        emit()
        try{
            val result=ConnectionProtocol.mutation(await(ports.call(r.key,PREFIX+"mutate",ConnectionProtocol.parseData(request),r.stamp)),expectation(r))
            if(!active(r))return
            when(result){
                is MutationReply.Committed -> commit(r,result.value)
                is MutationReply.Rejected -> {
                    if(result.code=="session-expired"&&r.key.scope=="temporary"){ports.expireTemporary()
                        endTemporary()
                        return}
                    synchronized(lock){if(!active(r))return
                        r.errorCode=result.code
                        if(r.mode=="remove"&&r.ticket!=null)r.removal=projectRemovalRejection(r.ticket!!,result.code)
                        r.phase=if(result.code in setOf("reconciliation-required","recovery-required","operation-mismatch"))"reconciliation-required"else"rejected"
                        if(r.phase=="rejected"){r.ticket=null
                            release(r)}}
                }
            }
        }catch(_:Exception){synchronized(lock){if(active(r)){r.phase="unknown"
                    if(r.mode=="remove"&&r.ticket!=null)r.removal=projectRemovalState(r.ticket!!,OperationStatus.Uncommitted("pending"))
                    r.errorCode="transport-error"}}}
    }
    private fun commit(r:Attempt,value:CommittedOutcome){
        synchronized(lock){
            if(!active(r))return
            r.outcome?.let{if(value.revision!=it.revision||value.registration!=it.registration)throw MutationStateException("invalid-state")}
            r.outcome=value.copy()
            r.phase="committed"
            if(r.mode=="remove")r.removal=projectRemovalState(r.ticket!!,OperationStatus.Committed(value))
            r.errorCode=null
            release(r)
            clear(r)
            r.timer?.close()
            r.timer=null
        }
        emit()
        if(r.mode=="remove")removalState(r,false)
        refresh(r)
    }
    private fun removalState(r:Attempt,retry:Boolean) {
        val ticket=synchronized(lock){if(!active(r)||r.mode!="remove"||r.outcome==null||r.ticket==null)throw MutationStateException("invalid-state");r.ticket!!}
        try {
            val value=ConnectionProtocol.removal(await(ports.call(r.key,PREFIX+if(retry)"retryRemovalCleanup"else"removalState",JsonObject().apply{add("ticket",ticketJson(ticket))},r.stamp)),expectation(r))
            synchronized(lock){if(!active(r))return
                if(value.state !in setOf("removed","removed-cleanup-pending"))throw MutationStateException("invalid-state")
                r.outcome=r.outcome!!.copy(credentialCleanup=value.credentialCleanup!!)
                r.removal=projectRemovalState(ticket,OperationStatus.Committed(r.outcome!!),value.resourceCleanup!!);r.errorCode=null}
        }catch(_:Exception){synchronized(lock){if(active(r))r.errorCode="transport-error"}}
    }
    private fun refresh(r:Attempt){
        val revision=synchronized(lock){if(!active(r)||r.outcome==null)return
            r.refresh="pending"
            r.outcome!!.revision}
        val deliveries=observers.mapNotNull{runCatching{it(r.key,revision)}.getOrNull()}
        emit()
        try{
            val rows=ConnectionProtocol.list(await(ports.refresh(r.key,revision)),r.key.repoRoot)
            synchronized(lock){if(!active(r))return
                r.refresh="complete"}
            deliveries.forEach{runCatching{it.success(rows)}}
        }catch(_:Exception){synchronized(lock){if(!active(r))return
                r.refresh="failed"}
            deliveries.forEach{runCatching{it.failed()}}}
    }
    private fun action(id:String,body:(Attempt)->Unit):CompletionStage<MutationRecordView> = try {
        val r=synchronized(lock){admit()
            val r=attempts[id]?:throw MutationStateException("invalid-state")
            if(r.busy)throw MutationStateException("busy")
            r.busy=true
            r.timer?.close()
            r.timer=null
            r}
        emit()
        launch(r){body(r)}
    }catch(e:Exception){CompletableFuture.failedFuture<MutationRecordView>(e).minimalCompletionStage()}
    fun reconcile(id:String):CompletionStage<MutationRecordView> = action(id){r->synchronized(lock){r.polls=0}
        status(r)}
    private fun status(r:Attempt){
        val (ticket,known)=synchronized(lock){if(!active(r)||r.ticket==null)throw MutationStateException("invalid-state")
            r.ticket!! to r.outcome}
        try{
            val result=ConnectionProtocol.status(await(ports.call(r.key,PREFIX+"status",JsonObject().apply{add("ticket",ticketJson(ticket))},r.stamp)),expectation(r))
            if(!active(r))return
            when(result){
                is OperationStatus.Committed -> if(known==null)commit(r,result.value)else {synchronized(lock){if(!active(r))return
                    if(result.value.revision!=known.revision||result.value.registration!=known.registration)throw MutationStateException("invalid-state")
                    r.outcome=result.value.copy()
                    r.errorCode=null};if(r.mode=="remove")removalState(r,false)}
                is OperationStatus.Uncommitted -> synchronized(lock){if(!active(r))return
                    if(known!=null)r.errorCode="reconciliation-required"else{r.phase=if(result.status=="not-seen"&&!unexpired(r))"reconciliation-required"else result.status
                        if(r.mode=="remove")r.removal=projectRemovalState(ticket,result)
                        r.errorCode=if(r.phase=="reconciliation-required")"reconciliation-required"else null
                        if(r.phase=="pending")schedule(r)}}
            }
        }catch(_:Exception){synchronized(lock){if(active(r)){if(known==null)r.phase="unknown"
                    r.errorCode="transport-error"}}}
    }
    private fun schedule(r:Attempt){
        if(r.polls>=MAX_POLLS||r.timer!=null||!active(r))return
        val delay=minOf(16000L,1000L shl r.polls++)
        val callback={synchronized(lock){r.timer=null}
            if(active(r))action(r.id){status(it)}
            Unit}
        r.timer=ports.timer?.invoke(callback,delay)?:scheduler.schedule(callback,delay,TimeUnit.MILLISECONDS).let{AutoCloseable{it.cancel(false)}}
    }
    fun replay(id:String):CompletionStage<MutationRecordView> = action(id){r->
        synchronized(lock){if(r.phase!="not-seen"||r.request==null||r.ticket==null)throw MutationStateException("invalid-state")
            if(!unexpired(r)){r.phase="reconciliation-required"
                r.errorCode="reconciliation-required"
                return@action}}
        mutate(r)
    }
    fun retryRefresh(id:String):CompletionStage<MutationRecordView> = action(id){r->synchronized(lock){if(r.phase!="committed"||r.outcome==null)throw MutationStateException("invalid-state")}
        refresh(r)}
    fun retryActivation(id:String):CompletionStage<MutationRecordView> = action(id){r->
        val known=synchronized(lock){r.outcome?.takeIf{r.phase=="committed"&&it.activation !in setOf("active","not-applicable")}?:throw MutationStateException("invalid-state")}
        try{
            val result=ConnectionProtocol.mutation(await(ports.call(r.key,PREFIX+"activate",JsonObject().apply{add("key",keyJson(r.key))
                addProperty("committedRevision",known.revision)},r.stamp)),expectation(r))
            synchronized(lock){if(!active(r))return@action
                if(result !is MutationReply.Committed||result.value.revision!=known.revision||result.value.registration!=known.registration)throw MutationStateException("invalid-state")
                r.outcome=result.value.copy()
                r.errorCode=null}
        }catch(_:Exception){synchronized(lock){if(active(r))r.errorCode="transport-error"}}
    }
    fun retryCleanup(id:String):CompletionStage<MutationRecordView> = action(id){r->synchronized(lock){if(r.phase!="committed"||r.outcome==null||if(r.mode=="remove")r.removal?.state!="removed-cleanup-pending"else r.outcome?.credentialCleanup!="pending")throw MutationStateException("invalid-state")}
        if(r.mode=="remove")removalState(r,true)else status(r)}
    fun endTemporary(){
        synchronized(lock){attempts.values.filter{it.key.scope=="temporary"&&it.phase!="session-ended"}.forEach{r->r.timer?.close()
                r.timer=null
                r.phase="session-ended"
                r.ticket=null
                r.outcome=null
                r.removal=null
                r.errorCode="session-expired"
                release(r)
                clear(r)}}
        emit()
    }
    fun dismiss(id:String){synchronized(lock){admit()
            val r=attempts[id]?:throw MutationStateException("invalid-state")
            if(!view(r).canDismiss)throw MutationStateException("invalid-state")
            release(r)
            r.ticket=null
            r.clearDraft=null
            attempts.remove(id)}
        emit()}
    override fun close(){
        synchronized(lock){if(closed)return
            closed=true
            attempts.values.forEach{it.timer?.close()
                release(it)
                it.ticket=null
                clear(it)}
            attempts.clear()
            disposal=CompletableFuture()}
        listeners.clear()
        observers.clear()
        pending.forEach{it.completeExceptionally(MutationStateException("disposed"))}
        pending.clear()
        worker.shutdownNow()
        scheduler.shutdownNow()
        Thread({val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3)
            try{val first=worker.awaitTermination(3,TimeUnit.SECONDS)
                val second=scheduler.awaitTermination(maxOf(0,until-System.nanoTime()),TimeUnit.NANOSECONDS)
                if(first&&second)disposal.complete(null)else disposal.completeExceptionally(MutationStateException("teardown"))}catch(_:Exception){disposal.completeExceptionally(MutationStateException("teardown"))}},"insrc-project-mutation-end").apply{isDaemon=true
            start()}
    }
    fun whenDisposed():CompletionStage<Void> = disposal.minimalCompletionStage()
    override fun toString()="ConnectionMutationController(private)"
}
