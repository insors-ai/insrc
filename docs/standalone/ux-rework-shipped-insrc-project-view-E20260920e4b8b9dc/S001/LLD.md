<!-- insrc:artifact LLD-e4b8b9dc9aa7978a-S001 -->

# LLD: E20260920e4b8b9dc:S001

**Epic:** `ux-rework-shipped-insrc-project-view`
**HLD base run:** `wf-1789927144916-lxatz9`
**HLD effective hash:** `e4b8b9dc9aa7...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `InsrcCollapsible.collapsiblePanel`

```typescript
fun collapsiblePanel(title: String, body: JComponent, expanded: Boolean = true): JComponent
```

**Parameters:**
- `title: String` — The accordion group header label (rendered with a ▾/▸ disclosure marker).
- `body: JComponent` — The group content shown when expanded (a content-sized JTable panel).
- `expanded: Boolean` _(optional)_ — Whether the group starts open (default true).

**Returns:** `JComponent` — A JPanel(BorderLayout) with a JToggleButton ▾/▸ header (NORTH) toggling body.isVisible (CENTER) + revalidate/repaint — the settings-page accordion idiom generalized into a shared, reusable helper.

**Postconditions:**
- Pure Swing construction; no daemon/EDT-threading concern (built on the EDT by the caller).
- Left-aligned (alignmentX=LEFT_ALIGNMENT) so it stacks cleanly in the vertical column.

### `InsrcCollapsible.ScrollableColumn`

```typescript
class ScrollableColumn(viewportHeightPx: Int) : JPanel(), Scrollable
```

**Parameters:**
- `viewportHeightPx: Int` — The bounded preferred viewport HEIGHT (already JBUI-scaled by the caller) the enclosing JBScrollPane sizes to — this is what makes the popup a FIXED size with a scrollbar for overflow.

**Returns:** `ScrollableColumn` — A width-tracking Scrollable BoxLayout column: getScrollableTracksViewportWidth=true, getScrollableTracksViewportHeight=ALWAYS false, getPreferredScrollableViewportSize=Dimension(preferredSize.width, viewportHeightPx) — NEVER reads the live viewport (avoids the width-feedback spiral + grow-to-fit clip the settings page hit). Mirrors ScrollableContentPanel.

**Postconditions:**
- Never reads the live viewport width/height for its preferred size (no layout feedback loop).
- getScrollableTracksViewportHeight is ALWAYS false so the BoxLayout children keep their natural (content) heights and the outer AS_NEEDED scrollbar governs overflow (never clips).

### `ShowOrRegisterRepoAction.update`

```typescript
override fun update(e: AnActionEvent): Unit
```

**Parameters:**
- `e: AnActionEvent` — The action event whose presentation gets the insrc icon set (in addition to the existing text/enabled/REGISTERED_KEY logic).

**Returns:** `Unit` — Unchanged control flow; ADDS e.presentation.icon = INSRC_ICON for both the registered and unregistered branches so the insrc icon shows next to the menu item regardless of state.

**Preconditions:**
- Runs on ActionUpdateThread.BGT (unchanged).

**Postconditions:**
- INSRC_ICON is a companion Icon loaded once via IconLoader.getIcon("/META-INF/pluginIcon.svg", ShowOrRegisterRepoAction::class.java); a load failure yields a null/absent icon (menu item still renders, just without an icon) — never throws.
- No change to the label/enabled/REGISTERED_KEY logic or the off-EDT-safety of the action.

### `RepoStatusDialog.render`

```typescript
private fun render(result: RepoStatsResult): Unit
```

**Parameters:**
- `result: RepoStatsResult` — The off-EDT repoStats read result; Loaded is rendered as accordion groups + tables, Unavailable as a plain wrapping message.

**Returns:** `Unit` — REWORKED: on Loaded builds a ScrollableColumn of collapsiblePanel groups ('Repository' Key/Value table; 'Files by language' Language/Count table; 'Entities by kind' Kind/Count table) wrapped in ONE outer JBScrollPane(VERTICAL_SCROLLBAR_AS_NEEDED, HORIZONTAL_SCROLLBAR_NEVER) set as the dialog body; on Unavailable a plain wrapping message. Replaces the flat statsPanel BoxLayout of key:value rows.

**Preconditions:**
- Called on the EDT via invokeLater, guarded on !disposed (unchanged off-EDT read + disposed guard).

**Postconditions:**
- Each group body is a content-sized JTable (its tableHeader NORTH + table CENTER in a BorderLayout, NO inner scroll pane, rowHeight>=24), so expand/collapse re-flows inside the fixed viewport and only the outer scrollbar scrolls.
- The dialog is a FIXED size: the ScrollableColumn's bounded getPreferredScrollableViewportSize sizes the JBScrollPane viewport; pack() (already called) settles it.
- A never-indexed repo (empty filesByLanguage/entityCountByKind) renders those groups with an empty table (or a '(none)' row), never a blank/crash.

## Data model changes

### `InsrcCollapsible (new shared ui helper)` — new

A new file jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/ui/InsrcCollapsible.kt with the reusable collapsiblePanel(title, body, expanded) accordion header (JToggleButton ▾/▸, body.isVisible toggle + revalidate/repaint) and the ScrollableColumn (JPanel(),Scrollable width-tracking column with a bounded, viewport-independent preferred size). A clean generalization of InsrcSettingsConfigurable's PRIVATE collapsiblePanel/headerText + ScrollableContentPanel — the settings page is NOT edited (a2/a3 rejected). Consumed only by RepoStatusDialog now; a future story may migrate the settings page onto it.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt`

