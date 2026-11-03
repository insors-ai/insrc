package ai.insors.insrc.jetbrains.connections

import com.google.gson.JsonElement

data class ConnectionControls(val save:Boolean=false,val test:Boolean=false,val remove:Boolean=false,val operations:Map<String,List<String>> = emptyMap())

/** Consumer metadata admission only. Actual daemon registry/session/ticket gates remain authoritative. */
internal object ConnectionActions {
    val base=listOf("safe-read","driver-descriptors","workbench-sessions","session-delegation")
    private val signedSaved=listOf("operation-tickets","operation-status","immutable-credentials","full-use-leases","memory-only-files")
    fun supported(features:List<String>,scope:String,action:String,mode:String="create"):Boolean {
        if(scope !in listOf("saved","temporary")||mode !in listOf("create","update","remove"))return false
        fun has(required:List<String>)=features.containsAll(required)
        if(!has(base))return false
        return when(action){
            "read"->true
            "create","update"->scope=="temporary"||has(signedSaved+listOf("saved-$action"))
            "remove"->has(listOf("$scope-remove","removal-state","removal-cleanup-retry")+if(scope=="saved")signedSaved else emptyList())
            "test"->has(listOf("draft-test","test-cancellation"))
            "status"->scope=="temporary"||has(listOf("operation-status"))
            "activation"->scope=="temporary"||has(listOf("activation-retry"))
            "cleanup"->if(mode=="remove")has(listOf("removal-state","removal-cleanup-retry"))else supported(features,scope,"status")
            else->false
        }
    }
    fun operation(features:List<String>,scope:String,mode:String,action:String):Boolean = when(action){
        "dismiss"->true
        "reconcile"->supported(features,scope,"status",mode)
        "replay"->supported(features,scope,mode,mode)
        "refresh"->supported(features,scope,"read",mode)
        else->supported(features,scope,action,mode)
    }
    fun mutation(features:List<String>,scope:String,method:String,params:JsonElement):Boolean {
        if(!method.startsWith("db.connections.v2."))return false
        return when(method.removePrefix("db.connections.v2.")){
            "status"->supported(features,scope,"status")
            "activate"->supported(features,scope,"activation")
            "removalState"->supported(features,scope,"read")&&"removal-state" in features
            "retryRemovalCleanup"->supported(features,scope,"cleanup","remove")
            "ticket","mutate"->{val value=params.takeIf{it.isJsonObject}?.asJsonObject?.get("mode");val mode=value?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isString}?.asString
                mode in listOf("create","update","remove")&&supported(features,scope,mode!!)}
            else->false
        }
    }
}
