<!-- insrc:artifact LLD-9225688d966a8588-S001 -->

# LLD: E202609209225688d:S001

**Epic:** `re-author-s001-lld-collapsible-sections`
**HLD base run:** `wf-1789903113653-bjwxm4`
**HLD effective hash:** `3d393f126c41...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `InsrcSettingsConfigurable.createComponent`

```typescript
override fun createComponent(): JComponent
```

**Returns:** `JComponent` — RE-RESHAPED (a1 master-detail -> a2 collapsible sections): the off-EDT read (settingsCatalog + perRoleOverrides + perRepoOverrides + registeredRepos, invokeLater guarded on root===panel) and the Unavailable placeholder are UNCHANGED. On Loaded it now renders ONE vertically-scrolling page (a BoxLayout content panel in ONE AS_NEEDED JScrollPane) of collapsible panels: one per SettingsView.groupsOf category (a toggle header '▾/▸ group' over the category's editable SettingsTableModel JTable body, the body sized to its content so the OUTER scrollbar governs) then one per registered SettingsSection (a toggle header over section.component()). 'General' is expanded on first render, the rest collapsed. The JTree/JBSplitter/CardLayout of a1 are gone. The sections list, SettingsEditModel, apply/isModified/reset fan-out, and refreshTables() all stay.

**Errors:**
- `none` when reads never throw (sealed results); an Unavailable catalog renders the existing placeholder, no panels.

**Preconditions:**
- Loaded catalog to render the panels; an Unavailable read keeps the placeholder path.

**Postconditions:**
- Overflow scrolls (one outer AS_NEEDED JScrollPane, content-sized tables, ac1); categories are collapsible panels (ac2); General is expanded on first render (ac5); the override sections are their own collapsible panels (ac7).

### `SettingsView.settingsTree`

```typescript
fun settingsTree(catalog: SettingsCatalogDto, sectionTitles: List<String>): SettingsTree
```

**Parameters:**
- `catalog: SettingsCatalogDto` — The loaded config.catalog payload whose categories (via groupsOf) become the collapsible category panels.
- `sectionTitles: List<String>` — The registered override section titles, appended after the categories as their own panels.

**Returns:** `SettingsTree` — REPURPOSED from the a1 master-detail builder to the a2 collapsible-panel builder: the ordered panel nodes (SettingsTreeNode.Category per groupsOf group carrying its options, then SettingsTreeNode.Section per title) + defaultIndex = the panel expanded on first render ('General' category when present, else the first category, else the first node). Same pure, headless shape; the Configurable now renders collapsible panels from it instead of a JTree.

**Preconditions:**
- catalog is Loaded.

**Postconditions:**
- Panel order + membership match groupsOf exactly (categories declared-order then trailing, every option once); defaultIndex marks the General-or-first category as expanded (ac2/ac4/ac5).

### `SettingsTableModel`

```typescript
class SettingsTableModel(options: List<ConfigOptionDto>, edit: SettingsEditModel) : AbstractTableModel { fun option(row): ConfigOptionDto; fun controlKind(row): ControlKind; fun resetToDefault(row) }
```

**Parameters:**
- `options: List<ConfigOptionDto>` — The category's options (the table's rows).
- `edit: SettingsEditModel` — The pure edit surface the Value column reads/writes (unchanged).

**Returns:** `SettingsTableModel` — CONSUMED VERBATIM from a1 (no change): columns Key/Value/Default; isCellEditable only COL_VALUE; getValueAt reads path / edit.controlValue / renderScalar(default); setValueAt -> edit.editField; resetToDefault -> edit.markResetToDefault. The a2 category panel body is a JTable over this model, sized to its content.

**Errors:**
- `IllegalArgumentException` when an unknown setting path (only catalog paths are addressed).

**Preconditions:**
- A row's path is one of the category's option paths.

**Postconditions:**
- A dirty Value cell contributes to the host's isModified/collectDirty exactly as before (ac3/ac6).

### `SettingsSection`

```typescript
interface SettingsSection { val title: String; fun component(): JComponent; fun isModified(): Boolean; fun apply(); fun reset() }
```

**Returns:** `SettingsSection` — CONSUMED UNCHANGED: each host section (PerRoleSection, PerRepoSection) becomes one collapsible panel whose header is section.title and whose body is section.component(); isModified/apply/reset stay fanned by the host. The section classes are not modified (ac7).

**Preconditions:**
- The section was registered into the host sections list (only when its read is Loaded).

**Postconditions:**
- Expanding the panel shows section.component(); the section still participates in the host's off-EDT apply/isModified/reset.

## Data model changes

### `SettingsView.settingsTree builder (a1 master-detail -> a2 collapsible-panel)` — field-modify

The pure builder + its SettingsTreeNode{Category,Section}/SettingsTree types are REPURPOSED, not redesigned: same ordered nodes (categories from groupsOf then section titles) + defaultIndex (General-or-first), now consumed to build collapsible panels rather than a JTree. Its ordering/default-selection semantics are unchanged, so its unit tests carry over.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `InsrcSettingsConfigurable render shell (a1 master-detail -> a2 collapsible sections)` — field-modify

buildMasterDetail's JTree + JBSplitter + CardLayout + DefaultMutableTreeNode/TreeSelectionListener/setSelectionRow are REPLACED by a single BoxLayout content panel of collapsible category panels (toggle header + JTable body) then collapsible section panels, in ONE AS_NEEDED JScrollPane, General expanded. The a1-removed maximumSize caps stay absent; each JTable is content-sized so the outer scroll governs. The sections list, SettingsEditModel wiring, apply/isModified/reset fan-out, refreshTables() (fireTableDataChanged), and the Unavailable placeholder are unchanged.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### `SettingsTableModel + SettingsValueCellRenderer + SettingsValueCellEditor` — field-modify

Consumed VERBATIM from a1 (no logic change): the collapsible category panel's body is a JTable over SettingsTableModel with the per-type SettingsValueCellRenderer/SettingsValueCellEditor on the Value column. Only their host (a collapsible panel vs a CardLayout detail) changes.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

## Error paths

### Error cases

- **The daemon is unreachable/errored when the page opens (config.catalog Unavailable).** (recoverable)
  - Detection: createComponent's off-EDT settingsCatalog() returns SettingsCatalogResult.Unavailable (existing sealed result).
  - Response: Render the EXISTING unavailable placeholder — no panels, no tables, no sections registered (apply/reset no-ops), unchanged.
  - User impact: A clear 'settings unavailable' message rather than empty panels; retry on reopen.
- **A user types an invalid Value in a category table (a number that doesn't parse or an enum outside the set).** (recoverable)
  - Detection: SettingsEditModel.validationError(path) returns non-null; apply checks it BEFORE issuing any write.
  - Response: apply throws ConfigurationException naming the path; the dialog stays open and the table keeps the pending edit (unchanged S003 gate).
  - User impact: The bad value is flagged and preserved; nothing invalid reaches the daemon.
- **A write is rejected or the daemon drops during apply.** (recoverable)
  - Detection: gateway.writeSetting/clearSetting returns SaveResult.Rejected/Unavailable; the host aggregates failures.
  - Response: Saved fields advance via onSaved; failed fields keep their pending edit and are surfaced in the aggregated ConfigurationException; refreshTables re-seeds the tables.
  - User impact: Honest partial-save with failures named; no dirty edit silently lost.
- **The Settings page is closed and reopened while the off-EDT read of the first open is still in flight.** (recoverable)
  - Detection: the invokeLater render guards on `root === panel` (captured page identity, unchanged).
  - Response: A stale read's render is skipped; only the live page renders its panels.
  - User impact: No cross-render onto a disposed page; the reopened page loads its own panels.
- **A category has many settings so its expanded table is taller than the visible viewport.** (recoverable)
  - Detection: the category table is content-sized (preferredScrollableViewportSize = rows*rowHeight) and its own scrollbars are off, so the BoxLayout content grows past the ONE outer JScrollPane viewport.
  - Response: The OUTER page JScrollPane shows its vertical scrollbar (AS_NEEDED) and the whole page scrolls — no clipped rows, no nested/dead inner scrollbar.
  - User impact: All rows reachable by scrolling the page (ac1), the original 'no scrollbar' bug fixed.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The catalog has no 'General' category. | The FIRST category panel is expanded by default instead (settingsTree.defaultIndex fallback); the page is never all-collapsed with nothing open. |
| A category contains exactly one setting. | A one-row Key/Value/Default table under that category's header — no special-casing. |
| An option whose group is not in catalog.groups. | It still gets a trailing category panel (groupsOf trailing bucket) — no option dropped (ac4). |
| A per-role or per-repo override read is Unavailable while the catalog is Loaded. | That override panel is NOT rendered (the section isn't registered) and a placeholder note is shown; the category panels + the other override panel still render. |
| The user collapses General and expands Models, then clicks Apply. | Expand/collapse is pure view state; apply still collects dirty edits from ALL category tables (not just the expanded one) via the shared SettingsEditModel + collectDirty (ac6). |
| The user toggles a boolean or picks an enum in a table cell. | The per-type cell editor commits on change (stopCellEditing) -> setValueAt -> editField; a boolean round-trips as a Boolean (unchanged from a1, ac6). |
| The user clicks reset-to-default (⟲) on a row. | markResetToDefault marks the field; the Value cell shows the default; apply emits a Clear (unchanged, ac6). |

### Invariants to preserve

- Editing still round-trips through the UNCHANGED SettingsEditModel: a dirty Value cell contributes to isModified()/collectDirty() and persists via the host's sc2 apply exactly as a1 did — the collapsible-panel rework must not fork/bypass the edit model, and reset-to-default still maps to a Clear (ac6). collectDirty spans ALL categories regardless of which panels are expanded. [[c1]]
- groupsOf grouping stays authoritative: every catalog option appears in exactly ONE category panel and one table row, in groupsOf order (declared groups first, out-of-groups trailing) — no option dropped, duplicated, or reordered. [[c2]]
- The off-EDT discipline holds: daemon reads run off the EDT and render on the EDT (invokeLater, guarded on the captured page identity); apply runs off the EDT via runProcessWithProgressSynchronously with model mutation + refreshTables (fireTableDataChanged) back on the EDT — no Swing access off the EDT, no daemon round-trip on the EDT. [[c1]]
- The override sub-sections keep their own apply/isModified/reset through the host fan-out: hosting PerRoleSection/PerRepoSection as collapsible panels uses only section.title + section.component() and must not modify the section classes or bypass the host's isModified-OR / off-EDT apply / reset (ac7). [[c3]]
- The plugin renders only what the daemon describes: the panels come from groupsOf(catalog) + the registered section titles and the values from the catalog + SettingsEditModel — no setting, group, role, or tier is hardcoded, and the daemon is unchanged. [[c2]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) on JDK21 via ./gradlew test, matching the existing SettingsView/*ModelTest pure tests + the InsrcSettingsConfigurableTest source-scan idiom (the Swing Configurable is not headlessly bootable). No BasePlatformTestCase; no daemon/TS test (daemon unchanged).`

