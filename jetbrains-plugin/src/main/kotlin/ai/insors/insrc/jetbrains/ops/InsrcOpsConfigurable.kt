package ai.insors.insrc.jetbrains.ops

import ai.insors.insrc.jetbrains.ui.ScrollableColumn
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.ScrollPaneConstants

/**
 * sc1 (Story E2026092157298940:S001): the shared page-shell base every nested insrc
 * Settings page (Daemon / Workflows / Debug) is built on. It OWNS the off-EDT-load +
 * guarded-render + scroll mechanic once — the exact idiom the shipped
 * [InsrcSettingsConfigurable][ai.insors.insrc.jetbrains.settings.InsrcSettingsConfigurable]
 * `createComponent()` established (k2), generalized here so each page implements ONLY
 * its own body.
 *
 * [createComponent] returns the [JBScrollPane] itself as the TOP-LEVEL component (a
 * plain JPanel gets grown-to-preferred-height + clipped by the Settings dialog, so the
 * pane must be top-level and the scrollbar governs); it shows a loading note, runs the
 * subclass's [buildBody] on a pooled thread, and swaps in the result via a
 * disposed-guarded [invokeLater][ApplicationManager]. A [buildBody] throw renders a
 * plain error label rather than propagating to the EDT.
 *
 * Subclasses supply only [pageTitle] (the nav/tab title) and [buildBody] (the page
 * content, built OFF the EDT). The page is read-only by default: [isModified] is false
 * and [apply]/[reset] are no-ops (a page that needs them overrides them).
 */
abstract class InsrcOpsConfigurable : Configurable {

    /** The Settings nav/tab title for this page. */
    protected abstract fun pageTitle(): String

    /**
     * Build the page body. Called OFF the EDT (on a pooled thread) so a page may do
     * local-socket / file reads without blocking the UI; the base mounts the returned
     * component on the EDT. Must not touch Swing state that requires the EDT beyond
     * constructing components.
     */
    protected abstract fun buildBody(): JComponent

    private var root: JBScrollPane? = null

    /** Set in [disposeUIResources]; the guarded render drops a late result once disposed. */
    @Volatile
    private var disposed = false

    override fun getDisplayName(): String = pageTitle()

    override fun createComponent(): JComponent {
        disposed = false
        val scroll = JBScrollPane(
            JLabel("Loading ${pageTitle()}…"),
            ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
            ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
        )
        scroll.border = JBUI.Borders.empty()
        root = scroll

        // Read/build OFF the EDT (a page body may hit the local socket), then mount on
        // the EDT — but only if this component is still the live, undisposed page.
        ApplicationManager.getApplication().executeOnPooledThread {
            val body: JComponent = try {
                buildBody()
            } catch (e: RuntimeException) {
                // A page-body failure never propagates to the EDT: render it as text.
                JLabel("Could not load ${pageTitle()}: ${e.message ?: e.javaClass.simpleName}")
            }
            ApplicationManager.getApplication().invokeLater({
                if (!disposed && root === scroll) {
                    val column = ScrollableColumn(ScrollableColumn.defaultHeight(), ScrollableColumn.defaultMinWidth())
                    column.layout = BorderLayout()
                    column.add(body, BorderLayout.CENTER)
                    scroll.setViewportView(column)
                    scroll.revalidate()
                    scroll.repaint()
                }
            }, ModalityState.any())
        }
        return scroll
    }

    /** Read-only by default. */
    override fun isModified(): Boolean = false

    /** No-op by default (a read-only page persists nothing). */
    override fun apply() {}

    /** No-op by default. */
    override fun reset() {}

    override fun disposeUIResources() {
        disposed = true
        root = null
    }
}
