package ai.insors.insrc.jetbrains.ops

import com.intellij.util.ui.JBUI
import javax.swing.JComponent
import javax.swing.JLabel

/**
 * The Daemon child page (Story E2026092157298940:S001 / sc1) — a nested item under the
 * insrc Settings node. S001 ships it empty-but-navigable; S002 fills [buildBody] with
 * the daemon health readout + the six lifecycle actions (consuming sc2's daemonStatus()).
 */
class DaemonConfigurable : InsrcOpsConfigurable() {
    override fun pageTitle(): String = "Daemon"
    override fun buildBody(): JComponent =
        JLabel("Daemon controls arrive in a later insrc update.").apply { border = JBUI.Borders.empty(12) }
}
