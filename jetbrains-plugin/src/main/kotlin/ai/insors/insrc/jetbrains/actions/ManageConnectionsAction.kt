package ai.insors.insrc.jetbrains.actions

import ai.insors.insrc.jetbrains.connections.ConnectionsEntryPanel
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import javax.swing.JComponent

/** Uses the actual action-context Project. Paths, editor roots and command strings confer no authority. */
class ManageConnectionsAction internal constructor(private val show:(Project?)->Unit) : AnAction() {
    constructor():this({ project -> ConnectionsDialog(project).show() })
    override fun getActionUpdateThread() = ActionUpdateThread.BGT
    override fun actionPerformed(e:AnActionEvent) { show(e.project?.takeUnless { it.isDisposed || it.isDefault }) }
}

private class ConnectionsDialog(project:Project?) : DialogWrapper(project,false) {
    private val manager = ConnectionsEntryPanel(project)
    init { title="insrc — Manage Connections";init() }
    override fun createCenterPanel():JComponent = manager
    override fun createActions():Array<javax.swing.Action> = arrayOf(cancelAction)
    override fun dispose() { manager.dispose();super.dispose() }
}
