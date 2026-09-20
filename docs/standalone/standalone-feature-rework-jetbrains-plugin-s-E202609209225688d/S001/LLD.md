<!-- insrc:artifact LLD-9225688d966a8588-S001 -->

# LLD: E202609209225688d:S001

**Epic:** `standalone-feature-rework-jetbrains-plugin-s`
**HLD base run:** `wf-1789897898189-060gr5`
**HLD effective hash:** `9225688d966a...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `InsrcSettingsConfigurable.createComponent`

```typescript
override fun createComponent(): JComponent
```

**Returns:** `JComponent` — RESHAPED (S002/S003 rendering rework): still shows a 'Loading…' label and reads config.catalog + perRoleOverrides + perRepoOverrides + registeredRepos OFF the EDT, then invokeLater renders a MASTER-DETAIL page instead of the flat BoxLayout: a LEFT JTree (its own JScrollPane) of category nodes (SettingsView.groupsOf) + one node per host SettingsSection (Per-role, Per-repo), and a RIGHT detail panel (its own JScrollPane, AS_NEEDED policies, no maximumSize caps / vertical glue) that on tree selection shows either a category's editable Key/Value/Default JTable or an override node's section.component(). 'General' is selected + expanded on first render. The host's sections list + SettingsEditModel + off-EDT apply/isModified/reset fan-out are unchanged.

**Errors:**
- `none` when reads never throw (sealed results); an Unavailable catalog renders the existing placeholder, no tree.

**Preconditions:**
- Loaded catalog to render the tree; an Unavailable read keeps the placeholder path (as today).

**Postconditions:**
- Overflow scrolls (the tree and the detail each in an AS_NEEDED JScrollPane, ac1); categories are JTree nodes (ac2); General is the initial selection + expanded (ac5); the override sections are top-level tree nodes (ac7).

### `SettingsView.groupsOf`

```typescript
fun groupsOf(catalog: SettingsCatalogDto): List<SettingsGroupModel>
```

**Parameters:**
- `catalog: SettingsCatalogDto` — The loaded config.catalog payload (options + groups) whose categories become the tree nodes + table row-sets.

**Returns:** `List<SettingsGroupModel>` — CONSUMED UNCHANGED: the ordered category buckets (declared-group order first, out-of-groups trailing, every option once) — reused to build the category tree nodes and each node's table rows.

**Preconditions:**
- catalog is Loaded.

**Postconditions:**
- Category node order + membership match groupsOf exactly (no option dropped or duplicated).

### `SettingsEditModel`

```typescript
class SettingsEditModel(catalog: SettingsCatalogDto) { fun controlKind(path): ControlKind; fun controlValue(path): Any?; fun editField(path, raw); fun revertField(path); fun markResetToDefault(path); fun validationError(path): String?; fun isModified(): Boolean; fun collectDirty(): List<PendingWrite>; fun onSaved(path) }
```

**Parameters:**
- `catalog: SettingsCatalogDto` — The catalog the edit model is built from (unchanged construction).

**Returns:** `SettingsEditModel` — CONSUMED UNCHANGED as the editable table's backing: the Value cell editor calls editField(path, raw) and reads controlValue(path)/controlKind(path)/validationError(path); a per-row reset calls markResetToDefault(path); the Default column reads the option.default via SettingsView.renderScalar. apply/isModified/reset stay driven by the host over collectDirty/onSaved. No logic change.

**Errors:**
- `IllegalArgumentException` when an unknown setting path (a programming error; the table only addresses catalog paths).

**Preconditions:**
- A row's path is one of the catalog's option paths.

**Postconditions:**
- The value shown in the table's Value column is controlValue(path) rendered per type; a dirty cell contributes to isModified/collectDirty exactly as the S003 row control did (ac6).

### `SettingsSection`

```typescript
interface SettingsSection { val title: String; fun component(): JComponent; fun isModified(): Boolean; fun apply(); fun reset() }
```

**Returns:** `SettingsSection` — CONSUMED UNCHANGED for the override tree nodes: each host section (PerRoleSection, PerRepoSection) contributes one top-level tree node whose label is section.title and whose detail content is section.component(); isModified/apply/reset continue to be fanned by the host. The section classes themselves are not modified (ac7).

**Preconditions:**
- The section was registered into the host sections list (as today, only when its read is Loaded).

**Postconditions:**
- Selecting the node shows section.component(); the section still participates in the host's off-EDT apply/isModified/reset.

## Data model changes

### `SettingsTreeModel (pure tree-node model)` — new

A new PURE builder + node model in SettingsView (headless-testable): given SettingsView.groupsOf(catalog) + the ordered host section titles, it produces the ordered tree nodes — category nodes first (groupsOf order) then one node per override section — and names which node is default-selected/expanded ('General' when present, else the first category). Holds NO Swing; the Configurable renders a JTree from it. Load-bearing ordering + default-selection logic lives here so it is unit-tested.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`

