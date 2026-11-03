package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ConnectionDraftTest {
    private val corpus=ConnectionCorpus.load()
    private val descriptors=ConnectionProtocol.descriptors(corpus["driverDescriptors"])
    private val key=ConnectionKey("/fixture/repo-a","saved","draft")
    private val gson=Gson()
    private fun key(o:JsonObject)=ConnectionKey(o["repoRoot"].asString,o["scope"].asString,o["id"].asString)
    private fun draft(kind:String="postgres")=ConnectionDraft(descriptors.first{it.kind==kind},key)
    private fun sample(s:JsonObject,path:List<String>,kind:String):JsonElement {
        if(s.has("const"))return s["const"].deepCopy()
        if(s.has("enum"))return s.getAsJsonArray("enum")[0].deepCopy()
        if(s.has("anyOf"))return sample(s.getAsJsonArray("anyOf")[0].asJsonObject,path,kind)
        return when(s["type"].asString){
            "object" -> JsonObject().apply{s.getAsJsonObject("properties").entrySet().forEach{(k,v)->add(k,sample(v.asJsonObject,path+k,kind))}}
            "array" -> JsonArray().apply{add(sample(s.getAsJsonObject("items"),path+"0",kind))}
            "boolean" -> JsonPrimitive(true)
            "integer","number" -> s["minimum"]?.deepCopy()?:JsonPrimitive(0)
            else -> JsonPrimitive(when {
                path.last()=="endpoint" -> "${when(kind){"dynamodb"->"https";"cockroachdb"->"postgresql";"keydb","valkey"->"redis";else->kind}}://fixture.invalid/example"
                path.last()=="path" -> "data/example.csv"
                "contactPoints" in path -> "fixture.invalid:9042"
                "servers" in path -> "nats://fixture.invalid:4222"
                "hosts" in path -> "https://fixture.invalid:2379"
                s["maxLength"]?.asInt?.let{it<7}==true -> "x".repeat(maxOf(1,s["minLength"]?.asInt?:1))
                else -> "fixture"
            })
        }
    }
    @Test fun `all current descriptor fields and nine common drafts match TypeScript serializer`() {
        assertEquals(29,connectionDriverChoices(descriptors).count{it.enabled})
        for(d in descriptors){
            val form=ConnectionDraft(d,key)
            for((name,schema)in d.publicInputSchema.getAsJsonObject("properties").entrySet())if(name!="kind")form.setField(listOf(name),sample(schema.asJsonObject,listOf(name),d.kind))
            val value=form.serialize();assertEquals(d.kind,value.getAsJsonObject("publicPatch")["kind"].asString)
            assertEquals(d.secretSlots.toSet(),value.getAsJsonObject("credentials").keySet())
        }
        val scenarios=corpus.getAsJsonArray("draftScenarios");assertEquals(9,scenarios.size())
        for(raw in scenarios){
            val s=raw.asJsonObject;val form=ConnectionDraft(descriptors.first{it.kind==s["kind"].asString},key(s.getAsJsonObject("key")),s["current"]?.let{ConnectionProtocol.safeConnection(it)})
            for(event in s.getAsJsonArray("steps")){val e=event.asJsonObject
                when(e["action"].asString){
                    "field" -> form.setField(e.getAsJsonArray("path").map{it.asString},e["value"])
                    "credential" -> form.setCredential(e["slot"].asString,e["intent"].asString,e["value"]?.asString)
                    "credential-addresses" -> form.setCredentialAddresses(e["slot"].asString,e.getAsJsonArray("values").map{it.asString})
                    "reset-field" -> form.resetField(e.getAsJsonArray("path").map{it.asString})
                    else -> error("Unknown common draft action")
                }
            }
            val view=gson.toJsonTree(form.view).asJsonObject
            for((k,v)in s.getAsJsonObject("expected").entrySet())assertEquals(v,view[k],s["id"].asString+": "+k)
            if(s.has("serializationError"))assertEquals(s["serializationError"].asString,assertThrows(ConnectionDraftException::class.java){form.serialize()}.code)
            else assertEquals(s["serialized"],form.serialize(),s["id"].asString)
            assertEquals("{}",gson.toJson(form));assertFalse(gson.toJson(form.view).contains("fixture-only-"));assertFalse(form.toString().contains("fixture-only-"))
        }
    }
    @Test fun `dirty exits cancel without changing inputs while discard clears only unsaved form`() {
        val revision=corpus.getAsJsonObject("identity")["revision"].asString
        val targets=listOf(DraftNavigation("root",repoRoot="/fixture/repo-b"),DraftNavigation("row",key=key.copy(scope="temporary"),revision=revision),DraftNavigation("filter","temporary"),DraftNavigation("search","other"),DraftNavigation("scope","temporary"),DraftNavigation("kind","csv"),DraftNavigation("close"),DraftNavigation("remove",key=key,revision=revision))
        for(target in targets){
            val form=draft();form.setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/db"));form.setCredential("url.password","replace","fixture-only-private")
            val before=form.serialize();val generation=form.view.draftRevision
            assertTrue(form.requestExit(target).isEmpty());assertTrue(form.view.confirmDiscard)
            assertTrue(form.decideDiscard("cancel").isEmpty());assertFalse(form.view.confirmDiscard);assertEquals(generation,form.view.draftRevision);assertEquals(before,form.serialize())
            assertTrue(form.requestExit(target).isEmpty());assertEquals(listOf(DraftNavigationEffect(target)),form.decideDiscard("discard"))
            assertTrue(form.view.discarded);assertFalse(form.view.dirty);assertTrue(form.view.publicValues.isEmpty)
            assertEquals("discarded",assertThrows(ConnectionDraftException::class.java){form.serialize()}.code)
        }
    }
    @Test fun `unsafe fields read only shapes pinned family and defensive projections`() {
        val form=draft();form.setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/db"));val before=gson.toJson(form.view)
        for(value in listOf("postgresql://user:private-canary@fixture.invalid/db","postgresql://fixture.invalid/db?password=private-canary","%24%7Bsecret%3Aprivate-canary%7D"))assertThrows(IllegalArgumentException::class.java){form.setField(listOf("endpoint"),JsonPrimitive(value))}
        assertEquals(before,gson.toJson(form.view))
        for(field in listOf("id","kind","scope","family","effectiveFamily"))assertEquals("fixed-identity",assertThrows(ConnectionDraftException::class.java){form.setField(listOf(field),JsonPrimitive("changed"))}.code)
        assertThrows(ConnectionDraftException::class.java){form.setField(listOf("options","arbitrary"),JsonPrimitive("raw"))}
        val shape=corpus.getAsJsonArray("driverDescriptors")[0].deepCopy().asJsonObject
        shape.getAsJsonObject("publicInputSchema").getAsJsonObject("properties").add("newRequiredField",JsonObject().apply{addProperty("type","string")})
        shape.getAsJsonObject("publicInputSchema").add("required",JsonArray().apply{add("newRequiredField")})
        val unknown=ConnectionProtocol.descriptors(JsonArray().apply{add(shape)}).single();assertFalse(connectionDriverChoices(listOf(unknown)).single().enabled)
        val legacy=ConnectionProtocol.safeConnection(corpus.getAsJsonArray("draftScenarios")[1].asJsonObject["current"])
        val readOnly=ConnectionDraft(descriptors.first{it.kind=="postgres"},key,legacy.copy(readOnly=true))
        assertTrue(readOnly.view.readOnly);assertNotNull(readOnly.view.guidance)
        val update=ConnectionDraft(descriptors.first{it.kind=="postgres"},key,legacy)
        assertEquals("fixed-identity",assertThrows(ConnectionDraftException::class.java){update.setId("other")}.code)
        assertEquals("kv",update.view.family);assertFalse(update.serialize().getAsJsonObject("publicPatch").has("family"))
        val view=update.view;view.publicValues.addProperty("endpoint","changed")
        assertNotEquals("changed",update.view.publicValues["endpoint"].asString)
        val serialized=update.serialize();serialized.getAsJsonObject("credentials").add("url.password",JsonObject().apply{addProperty("action","clear")})
        assertEquals("keep",update.serialize().getAsJsonObject("credentials").getAsJsonObject("url.password")["action"].asString)
    }
    @Test fun `public percent decoding rejects malformed UTF8 without changing valid plus or percent text`() {
        for(raw in corpus.getAsJsonArray("publicFieldCases")){
            val c=raw.asJsonObject;val value=JsonObject().apply{addProperty("kind","csv");addProperty("path",c["value"].asString)}
            if(c["valid"].asBoolean)assertEquals(value,ConnectionProtocol.publicPatch(value))else assertThrows(ConnectionReplyException::class.java){ConnectionProtocol.publicPatch(value)}
        }
    }
}
