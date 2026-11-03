package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpc
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import com.google.gson.*
import com.intellij.openapi.components.service
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.util.ui.UIUtil
import java.awt.Component
import java.awt.Container
import java.nio.file.Files
import java.util.concurrent.*
import javax.swing.*

class ConnectionsCompatibilityTest:BasePlatformTestCase(){
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private fun parts(root:Component):List<Component> = listOf(root)+(root as? Container)?.components?.flatMap{parts(it)}.orEmpty()
    private inline fun <reified T:Component> named(root:Component,name:String)=parts(root).filterIsInstance<T>().first{it.name==name}
    private fun pump()=UIUtil.dispatchAllInvocationEvents()
    private fun until(check:()->Boolean){val end=System.nanoTime()+TimeUnit.SECONDS.toNanos(12);while(!check()){assertTrue(System.nanoTime()<end);pump();Thread.sleep(5)};pump()}
    private fun caps(b:ConnectionMutationBackend,mode:String="normal",vararg omit:String){b.command("fixture.capabilities",JsonObject().apply{addProperty("mode",mode);add("omit",JsonArray().apply{omit.forEach{add(it)}})})}
    private fun click(panel:Component,name:String){named<JButton>(panel,name).doClick();pump()}
    private fun choose(panel:Component,name:String,value:String){val combo=named<JComboBox<*>>(panel,name);combo.selectedIndex=(0 until combo.itemCount).first{val item=combo.getItemAt(it);item==value||(item as? ConnectionDriverChoice)?.kind==value};pump()}
    private fun start(panel:ConnectionsManagerPanel,scope:String,id:String){click(panel,"add");choose(panel,"kind","postgres");choose(panel,"scope",scope);named<JTextField>(panel,"id").text=id;pump();named<JTextField>(panel,"field:endpoint").text="postgresql://fixture.invalid/database";pump()}
    private fun fixture(b:ConnectionMutationBackend,name:String,body:(ConnectionsSessionService,ConnectionsManagerPanel,ConnectionsManagerGateway)->Unit){
        val project=ProjectManager.getInstance().createProject(name,Files.createDirectory(b.dir.resolve(name)).toString())!!
        val s=project.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());s.installMutationFixtureTiming(MutationTiming(now=b.wall::get,timer={_,_->AutoCloseable{}}));s.installManagerFixtureRoots{listOf(b.root)}
        val panel=ConnectionsManagerPanel(project);val gateway=s.manager()
        try{until{gateway.snapshot().list.roots.isNotEmpty()};choose(panel,"root",b.root);body(s,panel,gateway)}
        finally{panel.dispose();assertTrue(ProjectManager.getInstance().closeAndDispose(project));s.whenDisposed().toCompletableFuture().get(25,TimeUnit.SECONDS)}
    }
    fun testOldMissingMalformedAndBaseIncompleteRepliesRefuseWithoutLegacyMutation(){ConnectionMutationBackend().use{b->
        for(mode in listOf("missing","old","future","malformed","base")){
            if(mode=="base")caps(b,"normal","safe-read")else caps(b,mode)
            fixture(b,"compat-$mode"){_,panel,gateway->until{gateway.snapshot().list.listState=="upgrade-required"};assertFalse(named<JButton>(panel,"add").isEnabled)
                gateway.save();gateway.test();gateway.remove();assertEquals(0,b.stats()["tickets"].asInt);assertEquals(0,b.stats()["mutations"].asInt);assertEquals(0,b.stats()["legacyMutations"].asInt)}
        }
    }}
    fun testOptionalTestAndPartialSavedFeaturesDisableOnlyAffectedNativeActions(){ConnectionMutationBackend().use{b->caps(b,"normal","draft-test","test-cancellation")
        fixture(b,"compat-partial"){_,panel,gateway->until{gateway.snapshot().list.listState=="empty-registry"};start(panel,"saved","optional-test")
            assertTrue(named<JButton>(panel,"save").isEnabled);assertFalse(named<JButton>(panel,"test").isEnabled);gateway.test();assertTrue(gateway.snapshot().error.contains("Upgrade"));click(panel,"save");until{gateway.snapshot().list.counts.saved==1&&gateway.snapshot().draft==null}
            caps(b,"normal","saved-update");gateway.refresh();until{gateway.snapshot().list.listState=="ready"&&!gateway.snapshot().controls.save}
            named<JList<*>>(panel,"rows").selectedIndex=0;pump();assertFalse(named<JButton>(panel,"save").isEnabled);val before=b.stats()["tickets"].asInt;gateway.save();assertEquals(before,b.stats()["tickets"].asInt)
            caps(b,"normal","saved-create");gateway.refresh();until{gateway.snapshot().list.listState=="ready"};start(panel,"saved","temporary-only");assertFalse(named<JButton>(panel,"save").isEnabled);gateway.save();assertEquals(before,b.stats()["tickets"].asInt)
            choose(panel,"scope","temporary");click(panel,"confirm-accept");named<JTextField>(panel,"field:endpoint").text="postgresql://fixture.invalid/database";pump();assertTrue(named<JButton>(panel,"save").isEnabled);click(panel,"save");until{gateway.snapshot().list.counts.temporary==1&&gateway.snapshot().draft==null}
            caps(b,"normal","saved-remove");gateway.refresh();until{gateway.snapshot().list.listState=="ready"};gateway.filter("all");pump();val list=named<JList<*>>(panel,"rows")
            list.selectedIndex=(0 until list.model.size).first{(list.model.getElementAt(it) as SafeConnection).key.scope=="saved"};pump();assertFalse(named<JButton>(panel,"remove").isEnabled);gateway.remove();assertNull(gateway.snapshot().confirmation)
            list.selectedIndex=(0 until list.model.size).first{(list.model.getElementAt(it) as SafeConnection).key.scope=="temporary"};pump();assertTrue(named<JButton>(panel,"remove").isEnabled);click(panel,"remove");click(panel,"confirm-accept");until{gateway.snapshot().list.counts.temporary==0};assertEquals(0,b.stats()["legacyMutations"].asInt)
        }
    }}
    fun testUnknownOperationSurvivesMissingStatusAndUsesOriginalTicketAfterCapabilityReturns(){ConnectionMutationBackend().use{b->
        fixture(b,"compat-recovery"){s,_,gateway->until{gateway.snapshot().list.listState=="empty-registry"};b.fault("after")
            val form=ConnectionDraft(ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"]).first{it.kind=="postgres"},ConnectionKey(b.root,"saved","unknown")).apply{setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/database"))}
            val record=s.mutations().submit(form).toCompletableFuture().get(20,TimeUnit.SECONDS);assertEquals("unknown",record.phase)
            caps(b,"normal","operation-status");gateway.refresh();until{gateway.snapshot().controls.operations[record.recordId]?.contains("reconcile")==false}
            val count=b.stats()["statuses"].asInt;gateway.operation(record.recordId,"reconcile");assertEquals(count,b.stats()["statuses"].asInt);assertEquals("unknown",s.mutations().record(record.recordId).phase)
            caps(b);gateway.refresh();until{gateway.snapshot().controls.operations[record.recordId]?.contains("reconcile")==true};gateway.operation(record.recordId,"reconcile");until{s.mutations().record(record.recordId).phase=="committed"}
            assertEquals(1,b.stats()["tickets"].asInt);assertEquals(1,b.stats()["mutations"].asInt);assertEquals(0,b.stats()["legacyMutations"].asInt)
        }
    }}
    fun testCommonCapabilityPolicyPinnedReadOnlyRowsAndActualLegacySavedProjection(){
        val cases=ConnectionCorpus.load().getAsJsonArray("capabilityCases");assertEquals(41,cases.size())
        for(raw in cases){val c=raw.asJsonObject;assertEquals(c["id"].asString,c["expected"].asBoolean,ConnectionActions.supported(c.getAsJsonArray("features").map{it.asString},c["scope"].asString,c["action"].asString,c["mode"].asString))}
        ConnectionMutationBackend().use{b->val row=JsonParser.parseString("""{"key":{"repoRoot":"unused","scope":"saved","id":"pinned"},"revision":"11111111-1111-4111-8111-111111111111","kind":"csv","family":"rdbms","effectiveFamily":"rdbms","declaredFamily":"rdbms","registeredFamily":"file","readOnly":true,"compatibilityWarning":"legacy mismatch","publicConfig":{"kind":"csv","path":"source.csv"},"credentialPresence":{}}""").asJsonObject;row.getAsJsonObject("key").addProperty("repoRoot",b.root)
            b.command("fixture.readRows",JsonObject().apply{add("rows",JsonArray().apply{add(row)})})
            fixture(b,"compat-legacy"){s,panel,gateway->until{gateway.snapshot().list.listState=="ready"};named<JList<*>>(panel,"rows").selectedIndex=0;pump();assertEquals("rdbms",gateway.snapshot().draft?.family);assertEquals(true,gateway.snapshot().draft?.readOnly);assertFalse(named<JButton>(panel,"save").isEnabled);assertTrue(named<JButton>(panel,"remove").isEnabled);assertEquals(0,b.stats()["registryWrites"].asInt)
                b.command("fixture.readRows",JsonObject().apply{add("rows",JsonNull.INSTANCE)});b.command("fixture.seedSaved",JsonObject().apply{addProperty("id","legacy-saved")})
                val form=ConnectionDraft(ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"]).first{it.kind=="postgres"},ConnectionKey(b.root,"temporary","legacy-hidden")).apply{setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/database"))};assertEquals("committed",s.mutations().submit(form).toCompletableFuture().get(20,TimeUnit.SECONDS).phase)
                fun legacy(root:String)=CompletableFuture.supplyAsync{UnixSocketDaemonRpc(b.socket).call("db.listConnections",mapOf("repoRoot" to root))}.get(15,TimeUnit.SECONDS)
                val actual=legacy(b.root);assertTrue(actual.ok);assertEquals(listOf("legacy-saved"),actual.list!!.map{(it as Map<*,*>)["id"]});assertEquals(setOf("id","kind","family"),(actual.list!!.single() as Map<*,*>).keys);assertTrue(legacy(b.otherRoot).list!!.isEmpty());assertEquals(0,b.stats()["legacyMutations"].asInt)
            }
        }
    }
}