### `SettingsTableModel (per-category editable table model)` — new

A new javax.swing.table.AbstractTableModel (one per category) with columns Key (read), Value (editable), Default (read): getValueAt reads the setting path + SettingsEditModel.controlValue/renderScalar + option.default; isCellEditable is true only for the Value column; setValueAt(path,row) routes to SettingsEditModel.editField. Backed entirely by the unchanged SettingsEditModel + SettingsView.renderScalar.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### `Per-type Value cell editor/renderer` — new

A new TableCellEditor/TableCellRenderer for the Value column that swaps the widget by the row's ControlKind (JComboBox for CHOOSER over option.enumValues, JCheckBox for TOGGLE, JTextField for NUMBER/TEXT) + a reset-to-default affordance calling markResetToDefault; validation surfaces via validationError before apply (unchanged apply gate).

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

### `InsrcSettingsConfigurable render shell` — field-modify

renderBody's flat BoxLayout + collapsibleGroup + settingRow + per-control rowRefreshers are REPLACED by the master JTree + a detail panel that swaps the selected node's editable table / section.component(); the JScrollPane wraps the tree and the detail independently (AS_NEEDED, no maximumSize caps / vertical glue). The sections list, SettingsEditModel, and the apply/isModified/reset fan-out are unchanged; reset re-seeds via table-model fireTableDataChanged instead of per-row rowRefreshers.

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt`

## Error paths

### Error cases

- **The daemon is unreachable/errored when the page opens (config.catalog Unavailable).** (recoverable)
  - Detection: createComponent's off-EDT settingsCatalog() returns SettingsCatalogResult.Unavailable (existing sealed result).
  - Response: Render the EXISTING unavailable placeholder — no tree, no detail table, no sections registered (apply/reset stay no-ops), exactly as today.
  - User impact: A clear 'settings unavailable' message rather than an empty tree; retry on reopen.
- **A user types an invalid Value in the editable table (a number that does not parse, or an enum value outside the declared set).** (recoverable)
  - Detection: SettingsEditModel.validationError(path) returns non-null for that field (unchanged S003 gate); apply checks it BEFORE issuing any write.
  - Response: apply throws ConfigurationException naming the path; the dialog stays open and the table keeps the pending edit (no write is sent).
  - User impact: The bad value is flagged and preserved for correction; nothing invalid reaches the daemon.
- **A write is rejected or the daemon drops during apply.** (recoverable)
  - Detection: gateway.writeSetting/clearSetting returns SaveResult.Rejected/Unavailable (classified on data['ok']/transport, unchanged); the host aggregates failures.
  - Response: Saved fields advance via onSaved; failed fields keep their pending edit and are surfaced in the aggregated ConfigurationException; the table re-seeds from the model (Saved rows show the new value, failed rows stay dirty).
  - User impact: Honest partial-save with the failures named; no dirty edit silently lost.
- **The Settings page is closed and reopened while the off-EDT read of the first open is still in flight.** (recoverable)
  - Detection: the invokeLater render guards on `root === panel` (the captured page identity, unchanged).
  - Response: A stale read's render is skipped; only the live page renders its tree.
  - User impact: No cross-render onto a disposed page; the reopened page loads its own tree.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The catalog has no 'General' category (unusual). | The tree default-selects/expands the FIRST category node (the pure tree-model's fallback), never leaving the detail blank. |
| A category contains exactly one setting. | A one-row Key/Value/Default table for that node — no special-casing. |
| An option whose group is not listed in catalog.groups. | It still appears (groupsOf's trailing first-seen bucket) as its own category node/table row — no option dropped (ac4). |
| A per-role or per-repo override read is Unavailable while the catalog is Loaded. | That override node is NOT added to the tree (the section isn't registered, as today) and a placeholder note is shown; the category nodes + the other override node still render. |
| The user toggles a boolean setting in the Value cell. | The cell editor writes a Boolean (not a string) through SettingsEditModel.editField, so parsedValue/collectDirty produce a boolean write exactly as the S003 JCheckBox did (ac6). |
| The user clicks reset-to-default on a set row, then Apply. | markResetToDefault marks the field; the Value cell shows the default; apply emits a Clear for that key (unchanged S003 reset semantics). |
| A category's table is taller/wider than the detail viewport. | The detail JScrollPane shows its scrollbar(s) (AS_NEEDED) and the table scrolls — the value column is never clipped off-view (ac1/ac3). |

### Invariants to preserve

- Editing still round-trips through the UNCHANGED SettingsEditModel: a dirty Value cell contributes to isModified()/collectDirty() and persists via the host's sc2 apply exactly as the S003 per-row control did — the tree/table rework must not fork, bypass, or duplicate the edit model, and reset-to-default still maps to a Clear (ac6). [[c2]]
- groupsOf grouping stays authoritative: every catalog option appears in exactly ONE category node and exactly one table row, in groupsOf order (declared groups first, out-of-groups trailing) — the tree must not drop, duplicate, or reorder options. [[c2]]
- The off-EDT discipline holds: daemon reads run off the EDT and render on the EDT (invokeLater, guarded on the captured page identity); apply runs off the EDT via the host's runProcessWithProgressSynchronously with model mutation + table refresh back on the EDT — no Swing access off the EDT and no daemon round-trip on the EDT. [[c1]]
- The override sub-sections keep their own apply/isModified/reset through the host fan-out: hosting PerRoleSection/PerRepoSection as tree nodes uses only section.title + section.component() and must not modify the section classes or bypass the host's isModified-OR / off-EDT apply / reset (ac7). [[c3]]
- The plugin renders only what the daemon describes: the tree nodes come from groupsOf(catalog) + the registered section titles and the values from the catalog + SettingsEditModel — no setting, group, role, or tier is hardcoded, and the daemon is unchanged. [[c1]]

## Test strategy

**Test framework:** `JUnit5 (org.junit.jupiter) on JDK21 via ./gradlew test, matching the existing SettingsView/*ModelTest pure tests + the InsrcSettingsConfigurableTest source-scan idiom (the Swing Configurable is not headlessly bootable). No BasePlatformTestCase; no daemon/TS test (daemon unchanged).`

### Test levels

- **unit** — Prove the NEW pure tree-model builder headlessly: node ordering (categories in groupsOf order + override nodes after), default-selection ('General' when present else the first category), no option dropped/duplicated/reordered.
  - Subjects: `the tree-model builder yields category nodes in SettingsView.groupsOf order followed by one node per supplied section title (Per-role, Per-repo)`, `the default-selected/expanded node is 'General' when a General category exists (ac5)`, `when there is no 'General' category, the default selection falls back to the first category node (ac5 edge)`, `every catalog option maps to exactly one category node's row-set (union == all options, no dup/drop, groupsOf order preserved)`, `an out-of-groups option still gets a trailing category node (no drop)`
  - Fixtures: `a SettingsCatalogDto with a 'General' group + another group + an out-of-groups option, and a list of section titles ['Per-role model overrides','Per-repo overrides']`, `a catalog WITHOUT a 'General' group for the fallback case`
- **unit** — Prove the per-category editable table model over the UNCHANGED SettingsEditModel: Key/Value/Default columns, only Value editable, setValue routes to editField, Default reads renderScalar.
  - Subjects: `the table model exposes 3 columns Key/Value/Default; getValueAt returns the path, controlValue(path) rendered, and the option default via renderScalar`, `isCellEditable is true only for the Value column`, `setValueAt on the Value column calls SettingsEditModel.editField(path,raw) and the value/isModified reflect it (ac6)`, `a boolean row's Value round-trips as a Boolean (not a string) through editField (ac6)`, `a reset-to-default on a row maps to markResetToDefault -> the Value shows the default and apply would emit a Clear (ac6)`
  - Fixtures: `a SettingsCatalogDto with an enum, a boolean, a number, and a string option in one group, backed by a real SettingsEditModel`
- **unit** — Guard the Swing shell + wiring by source-scan (the Configurable is not headlessly bootable), matching the existing InsrcSettingsConfigurableTest idiom.
  - Subjects: `InsrcSettingsConfigurable builds a JTree of the categories + registers the sections as tree nodes (JTree present; renders section.title/component() for override nodes) (ac2/ac7)`, `the detail uses an editable JTable with Key/Value/Default columns bound to the model, not the old settingRow/collapsibleGroup flat layout (ac3/ac4/ac6)`, `the tree and the detail are each wrapped in a JScrollPane and NO maximumSize height caps / Box.createVerticalGlue remain in the render path (ac1)`, `the page still applies via gateway.writeSetting/clearSetting and throws ConfigurationException on a not-Saved/validation failure (unchanged apply gate, ac6)`, `'General' is selected/expanded on first render (a default-selection call is present) (ac5)`
  - Fixtures: `Read of InsrcSettingsConfigurable.kt + SettingsView.kt source`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `source-scan: the tree + detail are each in a JScrollPane and no maximumSize caps / vertical glue remain`, `table-model test: a category taller than the viewport still exposes all rows (the JScrollPane scrolls)` |
| `ac2` | `tree-model builder: category nodes in groupsOf order`, `source-scan: InsrcSettingsConfigurable builds a JTree of categories` |
| `ac3` | `table-model: getValueAt returns each setting's current value in the Value column (via controlValue)`, `source-scan: the detail is a Key/Value/Default JTable, not a far-right EAST control` |
| `ac4` | `table-model: 3 columns Key/Value/Default over a category's options`, `source-scan: selecting a category node shows its editable JTable` |
| `ac5` | `tree-model: default selection is 'General' when present`, `tree-model: fallback to the first category when no General`, `source-scan: a default-selection/expand call for General on first render` |
| `ac6` | `table-model: setValueAt routes to editField; boolean round-trips as Boolean; reset maps to markResetToDefault`, `source-scan: apply still goes through gateway.writeSetting/clearSetting + throws ConfigurationException on not-Saved/validation` |
| `ac7` | `tree-model: one node per supplied section title after the categories`, `source-scan: the host registers PerRoleSection/PerRepoSection as tree nodes and still fans isModified/apply/reset` |

## Migration

**State before:** The insrc Settings page (InsrcSettingsConfigurable.kt) renders a flat one-page layout: createComponent reads config.catalog + perRoleOverrides + perRepoOverrides + registeredRepos off the EDT, then renderBody builds a BoxLayout content of collapsibleGroup panels (one per SettingsView.groupsOf category), each a toggle header over settingRow()s (JLabel path WEST + an EAST FlowLayout edit control + '⟲' reset), followed by the PerRoleSection + PerRepoSection components and a vertical glue, ALL wrapped in one JScrollPane. Values are seeded into the far-right EAST controls but clip off-view (no horizontal scroll), and the per-wrapper maximumSize caps + vertical glue keep the content from exceeding the viewport so the vertical scrollbar never shows. Editing is driven by the pure SettingsEditModel (per-type controls -> editField), and apply/isModified/reset are fanned by the host over collectDirty + the sections list (off-EDT runProcessWithProgressSynchronously). This shipped at 0.2.1.

**State after:** The page is a master-detail: a LEFT JTree of category nodes (SettingsView.groupsOf order) plus one top-level node per registered SettingsSection (Per-role, Per-repo), and a RIGHT detail panel that on selection shows either the category's editable Key/Value/Default JTable (Value column an editable per-type cell over the UNCHANGED SettingsEditModel, Default read via renderScalar) or the override node's section.component(). The tree and the detail are each in their own AS_NEEDED JScrollPane (no maximumSize caps / vertical glue), so overflow always scrolls; each setting's value is an explicit visible column; 'General' is selected + expanded on first render. The SettingsEditModel, the PerRoleSection/PerRepoSection classes, the host sections list, and the apply/isModified/reset fan-out are UNCHANGED; reset re-seeds via table-model fireTableDataChanged. Daemon UNCHANGED.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the PURE tree-node model + builder to SettingsView (category nodes from groupsOf + one node per supplied section title, default-selection = General-or-first). No Swing; additive, existing groupsOf/displayValue/renderScalar unchanged. — ↩ rollbackable
2. Add the per-category editable AbstractTableModel (Key/Value/Default; only Value editable; setValue -> SettingsEditModel.editField; Default via renderScalar) + the per-type Value cell editor/renderer (ControlKind -> combo/checkbox/text + reset-to-default). Backed by the unchanged SettingsEditModel. — ↩ rollbackable
3. Replace InsrcSettingsConfigurable.renderBody's flat BoxLayout/collapsibleGroup/settingRow/rowRefreshers with the master JTree + detail panel (each in its own AS_NEEDED JScrollPane), registering the SettingsSections as top-level tree nodes and selecting/expanding General on first render. Keep the sections list, SettingsEditModel wiring, and apply/isModified/reset fan-out; drive re-seed via table-model refresh. The Unavailable-catalog placeholder path is unchanged. — ↩ rollbackable
4. Update/extend the tests: new pure tree-model + table-model unit tests, and revise InsrcSettingsConfigurableTest's source-scan to assert the JTree + editable JTable(Key/Value/Default) + JScrollPane-without-height-caps + General default-expand + sections-as-tree-nodes (replacing the old collapsibleGroup/settingRow assertions). Run ./gradlew test on JDK21. — ↩ rollbackable

**Backward compat:** Confined to the plugin settings package; no public/IPC surface changes. InsrcSettingsConfigurable.createComponent keeps its Configurable signature and its off-EDT-read + Unavailable-placeholder contract; only the Loaded rendering changes shape. SettingsEditModel, SettingsView.groupsOf/displayValue/renderScalar, and PerRoleSection/PerRepoSection are consumed UNCHANGED, so the S003 edit/apply and the S004/S005 override behaviours are preserved (a dirty cell still persists via sc2, reset still Clears). The daemon config.catalog + config.show + config.write are untouched, so an older or newer daemon interoperates exactly as before. No persisted state, config, or on-disk format changes.

## Alternatives considered

### a1: Master JTree + detail editable key/value/default table (selection-driven) — **CHOSEN**

A left JTree of category nodes + a Per-role and a Per-repo node; selecting a category shows its editable key/value/default JTable in a detail panel, selecting an override node shows that SettingsSection.component(); General selected+expanded by default; tree and detail each in their own JScrollPane.

Replace renderBody's flat BoxLayout+collapsibleGroup with a JBSplitter/master-detail: LEFT a JTree whose nodes are SettingsView.groupsOf(catalog) categories plus one node per host SettingsSection (Per-role, Per-repo); RIGHT a detail panel that, on tree selection, shows either (a) for a category, an editable JTable with columns Key / Value / Default — the Value cell is a per-type editor (JComboBox for enum, JCheckBox for boolean, JTextField for number/text) bound to the EXISTING SettingsEditModel (editField/controlValue/validationError) with a reset-to-default affordance, and Default rendered read-only via SettingsView.renderScalar — or (b) for an override node, that section's component() verbatim. Both the tree and the detail table sit in their own JScrollPane with AS_NEEDED policies (fixes scroll); no maximumSize caps or vertical glue. General is selected + expanded on first render. The host keeps the sections list + SettingsEditModel and its off-EDT apply/isModified/reset fan-out UNCHANGED; a pure tree-model builder (categories + section labels) is unit-testable.

### a2: Collapsible category panels, each embedding an editable key/value/default JTable

Keep the one-scrolling-page collapsible groups, but replace each group's body of rows with a single editable JTable (Key/Value/Default), and fix scroll by dropping the maximumSize caps + vertical glue.

Retain the toggle-header collapsible group per SettingsView.groupsOf category, but render each group body as ONE editable JTable (Key/Value/Default) bound to SettingsEditModel, and append the Per-role/Per-repo sections below; remove the per-wrapper maximumSize caps and the trailing vertical glue so the BoxLayout content grows past the viewport and the JScrollPane shows its vertical bar. General group expanded by default.

**Rejected because:** Partial on ac2 (collapsible panels, not a real tree) and ac7 (overrides not tree nodes) — exactly the two things the user asked for. Cheaper churn but under-delivers the tree the request centers on.

### a3: Native IntelliJ TreeTable (single tree-table, categories as parent rows)

Use IntelliJ's TreeTable/ColumnTree so categories are expandable parent rows and settings are child rows with Value/Default columns in one widget.

Render the whole page as a single com.intellij.ui.treeStructure TreeTable (or ColumnTree): parent rows are categories (+ Per-role/Per-repo), child rows are settings with Key/Value/Default columns; the Value column is an editable TreeTable cell bound to SettingsEditModel. General expanded by default; the TreeTable scrolls natively.

**Rejected because:** Meets the layout ACs most literally but is partial on ac6/ac7: the S004/S005 sections' rich sub-editors don't fit a uniform tree-table cell, forcing a bespoke escape hatch, and it couples to IntelliJ's internal TreeTable APIs at L cost — more rewrite + brittleness for no gain over a1 on the ACs that matter.

## Citations

- **[[c1]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt (createComponent/renderBody/collapsibleGroup/settingRow + the off-EDT read + apply fan-out)` — "createComponent reads config.catalog + the overrides OFF the EDT then invokeLater renders renderBody (guarded on root===panel) into a JScrollPane over a BoxLayout of collapsibleGroups + the sections; "
- **[[c2]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt (groupsOf/displayValue/renderScalar + SettingsEditModel controlKind/controlValue/editField/markResetToDefault/validationError/collectDirty/onSaved)` — "groupsOf buckets options declared-group-first/out-of-groups-trailing/every-option-once; SettingsEditModel is the pure per-type edit surface (editField/controlValue/validationError/collectDirty/onSaved"
- **[[c3]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:25 (SettingsSection) + PerRoleSection.kt + PerRepoSection.kt` — "SettingsSection { title; component(); isModified(); apply(); reset() } is implemented by PerRoleSection + PerRepoSection; hosting them as tree nodes uses section.title as the label + section.component"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T10:00:28.132Z

_No load-bearing premises were extracted._
