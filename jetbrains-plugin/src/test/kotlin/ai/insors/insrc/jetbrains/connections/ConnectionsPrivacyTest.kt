package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import com.google.gson.*
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.ui.components.JBPasswordField
import com.intellij.util.ui.UIUtil
import java.awt.Component
import java.awt.Container
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit
import javax.swing.*

class ConnectionsPrivacyTest : BasePlatformTestCase() {
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private fun parts(root:Component):List<Component> = listOf(root)+(root as? Container)?.components?.flatMap{parts(it)}.orEmpty()
    private inline fun <reified T:Component> named(root:Component,name:String)=parts(root).filterIsInstance<T>().first{it.name==name}
    private fun pump()=UIUtil.dispatchAllInvocationEvents()
    private fun until(check:()->Boolean){val end=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);while(!check()){assertTrue(System.nanoTime()<end);pump();Thread.sleep(5)};pump()}
    private fun click(root:Component,name:String){named<JButton>(root,name).doClick();pump()}
    private fun choose(root:Component,name:String,value:String){val combo=named<JComboBox<*>>(root,name);combo.selectedIndex=(0 until combo.itemCount).first{val item=combo.getItemAt(it);item==value||(item as? ConnectionDriverChoice)?.kind==value};pump()}
    private fun fixture(body:(ConnectionMutationBackend,Project,ConnectionsSessionService,ConnectionsManagerPanel,ConnectionsManagerGateway,Path)->Unit){
        ConnectionMutationBackend().use{b->val path=Files.createDirectory(b.dir.resolve("private-project"));val project=ProjectManager.getInstance().createProject("privacy fixture",path.toString())!!
            val s=project.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());s.installMutationFixtureTiming(MutationTiming(now=b.wall::get));s.installManagerFixtureRoots{listOf(b.root)}
            val panel=ConnectionsManagerPanel(project);val gateway=s.manager()
            try{until{gateway.snapshot().list.roots.isNotEmpty()};choose(panel,"root",b.root);until{gateway.snapshot().list.listState=="empty-registry"};body(b,project,s,panel,gateway,path)}
            finally{panel.dispose();if(!project.isDisposed)assertTrue(ProjectManager.getInstance().closeAndDispose(project));s.whenDisposed().toCompletableFuture().get(25,TimeUnit.SECONDS)}}
    }
    fun testNativePasswordErasureAndDetachedCallbacksAcrossKeepRebuildAndAddressRemoval()=fixture{_,_,_,panel,gateway,_->
        click(panel,"add");choose(panel,"kind","postgres");choose(panel,"credential-action:url.password","replace")
        val oldPublic=named<JTextField>(panel,"field:endpoint");val old=named<JBPasswordField>(panel,"credential:url.password:0");old.text="fixture-native-private-widget";pump()
        gateway.credential("url.password","keep");pump();assertTrue(old.password.isEmpty())
        choose(panel,"credential-action:url.password","replace");old.text="fixture-native-detached-widget";pump();click(panel,"add");click(panel,"confirm-accept");assertTrue(old.password.isEmpty())
        val revision=gateway.snapshot().draft!!.draftRevision;old.text="fixture-native-stale-widget";pump();assertEquals(revision,gateway.snapshot().draft!!.draftRevision);oldPublic.text="postgresql://fixture-stale-config.invalid/database";pump();assertEquals(revision,gateway.snapshot().draft!!.draftRevision)
        choose(panel,"kind","nats");choose(panel,"credential-action:options.servers","replace");val address=named<JBPasswordField>(panel,"credential:options.servers:0");address.text="nats://fixture-native-private.invalid:4222";pump()
        parts(panel).filterIsInstance<JButton>().first{it.text=="Remove replacement address"}.doClick();pump();assertTrue(address.password.isEmpty())
        val after=gateway.snapshot().draft!!.draftRevision;address.text="nats://fixture-native-stale.invalid:4222";pump();assertEquals(after,gateway.snapshot().draft!!.draftRevision)
        val current=named<JBPasswordField>(panel,"credential:options.servers:0");current.text="nats://fixture-native-final.invalid:4222";pump();panel.dispose();assertTrue(current.password.isEmpty())
    }
    private fun files(path:Path):Map<String,List<Byte>> = Files.walk(path).use{all->all.filter{Files.isRegularFile(it)}.toList().associate{path.relativize(it).toString() to Files.readAllBytes(it).toList()}}
    fun testActualProjectTempActionsHaveZeroPersistenceAndNoPrivateStateSerialization()=fixture{b,project,s,panel,gateway,path->
        val beforeFiles=files(path);val before=b.stats();val keys=listOf("registryWrites","credentialSets","credentialDeletes")
        assertFalse(PersistentStateComponent::class.java.isAssignableFrom(ConnectionsSessionService::class.java))
        click(panel,"add");choose(panel,"kind","postgres");choose(panel,"scope","temporary");named<JTextField>(panel,"id").text="private-preview";pump()
        named<JTextField>(panel,"field:endpoint").text="postgresql://127.0.0.1:1/s5-native-private-endpoint-canary";pump();named<JTextField>(panel,"field:label").text="s5-native-private-label-canary";pump()
        choose(panel,"credential-action:url.password","replace");named<JBPasswordField>(panel,"credential:url.password:0").text="s5-native-private-credential-canary";pump()
        gateway.field(listOf("path"),JsonPrimitive("s5-native-private-source-canary.csv"));pump();assertFalse(gateway.snapshot().error.contains("s5-native-private-source-canary"))
        click(panel,"test");until{gateway.snapshot().test.status in setOf("failed","timeout","unavailable")};until{b.stats()["probeActive"].asInt==0}
        click(panel,"save");until{gateway.snapshot().list.counts.temporary==1&&gateway.snapshot().draft==null}
        assertEquals("{}",Gson().toJson(s));assertEquals("{}",Gson().toJson(s.manager()));assertEquals("{}",Gson().toJson(s.mutations()))
        val otherPath=Files.createDirectory(b.dir.resolve("other-project"));val other=ProjectManager.getInstance().createProject("other privacy fixture",otherPath.toString())!!
        val otherService=other.service<ConnectionsSessionService>();otherService.installFixturePorts(b.ports());otherService.installManagerFixtureRoots{listOf(b.root)}
        val otherPanel=ConnectionsManagerPanel(other)
        try{val otherGateway=otherService.manager();until{otherGateway.snapshot().list.roots.isNotEmpty()};choose(otherPanel,"root",b.root);until{otherGateway.snapshot().list.listState=="empty-registry"}
            assertFalse(Gson().toJson(otherGateway.snapshot()).contains("s5-native-private-"))
        }finally{otherPanel.dispose();assertTrue(ProjectManager.getInstance().closeAndDispose(other));otherService.whenDisposed().toCompletableFuture().get(25,TimeUnit.SECONDS)}
        val rows=named<JList<*>>(panel,"rows");rows.selectedIndex=0;pump();click(panel,"remove");click(panel,"confirm-accept");until{gateway.snapshot().list.counts.temporary==0}
        click(panel,"add");choose(panel,"kind","postgres");choose(panel,"scope","temporary");named<JTextField>(panel,"id").text="expiry-preview";pump();named<JTextField>(panel,"field:endpoint").text="postgresql://127.0.0.1:1/private";pump()
        b.command("fixture.clock",JsonObject().apply{addProperty("now",90000)});click(panel,"save");until{s.view.status=="expired"};assertNull(gateway.snapshot().draft)
        s.selectRoot(b.root).toCompletableFuture().get(15,TimeUnit.SECONDS);assertEquals("ready",s.view.status)
        val after=b.stats();keys.forEach{assertEquals(before[it],after[it])};assertTrue("Client actions changed Project files",beforeFiles==files(path))
        assertTrue(ProjectManager.getInstance().closeAndDispose(project));s.whenDisposed().toCompletableFuture().get(25,TimeUnit.SECONDS);assertEquals("{}",Gson().toJson(s));assertNull(gateway.snapshot().draft)
        assertFalse(files(path).values.any{String(it.toByteArray()).contains("s5-native-private-")})
    }
}
