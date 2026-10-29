package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.daemon.ConnectionLaneCall
import ai.insors.insrc.jetbrains.daemon.ConnectionLaneException
import ai.insors.insrc.jetbrains.daemon.PersistentDaemonLane
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicLong

/** Actual Project identity is supplied by the platform container, never a JSON owner hint. */
@Service(Service.Level.PROJECT)
class ConnectionsSessionService(private val project: Project) : Disposable {
    private var owner = ConnectionsSessionOwner(alive = { !project.isDisposed })
    val view: ConnectionOwnerView get() = owner.view
    fun setRegisteredRoots(roots: List<String>) = owner.setRegisteredRoots(roots)
    fun selectRoot(root: String): CompletionStage<ConnectionOwnerView> = owner.selectRoot(root)
    fun requestTemporary(root: String, identity: ConnectionOwnerView, method: String, params: JsonElement): ConnectionLaneCall = owner.requestTemporary(root, identity, method, params)
    fun requestSaved(root: String, method: String, params: JsonElement): ConnectionLaneCall = owner.requestSaved(root, method, params)
    /** UI subscribers run on EDT; disposed views remove only their subscription. */
    fun onChange(listener: (ConnectionOwnerView) -> Unit): AutoCloseable = owner.onChange { view ->
        val app = ApplicationManager.getApplication()
        val deliver = Runnable { if (!project.isDisposed && view.generation == owner.view.generation) listener(view) }
        if (app.isDispatchThread) deliver.run() else app.invokeLater(deliver)
    }
    /** Private controller erasure is synchronous; it must not wait for EDT delivery. */
    fun onTemporaryInvalidated(listener: () -> Unit): AutoCloseable = owner.onTemporaryInvalidated(listener)
    override fun dispose() = owner.close()
    fun whenDisposed(): CompletionStage<Void> = owner.whenDisposed()
    /** Per-instance transport/clock seam, installable only before any root/session work. */
    internal fun installFixturePorts(ports: ConnectionOwnerPorts) {
        check(owner.view.status == "idle"); owner.close(); owner = ConnectionsSessionOwner(ports) { !project.isDisposed }
    }
}

data class ConnectionOwnerView(val status: String, val repoRoot: String?, val daemonEpoch: String?, val generation: Long)
class ConnectionOwnerException(val code: String) : IllegalStateException("The connection manager is unavailable.")
internal data class ConnectionOwnerPorts(
    val openLane: () -> PersistentDaemonLane = { PersistentDaemonLane.open() },
    val now: () -> Long = { System.nanoTime() / 1_000_000 },
    val timer: ((() -> Unit, Long) -> AutoCloseable)? = null,
)
private data class SessionAuthority(val sessionHandle: String, val capability: String, val daemonEpoch: String) {
    fun payload() = JsonObject().apply { addProperty("sessionHandle",sessionHandle);addProperty("capability",capability);addProperty("daemonEpoch",daemonEpoch) }
    override fun toString() = "SessionAuthority(private)"
}

