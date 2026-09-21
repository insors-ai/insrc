package ai.insors.insrc.jetbrains.debug

import javax.swing.JComponent

/**
 * sc3 (Story E2026092157298940:S004): one read-only collapsible area on the Debug page.
 * A section supplies its [title] and its [component] (built off the EDT by the section,
 * mounted under the sc1 page shell). S005 (MCP/sessions) and S006 (log-open) contribute
 * their own sections without re-owning the Debug page.
 */
interface DebugSection {
    fun title(): String
    fun component(): JComponent
}

/**
 * sc3 (Story E2026092157298940:S004): the Debug page's section-host. S004's
 * DebugConfigurable implements this and seeds [sections] with the Status + Orphans
 * sections; consuming stories append their own [DebugSection] to the ordered list —
 * the section-additive contract (they do not modify S004's sections).
 */
interface DebugPageHost {
    fun sections(): List<DebugSection>
}
