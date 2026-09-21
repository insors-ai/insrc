package ai.insors.insrc.jetbrains.ops

import com.intellij.util.ui.JBUI
import javax.swing.JComponent
import javax.swing.JLabel

/**
 * The Debug child page (Story E2026092157298940:S001 / sc1) — a nested item under the
 * insrc Settings node. S001 ships it empty-but-navigable; S004 fills [buildBody] with
 * the daemon-status card + the orphan-process controls (and owns the DebugPageHost sc3
 * that S005/S006 attach their sections to).
 */
class DebugConfigurable : InsrcOpsConfigurable() {
    override fun pageTitle(): String = "Debug"
    override fun buildBody(): JComponent =
        JLabel("Debug diagnostics arrive in a later insrc update.").apply { border = JBUI.Borders.empty(12) }
}
