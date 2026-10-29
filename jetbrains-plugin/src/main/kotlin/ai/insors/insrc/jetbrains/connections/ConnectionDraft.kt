package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import java.util.Collections
import java.util.regex.Pattern
import kotlin.math.floor

class ConnectionDraftException(val code:String):IllegalArgumentException(if(code=="read-only")"This connection requires a newer editor or has compatibility restrictions."else"Review the connection fields before continuing.")
data class DraftCredentialView(val slot:String,val present:Boolean,val action:String,val masked:Boolean=true,val format:String="text")
data class ConnectionDraftView(val key:ConnectionKey,val kind:String,val family:String,val mode:String,val draftRevision:Long,val dirty:Boolean,val readOnly:Boolean,val guidance:String?,val publicValues:JsonObject,val publicInputSchema:JsonObject,val credentials:List<DraftCredentialView>,val confirmDiscard:Boolean,val discarded:Boolean)
data class DraftNavigation(val type:String,val value:String?=null,val repoRoot:String?=null,val key:ConnectionKey?=null,val revision:String?=null) {
    fun toWire()=JsonObject().apply{addProperty("type",type)
        value?.let{addProperty("value",it)}
        repoRoot?.let{addProperty("repoRoot",it)}
        key?.let{add("key",keyJson(it))}
        revision?.let{addProperty("revision",it)}}
}
data class DraftNavigationEffect(val target:DraftNavigation){fun toWire()=JsonObject().apply{addProperty("type","navigate")
        add("target",target.toWire())}}
private fun keyJson(key:ConnectionKey)=JsonObject().apply{addProperty("repoRoot",key.repoRoot)
    addProperty("scope",key.scope)
    addProperty("id",key.id)}
private fun invalid():Nothing=throw ConnectionDraftException("invalid-fields")
private fun text(v:JsonElement?)=v?.takeIf{it.isJsonPrimitive&&it.asJsonPrimitive.isString}?.asString

/** Advertised schema subset, without coercion/defaults or an arbitrary options editor. */
private object DraftSchema {
    fun enabled(d:ConnectionDriverDescriptor):Boolean {
        if(!d.editable)return false
        return try {
            if(d.publicInputSchema.getAsJsonObject("properties").keySet().any{it !in ConnectionProtocol.publicFieldNames})return false
            fun supported(s:JsonObject):Boolean {
                s["pattern"]?.let{Pattern.compile(it.asString,Pattern.UNICODE_CHARACTER_CLASS)}
                return (!s.has("properties")||s.getAsJsonObject("properties").entrySet().all{it.key !in setOf("password","credentials","secretRef","runtimeAuth","capability","sessionHandle")&&supported(it.value.asJsonObject)})&&(!s.has("items")||supported(s.getAsJsonObject("items")))&&(!s.has("anyOf")||s.getAsJsonArray("anyOf").all{supported(it.asJsonObject)})
            }
            supported(d.publicInputSchema)
        }catch(_:Exception){false}
    }
    fun valid(s:JsonObject,v:JsonElement,editing:Boolean=false):Boolean {
        if(s.has("const")&&s["const"]!=v||s.has("enum")&&s.getAsJsonArray("enum").none{it==v}||s.has("anyOf")&&s.getAsJsonArray("anyOf").none{valid(it.asJsonObject,v,editing)})return false
        return when(text(s["type"])) {
            "object" -> {if(!v.isJsonObject)return false
                val o=v.asJsonObject
                val props=s.getAsJsonObject("properties")
                (editing||!s.has("required")||s.getAsJsonArray("required").all{o.has(it.asString)})&&o.entrySet().all{props.has(it.key)&&valid(props.getAsJsonObject(it.key),it.value,editing)}}
            "array" -> v.isJsonArray&&(editing||!s.has("minItems")||v.asJsonArray.size()>=s["minItems"].asInt)&&(!s.has("maxItems")||v.asJsonArray.size()<=s["maxItems"].asInt)&&v.asJsonArray.all{valid(s.getAsJsonObject("items"),it,editing)}
            "string" -> {val str=text(v)?:return false
                val len=str.codePointCount(0,str.length)
                (editing||!s.has("minLength")||len>=s["minLength"].asInt)&&(!s.has("maxLength")||len<=s["maxLength"].asInt)&&(editing||!s.has("pattern")||Pattern.compile(s["pattern"].asString,Pattern.UNICODE_CHARACTER_CLASS).matcher(str).find())}
            "boolean" -> v.isJsonPrimitive&&v.asJsonPrimitive.isBoolean
            "number","integer" -> {if(!v.isJsonPrimitive||!v.asJsonPrimitive.isNumber)return false
                val n=v.asDouble
                n.isFinite()&&(text(s["type"])!="integer"||n==floor(n))&&(editing||!s.has("minimum")||n>=s["minimum"].asDouble)&&(editing||!s.has("maximum")||n<=s["maximum"].asDouble)}
            else -> true
        }
    }
}
data class ConnectionDriverChoice(val kind:String,val family:String,val enabled:Boolean,val guidance:String?)
fun connectionDriverChoices(descriptors:List<ConnectionDriverDescriptor>):List<ConnectionDriverChoice> = Collections.unmodifiableList(descriptors.map{val enabled=DraftSchema.enabled(it)
    ConnectionDriverChoice(it.kind,it.family,enabled,if(enabled)null else "This connection requires a newer editor or has compatibility restrictions.")})

