package ai.insors.insrc.jetbrains.ops

import ai.insors.insrc.jetbrains.debug.DebugPageHost
import ai.insors.insrc.jetbrains.debug.DebugSection
import ai.insors.insrc.jetbrains.debug.DebugStatusCardModel
import ai.insors.insrc.jetbrains.debug.DebugStatusCardReader
import ai.insors.insrc.jetbrains.debug.LogEditorSection
import ai.insors.insrc.jetbrains.debug.McpDebugSection
import ai.insors.insrc.jetbrains.ui.InsrcCollapsible
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.ui.Messages
import com.intellij.ui.components.JBList
import com.intellij.util.ui.JBUI
import java.awt.Component
import javax.swing.BoxLayout
import javax.swing.DefaultListModel
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.ListSelectionModel

/**
 * The Debug child page (Story E2026092157298940:S001 / sc1 scaffold; body filled by Story
 * E2026092157298940:S004). It OWNS the sc3 [DebugPageHost] and seeds the ordered section
 * list with a read-only daemon-status card and an orphan-process section. The ONLY mutating
 * affordance on the whole surface is the orphan Kill (k3): confirm-gated via
 * [Messages.showYesNoDialog] and run OFF the EDT under [ProgressManager], acting solely on
 * the operator's explicit selection. Everything else is read-only; the parent settings page
 * + plugin.xml stay unchanged (k1/k4). S005/S006 append their own [DebugSection]s later.
 */
class DebugConfigurable : InsrcOpsConfigurable(), DebugPageHost {

    private val statusReader = DebugStatusCardReader()

    override fun pageTitle(): String = "Debug"

    /** sc3: the ordered read-only sections S004 seeds; S005 appends MCP, S006 appends the log section. */
    override fun sections(): List<DebugSection> = listOf(statusSection(), mcpSection(), logSection())

    override fun buildBody(): JComponent {
        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = JBUI.Borders.empty(8)
        }
        for (section in sections()) {
            column.add(InsrcCollapsible.collapsiblePanel(section.title(), section.component()))
        }
        return column
    }

    // ---- Status section (read-only) -----------------------------------------

    private fun statusSection(): DebugSection = object : DebugSection {
        override fun title(): String = "Daemon status"
        override fun component(): JComponent = statusCard(statusReader.read())
    }

    private fun statusCard(model: DebugStatusCardModel): JComponent {
        val card = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
        }
        if (model.reachable) {
            card.add(row("State", if (model.running == true) "running" else "stopped"))
            card.add(row("Uptime", model.uptimeSec?.let { "${it}s" } ?: "—"))
            card.add(row("Registered repos", model.repoCount?.toString() ?: "—"))
        } else {
            card.add(row("State", model.notReachableReason ?: "not reachable"))
        }
        card.add(row("Socket", model.socket))
        card.add(row("PID", model.pid?.toString() ?: "—"))
        card.add(row("Version", model.version ?: "—"))
        return card
    }

    // ---- MCP clients section (read-only, appended by S005) -------------------

    /** sc3: the S005 read-only MCP registration + attached-sessions section (no mutation, k3). */
    private fun mcpSection(): DebugSection = McpDebugSection()

    // ---- Logs section (read-only editor-tab affordance, appended by S006) -----

    /** sc3: the S006 log-open affordance; the live log opens in an editor tab (k5), not inline. */
    private fun logSection(): DebugSection = LogEditorSection()

    private fun row(label: String, value: String): JComponent =
        JLabel(if (label.isEmpty()) value else "$label: $value").apply { alignmentX = Component.LEFT_ALIGNMENT }
}