### `RepoStatusDialog` — invariant-change

The Loaded render changes from a flat BoxLayout(Y_AXIS) of row(key,value) JPanels + sectionLabel()s to a ScrollableColumn of collapsiblePanel accordion groups whose bodies are content-sized JTables (Repository Key/Value; Files-by-language Language/Count; Entities-by-kind Kind/Count), inside ONE outer JBScrollPane(VERTICAL_SCROLLBAR_AS_NEEDED, HORIZONTAL_SCROLLBAR_NEVER) returned as the fixed-size dialog body. PRESERVED unchanged: the off-EDT repoStats read (executeOnPooledThread), the invokeLater render guarded on @Volatile disposed, the Unavailable-as-plain-message branch, OK-only, and the humanBytes(Long) helper. The old row()/sectionLabel()/statsPanel() helpers are replaced by table-model builders.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/actions/RepoStatusDialog.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### `ShowOrRegisterRepoAction (presentation icon)` — field-add

Add a companion INSRC_ICON = IconLoader.getIcon("/META-INF/pluginIcon.svg", ShowOrRegisterRepoAction::class.java) and set e.presentation.icon = INSRC_ICON in update() for both branches. No change to getActionUpdateThread=BGT, the label logic, the REGISTERED_KEY stash, or actionPerformed's reuse-the-flag behaviour.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/actions/ShowOrRegisterRepoAction.kt`
- `jetbrains-plugin/src/main/resources/META-INF/pluginIcon.svg`

## Error paths

### Error cases

- **The pluginIcon.svg resource cannot be loaded (missing/renamed/corrupt).** (recoverable)
  - Detection: IconLoader.getIcon returns an empty/placeholder icon (it does not throw for a missing path); the companion INSRC_ICON is initialized once at class load.
  - Response: The menu item renders with no (or a blank) icon; the action's text/enabled/branch logic is unaffected. Never crashes the menu build.
  - User impact: Cosmetic only — the item still reads 'Show Repo status'/'Register Repo' and works.
- **The daemon is unreachable / repo.stats framed an error when the Status dialog opens (unchanged path).** (recoverable)
  - Detection: gateway.repoStats returns RepoStatsResult.Unavailable (already: catches DaemonUnavailableException/RuntimeException); render() matches Unavailable.
  - Response: Render the plain wrapping 'Repo stats unavailable: <reason>' message — NOT an empty accordion (no groups/tables for a failure).
  - User impact: The user sees the explicit unavailable reason, same as before the rework.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A never-indexed / empty repo: filesByLanguage and entityCountByKind are empty maps, fileCount/entityCount 0. | The 'Files by language' and 'Entities by kind' accordion groups still render — their tables show zero rows (or a single '(none)' row) under the header; the Repository group shows the real zero counts. No blank panel, no crash. |
| Very long content: a repo with many languages/kinds so the expanded groups exceed the fixed viewport height. | The single outer JBScrollPane's vertical scrollbar (AS_NEEDED) appears and scrolls; the popup stays its fixed size and never grows to fit or clips (ScrollableColumn tracksViewportHeight=false, bounded preferred viewport size). |
| The user collapses all accordion groups. | Each collapsiblePanel hides its body (isVisible=false) + revalidate/repaint; the column shrinks to the headers within the fixed viewport; no horizontal scrollbar ever appears (HORIZONTAL_SCROLLBAR_NEVER, width-tracking). |
| The dialog is closed before the off-EDT repoStats read completes. | The invokeLater render is still guarded on !disposed (unchanged), so a late result is dropped — no render into a disposed dialog. |
| An unknown/long status string or a very long repoPath in the Repository table. | Rendered verbatim in the Key/Value table cell; the width-tracking column + NEVER-horizontal scroll means the cell fits the width (table column sizing), no horizontal scrollbar. |