### Test levels

- **unit** — Prove the pure collapsible-panel builder (SettingsView.settingsTree, repurposed): ordering (categories in groupsOf order then section panels), General-or-first default-expanded, no option dropped/duplicated/reordered.
  - Subjects: `settingsTree yields category nodes in groupsOf order then one node per section title`, `defaultIndex is the 'General' category when present, else the first category, else the first node`, `every catalog option maps to exactly one category node's options (no drop/dup/reorder); an out-of-groups option gets a trailing node`
  - Fixtures: `a SettingsCatalogDto with General + another group + an out-of-groups option + section titles`, `a catalog WITHOUT General for the fallback`
- **unit** — Prove the reused per-category editable table model over the UNCHANGED SettingsEditModel (carried over from a1): Key/Value/Default, only-Value-editable, setValue->editField (boolean as Boolean), reset->markResetToDefault.
  - Subjects: `the table model exposes 3 columns Key/Value/Default; getValueAt reads path/controlValue/renderScalar(default); isCellEditable only on Value`, `setValueAt routes to SettingsEditModel.editField; a boolean round-trips as a Boolean; isModified/collectDirty reflect the edit`, `resetToDefault maps to markResetToDefault (Value shows default; apply would Clear)`
  - Fixtures: `a SettingsCatalogDto with enum/boolean/number/string options backed by a real SettingsEditModel`