/** Native background orchestrator. All socket waits occur on its owned worker/scheduler threads. */
internal class ConnectionsSessionOwner(private val ports: ConnectionOwnerPorts = ConnectionOwnerPorts(), private val alive: () -> Boolean = { true }) : AutoCloseable {
    companion object { private const val PREFIX="db.connections.v2."
        private val methods=setOf("capabilities","drivers","list","read","ticket","mutate","status","activate","removalState","retryRemovalCleanup","test","cancelTest").map { PREFIX+it }.toSet()
    }
    private val lock=Any()
    @Volatile private var disposed=false
    @Volatile private var roots=setOf<String>()
    @Volatile private var root:String?=null
    @Volatile private var epoch:String?=null
    @Volatile private var status="idle"
    @Volatile private var control:PersistentDaemonLane?=null
    @Volatile private var authority:SessionAuthority?=null
    @Volatile private var deadline=0L
    private val generation=AtomicLong()
    private val data=ConcurrentHashMap<String,PersistentDaemonLane>()
    private val saved=ConcurrentHashMap<String,PersistentDaemonLane>()
    private val owned=ConcurrentHashMap.newKeySet<PersistentDaemonLane>()
    private val listeners=CopyOnWriteArraySet<(ConnectionOwnerView)->Unit>()
    private val invalidations=CopyOnWriteArraySet<()->Unit>()
    private val pending=ConcurrentHashMap.newKeySet<CompletableFuture<*>>()
    private val worker=ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue(64),{task->Thread(task,"insrc-project-connections").apply{isDaemon=true}})
    private val scheduler=ScheduledThreadPoolExecutor(2) {task->Thread(task,"insrc-project-connection-lease").apply{isDaemon=true}}.apply{removeOnCancelPolicy=true}
    private var heartbeat:AutoCloseable?=null
    private var expiry:AutoCloseable?=null
    @Volatile private var disposal=CompletableFuture.completedFuture<Void>(null)
    val view:ConnectionOwnerView get()=ConnectionOwnerView(status,root,epoch,generation.get())
    private fun admit(root:String?=null) {if(disposed||!alive())throw ConnectionOwnerException("disposed");if(root!=null&&root !in roots)throw ConnectionOwnerException("invalid-request")}
    private fun openLane():PersistentDaemonLane = synchronized(lock) {
        admit();owned.removeIf{it.isClosed&&it.awaitClosed(0)}
        if(owned.size>=256)throw ConnectionOwnerException("offline")
        ports.openLane().also{owned.add(it)}
    }
    fun onChange(listener:(ConnectionOwnerView)->Unit):AutoCloseable {admit();listeners.add(listener);return AutoCloseable{listeners.remove(listener)}}
    fun onTemporaryInvalidated(listener:()->Unit):AutoCloseable {admit();invalidations.add(listener);return AutoCloseable{invalidations.remove(listener)}}
    private fun emit() {generation.incrementAndGet();val view=view;listeners.forEach{runCatching{it(view)}}}
    private fun timer(ms:Long,block:()->Unit):AutoCloseable = ports.timer?.invoke(block,maxOf(0,ms)) ?: scheduler.schedule(block,maxOf(0,ms),TimeUnit.MILLISECONDS).let{future->AutoCloseable{future.cancel(false)}}
    fun setRegisteredRoots(values:List<String>) {
        admit();require(values.size<=16384&&values.all{it.isNotEmpty()&&it.length<=16384&&it.none{c->c.code<32}})
        roots=values.toSet()
        for(map in listOf(data,saved))for((r,lane)in map)if(r !in roots&&map.remove(r,lane))lane.close()
        if(root!=null&&root !in roots){root=null;emit()}
    }
    private fun dropData():List<PersistentDaemonLane> = synchronized(lock){val lanes=data.values.toList();data.clear();lanes}
    private fun cancelTimers() {heartbeat?.close();heartbeat=null;expiry?.close();expiry=null}
    private fun invalidate(next:String,clearEpoch:Boolean=false,expectedDeadline:Long?=null) {
        val old:PersistentDaemonLane?
        synchronized(lock){if(disposed||authority==null&&control==null&&status==next&&!clearEpoch||expectedDeadline!=null&&(deadline!=expectedDeadline||ports.now()<expectedDeadline))return;cancelTimers();authority=null;deadline=0;old=control;control=null;status=next;if(clearEpoch)epoch=null}
        dropData().forEach{it.close()};old?.close();invalidations.forEach{runCatching{it()}};emit()
    }
    private fun lost(lane:PersistentDaemonLane) {
        synchronized(lock){if(disposed||control!==lane)return;control=null;heartbeat?.close();heartbeat=null;status="offline"}
        dropData().forEach{it.close()};emit()
    }
    private fun <T> current(lane:PersistentDaemonLane,block:()->T):T = synchronized(lock){admit();if(control!==lane||lane.isClosed)throw ConnectionOwnerException("offline");block()}
    private fun renew(lane:PersistentDaemonLane,sent:Long) = current(lane) {
        check(authority!=null);deadline=sent+90000;expiry?.close()
        val expires=deadline
        expiry=timer(deadline-ports.now()){invalidate("expired",expectedDeadline=expires)}
    }
    private fun scheduleHeartbeat() = synchronized(lock) {
        if(heartbeat!=null||disposed||control==null||authority==null)return@synchronized
        heartbeat=timer(30000){synchronized(lock){heartbeat=null};beat()}
    }
    private fun sessionData(value:JsonElement):JsonObject {
        val copy=ConnectionProtocol.requestData(value)
        if(!copy.isJsonObject)throw ConnectionOwnerException("upgrade-required")
        val o=copy.asJsonObject
        if(o["status"]?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isString}?.asString=="rejected") {
            val code=o["code"]?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isString}?.asString
            throw ConnectionOwnerException(if(code=="session-expired")"expired" else if(code=="upgrade-required")"upgrade-required" else "offline")
        }
        return o
    }
    private fun session(value:JsonElement,opened:Boolean):SessionAuthority {
        val o=sessionData(value);val fields=setOf("sessionHandle","capability","daemonEpoch")+if(opened)setOf("heartbeatMs","leaseMs")else emptySet()
        if(o.keySet()!=fields)throw ConnectionOwnerException("upgrade-required")
        fun text(k:String):String {val v=o[k];if(!v.isJsonPrimitive||!v.asJsonPrimitive.isString)throw ConnectionOwnerException("upgrade-required");return v.asString}
        val handle=text("sessionHandle");val capability=text("capability");val epoch=text("daemonEpoch")
        if(!Regex("^[A-Za-z0-9_-]{43}$").matches(handle)||!Regex("^[A-Za-z0-9_-]{43}$").matches(capability)||epoch.isEmpty()||epoch.length>128||epoch.any{it.code<32})throw ConnectionOwnerException("upgrade-required")
        if(opened&&(!o["heartbeatMs"].isJsonPrimitive||!o["heartbeatMs"].asJsonPrimitive.isNumber||o["heartbeatMs"].asDouble!=30000.0||!o["leaseMs"].isJsonPrimitive||!o["leaseMs"].asJsonPrimitive.isNumber||o["leaseMs"].asDouble!=90000.0))throw ConnectionOwnerException("upgrade-required")
        return SessionAuthority(handle,capability,epoch)
    }
    private fun rpc(lane:PersistentDaemonLane,method:String,params:JsonElement=JsonObject()):JsonElement = try {
        lane.request(PREFIX+method,params).result.toCompletableFuture().get(16,TimeUnit.SECONDS)
    }catch(e:ExecutionException){throw e.cause?:e}
    private fun beat() {
        val lane=control?:return;if(disposed||authority==null)return
        try {
            val sent=ports.now();val reply=sessionData(rpc(lane,"session.heartbeat"));current(lane){}
            if(reply.keySet()!=setOf("status","leaseMs")||reply["status"]?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isString}?.asString!="active"||!reply["leaseMs"].isJsonPrimitive||!reply["leaseMs"].asJsonPrimitive.isNumber||reply["leaseMs"].asDouble!=90000.0)throw ConnectionOwnerException("expired")
            renew(lane,sent)
        }catch(e:Exception){if(control===lane){if(e is ConnectionOwnerException)invalidate("expired")else{lane.close();lost(lane)}}}
        finally{scheduleHeartbeat()}
    }
    private fun <T> submit(block:()->T):CompletableFuture<T> {
        val result=CompletableFuture<T>()
        try {admit();pending.add(result);worker.execute {try{admit();result.complete(block())}catch(e:Throwable){result.completeExceptionally(e)}finally{pending.remove(result)}}}
        catch(e:Exception){pending.remove(result);result.completeExceptionally(if(e is RejectedExecutionException)ConnectionOwnerException("offline")else e)}
        return result
    }
    fun selectRoot(selected:String):CompletionStage<ConnectionOwnerView> = submit {
        admit(selected);if(root!=selected){root=selected;emit()};ensure(selected);view
    }.minimalCompletionStage()
    private fun ensure(selected:String,epochRetry:Boolean=false) {
        if(authority!=null&&ports.now()>=deadline)invalidate("expired")
        val reconnect=control==null&&authority!=null
        val (lane,created)=synchronized(lock){admit(selected);control?.let{it to false}?:openLane().also{control=it}.let{it to true}}
        if(created)lane.onClose{lost(lane)}
        try {
            current(lane){}
            val cap=ConnectionProtocol.capabilities(rpc(lane,"capabilities",JsonObject().apply{addProperty("repoRoot",selected)}));current(lane){admit(selected)}
            if(!cap.features.containsAll(listOf("workbench-sessions","session-delegation")))throw ConnectionOwnerException("upgrade-required")
            if(epoch!=null&&epoch!=cap.daemonEpoch){invalidate("expired",true);epoch=cap.daemonEpoch;if(epochRetry)throw ConnectionOwnerException("offline");ensure(selected,true);return}
            epoch=cap.daemonEpoch
            if(authority==null) {
                val sent=ports.now();val opened=session(rpc(lane,"session.open",JsonObject().apply{addProperty("repoRoot",selected)}),true)
                current(lane){if(opened.daemonEpoch!=epoch)throw ConnectionOwnerException("expired");authority=opened};renew(lane,sent)
            }else if(reconnect) {
                val previous=authority?:throw ConnectionOwnerException("expired");val resumed=session(rpc(lane,"session.resume",previous.payload()),true)
                current(lane){if(resumed!=previous)throw ConnectionOwnerException("expired")};beat();current(lane){if(authority==null)throw ConnectionOwnerException("expired")}
            }
            if(!data.containsKey(selected)) {
                if(data.size>=64)throw ConnectionOwnerException("offline")
                val delegated=session(rpc(lane,"session.delegate",JsonObject().apply{addProperty("repoRoot",selected);addProperty("audience","workbench-ui")}),false)
                current(lane){admit(selected);if(delegated.daemonEpoch!=epoch||delegated.sessionHandle!=authority?.sessionHandle)throw ConnectionOwnerException("expired")}
                val attached=openLane()
                try {
                    val reply=sessionData(rpc(attached,"session.attach",delegated.payload().apply{addProperty("repoRoot",selected)}))
                    current(lane){
                        admit(selected)
                        fun exact(k:String,v:String)=reply[k]?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isString}?.asString==v
                        val g=reply["controlGeneration"]
                        if(reply.keySet()!=setOf("attached","daemonEpoch","repoRoot","audience","controlGeneration")||reply["attached"]?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isBoolean}?.asBoolean!=true||!exact("daemonEpoch",epoch!!)||!exact("repoRoot",selected)||!exact("audience","workbench-ui")||g==null||!g.isJsonPrimitive||!g.asJsonPrimitive.isNumber||g.asDouble<1||g.asDouble>9007199254740991.0||g.asDouble%1.0!=0.0||attached.isClosed)throw ConnectionOwnerException("expired")
                        data[selected]=attached
                    }
                    attached.onClose{if(data.remove(selected,attached)){if(root==selected)status="offline";emit()}}
                }catch(e:Exception){attached.close();throw e}
            }
            current(lane){status="ready"};scheduleHeartbeat();emit()
        }catch(e:Exception){
            if(disposed)throw ConnectionOwnerException("disposed")
            if(e is ConnectionOwnerException&&e.code=="expired"){invalidate("expired");throw e}
            if(e is ConnectionOwnerException&&e.code in setOf("offline","invalid-request","stale-view")){if(control===lane){lane.close();lost(lane)};throw e}
            if(e !is ConnectionLaneException||e.code=="remote-error"){invalidate("upgrade-required");throw ConnectionOwnerException("upgrade-required")}
            if(control===lane){lane.close();lost(lane)};throw ConnectionOwnerException("offline")
        }
    }
    private fun params(root:String,method:String,value:JsonElement,temporary:Boolean):JsonObject {
        admit(root);if(method !in methods)throw ConnectionOwnerException("invalid-request")
        val copy=ConnectionProtocol.requestData(value);if(!copy.isJsonObject)throw ConnectionOwnerException("invalid-request");val o=copy.asJsonObject
        if(o.keySet().any{it in setOf("sessionHandle","capability","daemonEpoch","projectId","windowId","trustedContext")})throw ConnectionOwnerException("invalid-request")
        fun text(v:JsonElement?):String?=v?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isString}?.asString
        if(o.has("repoRoot")&&text(o["repoRoot"])!=root)throw ConnectionOwnerException("invalid-request")
        for(field in listOf("key","ticket"))if(o.has(field)){val k=o[field];if(!k.isJsonObject||(text(k.asJsonObject["repoRoot"])?:text(k.asJsonObject["lookupRoot"]))!=root||text(k.asJsonObject["scope"])!=if(temporary)"temporary"else"saved")throw ConnectionOwnerException("invalid-request")}
        return o
    }
    private fun request(root:String,identity:ConnectionOwnerView?,method:String,value:JsonElement,temporary:Boolean):ConnectionLaneCall {
        val result=CompletableFuture<JsonElement>();val callLock=Any();var actual:ConnectionLaneCall?=null;var canceled=false
        val copy=try{params(root,method,value,temporary)}catch(e:Exception){result.completeExceptionally(e);return ConnectionLaneCall(result.minimalCompletionStage()){false}}
        submit {
            admit(root)
            val lane=if(temporary) {
                if(identity?.generation!=generation.get()||identity.daemonEpoch!=epoch||identity.repoRoot!=root)throw ConnectionOwnerException("stale-view")
                if(authority!=null&&ports.now()>=deadline)invalidate("expired")
                if(status!="ready"||authority==null)throw ConnectionOwnerException("expired")
                data[root]?.takeUnless{it.isClosed}?:throw ConnectionOwnerException("offline")
            }else synchronized(lock){admit(root);saved[root]?.takeUnless{it.isClosed}?:run{if(!saved.containsKey(root)&&saved.size>=64)throw ConnectionOwnerException("offline");openLane().also{saved[root]=it}}}
            synchronized(callLock){if(canceled)throw ConnectionLaneException("canceled",false);lane.request(method,copy).also{actual=it}}
        }.whenComplete{_,error->
            // Disposal can race between lane.request() and admission-future completion.
            // Once created, only the lane's own outcome can classify whether bytes were written.
            val created=synchronized(callLock){actual}
            if(created!=null)created.result.whenComplete{answer,failure->if(failure!=null)result.completeExceptionally(failure)else result.complete(answer)}
            else if(error!=null)result.completeExceptionally(error)
        }
        return ConnectionLaneCall(result.minimalCompletionStage()) {synchronized(callLock){if(result.isDone)false else actual?.cancel()?:run{canceled=true;result.completeExceptionally(ConnectionLaneException("canceled",false));true}}}
    }
    fun requestTemporary(root:String,identity:ConnectionOwnerView,method:String,params:JsonElement)=request(root,identity,method,params,true)
    fun requestSaved(root:String,method:String,params:JsonElement)=request(root,null,method,params,false)
    override fun close() {
        val lane:PersistentDaemonLane?
        synchronized(lock){if(disposed)return;disposed=true;cancelTimers();lane=control;control=null;authority=null;status="disposed";disposal=CompletableFuture()}
        dropData().forEach{it.close()};saved.values.forEach{it.close()};saved.clear()
        invalidations.forEach{runCatching{it()}};emit();listeners.clear();invalidations.clear()
        pending.forEach{it.completeExceptionally(ConnectionOwnerException("disposed"))};pending.clear();worker.shutdownNow();scheduler.shutdownNow()
        Thread({
            try {
                if(lane!=null)try{lane.request(PREFIX+"session.end").result.toCompletableFuture().get(1,TimeUnit.SECONDS)}catch(_:Exception){}finally{lane.close()}
                val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3)
                fun remaining()=maxOf(0,until-System.nanoTime())
                val allLanes=owned.toList();allLanes.forEach{it.close()}
                var lanesDrained=true
                allLanes.forEach{if(!it.awaitClosed(TimeUnit.NANOSECONDS.toMillis(remaining())))lanesDrained=false}
                val workerDrained=worker.awaitTermination(remaining(),TimeUnit.NANOSECONDS)
                val schedulerDrained=scheduler.awaitTermination(remaining(),TimeUnit.NANOSECONDS)
                owned.clear()
                if(lanesDrained&&workerDrained&&schedulerDrained)disposal.complete(null)else disposal.completeExceptionally(ConnectionOwnerException("teardown"))
            }catch(_:Exception){owned.forEach{it.close()};disposal.completeExceptionally(ConnectionOwnerException("teardown"))}
        },"insrc-project-connection-end").apply{isDaemon=true;start()}
    }
    fun whenDisposed():CompletionStage<Void> = disposal.minimalCompletionStage()
}
