package ai.insors.insrc.jetbrains.ui

import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.Rectangle
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JToggleButton
import javax.swing.Scrollable
import javax.swing.SwingConstants

/**
 * Shared Swing helpers for insrc popups (Story ux-rework-shipped-insrc-project-view
 * / S001) — a clean, reusable generalization of the accordion + width-tracking
 * scrollable column that the Settings page (InsrcSettingsConfigurable) keeps as
 * its own private copies. Extracting them here lets the repo-status popup reuse
 * the exact proven mechanic WITHOUT editing the shipped settings page (a future
 * story may migrate the settings page onto these).
 */
object InsrcCollapsible {

    /**
     * An accordion group: a [JToggleButton] header (with a ▾/▸ disclosure marker)
     * over [body], which is shown iff the group is expanded. Toggling the header
     * flips body.isVisible + revalidate/repaint. Left-aligned so it stacks cleanly
     * in a vertical [ScrollableColumn]. Pure Swing — built on the EDT by the caller.
     */
    fun collapsiblePanel(title: String, body: JComponent, expanded: Boolean = true): JComponent {
        val panel = JPanel(BorderLayout())
        panel.alignmentX = Component.LEFT_ALIGNMENT
        val header = JToggleButton(headerText(title, expanded), expanded).apply {
            horizontalAlignment = SwingConstants.LEFT
            isFocusPainted = false
            isContentAreaFilled = false
            border = BorderFactory.createEmptyBorder(4, 2, 4, 2)
        }
        body.isVisible = expanded
        header.addActionListener {
            val open = header.isSelected
            header.text = headerText(title, open)
            body.isVisible = open
            panel.revalidate()
            panel.repaint()
        }
        panel.add(header, BorderLayout.NORTH)
        panel.add(body, BorderLayout.CENTER)
        return panel
    }

    private fun headerText(title: String, expanded: Boolean): String = "${if (expanded) "▾" else "▸"} $title"
}

/**
 * A width-tracking [Scrollable] column (Story ux-rework-shipped-insrc-project-view
 * / S001), mirroring the Settings page's ScrollableContentPanel. It fills the
 * enclosing viewport's WIDTH but keeps its natural (content) HEIGHT, so one outer
 * `JBScrollPane(AS_NEEDED vertical, NEVER horizontal)` gives a FIXED-size popup
 * with a vertical scrollbar for overflow and never clips.
 *
 * [getPreferredScrollableViewportSize] returns a bounded height ([viewportHeightPx],
 * already JBUI-scaled by the caller) and the content's OWN preferred width — it
 * NEVER reads the live viewport, so there is no layout feedback loop (the
 * width-feedback spiral / grow-to-fit clip the settings page had to fix).
 */
class ScrollableColumn(
    private val viewportHeightPx: Int,
    private val minWidthPx: Int = 0,
) : JPanel(), Scrollable {

    override fun getPreferredScrollableViewportSize(): Dimension =
        // The width is the content's OWN preferred width (never the live viewport),
        // floored at minWidthPx so a JTable's default narrow columns don't birth a
        // cramped popup that truncates its own values on first paint.
        Dimension(preferredSize.width.coerceAtLeast(minWidthPx), viewportHeightPx)

    override fun getScrollableTracksViewportWidth(): Boolean = true

    /** ALWAYS false: never let the viewport compress this column below its natural
     *  (content) height — that would squeeze the content-sized, no-scrollbar tables
     *  so their rows clip and the outer scrollbar vanishes. */
    override fun getScrollableTracksViewportHeight(): Boolean = false

    override fun getScrollableUnitIncrement(visibleRect: Rectangle, orientation: Int, direction: Int): Int = 16

    override fun getScrollableBlockIncrement(visibleRect: Rectangle, orientation: Int, direction: Int): Int =
        if (orientation == SwingConstants.VERTICAL) visibleRect.height else visibleRect.width

    companion object {
        /** A sensible default popup viewport height for the repo-status dialog. */
        fun defaultHeight(): Int = JBUI.scale(420)

        /** A sensible minimum popup content width so long path/value text is readable
         *  on first paint (the popup stays user-resizable beyond this). */
        fun defaultMinWidth(): Int = JBUI.scale(480)
    }
}