- **unit** — Guard the Swing shell + wiring by source-scan (the Configurable is not headlessly bootable), rewritten for a2.
  - Subjects: `InsrcSettingsConfigurable builds COLLAPSIBLE category panels with expand/collapse toggle headers (no JTree/JBSplitter/CardLayout) (ac2)`, `each category panel body is an editable JTable over SettingsTableModel with a Key/Value/Default model + the per-type Value cell editor (ac3/ac4/ac6)`, `the whole page is in ONE JScrollPane (AS_NEEDED) and each table is content-sized (preferredScrollableViewportSize); no maximumSize caps / Box.createVerticalGlue (ac1)`, `General is expanded on first render via settingsTree.defaultIndex (ac5)`, `the per-role/per-repo sections are rendered as collapsible panels + registered in the sections list; apply still gateway.writeSetting/clearSetting + throws ConfigurationException (ac6/ac7)`
  - Fixtures: `Read of InsrcSettingsConfigurable.kt + SettingsView.kt source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `source-scan: ONE JScrollPane (AS_NEEDED) + content-sized tables + no maximumSize caps / vertical glue`, `table-model: a category with many rows still exposes all rows (page scrolls, no clip)` |
| `ac2` | `settingsTree builder: categories in groupsOf order (panel order)`, `source-scan: collapsible toggle-header category panels, no JTree/JBSplitter` |
| `ac3` | `table-model: getValueAt returns each setting's value in the Value column`, `source-scan: the category body is a Key/Value/Default JTable` |
| `ac4` | `source-scan: expanding a category toggle reveals its JTable body`, `settingsTree: each category node carries its options for the table` |
| `ac5` | `settingsTree: defaultIndex = General when present, else first category`, `source-scan: General panel expanded on first render via settingsTree.defaultIndex` |
| `ac6` | `table-model: setValueAt->editField; boolean round-trips as Boolean; reset->markResetToDefault`, `source-scan: apply still goes through gateway.writeSetting/clearSetting + throws ConfigurationException; collectDirty spans all categories` |
| `ac7` | `settingsTree: one section node per section title after the categories`, `source-scan: PerRoleSection/PerRepoSection rendered as collapsible panels + kept in the sections list with the host fan-out` |

