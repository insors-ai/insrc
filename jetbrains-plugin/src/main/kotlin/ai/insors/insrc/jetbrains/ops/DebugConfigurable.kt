package ai.insors.insrc.jetbrains.ops

import ai.insors.insrc.jetbrains.debug.DebugPageHost
import ai.insors.insrc.jetbrains.debug.DebugSection
import ai.insors.insrc.jetbrains.debug.DebugStatusCardModel
import ai.insors.insrc.jetbrains.debug.DebugStatusCardReader
import ai.insors.insrc.jetbrains.debug.KillOutcome
import ai.insors.insrc.jetbrains.debug.KillResult
import ai.insors.insrc.jetbrains.debug.LogEditorSection
import ai.insors.insrc.jetbrains.debug.McpDebugSection
import ai.insors.insrc.jetbrains.debug.OrphanProcess
import ai.insors.insrc.jetbrains.debug.OrphanProcessSeam
import ai.insors.insrc.jetbrains.debug.OrphanScanResult
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
    private val orphanSeam = OrphanProcessSeam()

    override fun pageTitle(): String = "Debug"

    /** sc3: the ordered read-only sections S004 seeds; S005 appends MCP, S006 appends the log section. */
    override fun sections(): List<DebugSection> = listOf(statusSection(), orphansSection(), mcpSection(), logSection())

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

    // ---- Orphans section (the single confirm-gated mutation, k3) -------------

    private fun orphansSection(): DebugSection = object : DebugSection {
        override fun title(): String = "Orphan processes"
        override fun component(): JComponent = orphansCard(orphanSeam.scan())
    }

    private fun orphansCard(scan: OrphanScanResult): JComponent {
        val card = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
        }
        when (scan) {
            OrphanScanResult.Unsupported ->
                card.add(row("", "Orphan detection is not supported on this platform."))
            is OrphanScanResult.Scanned -> {
                if (scan.orphans.isEmpty()) {
                    card.add(row("", "No orphan daemon processes found."))
                } else {
                    val listModel = DefaultListModel<OrphanProcess>().apply { scan.orphans.forEach { addElement(it) } }
                    val list = JBList(listModel).apply {
                        selectionMode = ListSelectionModel.MULTIPLE_INTERVAL_SELECTION
                        cellRenderer = orphanRenderer()
                        alignmentX = Component.LEFT_ALIGNMENT
                    }
                    card.add(list)
                    card.add(killButton(list))
                }
            }
        }
        return card
    }

    /** The Kill button — the ONLY mutating control on the Debug surface (k3). */
    private fun killButton(list: JBList<OrphanProcess>): JButton =
        JButton("Kill selected…").apply {
            alignmentX = Component.LEFT_ALIGNMENT
            addActionListener {
                val selected = list.selectedValuesList
                if (selected.isEmpty()) return@addActionListener // nothing selected -> no-op (ac2)
                val pids = selected.map { it.pid }
                val confirm = Messages.showYesNoDialog(
                    "Terminate ${pids.size} selected process(es)?\n${pids.joinToString(", ")}",
                    "insrc Debug: Kill Orphan Processes",
                    Messages.getWarningIcon(),
                )
                if (confirm != Messages.YES) return@addActionListener // cancelled -> no signal (k3)
                val outcomes = ProgressManager.getInstance().runProcessWithProgressSynchronously<List<KillOutcome>, RuntimeException>(
                    { orphanSeam.kill(pids) }, "Terminating orphan processes…", true, null,
                )
                Messages.showInfoMessage(
                    outcomes.joinToString("\n") { "pid ${it.pid}: ${it.result.name.lowercase()}" },
                    "insrc Debug: Kill Result",
                )
                // Drop only the pids that were actually terminated — a failed kill (ERROR /
                // still alive) stays in the list so the operator is not misled.
                val cleared = outcomes.filter { it.result == KillResult.TERMINATED || it.result == KillResult.FORCED }.map { it.pid }.toSet()
                val model = list.model as DefaultListModel<OrphanProcess>
                cleared.forEach { pid -> (0 until model.size()).firstOrNull { model.getElementAt(it).pid == pid }?.let(model::removeElementAt) }
            }
        }

    private fun orphanRenderer() = javax.swing.ListCellRenderer<OrphanProcess> { _, value, _, _, _ ->
        JLabel("pid ${value.pid}  ${value.command}")
    }

    private fun row(label: String, value: String): JComponent =
        JLabel(if (label.isEmpty()) value else "$label: $value").apply { alignmentX = Component.LEFT_ALIGNMENT }
}
