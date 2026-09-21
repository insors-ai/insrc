package ai.insors.insrc.jetbrains.ops

import ai.insors.insrc.jetbrains.ui.InsrcCollapsible
import ai.insors.insrc.jetbrains.workflow.StageMark
import ai.insors.insrc.jetbrains.workflow.WorkflowChainDto
import ai.insors.insrc.jetbrains.workflow.WorkflowChainReader
import com.intellij.util.ui.JBUI
import java.awt.Component
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel

/**
 * The Workflows child page (Story E2026092157298940:S001 / sc1 scaffold; body filled by
 * Story E2026092157298940:S003). A strictly READ-ONLY view of the tracked-workflow chain
 * for the open project: it lists every insrc Epic and, per Epic, its define/HLD state,
 * each story's design/approved/stale state, the next-action hint, and the pending/approved
 * amendment counts (ac1). It exposes NO approve/reject/amend control — approvals stay in
 * the existing review surface (ac2/k6) — and shows a clear empty state when the project has
 * no insrc artifacts (ac3).
 *
 * [buildBody] runs OFF the EDT (the sc1 base calls it on a pooled thread), where the local
 * [WorkflowChainReader] file scan happens (k2); it touches neither the daemon nor the
 * parent settings page (k1/k4).
 */
class WorkflowsConfigurable : InsrcOpsConfigurable() {

    private val reader = WorkflowChainReader()

    override fun pageTitle(): String = "Workflows"

    override fun buildBody(): JComponent {
        val chains = reader.readAll()
        val column = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = JBUI.Borders.empty(8)
        }

        if (chains.isEmpty()) {
            column.add(
                JLabel("No insrc workflow artifacts in the open project.").apply {
                    alignmentX = Component.LEFT_ALIGNMENT
                    border = JBUI.Borders.empty(4)
                },
            )
            return column
        }

        for (chain in chains) {
            column.add(InsrcCollapsible.collapsiblePanel(epicTitle(chain), epicCard(chain)))
        }
        return column
    }

    private fun epicTitle(chain: WorkflowChainDto): String =
        (chain.epicSlug?.takeIf { it.isNotBlank() } ?: chain.epicHash) + "  (${chain.epicHash})"

    /** A read-only card for one Epic: define/HLD marks, per-story rows, amendment counts,
     *  and the derived next-action hint. Labels only — no interactive control (k6). */
    private fun epicCard(chain: WorkflowChainDto): JComponent {
        val card = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
        }
        card.add(row("Define", stageText(chain.define)))
        card.add(row("Design (HLD)", stageText(chain.hld)))
        if (chain.stories.isEmpty()) {
            card.add(row("Stories", "none yet"))
        } else {
            for (story in chain.stories) {
                card.add(row("Story ${story.id}", storyText(story)))
            }
        }
        card.add(row("Amendments", "${chain.amendmentsPending} pending, ${chain.amendmentsApproved} approved"))
        card.add(row("Next action", chain.nextActionHint))
        return card
    }

    private fun stageText(mark: StageMark): String = when {
        !mark.exists -> "not started"
        mark.rejected -> "rejected"
        mark.approved -> "approved"
        else -> "pending approval"
    }

    private fun storyText(story: ai.insors.insrc.jetbrains.workflow.StoryChainMark): String {
        if (!story.hasLld) return "no design"
        val parts = mutableListOf(if (story.approved) "approved" else "pending approval")
        if (story.stale) parts.add("stale" + (story.staleReason?.let { " ($it)" } ?: ""))
        return "${story.title} — ${parts.joinToString(", ")}"
    }

    private fun row(label: String, value: String): JComponent =
        JLabel("$label: $value").apply { alignmentX = Component.LEFT_ALIGNMENT }
}
