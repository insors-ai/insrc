package ai.insors.insrc.jetbrains.review

import ai.insors.insrc.jetbrains.daemon.DaemonGateway
import ai.insors.insrc.jetbrains.daemon.DaemonGatewayService
import ai.insors.insrc.jetbrains.daemon.PendingArtifactDto
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.content.ContentFactory
import com.intellij.util.Alarm
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.CardLayout
import java.util.concurrent.atomic.AtomicInteger
import javax.swing.DefaultListModel
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.SwingConstants

/**
 * The review tool window (Story S001 / sc1, t4). Registered off the shared
 * platform module only (plugin.xml `toolWindow` extension), so the ONE plugin
 * artifact hosts it identically in IntelliJ IDEA, PyCharm, GoLand and WebStorm.
 *
 * S001 owns the pending-LIST host only: it renders the pending set, "nothing
 * awaiting review", and "backing service unavailable". Selecting an artifact to
 * view its rendered content (and annotate/approve it) is s2+'s scope, consumed
 * later against the same [PendingArtifactDto] list this window shows.
 */
internal class ReviewToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = ReviewPanel(project, toolWindow, toolWindow.disposable)
        val content = ContentFactory.getInstance().createContent(panel.component, "", false)
        toolWindow.contentManager.addContent(content)
        panel.start()
    }
}

/**
 * The pending-list surface + its bounded poll driver. Discovery is bounded by
 * design (k7): an initial poll on creation, a refresh when the window becomes
 * visible (IDE focus), and a coarse self-rescheduling timer — never a hot loop
 * and never a held-open subscription. The one-shot [DaemonGateway] call runs on
 * a pooled thread; rendering is marshalled back to the EDT.
 */
internal class ReviewPanel(
    private val project: Project,
    private val toolWindow: ToolWindow,
    private val parentDisposable: Disposable,
) {
    private val gateway: DaemonGateway = service<DaemonGatewayService>()
    private val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, parentDisposable)

    // Monotonic poll generation. Every refreshNow() bumps it; a poll only
    // renders + reschedules while it still owns the current generation, so a
    // focus refresh that arrives while an earlier poll is mid-flight collapses
    // the two chains into one instead of leaving two self-rescheduling loops
    // running (k7: bounded discovery, never a growing poll loop).
    private val generation = AtomicInteger(0)

    // CardLayout keeps the three states strictly distinct — showing one card
    // never leaves a stale list behind (ac2: unavailable never shows as empty).
    private val cards = CardLayout()
    private val root = JPanel(cards)
    private val listModel = DefaultListModel<PendingArtifactDto>()
    private val list = JBList(listModel).apply { cellRenderer = PendingArtifactRenderer() }
    private val statusLabel = JBLabel("", SwingConstants.CENTER).apply { border = JBUI.Borders.empty(16) }

    val component: JComponent get() = root

    init {
        root.add(JBScrollPane(list), CARD_LIST)
        root.add(statusLabel, CARD_STATUS)
        // Neutral initial card so the empty JBList is never mistaken for
        // "nothing pending" before the first poll lands (#4b).
        statusLabel.text = "Checking for artifacts awaiting review…"
        cards.show(root, CARD_STATUS)
    }

    /** Wire the bounded triggers (visibility + coarse timer) and poll once now. */
    fun start() {
        // IDE-focus trigger: refresh when our tool window is (re)shown.
        project.messageBus.connect(parentDisposable).subscribe(
            ToolWindowManagerListener.TOPIC,
            object : ToolWindowManagerListener {
                override fun stateChanged(manager: com.intellij.openapi.wm.ToolWindowManager) {
                    if (toolWindow.isVisible) refreshNow()
                }
            },
        )
        refreshNow()
    }

    /** Cancel any queued poll and start a NEW generation immediately (initial / focus trigger). */
    private fun refreshNow() {
        val g = generation.incrementAndGet()
        alarm.cancelAllRequests()
        schedule(g, 0)
    }

    /** Queue one poll for generation [gen], tolerating a dispose race (#4a). */
    private fun schedule(gen: Int, delayMs: Int) {
        if (alarm.isDisposed) return
        try {
            alarm.addRequest({ poll(gen) }, delayMs)
        } catch (_: RuntimeException) {
            // Alarm disposed between the check and here — nothing left to do.
        }
    }

    /**
     * One bounded poll cycle for generation [gen] (on the Alarm's pooled
     * thread): a superseded generation (a newer refreshNow ran) no-ops so only
     * the latest chain survives. Otherwise query the daemon, render on the EDT,
     * then reschedule the SAME generation a coarse interval out. A rootless/light
     * project has nothing to review — NothingPending, not a false "unavailable".
     */
    private fun poll(gen: Int) {
        if (gen != generation.get()) return   // superseded by a newer refresh
        val repo = project.basePath
        val view = if (repo.isNullOrEmpty()) {
            ReviewListView.NothingPending
        } else {
            ReviewListViews.of(gateway.pendingArtifacts(repo))
        }
        ApplicationManager.getApplication().invokeLater(
            { if (gen == generation.get()) render(view) },
            project.disposed,
        )
        schedule(gen, COARSE_POLL_INTERVAL_MS)
    }

    private fun render(view: ReviewListView) {
        when (view) {
            is ReviewListView.Pending -> {
                listModel.clear()
                view.artifacts.forEach(listModel::addElement)
                cards.show(root, CARD_LIST)
            }
            ReviewListView.NothingPending -> {
                statusLabel.text = "Nothing awaiting review."
                cards.show(root, CARD_STATUS)
            }
            is ReviewListView.Unavailable -> {
                // Distinct from empty — never blanks to an empty list (ac2).
                statusLabel.text = "insrc backing service unavailable — ${view.reason}"
                cards.show(root, CARD_STATUS)
            }
        }
    }

    private companion object {
        const val CARD_LIST = "list"
        const val CARD_STATUS = "status"
        // Coarse: a background freshness check, not a live subscription (k7).
        const val COARSE_POLL_INTERVAL_MS = 15_000
    }
}

/** Renders one pending artifact as `[KIND] title` with an open-question hint. */
private class PendingArtifactRenderer : ColoredListCellRenderer<PendingArtifactDto>() {
    override fun customizeCellRenderer(
        list: JList<out PendingArtifactDto>,
        value: PendingArtifactDto?,
        index: Int,
        selected: Boolean,
        hasFocus: Boolean,
    ) {
        if (value == null) return
        append("${value.kind}  ", SimpleTextAttributes.GRAYED_ATTRIBUTES)
        append(value.title, SimpleTextAttributes.REGULAR_ATTRIBUTES)
        if (value.openQuestionCount > 0) {
            val q = if (value.openQuestionCount == 1) "1 open question" else "${value.openQuestionCount} open questions"
            append("   ($q)", SimpleTextAttributes.GRAY_ITALIC_ATTRIBUTES)
        }
    }
}
