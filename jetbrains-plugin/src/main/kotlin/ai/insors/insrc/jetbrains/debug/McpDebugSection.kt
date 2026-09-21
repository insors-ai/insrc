package ai.insors.insrc.jetbrains.debug

import ai.insors.insrc.jetbrains.daemon.AttachedSessionDto
import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.DebugStatusResult
import com.intellij.openapi.components.service
import com.intellij.util.ui.JBUI
import java.awt.Component
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * The Debug page's MCP diagnostic section (Story E2026092157298940:S005) — a read-only
 * [DebugSection] (sc3) contributed to the S004 [DebugPageHost]. It combines two reads:
 *
 *  - a per-host registration table (kind / present / registered) from
 *    [McpRegistrationReader], over the plugin's OWN MCP-client universe (AiHostKind
 *    {AI_ASSISTANT, JUNIE}); and
 *  - an attached-sessions table (id / label / pid / connected-at / last method) from
 *    [DaemonGateway.debugStatus] over the already-shipped `daemon.debug-status` IPC.
 *
 * When [DaemonGateway.debugStatus] is [DebugStatusResult.Unavailable] the sessions table
 * is replaced by a clear 'daemon unreachable' line (ac1 — never a blank); the
 * registration table still renders (it needs no daemon). STRICTLY READ-ONLY: the section
 * exposes no session-closing or mutating control and performs no daemon-mutating IPC
 * (ac2/k3) — the Epic's single mutation stays S004's confirm-gated orphan kill. Both
 * reads never throw (their contracts); [component] is built off the EDT by the sc3 host
 * and mounted under the sc1 base's disposed-guarded invokeLater.
 */
class McpDebugSection(
    private val gateway: DaemonGateway = service<DaemonGatewayService>(),
    private val registration: McpRegistrationReader = McpRegistrationReader(),
) : DebugSection {

    override fun title(): String = "MCP clients"

    override fun component(): JComponent {
        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
            border = JBUI.Borders.empty(4, 0)
        }
        column.add(registrationTable(registration.read()))
        column.add(JLabel(" ").apply { alignmentX = Component.LEFT_ALIGNMENT })
        column.add(sessionsTable(gateway.debugStatus()))
        return column
    }

    // ---- Per-host registration table (needs no daemon) ----------------------

    private fun registrationTable(hosts: List<McpHostStatusDto>): JComponent {
        val panel = column()
        panel.add(header("Registered MCP hosts"))
        if (hosts.isEmpty()) {
            panel.add(row("No MCP hosts detected."))
        } else {
            for (h in hosts) {
                panel.add(row("${h.kind.name}  —  present: ${yesNo(h.present)}, registered: ${yesNo(h.registered)}"))
            }
        }
        return panel
    }

    // ---- Attached-sessions table (from the debug-status read) ----------------

    private fun sessionsTable(result: DebugStatusResult): JComponent {
        val panel = column()
        panel.add(header("Attached sessions"))
        when (result) {
            is DebugStatusResult.Unavailable ->
                // Degrade to a clear line, never a blank (ac1).
                panel.add(row("daemon unreachable: ${result.reason}"))
            is DebugStatusResult.Loaded ->
                if (result.sessions.isEmpty()) {
                    panel.add(row("No sessions attached."))
                } else {
                    for (s in result.sessions) panel.add(row(sessionLine(s)))
                }
        }
        return panel
    }

    private fun sessionLine(s: AttachedSessionDto): String {
        val pid = s.pid?.toString() ?: "—"
        val method = s.lastMethod ?: "—"
        return "#${s.id}  ${s.label}  (pid $pid)  connected ${formatConnectedAt(s.connectedAtMs)}  last: $method"
    }

    /**
     * Render the epoch-ms [connectedAtMs] as a local wall-clock time (it is an absolute
     * instant, not a duration). A non-positive / unparseable value (e.g. a coerced-to-0
     * malformed field) degrades to '—'.
     */
    private fun formatConnectedAt(connectedAtMs: Long): String =
        if (connectedAtMs <= 0L) {
            "—"
        } else {
            try {
                java.time.Instant.ofEpochMilli(connectedAtMs)
                    .atZone(java.time.ZoneId.systemDefault())
                    .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
            } catch (e: Exception) {
                "—"
            }
        }

    // ---- Small read-only Swing helpers (mirror the S004 status card rows) -----

    private fun column(): JPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        alignmentX = Component.LEFT_ALIGNMENT
    }

    private fun header(text: String): JComponent =
        JLabel(text).apply {
            alignmentX = Component.LEFT_ALIGNMENT
            font = font.deriveFont(font.style or java.awt.Font.BOLD)
        }

    private fun row(text: String): JComponent =
        JLabel(text).apply { alignmentX = Component.LEFT_ALIGNMENT }

    private fun yesNo(b: Boolean): String = if (b) "yes" else "no"
}
