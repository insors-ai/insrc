package ai.insors.insrc.jetbrains.ops

import com.intellij.util.ui.JBUI
import javax.swing.JComponent
import javax.swing.JLabel

/**
 * The Workflows child page (Story E2026092157298940:S001 / sc1) — a nested item under
 * the insrc Settings node. S001 ships it empty-but-navigable; S003 fills [buildBody]
 * with the read-only tracked-workflow chain status.
 */
class WorkflowsConfigurable : InsrcOpsConfigurable() {
    override fun pageTitle(): String = "Workflows"
    override fun buildBody(): JComponent =
        JLabel("Workflow chain status arrives in a later insrc update.").apply { border = JBUI.Borders.empty(12) }
}