### Invariants to preserve

- All daemon I/O stays OFF the EDT: repoStats is read via executeOnPooledThread and the render is marshalled back via invokeLater guarded on @Volatile disposed — the rework only changes WHAT render() builds, never that it runs guarded on the EDT. [[c2]]
- An Unavailable result is rendered as a distinct plain message, never as an empty accordion or fabricated zero-tables — the failure branch stays visually distinct from a real (possibly zero-count) Loaded repo. [[c2]]
- The fixed-size + scroll-as-needed behaviour uses a viewport-INDEPENDENT bounded preferred size (getScrollableTracksViewportHeight ALWAYS false; getPreferredScrollableViewportSize never reads the live viewport) inside ONE outer JBScrollPane(AS_NEEDED vertical / NEVER horizontal) — the exact mechanic the settings page needed to avoid the width-feedback spiral and the grow-to-fit clip; no inner scroll panes, no maximumSize caps, no vertical glue. [[c4]]
- The shipped settings page (InsrcSettingsConfigurable) and its hardened private collapsiblePanel/ScrollableContentPanel are NOT edited by this Story (chosen alt a1) — the new shared ui helper is a clean copy consumed only by the dialog, so the 0.2.10 vertical-scroll fix cannot regress. [[c3]]
- The daemon repo.stats/repo.add IPCs, DaemonGateway.repoStats/registerProject, and RegisterRepoDialog are UNCHANGED — this Story only reformats the already-parsed RepoStatsDto and adds a presentation icon. [[c1]]

## Test strategy

**Test framework:** `JUnit (kotlin.test/JUnit5 source-scan tests via File(path).readText()) — the existing plugin idiom (ShowOrRegisterRepoActionTest / InsrcSettingsConfigurableTest). The Swing dialog + accordion are not headlessly bootable, so they are asserted against source text. No GitHub CI; verified locally with JDK21 gradlew test buildPlugin.`

### Test levels

- **contract** — Source-scan the reworked non-bootable UI: the action's presentation icon + the RepoStatusDialog accordion/table/fixed-scroll relayout, without regressing the off-EDT read.
  - Subjects: `ShowOrRegisterRepoAction: a companion INSRC_ICON = IconLoader.getIcon("/META-INF/pluginIcon.svg", ...) and e.presentation.icon = INSRC_ICON set in update() (icon shows next to the menu item)`, `RepoStatusDialog Loaded render uses the accordion + tables: references collapsiblePanel( (or the shared InsrcCollapsible helper) + JTable + a Language/Kind grouping, and NO longer the old flat row()/statsPanel BoxLayout`, `RepoStatusDialog wraps the groups in ONE outer JBScrollPane with VERTICAL_SCROLLBAR_AS_NEEDED + HORIZONTAL_SCROLLBAR_NEVER and NO inner scroll pane (the fixed-size + scroll-as-needed popup)`, `RepoStatusDialog still reads gateway.repoStats OFF the EDT (executeOnPooledThread + invokeLater) guarded on !disposed, and still renders a distinct Unavailable message (not an accordion)`, `InsrcCollapsible: collapsiblePanel(title, body, expanded) exists + ScrollableColumn is Scrollable with getScrollableTracksViewportHeight(): Boolean = false and a getPreferredScrollableViewportSize that does NOT read the live viewport`, `InsrcSettingsConfigurable.kt is NOT modified by this Story (chosen alt a1 — no settings-page regression); asserted by the absence of a diff / the settings source still owning its own private helpers`
  - Fixtures: `File(path).readText() over the action, dialog, new InsrcCollapsible source, and plugin resources (test cwd = jetbrains-plugin)`
- **smoke** — Confirm the whole plugin still compiles + all tests pass + the ZIP builds after the UI rework.
  - Subjects: `gradlew test buildPlugin (JDK21, --no-build-cache) is green and produces the plugin ZIP`
  - Fixtures: `JDK21 (amazon-corretto-21) + the Gradle wrapper`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `contract: ShowOrRegisterRepoAction sets e.presentation.icon = INSRC_ICON loaded via IconLoader from pluginIcon.svg` |
