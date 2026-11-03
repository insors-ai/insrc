package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.impl.LaterInvocator
import com.intellij.openapi.components.service
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.ui.components.JBPasswordField
import com.intellij.util.ui.UIUtil
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import java.awt.Component
import java.awt.Container
import java.nio.file.Files
import java.util.concurrent.*
import javax.swing.*

class ConnectionsManagerPanelTest:BasePlatformTestCase() {
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private fun <T> await(value:CompletionStage<T>):T=value.toCompletableFuture().get(25,TimeUnit.SECONDS)
    private fun components(root:Component):List<Component> = listOf(root)+(root as? Container)?.components?.flatMap{components(it)}.orEmpty()
    private inline fun <reified T:Component> named(root:Component,name:String)=components(root).filterIsInstance<T>().first{it.name==name}
    private fun pump(){UIUtil.dispatchAllInvocationEvents()}
    private fun until(predicate:()->Boolean){val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        while(!predicate()){check(System.nanoTime()<deadline){"Native manager fixture did not settle"};pump();Thread.sleep(5)};pump()}
    private fun click(panel:ConnectionsManagerPanel,name:String){pump();named<JButton>(panel,name).doClick();pump()}
    private fun choose(panel:ConnectionsManagerPanel,name:String,value:String){pump();val combo=named<JComboBox<*>>(panel,name)
        val selected=(0 until combo.itemCount).firstOrNull{index->val item=combo.getItemAt(index);item==value||(item as? ConnectionDriverChoice)?.kind==value}?:error("Missing choice")
        combo.selectedIndex=selected;pump()}
    private fun text(panel:ConnectionsManagerPanel,name:String,value:String){pump();named<JTextField>(panel,name).text=value;pump()}
    private fun fixture(name:String,body:(ConnectionMutationBackend,Project,ConnectionsSessionService,ConnectionsManagerPanel,ConnectionsManagerGateway)->Unit){
        ConnectionMutationBackend().use{b->val project=ProjectManager.getInstance().createProject(name,Files.createDirectory(b.dir.resolve("project")).toString())!!
            val s=project.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());s.installMutationFixtureTiming(MutationTiming(now=b.wall::get));s.installManagerFixtureRoots{assertFalse(ApplicationManager.getApplication().isDispatchThread);listOf(b.root)}
            val panel=ConnectionsManagerPanel(project);val gateway=s.manager()
            try{until{gateway.snapshot().list.roots.isNotEmpty()};body(b,project,s,panel,gateway)}
            finally{if(!project.isDisposed)assertTrue(ProjectManager.getInstance().closeAndDispose(project));await(s.whenDisposed())}}
    }
    private fun start(panel:ConnectionsManagerPanel,gateway:ConnectionsManagerGateway,b:ConnectionMutationBackend){
        assertNull(gateway.snapshot().list.repoRoot);choose(panel,"root",b.root);until{gateway.snapshot().list.listState=="empty-registry"};click(panel,"add");choose(panel,"kind","postgres")
    }
    fun testNativeEventsDirtyCancelMaskedFieldsAndImmediateSaveWithoutSettingsApply()=fixture("s5-native-panel"){b,_,_,panel,gateway->
        assertTrue(SwingUtilities.isEventDispatchThread());assertFalse(Configurable::class.java.isAssignableFrom(ConnectionsManagerPanel::class.java));assertEquals(0,b.stats()["tickets"].asInt)
        start(panel,gateway,b);text(panel,"id","native");text(panel,"field:endpoint","postgresql://fixture.invalid/database");text(panel,"field:label","<html><img src=file:PRIVATE_HTML_CANARY>")
        choose(panel,"credential-action:url.password","replace");val secret=named<JBPasswordField>(panel,"credential:url.password:0");assertTrue(secret.password.isEmpty());secret.text="fixture-only-native-private";pump();assertTrue(gateway.snapshot().valid)
        assertFalse(Gson().toJson(gateway.snapshot()).contains("fixture-only-native-private"));assertEquals("{}",Gson().toJson(gateway))
        secret.text="\${secret:fixture-invalid}";pump();assertFalse(gateway.snapshot().valid);assertFalse(named<JButton>(panel,"save").isEnabled);secret.text="fixture-only-native-private";pump()
        val tickets=b.stats()["tickets"].asInt;named<JToggleButton>(panel,"filter-temporary").doClick();pump();assertTrue(gateway.snapshot().dirty);assertFalse(named<JTextField>(panel,"id").isEnabled);click(panel,"confirm-cancel");assertFalse(gateway.snapshot().dirty);assertEquals(tickets,b.stats()["tickets"].asInt)
        assertEquals("<html><img src=file:PRIVATE_HTML_CANARY>",gateway.snapshot().draft?.publicValues?.get("label")?.asString)
        click(panel,"save");until{gateway.snapshot().list.counts.saved==1&&gateway.snapshot().draft==null};assertEquals(1,b.stats()["mutations"].asInt);assertEquals(1,b.stats()["tickets"].asInt)
        val list=named<JList<*>>(panel,"rows");val value=list.model.getElementAt(0);@Suppress("UNCHECKED_CAST") val renderer=list.cellRenderer as ListCellRenderer<Any>
        val cell=renderer.getListCellRendererComponent(list,value,0,false,false) as JLabel;assertEquals(true,cell.getClientProperty("html.disable"));assertTrue(cell.text.startsWith("<html>"))
        val labels=components(panel).filterIsInstance<JLabel>().filter{it.labelFor!=null};assertTrue(labels.any{it.labelFor?.name=="root"});assertTrue(labels.any{it.labelFor?.name=="id"})
    }
    fun testViewCloseRetainsDraftAndOwnerWhileProjectCloseErasesFieldsAndRejectsQueuedUpdates()=fixture("s5-native-close"){b,project,s,panel,gateway->
        start(panel,gateway,b);text(panel,"id","retained");text(panel,"field:endpoint","postgresql://fixture.invalid/database");choose(panel,"credential-action:url.password","replace");val secret=named<JBPasswordField>(panel,"credential:url.password:0");secret.text="fixture-only-retained-native";pump()
        val oldSave=named<JButton>(panel,"save");panel.dispose();assertTrue(secret.password.isEmpty());assertEquals(0,panel.componentCount);assertEquals("ready",s.view.status);assertEquals("retained",gateway.snapshot().draft?.key?.id)
        val next=ConnectionsManagerPanel(project);pump();until{gateway.snapshot().list.listState=="empty-registry"};assertEquals("retained",gateway.snapshot().draft?.key?.id);assertTrue(named<JBPasswordField>(next,"credential:url.password:0").password.isEmpty());assertSame(gateway,s.manager())
        val calls=b.stats()["tickets"].asInt;oldSave.doClick();pump();assertEquals(calls,b.stats()["tickets"].asInt)
        val currentSecret=named<JBPasswordField>(next,"credential:url.password:0");val old=gateway.snapshot();assertTrue(ProjectManager.getInstance().closeAndDispose(project));await(s.whenDisposed());pump();next.render(old);assertEquals(0,next.componentCount);assertTrue(currentSecret.password.isEmpty());assertNull(gateway.snapshot().draft);assertTrue(gateway.snapshot().list.closed)
    }
    fun testAllDescriptorsRenderTypedNativeFieldsAndBlankPasswordControls()=fixture("s5-native-fields"){b,_,_,panel,gateway->
        choose(panel,"root",b.root);until{gateway.snapshot().list.listState=="empty-registry"};val base=gateway.snapshot();val fields=ConnectionFieldsPanel(gateway)
        val descriptors=ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"])
        descriptors.forEachIndexed{index,descriptor->val draft=ConnectionDraft(descriptor,ConnectionKey(b.root,"temporary","fixture"));descriptor.secretSlots.firstOrNull()?.let{draft.setCredential(it,"replace","fixture-only-rendered-private")}
            fields.render(base.copy(draft=draft.view,formId=index.toLong()+1));assertFalse(components(fields).any{it is JTextArea});assertTrue(components(fields).filterIsInstance<JLabel>().filter{it.labelFor!=null}.all{it.getClientProperty("html.disable")==true})
            components(fields).filterIsInstance<JBPasswordField>().forEach{assertTrue(it.password.isEmpty())}
        }
        assertEquals(29,descriptors.size);fields.clearView();assertFalse(components(fields).any{it is JBPasswordField})
    }
    fun testEveryListStateStaleRowsAndScopeCountsAreNativeAndNonactionableWhenUnavailable()=fixture("s5-native-states"){b,_,s,panel,gateway->
        start(panel,gateway,b);text(panel,"id","saved");text(panel,"field:endpoint","postgresql://fixture.invalid/database");click(panel,"save");until{gateway.snapshot().list.counts.saved==1};val base=gateway.snapshot()
        for(state in listOf("loading","ready","empty-registry","empty-filter","read-error","offline","no-repository","upgrade-required")){
            val live=state in setOf("ready","empty-registry","empty-filter");panel.render(base.copy(list=base.list.copy(listState=state,canMutate=live,stale=!live)))
            assertTrue(components(panel).filterIsInstance<JLabel>().first{it.accessibleContext.accessibleName=="Connection list status"}.text.isNotEmpty());if(!live)assertFalse(named<JButton>(panel,"add").isEnabled)
        }
        panel.render(base);named<JToggleButton>(panel,"filter-temporary").doClick();pump();assertEquals("empty-filter",gateway.snapshot().list.listState);assertEquals(1,gateway.snapshot().list.counts.saved);assertEquals(0,gateway.snapshot().list.matchingCount)
        gateway.clearFilter();pump();gateway.add();pump();gateway.kind("postgres");pump();gateway.scope("temporary");pump();text(panel,"id","temporary");text(panel,"field:endpoint","postgresql://fixture.invalid/database");click(panel,"save");until{gateway.snapshot().list.counts.temporary==1}
        s.onTemporaryInvalidated{}.close();b.command("fixture.clock",JsonObject().apply{addProperty("now",90000)})
        // An authenticated expired response revokes temporary scope; no synthetic UI event grants authority.
        s.mutations().submit(ConnectionDraft(ConnectionProtocol.descriptors(ConnectionCorpus.load()["driverDescriptors"]).first{it.kind=="postgres"},ConnectionKey(b.root,"temporary","expired")).apply{setField(listOf("endpoint"),JsonPrimitive("postgresql://fixture.invalid/database"))})
        until{gateway.snapshot().list.counts.temporary==0};assertEquals(1,gateway.snapshot().list.counts.saved);assertFalse(gateway.snapshot().list.canMutate)
    }
    fun testLateRegistryAndPanelCallbacksCannotResurrectDisposedNativeView() {
        ConnectionMutationBackend().use{b->val project=ProjectManager.getInstance().createProject("s5-native-late",Files.createDirectory(b.dir.resolve("project")).toString())!!
            val s=project.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());val entered=CountDownLatch(1);val release=CountDownLatch(1)
            s.installManagerFixtureRoots{assertFalse(ApplicationManager.getApplication().isDispatchThread);entered.countDown();release.await(10,TimeUnit.SECONDS);listOf(b.root)}
            val panel=ConnectionsManagerPanel(project);val gateway=s.manager()
            try{assertTrue(entered.await(5,TimeUnit.SECONDS));panel.dispose();release.countDown();until{gateway.snapshot().list.roots.isNotEmpty()};assertEquals(0,panel.componentCount);assertEquals("idle",s.view.status);assertEquals(0,b.stats()["tickets"].asInt)}
            finally{release.countDown();assertTrue(ProjectManager.getInstance().closeAndDispose(project));await(s.whenDisposed())}
        }
    }
    fun testNativeManagerUpdatesInsideSettingsModalityWithoutWaitingForDialogClose()=fixture("s5-native-modal"){b,_,_,panel,gateway->
        val modality=Any();LaterInvocator.enterModal(modality)
        try{start(panel,gateway,b);assertNotNull(gateway.snapshot().draft);assertTrue(named<JTextField>(panel,"id").isEnabled);assertTrue(named<JButton>(panel,"refresh").isEnabled)
            choose(panel,"scope","temporary");text(panel,"id","resumed-probe");text(panel,"field:endpoint","postgresql://127.0.0.1:1/database");gateway.suspendView();gateway.resumeView();pump();click(panel,"test");until{gateway.snapshot().test.status in setOf("failed","reachable","timeout")};assertTrue(gateway.snapshot().test.tookMs!=null)
        }
        finally{LaterInvocator.leaveModal(modality);pump()}
    }
}
