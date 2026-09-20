package ai.insors.insrc.jetbrains.actions

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.RepoStatsDto
import ai.insors.insrc.jetbrains.daemon.RepoStatsResult
import ai.insors.insrc.jetbrains.ui.InsrcCollapsible
import ai.insors.insrc.jetbrains.ui.ScrollableColumn
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTable
import javax.swing.ScrollPaneConstants
import javax.swing.table.DefaultTableCellRenderer
import javax.swing.table.DefaultTableModel

/**
 * The "Show Repo status" popup (Story jetbrains-plugin-add-insrc-entry-project /
 * S001; UX rework in ux-rework-shipped-insrc-project-view / S001). A read-only
 * [DialogWrapper] that reads `repo.stats` for [projectRootPath] OFF the EDT (the
 * local-socket round-trip) and renders the rich fields on the EDT, guarded on the
 * dialog still being live.
 *
 * On [RepoStatsResult.Loaded] the fields are shown as accordion groups
 * (Repository / Files by language / Entities by kind) whose bodies are nested
 * tables, inside ONE outer [JBScrollPane] (AS_NEEDED vertical / NEVER horizontal)
 * over a width-tracking [ScrollableColumn] — a FIXED-size popup that scrolls when
 * the content overflows. On [RepoStatsResult.Unavailable] it shows a distinct
 * plain message (never a blank panel, an empty accordion, or fabricated zeros).
 * OK-only.
 */
class RepoStatusDialog(
    project: Project,
    private val projectRootPath: String,
) : DialogWrapper(project, false) {

    private val body = JPanel(BorderLayout())

    @Volatile
    private var disposed = false

    init {
        title = "insrc — Repo status"
        body.border = JBUI.Borders.empty(8)
        body.add(JLabel("Loading repository stats…"), BorderLayout.NORTH)
        init()
        loadOffEdt()
    }

    override fun createCenterPanel(): JComponent = body

    override fun createActions(): Array<javax.swing.Action> = arrayOf(okAction)

    override fun dispose() {
        disposed = true
        super.dispose()
    }

    private fun loadOffEdt() {
        val gateway = service<DaemonGatewayService>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val result = gateway.repoStats(projectRootPath)
            ApplicationManager.getApplication().invokeLater({
                // Only render if this dialog is still open (a late result on a
                // disposed dialog is dropped — no write to a dead component).
                if (!disposed) render(result)
            }, ModalityState.any())
        }
    }

    private fun render(result: RepoStatsResult) {
        body.removeAll()
        val content: JComponent = when (result) {
            is RepoStatsResult.Loaded -> statsScrollPane(result.stats)
            // A failure stays a plain message — never an empty accordion.
            is RepoStatsResult.Unavailable -> JLabel("Repo stats unavailable: ${result.reason}")
        }
        body.add(content, BorderLayout.CENTER)
        body.revalidate()
        body.repaint()
        pack()
    }

    /**
     * The accordion column of collapsible groups, wrapped in ONE outer scroll pane
     * (AS_NEEDED vertical / NEVER horizontal) so the popup is a fixed size and the
     * outer scrollbar governs overflow. No inner scroll panes — each group's table
     * is content-sized in place.
     */
    private fun statsScrollPane(s: RepoStatsDto): JComponent {
        val column = ScrollableColumn(ScrollableColumn.defaultHeight(), ScrollableColumn.defaultMinWidth())
        column.layout = BoxLayout(column, BoxLayout.Y_AXIS)

        val overview = buildList {
            add("Path" to s.repoPath)
            add("Status" to s.status)
            s.lastIndexed?.let { add("Last indexed" to it) }
            add("Added" to s.addedAt)
            s.errorMsg?.let { add("Error" to it) }
            add("Size" to humanBytes(s.sizeBytes))
            add("Files" to s.fileCount.toString())
            add("Entities" to s.entityCount.toString())
            add("Relations" to s.relationCount.toString())
            add("Pending jobs" to s.pendingJobs.toString())
        }
        column.add(InsrcCollapsible.collapsiblePanel("Repository", keyValueTable("Property", "Value", overview), expanded = true))

        column.add(
            InsrcCollapsible.collapsiblePanel(
                "Files by language",
                countTable("Language", "Files", s.filesByLanguage),
                expanded = true,
            ),
        )
        column.add(
            InsrcCollapsible.collapsiblePanel(
                "Entities by kind",
                countTable("Kind", "Count", s.entityCountByKind),
                expanded = true,
            ),
        )

        val scroll = JBScrollPane(
            column,
            ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
            ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
        )
        scroll.border = JBUI.Borders.empty()
        return scroll
    }

    /** A content-sized, read-only 2-column table (no inner scroll pane): its own
     *  header goes NORTH and the table CENTER, so it renders in full and the ONE
     *  outer scroll pane governs overflow. */
    private fun table(colA: String, colB: String, rows: List<Array<String>>): JComponent {
        val model = object : DefaultTableModel(arrayOf<Any>(colA, colB), 0) {
            override fun isCellEditable(row: Int, column: Int): Boolean = false
        }
        for (r in rows) model.addRow(r)
        val table = JTable(model)
        table.rowHeight = table.rowHeight.coerceAtLeast(24)
        table.setShowGrid(false)
        table.tableHeader.reorderingAllowed = false
        // The first column is a short label; give the value column the bulk of the
        // width, and a tooltip so a truncated long value (a long path/error) is still
        // fully readable on hover.
        table.columnModel.getColumn(0).preferredWidth = JBUI.scale(150)
        table.columnModel.getColumn(1).apply {
            preferredWidth = JBUI.scale(300)
            cellRenderer = object : DefaultTableCellRenderer() {
                override fun getTableCellRendererComponent(
                    t: JTable, value: Any?, selected: Boolean, focused: Boolean, row: Int, col: Int,
                ): Component {
                    val c = super.getTableCellRendererComponent(t, value, selected, focused, row, col)
                    (c as? JComponent)?.toolTipText = value?.toString()
                    return c
                }
            }
        }
        return JPanel(BorderLayout()).apply {
            alignmentX = Component.LEFT_ALIGNMENT
            add(table.tableHeader, BorderLayout.NORTH)
            add(table, BorderLayout.CENTER)
        }
    }

    private fun keyValueTable(colA: String, colB: String, rows: List<Pair<String, String>>): JComponent =
        table(colA, colB, rows.map { arrayOf(it.first, it.second) })

    /** A Name/Count table sorted by descending count; an empty map shows one
     *  '(none)' row so the group is never a blank body. */
    private fun countTable(colA: String, colB: String, counts: Map<String, Int>): JComponent {
        val rows = if (counts.isEmpty()) {
            listOf(arrayOf("(none)", "0"))
        } else {
            counts.entries.sortedByDescending { it.value }.map { arrayOf(it.key, it.value.toString()) }
        }
        return table(colA, colB, rows)
    }

    private fun humanBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val units = listOf("KB", "MB", "GB", "TB")
        var value = bytes.toDouble() / 1024
        var unit = 0
        while (value >= 1024 && unit < units.size - 1) {
            value /= 1024
            unit++
        }
        return String.format("%.1f %s", value, units[unit])
    }
}