| `ac2` | `contract: RepoStatusDialog Loaded render uses collapsiblePanel + JTable groups (Repository / Files-by-language / Entities-by-kind), not the flat row()/statsPanel BoxLayout` |
| `ac3` | `contract: RepoStatusDialog wraps the accordion in one outer JBScrollPane VERTICAL_SCROLLBAR_AS_NEEDED + HORIZONTAL_SCROLLBAR_NEVER with no inner scroll pane`, `contract: InsrcCollapsible.ScrollableColumn getScrollableTracksViewportHeight=false + viewport-independent preferred size (fixed-size popup + scrollbar as needed)` |
| `ac4` | `contract: RepoStatusDialog still reads gateway.repoStats off the EDT (executeOnPooledThread+invokeLater) guarded on !disposed and still shows a distinct Unavailable message`, `contract: InsrcSettingsConfigurable.kt is unmodified (no settings-page regression)`, `smoke: gradlew test buildPlugin green` |

## Migration

**State before:** Plugin 0.3.0: the ShowOrRegisterRepoAction menu item has NO icon (update() sets only text/enabled/REGISTERED_KEY); RepoStatusDialog renders the Loaded stats as a flat BoxLayout(Y_AXIS) of row(key,value) JPanels + sectionLabel()s (statsPanel), OK-only, off-EDT read guarded on disposed. The reusable collapsiblePanel + content-sized-JTable + ScrollableContentPanel idioms exist only PRIVATELY inside InsrcSettingsConfigurable.kt (s1 usage/symbol bundles).

**State after:** The menu item shows the insrc icon (presentation.icon from pluginIcon.svg) on both branches; RepoStatusDialog renders Loaded stats as accordion collapsiblePanel groups (Repository / Files-by-language / Entities-by-kind) with nested content-sized JTables inside ONE outer JBScrollPane (AS_NEEDED vertical / NEVER horizontal) at a FIXED popup size; the accordion + width-tracking scrollable column live in a new shared ui helper (InsrcCollapsible). Unavailable still a plain message; the off-EDT read + disposed guard unchanged; InsrcSettingsConfigurable untouched.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new shared ui helper file InsrcCollapsible (collapsiblePanel + ScrollableColumn) generalized from the settings-page idioms. Purely additive; nothing consumes it yet. — ↩ rollbackable
2. Add the companion INSRC_ICON to ShowOrRegisterRepoAction and set presentation.icon in update() for both branches. Additive; no logic change. — ↩ rollbackable
3. Rework RepoStatusDialog's Loaded render to build accordion groups + per-group JTables via the shared helper inside one outer JBScrollPane; replace the old row()/sectionLabel()/statsPanel helpers with table-model builders; keep the off-EDT read, disposed guard, humanBytes, and the Unavailable branch. UI-internal change. — ↩ rollbackable
4. Extend the source-scan tests (ShowOrRegisterRepoActionTest) for the icon + the accordion/table/fixed-scroll relayout + the no-settings-page-edit assertion; run the suite locally under JDK21 gradlew test buildPlugin (no GitHub CI). — ↩ rollbackable

**Backward compat:** No public API or contract changes: the DaemonGateway.repoStats/registerProject methods, the daemon repo.stats/repo.add IPCs, and RegisterRepoDialog are UNCHANGED — this Story only reformats the already-parsed RepoStatsDto and adds a presentation icon. The new InsrcCollapsible helper is additive (net-new, consumed only by RepoStatusDialog). InsrcSettingsConfigurable keeps its own private helpers, so the hardened 0.2.10 settings-scroll behaviour is unaffected. A full rollback is simply reverting the three files + the new helper; no data or persisted state is involved.

## Alternatives considered

### a1: New shared ui util, settings page untouched — **CHOSEN**

Add a small shared ui helper (collapsiblePanel + a Scrollable width-tracking column) in a new ui package, use it in RepoStatusDialog + set the action icon; leave InsrcSettingsConfigurable's private copies as-is.

Create a new file jetbrains-plugin/.../ui/InsrcCollapsible.kt exposing collapsiblePanel + a public ScrollableColumn (a clean copy of the two settings-page idioms, generalized); RepoStatusDialog.render(Loaded) builds a ScrollableColumn of collapsiblePanel groups with per-group content-sized JTables inside one outer JBScrollPane(AS_NEEDED/NEVER); the action gains INSRC_ICON on its presentation. InsrcSettingsConfigurable is NOT edited.

### a2: Extract to shared util AND repoint the settings page

Move collapsiblePanel + ScrollableContentPanel out of InsrcSettingsConfigurable into the shared ui util and make BOTH surfaces consume it.

Same shared util as a1 but also delete the private helpers from InsrcSettingsConfigurable and repoint it to the shared helper (single source of truth).

**Rejected because:** VIOLATES c-noregress: it edits the shipped, hard-won settings page (the 0.2.10 vertical-scroll + ScrollableContentPanel fix) — a real regression risk for zero user-facing gain in this small story.

### a3: Replicate a trimmed copy privately in the dialog

