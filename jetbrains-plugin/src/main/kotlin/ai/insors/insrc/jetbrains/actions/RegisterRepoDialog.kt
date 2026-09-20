package ai.insors.insrc.jetbrains.actions

import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.DaemonUnavailableException
import ai.insors.insrc.jetbrains.daemon.RegistrationResult
import ai.insors.insrc.jetbrains.daemon.SteeringSelection
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.BoxLayout
import javax.swing.JCheckBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTextField

/**
 * The "Register Repo" popup (Story jetbrains-plugin-add-insrc-entry-project /
 * S001). A [DialogWrapper] showing the detected project root (read-only) + two
 * steering toggles (CLAUDE.md / AGENTS.md). Register runs `repo.add` (with the
 * steering selection) OFF the EDT; it closes with a success notification ONLY on
 * `registered == true`, and on a rejection / unreachable daemon it keeps the
 * dialog open with the reason — an error is NEVER read as a silent success.
 */
class RegisterRepoDialog(
    private val project: Project,
    private val projectRootPath: String,
) : DialogWrapper(project, false) {

    private val claudeToggle = JCheckBox("Add insrc steering to CLAUDE.md (Claude Code)")
    private val agentsToggle = JCheckBox("Add insrc steering to AGENTS.md (Codex)")

    @Volatile
    private var disposed = false

    @Volatile
    private var inFlight = false

    init {
        title = "insrc — Register Repo"
        setOKButtonText("Register")
        init()
    }

    override fun dispose() {
        disposed = true
        super.dispose()
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel()
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        panel.border = JBUI.Borders.empty(8)

        val rootRow = JPanel(BorderLayout())
        rootRow.alignmentX = Component.LEFT_ALIGNMENT
        val label = JLabel("Project root:")
        label.border = JBUI.Borders.emptyRight(8)
        rootRow.add(label, BorderLayout.WEST)
        val field = JTextField(projectRootPath)
        field.isEditable = false
        rootRow.add(field, BorderLayout.CENTER)
        panel.add(rootRow)

        val hint = JLabel("Register this project with the insrc daemon. Optionally inject the insrc steering block:")
        hint.border = JBUI.Borders.empty(8, 0)
        hint.alignmentX = Component.LEFT_ALIGNMENT
        panel.add(hint)

        claudeToggle.alignmentX = Component.LEFT_ALIGNMENT
        agentsToggle.alignmentX = Component.LEFT_ALIGNMENT
        panel.add(claudeToggle)
        panel.add(agentsToggle)
        return panel
    }

    override fun doOKAction() {
        if (inFlight) return
        inFlight = true
        setErrorText(null)
        isOKActionEnabled = false
        val steering = SteeringSelection(claude = claudeToggle.isSelected, agents = agentsToggle.isSelected)
        val gateway = service<DaemonGatewayService>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val outcome: Result = try {
                Result.Done(gateway.registerProject(projectRootPath, steering))
            } catch (e: DaemonUnavailableException) {
                Result.Failed(e.message ?: "daemon unavailable")
            } catch (e: RuntimeException) {
                Result.Failed(e.message ?: "unexpected daemon fault")
            }
            ApplicationManager.getApplication().invokeLater({
                if (!disposed) applyOutcome(outcome)
            }, ModalityState.any())
        }
    }

    private fun applyOutcome(outcome: Result) {
        inFlight = false
        when (outcome) {
            is Result.Done ->
                if (outcome.result.registered) {
                    notifySuccess()
                    close(OK_EXIT_CODE)
                } else {
                    // A rejection is NOT a success: keep the dialog open with the reason.
                    isOKActionEnabled = true
                    setErrorText(outcome.result.reason ?: "registration rejected")
                }
            is Result.Failed -> {
                isOKActionEnabled = true
                setErrorText(outcome.reason)
            }
        }
    }

    private fun notifySuccess() {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("insrc")
            .createNotification("insrc: registered this project", NotificationType.INFORMATION)
            .notify(project)
    }

    private sealed interface Result {
        data class Done(val result: RegistrationResult) : Result
        data class Failed(val reason: String) : Result
    }
}