/** Privileged memory-only form. Every backing field is excluded from accidental Gson persistence. */
class ConnectionDraft(descriptor:ConnectionDriverDescriptor,key:ConnectionKey,current:SafeConnection?=null) {
    @Transient private val descriptor=descriptor.copy(publicInputSchema=descriptor.publicInputSchema.deepCopy(),secretSlots=descriptor.secretSlots.toList())
    @Transient private var key=key.copy()
    @Transient private val mode=if(current==null)"create"else"update"
    @Transient private val revision=current?.revision
    @Transient private val family=current?.effectiveFamily?:descriptor.family
    @Transient private val initialId=key.id
    @Transient private var values=(current?.publicConfig?.deepCopy()?:JsonObject()).apply{addProperty("kind",current?.kind?:descriptor.kind)}
    @Transient private var baseline=values.deepCopy()
    @Transient private var presence=current?.credentialPresence?.toMap()?:emptyMap()
    @Transient private val credentials=linkedMapOf<String,JsonObject>()
    @Transient private var draftRevision=0L
    @Transient private var readOnly=current?.readOnly==true||current!=null&&(current.key!=key||current.kind!=descriptor.kind)||!DraftSchema.enabled(this.descriptor)||!DraftSchema.valid(this.descriptor.publicInputSchema,values,true)
    @Transient private var discarded=false
    @Transient private var pending:DraftNavigation?=null
    init{descriptor.secretSlots.forEach{credentials[it]=JsonObject().apply{addProperty("action","keep")}}}
    val dirty:Boolean @Synchronized get()= !discarded&&(key.id!=initialId||values!=baseline||credentials.values.any{text(it["action"])!="keep"})
    val view:ConnectionDraftView @Synchronized get()=ConnectionDraftView(key.copy(),descriptor.kind,family,mode,draftRevision,dirty,readOnly,if(readOnly)"This connection requires a newer editor or has compatibility restrictions."else null,values.deepCopy(),descriptor.publicInputSchema.deepCopy(),Collections.unmodifiableList(descriptor.secretSlots.map{DraftCredentialView(it,presence[it]==true,text(credentials[it]?.get("action"))?:"keep",format=if(it in setOf("options.servers","options.hosts"))"address-list"else"text")}),pending!=null,discarded)
    private fun editable(){if(discarded)throw ConnectionDraftException("discarded")
        if(readOnly)throw ConnectionDraftException("read-only")
        if(pending!=null||draftRevision>=9007199254740991L)invalid()}
    @Synchronized fun setId(id:String){editable()
        if(mode=="update")throw ConnectionDraftException("fixed-identity")
        if(id.length>16384||id.any{it.code<32})invalid()
        key=key.copy(id=id)
        draftRevision++}
    private fun schemaAt(path:List<String>):JsonObject {
        var s=descriptor.publicInputSchema
        for(p in path){if(p in setOf("__proto__","prototype","constructor"))invalid()
            s=if(text(s["type"])=="array"&&Regex("^(0|[1-9][0-9]*)$").matches(p))s.getAsJsonObject("items")else s.getAsJsonObject("properties")?.get(p)?.takeIf{it.isJsonObject}?.asJsonObject?:invalid()}
        return s
    }
    private fun safeEditingFields(value:JsonObject) {
        fun walk(v:JsonElement){
            if(v.isJsonPrimitive&&v.asJsonPrimitive.isString){var decoded=v.asString
                repeat(8){if(decoded.contains("\${secret:"))invalid()
                    val next=ConnectionProtocol.decodePublicPercent(decoded)
                    if(next==decoded)return
                    decoded=next}
                invalid()}
            if(v.isJsonArray)v.asJsonArray.forEach{walk(it)}
            if(v.isJsonObject)for((k,child)in v.asJsonObject.entrySet()){if(k in setOf("password","credentials","secretRef","runtimeAuth","capability","sessionHandle"))invalid()
                walk(child)}
        }
        walk(value)
        val options=value["options"]?.takeIf{it.isJsonObject}?.asJsonObject
        val endpoints=mutableListOf(value["endpoint"],options?.get("endpoint"))
        for(k in listOf("servers","hosts"))options?.get(k)?.takeIf{it.isJsonArray}?.asJsonArray?.forEach{endpoints.add(it)}
        for(endpoint in endpoints){var decoded=text(endpoint)?:continue
            for(n in 0 until 8){val authority=decoded.replace(Regex("^[A-Za-z][A-Za-z0-9+.-]*://"),"").split(Regex("[/?#]"),2)[0]
                if(authority.contains('@')||Regex("[?&](?:password|passwd|token|secret|api[_-]?key|access[_-]?key)=",RegexOption.IGNORE_CASE).containsMatchIn(decoded))invalid()
                val next=ConnectionProtocol.decodePublicPercent(decoded)
                if(next==decoded)break
                decoded=next}}
    }
    @Synchronized fun setField(path:List<String>,value:JsonElement){
        editable()
        if(path.isEmpty()||path.size>32||path[0] in setOf("id","kind","scope","family","effectiveFamily"))throw ConnectionDraftException("fixed-identity")
        schemaAt(path)
        val next=values.deepCopy()
        var target:JsonElement=next
        fun index(a:JsonArray,p:String):Int{val i=p.toIntOrNull()?:invalid()
            if(i<0||i>a.size()||i>=16384)invalid()
            return i}
        for(i in 0 until path.lastIndex){val p=path[i]
            val following=path[i+1]
            val child=if(target.isJsonObject)target.asJsonObject[p]else if(target.isJsonArray){val n=index(target.asJsonArray,p)
                if(n<target.asJsonArray.size())target.asJsonArray[n]else null}else invalid()
            if(child==null){val created:JsonElement=if(Regex("^(0|[1-9][0-9]*)$").matches(following))JsonArray()else JsonObject()
                if(target.isJsonObject)target.asJsonObject.add(p,created)else target.asJsonArray.add(created)
                target=created}else{if(!child.isJsonObject&&!child.isJsonArray)invalid()
                target=child}}
        val copied=ConnectionProtocol.requestData(value)
        val leaf=path.last()
        if(target.isJsonObject)target.asJsonObject.add(leaf,copied)else if(target.isJsonArray){val n=index(target.asJsonArray,leaf)
            if(n==target.asJsonArray.size())target.asJsonArray.add(copied)else target.asJsonArray.set(n,copied)}else invalid()
        val checked=ConnectionProtocol.requestData(next).asJsonObject
        if(!DraftSchema.valid(descriptor.publicInputSchema,checked,true))invalid()
        safeEditingFields(checked)
        values=checked
        draftRevision++
    }
    @Synchronized fun resetField(path:List<String>){
        editable()
        if(path.isEmpty()||path.any{Regex("^(0|[1-9][0-9]*)$").matches(it)}||path[0] in setOf("id","kind","scope","family","effectiveFamily"))throw ConnectionDraftException("fixed-identity")
        schemaAt(path)
        val next=values.deepCopy()
        var target=next
        var original:JsonElement?=baseline
        for(p in path.dropLast(1)){val child=target[p]
            if(child==null||!child.isJsonObject){draftRevision++
                return}
            target=child.asJsonObject
            original=original?.takeIf{it.isJsonObject}?.asJsonObject?.get(p)}
        val leaf=path.last()
        val prior=original?.takeIf{it.isJsonObject}?.asJsonObject?.get(leaf)
        if(prior!=null)target.add(leaf,prior.deepCopy())else target.remove(leaf)
        values=next
        draftRevision++
    }
    @Synchronized fun setCredential(slot:String,action:String,replacement:String?=null){editable()
        if(slot !in descriptor.secretSlots||action !in setOf("keep","replace","clear"))invalid()
        val patch=JsonObject().apply{addProperty("action",action)}
        if(action=="replace"){val v=replacement?:""
            if(v.length>16384||v.contains("\${secret:"))invalid()
            patch.addProperty("value",v)}
        credentials[slot]=patch
        draftRevision++}
    @Synchronized fun setCredentialAddresses(slot:String,addresses:List<String>){if(slot !in setOf("options.servers","options.hosts")||addresses.isEmpty()||addresses.size>1024||addresses.any{it.isEmpty()||it.length>16384})invalid()
        setCredential(slot,"replace",JsonArray().apply{addresses.forEach{add(it)}}.toString())}
    /** Private copy is used by both Save and Test; it is never a view or Settings state. */
    @Synchronized fun serialize():JsonObject {
        editable()
        try{if(key.repoRoot.isEmpty()||key.id.isEmpty()||key.repoRoot.length>16384||key.id.length>16384||key.repoRoot.any{it.code<32}||key.id.any{it.code<32}||key.scope !in setOf("saved","temporary"))invalid()
            if(!DraftSchema.valid(descriptor.publicInputSchema,values))invalid()
            safeEditingFields(values)
            val patch=ConnectionProtocol.publicPatch(values)
            if(credentials.values.any{text(it["action"])=="replace"&&text(it["value"]).isNullOrEmpty()})invalid()
            return JsonObject().apply{add("key",keyJson(key))
                addProperty("mode",mode)
                revision?.let{addProperty("expectedRevision",it)}
                add("publicPatch",patch)
                add("credentials",JsonObject().apply{credentials.forEach{(slot,intent)->add(slot,intent.deepCopy())}})}
        }catch(e:ConnectionDraftException){throw e}catch(_:Exception){invalid()}
    }
    @Synchronized fun requestExit(target:DraftNavigation):List<DraftNavigationEffect>{if(discarded)throw ConnectionDraftException("discarded")
        if(pending!=null)return emptyList()
        if(target.type !in setOf("root","row","filter","search","scope","kind","close","remove"))invalid()
        if(dirty){pending=target.copy(key=target.key?.copy())
            return emptyList()}
        return listOf(DraftNavigationEffect(target))}
    @Synchronized fun decideDiscard(decision:String):List<DraftNavigationEffect>{if(decision !in setOf("discard","cancel"))invalid()
        val target=pending?:return emptyList()
        pending=null
        if(decision=="cancel")return emptyList()
        clear()
        return listOf(DraftNavigationEffect(target))}
    /** Only unsaved inputs are cleared; this never discards/deletes a registration or its source. */
    @Synchronized fun clear(){if(discarded)return
        values=JsonObject()
        baseline=JsonObject()
        credentials.clear()
        presence=emptyMap()
        pending=null
        discarded=true
        draftRevision++}
    override fun toString()="ConnectionDraft(private)"
}
