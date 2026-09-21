package ai.insors.insrc.jetbrains.ops

import ai.insors.insrc.jetbrains.daemon.DaemonActionResult
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.DaemonStatusResult
import ai.insors.insrc.jetbrains.daemon.LifecycleCommand
import ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleCommandRunner
import ai.insors.insrc.jetbrains.ui.InsrcCollapsible
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.ui.Messages
import com.intellij.util.ui.JBUI
import java.awt.Component
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * The Daemon child page (Story E2026092157298940:S001 / sc1 scaffold; body filled by
 * Story E2026092157298940:S002). Consumes sc2's daemonStatus() for a health readout and
 * exposes the six lifecycle actions — Start/Restart/Update via the S002
 * [DaemonLifecycleCommandRunner] (daemon-ctl.sh), Stop/Backup/Compact via the new
 * DaemonGateway IPC methods. Every action runs OFF the EDT under [ProgressManager] so the
 * IDE never freezes (k2); a backup asks for its target directory first (ac2).
 */
class DaemonConfigurable : InsrcOpsConfigurable() {

    private val gateway get() = service<DaemonGatewayService>()
    private val runner: DaemonLifecycleCommandRunner by lazy { DaemonLifecycleCommandRunner.production() }

    override fun pageTitle(): String = "Daemon"

    override fun buildBody(): JComponent {
        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = JBUI.Borders.empty(8)
        }

        // The status card lives in a holder we can repopulate after each action.
        val statusHolder = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
        }
        renderStatus(statusHolder, gateway.daemonStatus())

        val refresh = { renderStatus(statusHolder, readStatusWithProgress()) }

        column.add(InsrcCollapsible.collapsiblePanel("Health", statusHolder))
        column.add(InsrcCollapsible.collapsiblePanel("Lifecycle", lifecyclePanel(refresh)))
        column.add(InsrcCollapsible.collapsiblePanel("Maintenance", maintenancePanel(refresh)))
        return column
    }

    /** Re-read daemonStatus() under a modal progress (off the EDT), returning the result. */
    private fun readStatusWithProgress(): DaemonStatusResult =
        ProgressManager.getInstance().runProcessWithProgressSynchronously<DaemonStatusResult, RuntimeException>(
            { gateway.daemonStatus() }, "Reading daemon status…", true, null,
        )

    /** Populate [holder] from a status result (Loaded fields / a distinct Stopped card / Unavailable reason). */
    private fun renderStatus(holder: JPanel, status: DaemonStatusResult) {
        holder.removeAll()
        when (status) {
            is DaemonStatusResult.Loaded -> {
                val s = status.status
                holder.add(row("State", "running"))
                holder.add(row("Uptime", "${s.uptimeSec}s"))
                holder.add(row("Queue depth", s.queueDepth.toString()))
                holder.add(row("Pending embeddings", s.embeddingsPending.toString()))
                holder.add(row("Model", s.modelPullStatus + (s.modelPullPct?.let { " ($it%)" } ?: "")))
                holder.add(row("Index size", s.lmdbFileSizeMb?.let { "$it MiB" } ?: "—"))
                holder.add(row("Registered repos", s.repoCount.toString()))
            }
            DaemonStatusResult.Stopped ->
                holder.add(row("State", "stopped — use Start to launch the daemon"))
            is DaemonStatusResult.Unavailable ->
                holder.add(row("State", "unavailable: ${status.reason}"))
        }
        holder.revalidate()
        holder.repaint()
    }

    private fun row(label: String, value: String): JComponent =
        JLabel("$label: $value").apply { alignmentX = Component.LEFT_ALIGNMENT }

    /** Start / Stop / Restart / Update. */
    private fun lifecyclePanel(refresh: () -> Unit): JComponent =
        buttonRow(
            actionButton("Start", refresh) { runner.run(LifecycleCommand.START) },
            actionButton("Stop", refresh) { gateway.shutdown() },
            actionButton("Restart", refresh) { runner.run(LifecycleCommand.RESTART) },
            actionButton("Update", refresh) { runner.run(LifecycleCommand.UPDATE) },
        )

    /** Backup (asks where to write) / Compact. */
    private fun maintenancePanel(refresh: () -> Unit): JComponent {
        val backup = JButton("Backup…").apply {
            addActionListener {
                val dir = FileChooser.chooseFile(
                    FileChooserDescriptorFactory.createSingleFolderDescriptor()
                        .withTitle("Choose a Backup Directory"),
                    null, null,
                ) ?: return@addActionListener // cancel -> no call
                runActionThenRefresh("Backup", refresh) { gateway.backup(dir.path) }
            }
        }
        return buttonRow(backup, actionButton("Compact", refresh) { gateway.compact() })
    }

    private fun actionButton(label: String, refresh: () -> Unit, action: () -> DaemonActionResult): JButton =
        JButton(label).apply { addActionListener { runActionThenRefresh(label, refresh, action) } }

    /**
     * Run [action] OFF the EDT under a modal progress (k2 — the IDE never freezes on a
     * socket/script), show the DaemonActionResult outcome, then refresh the status card.
     */
    private fun runActionThenRefresh(label: String, refresh: () -> Unit, action: () -> DaemonActionResult) {
        val result = ProgressManager.getInstance().runProcessWithProgressSynchronously<DaemonActionResult, RuntimeException>(
            { action() }, "$label…", true, null,
        )
        when (result) {
            is DaemonActionResult.Ok -> Messages.showInfoMessage(result.message ?: "$label complete.", "insrc Daemon")
            is DaemonActionResult.Failed -> Messages.showErrorDialog(result.reason, "insrc Daemon: $label Failed")
        }
        ApplicationManager.getApplication().invokeLater { refresh() }
    }

    private fun buttonRow(vararg buttons: JButton): JComponent =
        JPanel().apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
            buttons.forEach { add(it); add(javax.swing.Box.createHorizontalStrut(JBUI.scale(6))) }
        }
}
