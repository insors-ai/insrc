package ai.insors.insrc.jetbrains.actions

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.RepoStatsDto
import ai.insors.insrc.jetbrains.daemon.RepoStatsResult
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * The "Show Repo status" popup (Story jetbrains-plugin-add-insrc-entry-project /
 * S001). A read-only [DialogWrapper] that reads `repo.stats` for [projectRootPath]
 * OFF the EDT (the local-socket round-trip) and renders the rich fields on the
 * EDT, guarded on the dialog still being live. On [RepoStatsResult.Unavailable] it
 * shows a distinct message (never a blank panel or fabricated zeros). OK-only.
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
            is RepoStatsResult.Loaded -> statsPanel(result.stats)
            is RepoStatsResult.Unavailable -> JLabel("Repo stats unavailable: ${result.reason}")
        }
        body.add(content, BorderLayout.CENTER)
        body.revalidate()
        body.repaint()
        pack()
    }

    private fun statsPanel(s: RepoStatsDto): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.add(row("Path", s.repoPath))
        panel.add(row("Status", s.status))
        s.lastIndexed?.let { panel.add(row("Last indexed", it)) }
        panel.add(row("Added", s.addedAt))
        s.errorMsg?.let { panel.add(row("Error", it)) }
        panel.add(row("Files", s.fileCount.toString()))
        panel.add(row("Size", humanBytes(s.sizeBytes)))
        panel.add(row("Entities", s.entityCount.toString()))
        panel.add(row("Relations", s.relationCount.toString()))
        panel.add(row("Pending jobs", s.pendingJobs.toString()))
        if (s.filesByLanguage.isNotEmpty()) {
            panel.add(sectionLabel("Files by language"))
            for ((lang, n) in s.filesByLanguage.entries.sortedByDescending { it.value }) {
                panel.add(row("  $lang", n.toString()))
            }
        }
        if (s.entityCountByKind.isNotEmpty()) {
            panel.add(sectionLabel("Entities by kind"))
            for ((kind, n) in s.entityCountByKind.entries.sortedByDescending { it.value }) {
                panel.add(row("  $kind", n.toString()))
            }
        }
        return panel
    }

    private fun sectionLabel(text: String): JComponent {
        val label = JLabel(text)
        label.border = JBUI.Borders.emptyTop(8)
        label.alignmentX = Component.LEFT_ALIGNMENT
        return label
    }

    private fun row(key: String, value: String): JComponent {
        val panel = JPanel(BorderLayout())
        panel.alignmentX = Component.LEFT_ALIGNMENT
        panel.border = JBUI.Borders.emptyBottom(2)
        val k = JLabel("$key:")
        k.border = JBUI.Borders.emptyRight(12)
        panel.add(k, BorderLayout.WEST)
        panel.add(JLabel(value), BorderLayout.CENTER)
        return panel
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
