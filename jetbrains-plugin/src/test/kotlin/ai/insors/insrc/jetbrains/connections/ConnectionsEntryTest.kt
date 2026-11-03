package ai.insors.insrc.jetbrains.connections

import ai.insors.insrc.jetbrains.actions.ManageConnectionsAction
import ai.insors.insrc.jetbrains.settings.ConnectionsConfigurable
import ai.insors.insrc.jetbrains.platform.AppScopedConsumers
import com.intellij.openapi.actionSystem.*
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.util.ui.UIUtil
import java.awt.Component
import java.awt.Container
import java.nio.file.Files
import java.util.concurrent.TimeUnit
import javax.swing.*

class ConnectionsEntryTest : BasePlatformTestCase() {
    override fun setUp(){super.setUp();AppScopedConsumers.claimForTest()}
    override fun tearDown(){try{AppScopedConsumers.resetForTest()}finally{super.tearDown()}}
    private fun components(root:Component):List<Component> = listOf(root)+(root as? Container)?.components?.flatMap{components(it)}.orEmpty()
    private inline fun <reified T:Component> named(root:Component,name:String)=components(root).filterIsInstance<T>().first{it.name==name}
    private fun until(predicate:()->Boolean){val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while(!predicate()){assertTrue(System.nanoTime()<deadline);UIUtil.dispatchAllInvocationEvents();Thread.sleep(5)};UIUtil.dispatchAllInvocationEvents()}
    private fun event(project:Project?) = AnActionEvent.createFromDataContext("connection-fixture", Presentation(), DataContext { key -> if(key==CommonDataKeys.PROJECT.name)project else null })

    fun testNoProjectCancelAndDisposedSelectionNeverObtainAnOwner() {
        val panel=ConnectionsEntryPanel({emptyList()})
        assertTrue(components(panel).filterIsInstance<JLabel>().any{it.text.contains("No open project")})
        named<JButton>(panel,"manage-connections").doClick();named<JButton>(panel,"cancel-project").doClick()
        assertFalse(components(panel).any{it is ConnectionsManagerPanel})
        panel.dispose();assertEquals(0,panel.componentCount)
        var received:Project?=project
        val action=ManageConnectionsAction{received=it};action.actionPerformed(event(null));assertNull(received)
        action.actionPerformed(event(project));assertSame(project,received)
        action.actionPerformed(event(ProjectManager.getInstance().defaultProject));assertNull(received)
    }
    fun testSettingsActualProjectChoiceApplyResetAndViewCloseRetainSameProjectManager() {
        ConnectionMutationBackend().use{b->
            val actual=ProjectManager.getInstance().createProject("same-name",Files.createDirectory(b.dir.resolve("project")).toString())!!
            val s=actual.service<ConnectionsSessionService>();s.installFixturePorts(b.ports());s.installMutationFixtureTiming(MutationTiming(now=b.wall::get));s.installManagerFixtureRoots{listOf(b.root)}
            val configurable=ConnectionsConfigurable{ConnectionsEntryPanel({listOf(actual)})}
            val panel=configurable.createComponent()
            try{
                assertSame(panel,configurable.createComponent());val choices=named<JComboBox<*>>(panel,"connection-project");assertNull(choices.selectedItem)
                choices.selectedIndex=1;named<JButton>(panel,"cancel-project").doClick();assertNull(choices.selectedItem);assertEquals("idle",s.view.status)
                choices.selectedIndex=1;named<JButton>(panel,"manage-connections").doClick()
                val gateway=s.manager();until{gateway.snapshot().list.roots.isNotEmpty()};assertNull(gateway.snapshot().list.repoRoot)
                named<JComboBox<*>>(panel,"root").selectedItem=b.root;until{gateway.snapshot().list.listState=="empty-registry"}
                named<JButton>(panel,"add").doClick();UIUtil.dispatchAllInvocationEvents();named<JTextField>(panel,"id").text="retained-settings-draft";UIUtil.dispatchAllInvocationEvents()
                val before=b.stats()["tickets"].asInt;configurable.apply();configurable.reset();assertFalse(configurable.isModified);assertEquals(before,b.stats()["tickets"].asInt)
                assertEquals("retained-settings-draft",gateway.snapshot().draft?.key?.id)
                named<JButton>(panel,"choose-project").doClick();UIUtil.dispatchAllInvocationEvents();assertTrue(gateway.snapshot().dirty)
                named<JButton>(panel,"confirm-cancel").doClick();UIUtil.dispatchAllInvocationEvents();assertTrue(components(panel).any{it is ConnectionsManagerPanel})
                var received:Project?=null;ManageConnectionsAction{received=it}.actionPerformed(event(actual));assertSame(actual,received);assertSame(gateway,received!!.service<ConnectionsSessionService>().manager())
                configurable.disposeUIResources();assertEquals("ready",s.view.status);assertEquals("retained-settings-draft",gateway.snapshot().draft?.key?.id)
                val reopened=ConnectionsEntryPanel({listOf(actual)},actual);try{assertSame(gateway,s.manager());assertEquals("retained-settings-draft",gateway.snapshot().draft?.key?.id)}finally{reopened.dispose()}
            }finally{configurable.disposeUIResources();assertTrue(ProjectManager.getInstance().closeAndDispose(actual));s.whenDisposed().toCompletableFuture().get(25,TimeUnit.SECONDS)}
        }
    }
    fun testClosedProjectChoiceAndStaleChooserButtonsCannotOpenManager() {
        val directory=Files.createTempDirectory("s5-entry-")
        val actual=ProjectManager.getInstance().createProject("closed-choice",directory.toString())!!
        var live=listOf(actual);val panel=ConnectionsEntryPanel({live})
        val choice=named<JComboBox<*>>(panel,"connection-project");choice.selectedIndex=1;val old=named<JButton>(panel,"manage-connections")
        live=emptyList();assertTrue(ProjectManager.getInstance().closeAndDispose(actual));old.doClick();assertFalse(components(panel).any{it is ConnectionsManagerPanel})
        named<JButton>(panel,"refresh-projects").doClick();old.doClick();assertFalse(components(panel).any{it is ConnectionsManagerPanel});panel.dispose();old.doClick();assertEquals(0,panel.componentCount)
        directory.toFile().deleteRecursively()
    }
}
