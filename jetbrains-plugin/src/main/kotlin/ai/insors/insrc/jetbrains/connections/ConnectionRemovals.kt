package ai.insors.insrc.jetbrains.connections

import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicLong

data class RemovalSelection(val key:ConnectionKey,val expectedRevision:String)
data class RemovalConfirmation(val key:ConnectionKey,val expectedRevision:String,val action:String,val message:String)
data class RemovalCard(val key:ConnectionKey,val operationId:String,val state:String,val safeMessage:String,val credentialCleanup:String?=null,val resourceCleanup:String?=null)
data class RemovalPromptView(val confirmation:RemovalConfirmation?,val resolveDirty:Boolean)

/** Native rendering of the unchanged sc6 contract. No daemon authority or JavaScript execution. */
fun removalConfirmation(key:ConnectionKey,revision:String):RemovalConfirmation {
    if(key.scope !in setOf("saved","temporary")||listOf(key.repoRoot,key.id,revision).any{it.isEmpty()||it.length>16384||it.any{c->c.code<32}})throw MutationStateException("invalid-state")
    return RemovalConfirmation(key.copy(),revision,if(key.scope=="saved")"Delete"else"Discard",if(key.scope=="saved")
        "Delete this saved registration and its obsolete application-owned credentials. Source files, databases, tables and remote data will be preserved."
        else "Discard this temporary registration and release its application-owned resources. Source files, databases, tables and remote data will be preserved.")
}
fun removalDecision(c:RemovalConfirmation,decision:String):RemovalSelection?=if(decision=="confirm")RemovalSelection(c.key.copy(),c.expectedRevision)else null
private fun removalCard(ticket:OperationTicket,state:String,message:String)=RemovalCard(ConnectionKey(ticket.lookupRoot,ticket.scope,ticket.connectionId),ticket.operationId,state,message).also{if(ticket.mode!="remove")throw MutationStateException("invalid-state")}
fun removalInProgress(ticket:OperationTicket)=removalCard(ticket,"removing","Removing the connection registration.")
fun projectRemovalRejection(ticket:OperationTicket,code:String)=when(code){
    "busy"->removalCard(ticket,"busy","The connection is currently in use. Retry after the current work finishes.")
    "conflict"->removalCard(ticket,"conflict","The connection revision changed. Refresh before confirming removal again.")
    else->removalCard(ticket,"unknown","The removal outcome is unknown. Reconcile using the same operation.")
}
fun projectRemovalState(ticket:OperationTicket,status:OperationStatus,resourceCleanup:String="pending"):RemovalCard {
    val unknown=projectRemovalRejection(ticket,"unknown")
    if(status !is OperationStatus.Committed)return unknown
    val outcome=status.value
    if(outcome.operationId!=ticket.operationId||outcome.registration!="removed"||outcome.activation!="not-applicable"||resourceCleanup !in setOf("complete","pending"))throw MutationStateException("invalid-state")
    val pending=outcome.credentialCleanup!="complete"||resourceCleanup!="complete"
    return unknown.copy(state=if(pending)"removed-cleanup-pending"else"removed",safeMessage=if(pending)"The registration was removed. Application-owned cleanup is pending."else"The registration was removed. Source data was preserved.",credentialCleanup=outcome.credentialCleanup,resourceCleanup=resourceCleanup)
}

/** View confirmation closes independently of the Project-memory signed operation cards. */
class ConnectionRemovals(@Transient private val controller:ConnectionMutationController):AutoCloseable {
    @Transient private val lock=Any()
    @Transient private var confirmation:RemovalConfirmation?=null
    @Transient private var dirty:ConnectionDraft?=null
    @Transient private val listeners=CopyOnWriteArraySet<()->Unit>()
    @Transient private val sequence=AtomicLong()
    @Transient private var closed=false
    @Transient private val subscription=controller.onChange{emit()}
    val view:RemovalPromptView get()=synchronized(lock){RemovalPromptView(if(dirty==null)confirmation else null,dirty!=null)}
    val records:List<MutationRecordView> get()=controller.records.filter{it.mode=="remove"}
    val generation:Long get()=sequence.get()
    private fun admit(){if(closed)throw MutationStateException("disposed")}
    private fun emit(){sequence.incrementAndGet();listeners.forEach{runCatching{it()}}}
    fun onChange(listener:()->Unit):AutoCloseable {synchronized(lock){admit();listeners.add(listener)};return AutoCloseable{listeners.remove(listener)}}
    fun begin(row:SafeConnection,draft:ConnectionDraft?=null)=synchronized(lock){
        admit();if(controller.isBlocked(row.key))throw MutationStateException("busy")
        if(confirmation!=null||draft?.view?.confirmDiscard==true)throw MutationStateException("invalid-state")
        val captured=removalConfirmation(row.key,row.revision)
        if(draft?.dirty==true){draft.requestExit(DraftNavigation("remove",key=captured.key,revision=captured.expectedRevision));dirty=draft}
        confirmation=captured;emit()
    }
    fun resolveDirty(decision:String)=synchronized(lock){
        admit();val draft=dirty?:throw MutationStateException("invalid-state")
        val effects=draft.decideDiscard(decision);dirty=null
        if(decision=="cancel"||effects.size!=1||effects[0].target.type!="remove")confirmation=null
        emit()
    }
    fun decide(decision:String):CompletionStage<MutationRecordView?> {
        val selection=try{synchronized(lock){admit();if(dirty!=null)throw MutationStateException("invalid-state")
            val captured=confirmation?:throw MutationStateException("invalid-state");confirmation=null;emit();removalDecision(captured,decision)}}
        catch(e:Exception){return CompletableFuture.failedFuture(e)}
        return if(selection==null)CompletableFuture.completedFuture(null)else controller.remove(selection).thenApply{it}
    }
    fun cancel()=synchronized(lock){admit();runCatching{dirty?.decideDiscard("cancel")};dirty=null;confirmation=null;emit()}
    override fun close()=synchronized(lock){if(closed)return@synchronized;cancel();closed=true;subscription.close();listeners.clear()}
    override fun toString()="ConnectionRemovals(private)"
}
