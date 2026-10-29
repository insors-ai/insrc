package ai.insors.insrc.jetbrains.connections

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.atomic.AtomicLong

internal data class MutationTiming(val now:()->Long=System::currentTimeMillis,val timer:((()->Unit,Long)->AutoCloseable)?=null)
internal data class ProjectMutationOwner(val controller:ConnectionMutationController,val revocation:AutoCloseable)
/** Native scope routing is private to the Project owner; no renderer/Settings payload grants authority. */
internal fun createProjectMutationOwner(owner:ConnectionsSessionOwner,timing:MutationTiming=MutationTiming()):ProjectMutationOwner {
    val lifetime=AtomicLong()
    fun stamp(key:ConnectionKey):String?=if(key.scope=="saved")null else "${owner.view.daemonEpoch}:${lifetime.get()}"
    fun temporary(key:ConnectionKey,method:String,params:JsonElement,expected:String?):CompletionStage<JsonElement> {
        if(expected==null||stamp(key)!=expected)return CompletableFuture.failedFuture(ConnectionOwnerException("expired"))
        val ready=if(method.endsWith(".status")&&owner.view.status=="offline")owner.selectRoot(key.repoRoot)else CompletableFuture.completedFuture(owner.view)
        return ready.thenCompose{
            if(stamp(key)!=expected)return@thenCompose CompletableFuture.failedFuture<JsonElement>(ConnectionOwnerException("expired"))
            owner.requestTemporary(key.repoRoot,owner.view,method,params).result
        }.thenApply{response->
            // Only strict authenticated expiry revokes; the effect's decoder handles every other reply.
            runCatching{val decoded=ConnectionProtocol.mutation(response,ReplyExpectation(key=key))
                if(decoded is MutationReply.Rejected&&decoded.code=="session-expired")owner.expireTemporary()}
            response
        }
    }
    val controller=ConnectionMutationController(MutationPorts(
        now=timing.now,timer=timing.timer,sessionStamp=::stamp,
        call={key,method,params,expected->if(!ConnectionActions.mutation(owner.features(key.repoRoot),key.scope,method,params))CompletableFuture.failedFuture(ConnectionOwnerException("upgrade-required"))else if(key.scope=="saved")owner.requestSaved(key.repoRoot,method,params).result else temporary(key,method,params,expected)},
        refresh={key,_->owner.selectRoot(key.repoRoot).thenCompose{view->owner.requestTemporary(key.repoRoot,view,"db.connections.v2.list",JsonObject().apply{addProperty("repoRoot",key.repoRoot)}).result}},
        expireTemporary={owner.expireTemporary()},
    ))
    val revocation=owner.onTemporaryInvalidated{lifetime.incrementAndGet()
        controller.endTemporary()}
    return ProjectMutationOwner(controller,revocation)
}