Inline a small private collapsiblePanel + Scrollable-column directly in RepoStatusDialog.kt; no shared util, settings untouched.

Add the accordion header + Scrollable column as PRIVATE helpers inside RepoStatusDialog.kt, used only by the dialog; same grouping + outer JBScrollPane + icon change as a1.

**Rejected because:** Only partial on c-reuse: a private third copy of the idiom with no shared/testable surface — the next UI that needs an accordion copies it again. a1 delivers the reuse at the same S cost.

## Citations

- **[[c1]]** `analyze-bundle` `s1 usage.example/data-model.trace — ShowOrRegisterRepoAction (no icon) + RepoStatusDialog (flat BoxLayout rows) + RepoStatsDto fields; daemon repo.stats/repo.add + gateway UNCHANGED` — "update() sets e.presentation.isEnabledAndVisible + e.presentation.text ... it currently sets NO icon"
- **[[c2]]** `analyze-bundle` `s1 data-model.trace — RepoStatusDialog off-EDT read (executeOnPooledThread) + invokeLater render guarded on @Volatile disposed + Unavailable-as-plain-message` — "reading gateway.repoStats(root) off the EDT (executeOnPooledThread) and rendering on the EDT via invokeLater guarded on @Volatile disposed"
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — the collapsiblePanel + content-sized-JTable + ScrollableContentPanel idioms currently PRIVATE to InsrcSettingsConfigurable` — "these are private members of InsrcSettingsConfigurable (collapsiblePanel/headerText) and a private top-level class (ScrollableContentPanel)"
- **[[c4]]** `analyze-bundle` `s1 usage.example — the fixed-size + scroll-as-needed mechanic (bounded getPreferredScrollableViewportSize, tracksHeight false, one outer JBScrollPane AS_NEEDED/NEVER)` — "getPreferredScrollableViewportSize returns a BOUNDED (JBUI.scale(500)) height ... AS_NEEDED vertical / NEVER horizontal ... no inner scroll panes, no per-panel maximumSize caps, no vertical glue"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-20T18:06:10.915Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| q1 | citation | LOW | manual | The reusable collapsiblePanel + ScrollableContentPanel accordion/scrollable idioms the LLD generalizes exist today PRIVATELY in InsrcSettingsConfigurable.kt. | CONFIRMED: InsrcSettingsConfigurable.kt:279 `private fun collapsiblePanel(...)`, :364 `private class ScrollableContentPanel : JPanel(), Scrollable`, :390 `getScrollableTracksViewportHeight(): Boolean = false` — the exact idioms the new InsrcCollapsible generalizes. | none — verified sound. |
| q2 | citation | LOW | manual | RepoStatusDialog today renders Loaded stats with the flat statsPanel/row/sectionLabel BoxLayout the rework replaces, and does the off-EDT read via executeOnPooledThread + invokeLater guarded on a disposed flag. | CONFIRMED: RepoStatusDialog.kt:77 `private fun statsPanel(s: RepoStatsDto)` (the flat layout the rework replaces), :55 executeOnPooledThread + :60 `if (!disposed) render(result)` — the off-EDT read + disposed guard the rework preserves. | none — verified sound. |
| q3 | citation | LOW | manual | ShowOrRegisterRepoAction currently sets no presentation icon (only text/enabled/REGISTERED_KEY), so adding INSRC_ICON is additive. | CONFIRMED: ShowOrRegisterRepoAction.kt sets presentation.text (:39) + putClientProperty(REGISTERED_KEY) (:38) but grep for presentation.icon finds NO source match — so adding INSRC_ICON is genuinely additive. | none — verified sound. |
| q4 | citation | LOW | manual | The pluginIcon.svg resource the icon loads from exists under META-INF. | CONFIRMED by direct inspection: jetbrains-plugin/src/main/resources/META-INF/pluginIcon.svg exists (13KB, valid `<svg ... viewBox="0 0 256 256">`). The review-engine grep is scoped to the daemon src/ so it didn't surface the plugin resource; IconLoader scales the SVG to the menu-icon size. | none — verified sound (resource present). |
| q5 | semantic | LOW | manual | RepoStatsResult (Loaded/Unavailable) + RepoStatsDto (with filesByLanguage/entityCountByKind maps) that render() groups into tables already exist in DaemonGateway.kt and are consumed unchanged. | CONFIRMED: DaemonGateway.kt:344 `sealed interface RepoStatsResult`, :322 `data class RepoStatsDto`, and RepoStatusDialog.kt:90/96 already read s.filesByLanguage / s.entityCountByKind — the DTO/result are consumed unchanged; the rework only regroups them into tables. | none — verified sound. |
