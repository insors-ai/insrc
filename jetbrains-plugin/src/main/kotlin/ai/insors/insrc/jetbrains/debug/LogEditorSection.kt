package ai.insors.insrc.jetbrains.debug

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.util.ui.JBUI
import java.awt.Component
import java.awt.FlowLayout
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * The Debug page's log section (Story E2026092157298940:S006) — a read-only [DebugSection] (sc3)
 * appended to the S004 [DebugPageHost]. It is JUST a category picker (Daemon/Agent) + an
 * 'Open in editor' affordance: the live log itself opens as a [LogEditorSurface] editor tab (k5),
 * NEVER inline in the settings page.
 *
 * FileEditorManager is project-scoped but the Debug page is application-level, so the affordance
 * resolves a target [Project] via the injectable [projectResolver] (default = the Settings dialog's
 * own DataContext, falling back to the most-recent open project) and degrades to a clear
 * 'open a project to view logs' line when none is open. The 'Open in editor' button lives HERE, not
 * on the DebugConfigurable, so the Debug page's sole-mutating-control invariant (S004's Kill button)
 * is untouched — this affordance opens a read-only view and deletes/rotates/clears nothing (k3/ac2).
 */
class LogEditorSection(
    private val surface: LogEditorSurface = LogEditorSurface(),
    private val projectResolver: (JComponent) -> Project? = ::resolveOpenProject,
) : DebugSection {

    override fun title(): String = "Logs"

    override fun component(): JComponent {
        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
            border = JBUI.Borders.empty(4, 0)
        }
        column.add(row("Open a daemon or agent log as a live, filterable, read-only editor tab."))

        val picker = JComboBox(LogCategories.all.map { it.title }.toTypedArray()).apply {
            alignmentX = Component.LEFT_ALIGNMENT
        }
        val openButton = JButton("Open in editor").apply {
            addActionListener {
                val category = LogCategories.all[picker.selectedIndex.coerceIn(0, LogCategories.all.lastIndex)]
                val project = projectResolver(column)
                if (project == null) {
                    // Degrade to a clear line rather than a silent no-op / NPE (no project open).
                    com.intellij.openapi.ui.Messages.showInfoMessage(
                        "Open a project to view logs — the log opens in that project's editor.",
                        "insrc Debug: Logs",
                    )
                } else {
                    surface.openLog(project, category)
                }
            }
        }
        val controls = JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(6), JBUI.scale(2))).apply {
            alignmentX = Component.LEFT_ALIGNMENT
            add(JLabel("Log:"))
            add(picker)
            add(openButton)
        }
        column.add(controls)
        return column
    }

    private fun row(text: String): JComponent =
        JLabel(text).apply { alignmentX = Component.LEFT_ALIGNMENT }

    companion object {
        /**
         * Resolve the target project for the log editor: the Settings dialog's own DataContext
         * (the page is always reached from a project frame), falling back to the most-recent
         * ([ProjectManager] openProjects first) open project. Null when no project is open. Never
         * throws — a DataContext hiccup falls through to the openProjects scan.
         */
        fun resolveOpenProject(component: JComponent): Project? {
            try {
                val ctx = DataManager.getInstance().getDataContext(component)
                CommonDataKeys.PROJECT.getData(ctx)?.let { return it }
            } catch (e: Exception) {
                // fall through to the openProjects scan
            }
            return ProjectManager.getInstance().openProjects.firstOrNull { !it.isDisposed }
        }
    }
}
