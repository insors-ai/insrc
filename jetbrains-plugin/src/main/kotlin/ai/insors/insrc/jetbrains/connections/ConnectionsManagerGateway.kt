package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.daemon.ConnectionLaneCall
import com.google.gson.*
import java.util.concurrent.*
import java.util.concurrent.atomic.*

data class ConnectionsManagerView(val generation:Long,val formId:Long,val list:ConnectionsManagerProjection,val draft:ConnectionDraftView?,val choices:List<ConnectionDriverChoice>,val blocked:Boolean,val valid:Boolean,val test:DraftTestView,val operations:List<MutationRecordView>,val confirmation:RemovalConfirmation?,val dirty:Boolean,val error:String,val notice:String,val controls:ConnectionControls=ConnectionControls())

/** One Project-memory editor over the native domain cores. Native panels are disposable subscribers. */
class ConnectionsManagerGateway internal constructor(
    @Transient private val session:ConnectionsSessionService,
    @Transient private val registeredRoots:()->List<String>,
    @Transient private val alive:()->Boolean,
):AutoCloseable {
    @Transient private val lock=Any()
    @Transient private val mutations=session.mutations()
    @Transient private val probes=session.tests()
    @Transient private val removals=session.removals()
    @Transient private val listeners=CopyOnWriteArraySet<()->Unit>()
    @Transient private val subscriptions=mutableListOf<AutoCloseable>()
    @Transient private val version=AtomicLong()
    @Transient private val uiGeneration=AtomicLong()
    @Transient private val views=AtomicInteger()
    @Transient private val registrySequence=AtomicLong()
    @Transient private val readSequence=AtomicLong()
    @Transient private val registryWorker=ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue(64),{task->Thread(task,"insrc-connections-registry").apply{isDaemon=true}})
    @Transient private var model=ConnectionsManagerModel.create(emptyList(),session.view.daemonEpoch?:"")
    @Transient private var draft:ConnectionDraft?=null
    @Transient private var descriptors=emptyList<ConnectionDriverDescriptor>()
    @Transient private var descriptorEpoch=""
    @Transient private var formId=0L
    @Transient private var pending:(()->Unit)?=null
    @Transient private var error=""
    @Transient private var notice=""
    @Transient @Volatile private var closed=false
    @Transient private var activeRead:ConnectionLaneCall?=null
    @Transient private var disposal=CompletableFuture.completedFuture<Void>(null)
    init {
        subscriptions.add(session.onChange{owner->
            if(!live())return@onChange
            if(owner.daemonEpoch!=null&&owner.daemonEpoch!=synchronized(lock){model.daemonEpoch}){synchronized(lock){descriptors=emptyList();descriptorEpoch=""};dispatch(ManagerEvent.Epoch(owner.daemonEpoch))}
            when(owner.status){"offline","expired","disposed"->dispatch(ManagerEvent.Unavailable("offline"));"upgrade-required"->dispatch(ManagerEvent.Unavailable("upgrade-required"))}
        })
        subscriptions.add(session.onTemporaryInvalidated{
            val current=synchronized(lock){draft}
            if(current?.view?.key?.scope=="temporary"){synchronized(lock){if(draft===current){draft=null;pending=null;formId++}};current.clear();bump()}
            runCatching{removals.cancel()};synchronized(lock){notice="Temporary connections expired with their Project. Refresh or choose a registered repository to reconnect."};dispatch(ManagerEvent.TemporaryEnded)
        })
        subscriptions.add(mutations.onChange{emit()});subscriptions.add(probes.onChange{emit()});subscriptions.add(removals.onChange{emit()})
        subscriptions.add(mutations.observeRefresh{key,revision->
            if(!live())return@observeRefresh null
            val remove=mutations.records.any{it.outcome?.revision==revision&&it.mode=="remove"}
            val identity=synchronized(lock){if(model.repoRoot!=key.repoRoot)return@observeRefresh null
                val next=ConnectionsManagerModel.reduce(model,if(remove)ManagerEvent.Refresh else ManagerEvent.CommittedReveal(ConnectionSelection(key,revision)))
                model=next.state;next.effects.firstOrNull()?.let{ManagerReadIdentity(it.repoRoot,it.viewGeneration,it.daemonEpoch)}}?:return@observeRefresh null
            emit()
            object:MutationRefreshDelivery {
                override fun success(rows:List<SafeConnection>){dispatch(ManagerEvent.ListResult(identity,Gson().toJsonTree(rows)))}
                override fun failed(){dispatch(ManagerEvent.ListError(identity,"read-error"))}
            }
        })
    }
    val generation:Long get()=version.get()
    private fun live()= !closed&&alive()
    private fun admit(){if(!live())throw MutationStateException("disposed")}
    private fun emit(){version.incrementAndGet();if(!live())return;listeners.forEach{runCatching{it()}}}
    fun onChange(listener:()->Unit):AutoCloseable {admit();listeners.add(listener);return AutoCloseable{listeners.remove(listener)}}
    /** No controller monitor is held while reading a form or operation core (their callbacks may publish). */
    fun snapshot():ConnectionsManagerView {
        val captured=synchronized(lock){Triple(model,draft,formId)}
        val form=captured.second?.view?.takeUnless{it.discarded}
        val projection=ConnectionsManagerModel.project(captured.first)
        val valid=captured.second?.let{runCatching{it.serialize()}.isSuccess}==true
        val prompt=removals.view
        val features=session.features(projection.repoRoot?:"")
        val records=mutations.records.filter{it.key.repoRoot==projection.repoRoot}
        val controls=ConnectionControls(form?.let{ConnectionActions.supported(features,it.key.scope,it.mode)}==true,form?.let{ConnectionActions.supported(features,it.key.scope,"test")}==true,projection.selected?.let{ConnectionActions.supported(features,it.key.scope,"remove")}==true,records.associate{r->r.recordId to listOf("reconcile","replay","activation","cleanup","refresh","dismiss").filter{ConnectionActions.operation(features,r.key.scope,r.mode,it)}})
        return ConnectionsManagerView(uiGeneration.get(),captured.third,projection,form,connectionDriverChoices(synchronized(lock){descriptors}),form?.let{mutations.isBlocked(it.key)}==true,valid,probes.view,records,prompt.confirmation,synchronized(lock){pending!=null}||prompt.resolveDirty,synchronized(lock){error},synchronized(lock){notice},controls)
    }
    private fun bindProbe(){val current=synchronized(lock){draft};val epoch=session.view.daemonEpoch
        runCatching{probes.setView(if(views.get()>0&&current!=null&&!current.view.discarded&&epoch!=null)DraftTestIdentity(current.view.key,epoch,uiGeneration.get())else null)}}
    private fun bump(){uiGeneration.incrementAndGet();bindProbe()}
    fun attach():AutoCloseable {admit();views.incrementAndGet();bump();open()
        val attached=AtomicBoolean(true)
        return AutoCloseable{if(attached.compareAndSet(true,false)){views.decrementAndGet();runCatching{probes.cancel()};bump();emit()}}}
    fun suspendView(){runCatching{probes.setView(null)}}
    fun resumeView(){if(live()){bump();emit()}}
    fun open(){
        admit();val sequence=registrySequence.incrementAndGet()
        try{registryWorker.execute{
            try{val roots=registeredRoots();if(!live()||registrySequence.get()!=sequence)return@execute
                session.setRegisteredRoots(roots);dispatch(ManagerEvent.RegisteredRoots(roots))
                val current=synchronized(lock){draft};if(current!=null&&current.view.key.repoRoot !in roots){synchronized(lock){if(draft===current)draft=null};current.clear();bump()}
                if(synchronized(lock){model.repoRoot}!=null)dispatch(ManagerEvent.Refresh)
            }catch(_:Exception){if(live()&&registrySequence.get()==sequence){synchronized(lock){error="Registered repositories are unavailable. Reconnect the daemon and reopen Connections."};dispatch(ManagerEvent.Unavailable("offline"))}}
        }}catch(_:RejectedExecutionException){synchronized(lock){error="The connection manager is busy. Retry after current work finishes."};emit()}
    }
    private fun dispatch(event:ManagerEvent){if(!live())return
        val effects=synchronized(lock){val next=ConnectionsManagerModel.reduce(model,event);model=next.state;next.effects}
        emit();effects.forEach(::load)
    }
    private fun load(effect:ManagerEffect){
        val sequence=readSequence.incrementAndGet();synchronized(lock){activeRead?.cancel();activeRead=null}
        val identity=ManagerReadIdentity(effect.repoRoot,effect.viewGeneration,effect.daemonEpoch)
        fun current()=live()&&readSequence.get()==sequence
        val work=session.selectRoot(effect.repoRoot).thenCompose{owner->
            if(!current())return@thenCompose CompletableFuture.failedFuture<JsonElement>(CancellationException())
            if(owner.daemonEpoch!=effect.daemonEpoch){owner.daemonEpoch?.let{dispatch(ManagerEvent.Epoch(it))};dispatch(ManagerEvent.Refresh);return@thenCompose CompletableFuture.failedFuture<JsonElement>(CancellationException())}
            val definitions=if(synchronized(lock){descriptorEpoch==effect.daemonEpoch})CompletableFuture.completedFuture(Unit)else {
                val call=session.requestSaved(effect.repoRoot,"db.connections.v2.drivers",JsonObject());synchronized(lock){activeRead=call}
                call.result.thenApply{value->val parsed=ConnectionProtocol.descriptors(value);if(current())synchronized(lock){descriptors=parsed;descriptorEpoch=effect.daemonEpoch};Unit}
            }
            definitions.thenCompose{
                if(!current())return@thenCompose CompletableFuture.failedFuture<JsonElement>(CancellationException())
                val call=session.requestTemporary(effect.repoRoot,owner,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",effect.repoRoot)})
                synchronized(lock){activeRead=call};call.result
            }
        }
        work.whenComplete{rows,failure->if(current()){
            if(failure==null)dispatch(ManagerEvent.ListResult(identity,rows))else{val cause=(failure as? CompletionException)?.cause?:failure
                dispatch(ManagerEvent.ListError(identity,if(cause is ConnectionOwnerException&&cause.code=="upgrade-required")"upgrade-required"else if(cause is ConnectionOwnerException)"offline"else"read-error"))}
        }}
    }
    private fun change(body:()->Unit){try{admit();synchronized(lock){error=""};body()}catch(e:Exception){synchronized(lock){error=if(e is ConnectionOwnerException&&e.code=="upgrade-required")"Upgrade the daemon to use this connection action. The original operation is retained."else"Review the connection fields and current operation state before continuing."}};emit()}
    private fun requireAction(key:ConnectionKey,action:String){if(!ConnectionActions.supported(session.features(key.repoRoot),key.scope,action))throw ConnectionOwnerException("upgrade-required")}
    private fun editable():ConnectionDraft {admit();val capture=synchronized(lock){model to draft}
        val value=capture.second?:throw MutationStateException("invalid-state")
        if(!ConnectionsManagerModel.project(capture.first).canMutate||mutations.isBlocked(value.view.key))throw MutationStateException("busy")
        return value}
    private fun navigate(target:DraftNavigation,action:()->Unit)=change{
        if(synchronized(lock){pending!=null}||removals.view.resolveDirty||removals.view.confirmation!=null)return@change
        val current=synchronized(lock){draft}
        if(current?.dirty==true){current.requestExit(target);synchronized(lock){pending=action};bump()}
        else{current?.clear();synchronized(lock){draft=null};bump();action()}
    }
    fun root(value:String){if(value in synchronized(lock){model.roots})navigate(DraftNavigation("root",repoRoot=value)){dispatch(ManagerEvent.SelectRoot(value))}}
    fun filter(value:String)=navigate(DraftNavigation("filter",value=value)){dispatch(ManagerEvent.Filter(value))}
    fun search(value:String)=navigate(DraftNavigation("search",value=value)){dispatch(ManagerEvent.Search(value))}
    fun clearFilter()=navigate(DraftNavigation("filter",value="all")){dispatch(ManagerEvent.Filter("all"));dispatch(ManagerEvent.Search(""))}
    fun refresh(){dispatch(ManagerEvent.Refresh)}
    private fun create(kind:String,scope:String,id:String=""){
        val descriptor=synchronized(lock){descriptors.firstOrNull{it.kind==kind}}?:throw MutationStateException("invalid-state")
        if(!connectionDriverChoices(listOf(descriptor))[0].enabled)throw MutationStateException("invalid-state")
        val root=synchronized(lock){model.repoRoot}?:throw MutationStateException("invalid-state")
        val next=ConnectionDraft(descriptor,ConnectionKey(root,scope,id));synchronized(lock){draft=next;formId++};bump()
    }
    fun add(){val first=connectionDriverChoices(synchronized(lock){descriptors}).firstOrNull{it.enabled}?:return
        if(!ConnectionsManagerModel.project(synchronized(lock){model}).canMutate)return
        navigate(DraftNavigation("kind",value=first.kind)){create(first.kind,if(synchronized(lock){model.filter}=="temporary")"temporary"else"saved")}}
    fun select(key:ConnectionKey,revision:String){val projection=ConnectionsManagerModel.project(synchronized(lock){model})
        val row=projection.rows.firstOrNull{it.key==key&&it.revision==revision&&it.key in projection.visibleKeys}?:return
        if(!projection.canMutate)return
        navigate(DraftNavigation("row",key=key,revision=revision)){
            dispatch(ManagerEvent.Select(ConnectionSelection(key,revision)))
            val descriptor=synchronized(lock){descriptors.firstOrNull{it.kind==row.kind}}
            val next=descriptor?.let{ConnectionDraft(it,key,row)};synchronized(lock){draft=next;formId++;error=if(next==null)"This driver requires a newer connection editor. The registration can still be removed."else""};bump()
        }
    }
    fun kind(value:String){val form=runCatching{editable().view}.getOrNull()?:return;if(form.mode!="create")return
        navigate(DraftNavigation("kind",value=value)){create(value,form.key.scope,form.key.id)}}
    fun scope(value:String){val form=runCatching{editable().view}.getOrNull()?:return;if(form.mode!="create")return
        navigate(DraftNavigation("scope",value=value)){create(form.kind,value,form.key.id)}}
    fun id(value:String)=change{editable().setId(value);bindProbe()}
    fun field(path:List<String>,value:JsonElement)=change{editable().setField(path,value)}
    fun reset(path:List<String>)=change{editable().resetField(path)}
    fun credential(slot:String,action:String,value:String?=null)=change{val form=editable();try{form.setCredential(slot,action,value)}catch(e:Exception){if(action=="replace"&&form.view.credentials.any{it.slot==slot})runCatching{form.setCredential(slot,"replace","")};throw e}}
    fun addresses(slot:String,values:List<String>)=change{val form=editable();try{form.setCredentialAddresses(slot,values)}catch(e:Exception){if(form.view.credentials.any{it.slot==slot})runCatching{form.setCredential(slot,"replace","")};throw e}}
    fun save()=change{val form=editable();requireAction(form.view.key,form.view.mode);probes.cancel();mutations.submit(form).whenComplete{_,_->emit()}}
    fun test()=change{val form=editable();requireAction(form.view.key,"test");val epoch=session.view.daemonEpoch?:throw MutationStateException("invalid-state");probes.test(form,DraftTestIdentity(form.view.key,epoch,uiGeneration.get())).whenComplete{_,_->emit()}}
    fun cancelTest(){probes.cancel()}
    fun remove()=change{val projection=ConnectionsManagerModel.project(synchronized(lock){model});val selected=projection.selected?:return@change
        val row=projection.rows.firstOrNull{it.key==selected.key&&it.revision==selected.revision&&it.key in projection.visibleKeys}?:return@change
        if(projection.canMutate){requireAction(row.key,"remove");removals.begin(row,synchronized(lock){draft});bump()}}
    fun decideDirty(decision:String)=change{
        if(removals.view.resolveDirty){removals.resolveDirty(decision);if(synchronized(lock){draft}?.view?.discarded==true)synchronized(lock){draft=null;formId++};bump();return@change}
        val action=synchronized(lock){pending}?:return@change;val current=synchronized(lock){draft}?:return@change
        val effects=current.decideDiscard(decision);synchronized(lock){pending=null};bump()
        if(decision=="discard"&&effects.isNotEmpty()){synchronized(lock){draft=null;formId++};bindProbe();action()}
    }
    fun decideRemoval(decision:String)=change{if(decision=="confirm")removals.view.confirmation?.let{requireAction(it.key,"remove")};removals.decide(decision).whenComplete{_,_->emit()};bump()}
    fun requestClose(action:()->Unit)=navigate(DraftNavigation("close"),action)
    fun operation(id:String,action:String)=change{
        val record=mutations.records.firstOrNull{it.recordId==id&&it.key.repoRoot==synchronized(lock){model.repoRoot}}?:return@change
        if(!ConnectionActions.operation(session.features(record.key.repoRoot),record.key.scope,record.mode,action))throw ConnectionOwnerException("upgrade-required")
        val work=when(action){"reconcile"->mutations.reconcile(id);"replay"->mutations.replay(id);"activation"->mutations.retryActivation(id);"cleanup"->mutations.retryCleanup(id);"refresh"->mutations.retryRefresh(id);"dismiss"->{mutations.dismiss(id);null};else->throw MutationStateException("invalid-state")}
        work?.whenComplete{_,_->emit()}
    }
    override fun close(){if(closed)return;closed=true;registrySequence.incrementAndGet();readSequence.incrementAndGet();listeners.clear();subscriptions.forEach{it.close()};subscriptions.clear()
        val current=synchronized(lock){val value=draft;draft=null;pending=null;activeRead?.cancel();activeRead=null;model=ConnectionsManagerModel.reduce(ConnectionsManagerModel.reduce(model,ManagerEvent.TemporaryEnded).state,ManagerEvent.Close).state;descriptors=emptyList();descriptorEpoch="";value};current?.clear();runCatching{probes.setView(null)};registryWorker.shutdownNow();disposal=CompletableFuture()
        Thread({try{if(registryWorker.awaitTermination(3,TimeUnit.SECONDS))disposal.complete(null)else disposal.completeExceptionally(MutationStateException("teardown"))}catch(_:Exception){disposal.completeExceptionally(MutationStateException("teardown"))}},"insrc-connections-registry-end").apply{isDaemon=true;start()}
    }
    fun whenDisposed():CompletionStage<Void> = disposal.minimalCompletionStage()
    override fun toString()="ConnectionsManagerGateway(private)"
}