## Migration

**State before:** The insrc Settings page (InsrcSettingsConfigurable.kt, shipped 0.2.2) renders a1 master-detail: createComponent reads config.catalog + the overrides off the EDT (invokeLater guarded on root===panel) and, on Loaded, buildMasterDetail creates a JBSplitter with a LEFT JTree (from SettingsView.settingsTree) + a RIGHT CardLayout detail of per-node cards (each category card an editable SettingsTableModel JTable in its own JScrollPane, each section card section.component()). Categories are leaf tree nodes, so there is NO in-place expand/collapse and 'General expanded' is only 'selected'. The edit stack (SettingsTableModel + SettingsValueCellRenderer/Editor + SettingsEditModel), the sections list, the off-EDT apply/isModified/reset fan-out, refreshTables(), and the Unavailable placeholder all exist and work.

**State after:** The page is a single vertically-scrolling list of collapsible panels in ONE AS_NEEDED JScrollPane: one panel per SettingsView.groupsOf category (a toggle header '▾/▸ group' over the category's editable Key/Value/Default JTable body, the table content-sized so the outer page scrollbar governs) then one panel per registered override SettingsSection (toggle header over section.component()). 'General' is expanded on first render (via settingsTree.defaultIndex = General-or-first), the rest collapsed. The JTree/JBSplitter/CardLayout are gone; SettingsView.settingsTree is repurposed (same nodes+defaultIndex, now feeding panels). The SettingsTableModel + cell editor/renderer, SettingsEditModel, the sections list, the off-EDT apply/isModified/reset fan-out, refreshTables(), and the Unavailable placeholder are UNCHANGED. Daemon UNCHANGED.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Repurpose SettingsView.settingsTree: keep the SettingsTreeNode{Category,Section}/SettingsTree types + the ordering + defaultIndex (General-or-first) unchanged; it now describes collapsible panels rather than JTree nodes. No signature change; existing pure tests carry over (rename to a panel-model test). — ↩ rollbackable
2. Replace InsrcSettingsConfigurable.buildMasterDetail (JTree + JBSplitter + CardLayout + tree selection wiring) with a collapsible-panels renderer: a BoxLayout content panel in ONE AS_NEEDED JScrollPane; per category a toggle-header panel over the SettingsTableModel JTable (content-sized, own scroll off); per section a toggle-header panel over section.component(); expand the settingsTree.defaultIndex category, collapse the rest. Keep the sections list, SettingsEditModel wiring, apply/isModified/reset fan-out, refreshTables(), and the Unavailable placeholder. — ↩ rollbackable
3. Revise tests: rename/rework SettingsTreeModelTest to assert the panel ordering + General-or-first default-expanded (semantics unchanged); keep SettingsTableModelTest verbatim; rewrite the InsrcSettingsConfigurableTest source-scan to assert collapsible toggle headers + JTable body + ONE JScrollPane(AS_NEEDED) + content-sized tables + no JTree/JBSplitter/maximumSize/vertical-glue + General expanded + sections as collapsible panels + the unchanged gateway apply gate. Run ./gradlew test on JDK21. — ↩ rollbackable

**Backward compat:** Confined to the plugin settings package; no public/IPC surface change. InsrcSettingsConfigurable.createComponent keeps its Configurable signature + the off-EDT-read/Unavailable-placeholder contract; only the Loaded rendering shape changes (master-detail -> collapsible panels). SettingsView.settingsTree keeps its signature (repurposed consumer). SettingsTableModel/cell editor/renderer, SettingsEditModel, groupsOf/renderScalar, and PerRoleSection/PerRepoSection are consumed UNCHANGED, so the edit/apply/reset behaviour + the S004/S005 overrides are preserved. Daemon config.catalog/config.show/config.write untouched. No persisted state or on-disk format change; this supersedes the a1 render shipped in 0.2.2 within the same page.

## Alternatives considered

### a1: Collapsible category panels, each embedding the editable Key/Value/Default table, in one scrolling page — **CHOSEN**

One vertically-scrolling BoxLayout page: each category is a toggle-header panel that expands/collapses to reveal its editable Key/Value/Default JTable, then the per-role/per-repo overrides as their own collapsible panels; General expanded on load; the whole page in one AS_NEEDED JScrollPane with each table sized to its content.

Replace the shipped master-detail (JTree + JBSplitter + CardLayout) with a single content JPanel (BoxLayout Y_AXIS) wrapped in ONE AS_NEEDED JScrollPane. A pure builder (SettingsView.settingsTree, repurposed) yields the ordered panels: one per groupsOf category (carrying its options) then one per host SettingsSection title, plus which category is expanded by default (General-or-first). For each category: a toggle button header ('▾ group' / '▸ group') over a body that is the editable SettingsTableModel JTable (REUSED verbatim, with SettingsValueCellRenderer/Editor); the body's visibility flips on the toggle; the table is content-sized (preferredScrollableViewportSize = rows*rowHeight, its own scroll disabled) so the OUTER page scrollbar governs. For each override section: a toggle header over section.component(). General starts expanded, others collapsed. The host keeps the sections list + SettingsEditModel + apply/isModified/reset fan-out (off-EDT) UNCHANGED; reset re-seeds via tableModels.fireTableDataChanged; the Unavailable-catalog placeholder is unchanged. NO maximumSize caps / vertical glue.

### a2: Keep the master-detail JTree + detail table (the shipped a1)

Leave the left JTree + right editable table as shipped in 0.2.2.

No render change: categories stay leaf tree nodes; selecting one shows its table in the right detail pane; General is selected on load.

**Rejected because:** Violates ac2 + ac5 (no expand/collapse, no in-place General) and only partial on ac4 — the precise behaviour the user rejected after live testing. Cheapest but does not deliver the ask.

### a3: Native IntelliJ TreeTable (categories as expandable parent rows)

A single tree-table where category rows expand in place to reveal setting rows with Value/Default columns.

Render the categories as parent rows in a com.intellij.ui.treeStructure TreeTable; expanding a category reveals its settings as child rows with editable Value + read Default columns; General expanded. The override sections need a bespoke escape hatch (their rich nested editors don't fit uniform tree-table cells).

**Rejected because:** Meets the layout ACs but goes partial on ac6/ac7 (override sub-editors fight a uniform tree-table cell) at L cost, discarding the a1 SettingsTableModel + cell editor that a1(collapsible) reuses wholesale.

## Citations

- **[[c1]]** `prior-artifact` `S001(a1) shipped code (InsrcSettingsConfigurable.kt 0.2.2) — the current render shell + off-EDT read + apply/isModified/reset fan-out + SettingsEditModel edit round-trip being reworked` — "createComponent reads off the EDT (invokeLater guarded on root===panel) then renders; apply runs off-EDT via runProcessWithProgressSynchronously over collectDirty + section.apply, throwing Configurati"
- **[[c2]]** `prior-artifact` `SettingsView (SettingsView.kt) — groupsOf grouping + renderScalar + the settingsTree builder repurposed for collapsible panels; daemon single-source (render only what the catalog describes)` — "groupsOf buckets options declared-group-first / out-of-groups-trailing / every-option-once; settingsTree yields the ordered nodes + defaultIndex (General-or-first); no setting/group/role/tier hardcode"
- **[[c3]]** `prior-artifact` `SettingsSection + PerRoleSection/PerRepoSection — hosted as collapsible panels via section.title + section.component(), kept in the host sections list + fan-out` — "SettingsSection { title; component(); isModified(); apply(); reset() } implemented by PerRoleSection + PerRepoSection; hosting them as collapsible panels uses section.title + section.component() and k"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T11:25:40.481Z

_No load-bearing premises were extracted._
