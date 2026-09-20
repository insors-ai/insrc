package ai.insors.insrc.jetbrains.actions

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Source-scan guards for the repo-status popup UX rework (Story
 * ux-rework-shipped-insrc-project-view / S001): the menu-item icon + the
 * accordion/table/fixed-scroll relayout, built on the reusable InsrcCollapsible
 * helper WITHOUT editing the shipped Settings page. The Swing dialog is not
 * headlessly bootable, so — the InsrcSettingsConfigurable source-scan idiom — the
 * load-bearing invariants are asserted against source text.
 */
class RepoStatusPopupLayoutTest {

    private fun read(path: String): String {
        val f = File(path)
        assertTrue(f.exists(), "expected source at $path (test cwd=${File("").absolutePath})")
        return f.readText()
    }

    @Test
    fun `ac1 - the action sets the insrc menu-item icon from pluginIcon_svg`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/ShowOrRegisterRepoAction.kt")
        assertTrue(
            src.contains("IconLoader.getIcon(\"/META-INF/pluginIcon.svg\""),
            "INSRC_ICON must load the bundled pluginIcon.svg via IconLoader",
        )
        assertTrue(src.contains("e.presentation.icon = INSRC_ICON"), "update() must set the presentation icon")
        assertTrue(
            File("src/main/resources/META-INF/pluginIcon.svg").exists(),
            "the referenced pluginIcon.svg resource must exist",
        )
    }

    @Test
    fun `ac2 - the status popup uses collapsible accordion groups with nested tables, not the flat rows`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt")
        assertTrue(src.contains("InsrcCollapsible.collapsiblePanel("), "groups use the shared accordion helper")
        assertTrue(src.contains("JTable("), "each group body is a JTable")
        // the three groups
        assertTrue(src.contains("\"Repository\""), "a Repository group")
        assertTrue(src.contains("\"Files by language\""), "a Files-by-language group")
        assertTrue(src.contains("\"Entities by kind\""), "an Entities-by-kind group")
        // the old flat key:value layout is gone
        assertFalse(src.contains("private fun statsPanel("), "the flat statsPanel layout is replaced")
        assertFalse(src.contains("private fun sectionLabel("), "the flat sectionLabel helper is replaced by table groups")
    }

    @Test
    fun `ac3 - one outer JBScrollPane (AS_NEEDED vertical, NEVER horizontal), no inner scroll pane, over a fixed-size ScrollableColumn`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt")
        assertEquals(
            1,
            Regex("JBScrollPane\\(").findAll(src).count(),
            "there must be EXACTLY ONE (outer) scroll pane — the group tables are content-sized in place",
        )
        assertTrue(src.contains("VERTICAL_SCROLLBAR_AS_NEEDED"), "the outer pane scrolls vertically when content overflows")
        assertTrue(src.contains("HORIZONTAL_SCROLLBAR_NEVER"), "the popup never scrolls horizontally (fills the width)")
        assertTrue(src.contains("ScrollableColumn("), "the accordion lives in the width-tracking ScrollableColumn")

        // The shared helper: width-tracking, height-independent, viewport-independent preferred size.
        val ui = read("src/main/kotlin/ai/insors/insrc/jetbrains/ui/InsrcCollapsible.kt")
        assertTrue(ui.contains("fun collapsiblePanel("), "InsrcCollapsible exposes collapsiblePanel")
        assertTrue(ui.contains("class ScrollableColumn"), "InsrcCollapsible exposes ScrollableColumn")
        assertTrue(ui.contains("Scrollable"), "ScrollableColumn implements Scrollable")
        assertTrue(
            ui.contains("getScrollableTracksViewportHeight(): Boolean = false"),
            "the column never lets the viewport compress it (would clip rows)",
        )
        assertTrue(ui.contains("getScrollableTracksViewportWidth(): Boolean = true"), "the column fills the viewport width")
        // the preferred viewport size must NOT read the live viewport (no feedback loop):
        // it uses the content's own preferred width (floored at a min) + the bounded height.
        assertTrue(
            ui.contains("preferredSize.width.coerceAtLeast(minWidthPx), viewportHeightPx"),
            "the preferred viewport size uses the bounded height + content width (min-floored), never the live viewport",
        )
    }

    @Test
    fun `ac4 - the off-EDT read + disposed guard is preserved and the shipped Settings page is not edited`() {
        val src = read("src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt")
        // off-EDT read + guarded render preserved through the rework
        assertTrue(src.contains("executeOnPooledThread"), "the stats read still runs off the EDT")
        assertTrue(src.contains("invokeLater"), "the render is still marshalled back to the EDT")
        assertTrue(src.contains("if (!disposed) render(result)"), "a late result on a disposed dialog is still dropped")
        assertTrue(src.contains("RepoStatsResult.Unavailable"), "Unavailable still renders a distinct message (not an accordion)")

        // no-regression: the Settings page keeps OWNING its own private helpers (this story does NOT touch it).
        val settings = read("src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt")
        assertTrue(
            settings.contains("private fun collapsiblePanel("),
            "the Settings page must keep its own private collapsiblePanel (untouched by this story)",
        )
        assertTrue(
            settings.contains("class ScrollableContentPanel"),
            "the Settings page must keep its own ScrollableContentPanel (untouched by this story)",
        )
        assertFalse(
            settings.contains("InsrcCollapsible"),
            "the Settings page must NOT be repointed at the new shared helper in this story (a2 rejected — no regression)",
        )
    }
}
