<!-- insrc:artifact PLAN-9225688d966a8588-S001 -->

# Plan: E202609209225688d:S001

**Epic:** `standalone-feature-rework-jetbrains-plugin-s`
**LLD run:** `wf-1789897898189-060gr5`
**LLD effective hash:** `9225688d966a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pure tree-node model + builder in SettingsView | S | — | unit: SettingsTreeModelTest: builder yields category nodes in groupsOf order then one node per supplied section title; every option maps to exactly one node's option-set (no drop/dup/reorder); an out-of-groups option gets a trailing node; unit: SettingsTreeModelTest: default selection is 'General' when present, and falls back to the first category node when there is no General | [[c2]] |
| 2 | **`t2`** Per-category editable table model + per-type Value cell editor/renderer | M | `t1` | unit: SettingsTableModelTest: 3 columns Key/Value/Default; getValueAt returns the path + controlValue(path) rendered + the option default via renderScalar; isCellEditable true only for the Value column; unit: SettingsTableModelTest: setValueAt on the Value column routes to SettingsEditModel.editField and the value/isModified reflect it; a boolean round-trips as a Boolean (not a string); unit: SettingsTableModelTest: reset-to-default maps to markResetToDefault (Value shows the default, apply would emit a Clear) | [[c2]] |
| 3 | **`t3`** InsrcSettingsConfigurable render rework (master JTree + detail, scroll fix, sections-as-nodes, General expand) | M | `t2` | unit: InsrcSettingsConfigurableTest (source-scan): builds a JTree of categories + registers PerRoleSection/PerRepoSection as tree nodes (renders section.title/component() for override nodes); unit: InsrcSettingsConfigurableTest (source-scan): the detail is an editable Key/Value/Default JTable; tree + detail are each in a JScrollPane and NO maximumSize caps / Box.createVerticalGlue remain; General is selected/expanded on first render; unit: InsrcSettingsConfigurableTest (source-scan): apply still goes through gateway.writeSetting/clearSetting and throws ConfigurationException on not-Saved/validation (unchanged apply gate) | [[c1]] [[c3]] |
| 4 | **`t4`** Tests + JDK21 gate | M | `t3` | unit: Full jetbrains-plugin suite green on JDK21 via ./gradlew test (SettingsTreeModelTest + SettingsTableModelTest + the revised InsrcSettingsConfigurableTest source-scan), no backtick-';' compile break; a category taller than the viewport still exposes all rows | [[c1]] [[c2]] [[c3]] |

### E202609209225688d:S001:T001 — Pure tree-node model + builder in SettingsView

Add a PURE, Swing-free tree-node model + builder to SettingsView.kt: given SettingsView.groupsOf(catalog) + the ordered host section titles, produce the ordered nodes — category nodes first (groupsOf order, each carrying its group + its options) then one node per override section title — and expose which node is default-selected/expanded ('General' when a General category exists, else the first category). No Swing imports; groupsOf/displayValue/renderScalar/ControlKind/SettingsEditModel unchanged.

**Acceptance checks:**
- the builder yields category nodes in SettingsView.groupsOf order followed by one node per supplied section title
- every catalog option maps to exactly one category node's option-set (no drop/dup/reorder); an out-of-groups option gets a trailing node
- default selection is 'General' when present, else the first category node

### E202609209225688d:S001:T002 — Per-category editable table model + per-type Value cell editor/renderer

Add a per-category AbstractTableModel (columns Key/Value/Default): getValueAt returns the setting path, SettingsEditModel.controlValue(path) rendered via renderScalar, and the option default via renderScalar; isCellEditable true ONLY for the Value column; setValueAt routes to SettingsEditModel.editField(path,raw). Add a per-type TableCellEditor/TableCellRenderer for the Value column that swaps the widget by ControlKind (JComboBox over enumValues for CHOOSER, JCheckBox for TOGGLE, JTextField for NUMBER/TEXT) with a reset-to-default affordance calling markResetToDefault. Backed entirely by the UNCHANGED SettingsEditModel + renderScalar.

**Acceptance checks:**
- the table model exposes Key/Value/Default; getValueAt reads controlValue + option default via renderScalar; isCellEditable true only for Value
- setValueAt routes to SettingsEditModel.editField and a dirty cell reflects in isModified/collectDirty; a boolean round-trips as a Boolean
- reset-to-default maps to markResetToDefault (Value shows the default; apply would Clear); the per-type cell editor picks combo/checkbox/text by ControlKind

### E202609209225688d:S001:T003 — InsrcSettingsConfigurable render rework (master JTree + detail, scroll fix, sections-as-nodes, General expand)

Replace renderBody's flat BoxLayout/collapsibleGroup/settingRow/editControl/rowRefreshers with a master-detail: a LEFT JTree built from the t1 tree model (category nodes + one node per registered SettingsSection) in its own AS_NEEDED JScrollPane, and a RIGHT detail panel in its own AS_NEEDED JScrollPane that on selection shows either the category's editable t2 JTable or the override node's section.component(). Remove the maximumSize caps + Box.createVerticalGlue. Select+expand General on first render. Keep the off-EDT read (invokeLater guarded on root===panel), the sections MutableList, the SettingsEditModel wiring, and apply/isModified/reset (off-EDT runProcessWithProgressSynchronously over collectDirty + section.apply, throwing ConfigurationException on not-Saved/validation); reset re-seeds via table-model fireTableDataChanged instead of rowRefreshers. The Unavailable-catalog placeholder path is unchanged.

**Acceptance checks:**
- the page renders a JTree of categories + the sections as top-level tree nodes; selecting a category shows its editable Key/Value/Default JTable, an override node shows section.component()
- the tree + detail are each in an AS_NEEDED JScrollPane and NO maximumSize caps / Box.createVerticalGlue remain in the render path; General is selected+expanded on first render
- apply still persists via gateway.writeSetting/clearSetting over collectDirty + section.apply and throws ConfigurationException on not-Saved/validation; the Unavailable placeholder path is unchanged

### E202609209225688d:S001:T004 — Tests + JDK21 gate

Add pure unit tests for the t1 tree-node builder (node ordering, General-or-first default selection, no option dropped/duplicated/reordered, out-of-groups trailing) and the t2 table model (Key/Value/Default columns, only-Value-editable, setValue->editField, boolean round-trip, reset->markResetToDefault). Revise InsrcSettingsConfigurableTest's source-scan: assert the JTree + editable JTable(Key/Value/Default) + tree/detail JScrollPanes with NO maximumSize caps / vertical glue + General default-expand + PerRoleSection/PerRepoSection registered as tree nodes + apply-via-gateway-still-throws-ConfigurationException (replacing the old collapsibleGroup/settingRow assertions). Run ./gradlew test on JDK21.

**Acceptance checks:**
- tree-model + table-model unit tests cover ac1..ac7's pure parts (ordering, default-select, no-drop, columns, editability, editField/boolean/reset)
- the revised source-scan asserts the JTree + editable Key/Value/Default JTable + scroll-without-caps + General expand + sections-as-nodes + gateway apply gate
- ./gradlew test is green on JDK21 with no backtick-';' compile break

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the tree-model builder yields category nodes in SettingsView.groupsOf order followed by one node per supplied section title (Per-role, Per-repo) | `t1` |
| the default-selected/expanded node is 'General' when a General category exists (ac5) | `t1` |
| when there is no 'General' category, the default selection falls back to the first category node (ac5 edge) | `t1` |
| every catalog option maps to exactly one category node's row-set (union == all options, no dup/drop, groupsOf order preserved) | `t1` |
| an out-of-groups option still gets a trailing category node (no drop) | `t1` |
| the table model exposes 3 columns Key/Value/Default; getValueAt returns the path, controlValue(path) rendered, and the option default via renderScalar | `t2` |
| isCellEditable is true only for the Value column | `t2` |
| setValueAt on the Value column calls SettingsEditModel.editField(path,raw) and the value/isModified reflect it (ac6) | `t2` |
| a boolean row's Value round-trips as a Boolean (not a string) through editField (ac6) | `t2` |
| a reset-to-default on a row maps to markResetToDefault -> the Value shows the default and apply would emit a Clear (ac6) | `t2` |
| InsrcSettingsConfigurable builds a JTree of the categories + registers the sections as tree nodes (JTree present; renders section.title/component() for override nodes) (ac2/ac7) | `t3` |
| the detail uses an editable JTable with Key/Value/Default columns bound to the model, not the old settingRow/collapsibleGroup flat layout (ac3/ac4/ac6) | `t3` |
| the tree and the detail are each wrapped in a JScrollPane and NO maximumSize height caps / Box.createVerticalGlue remain in the render path (ac1) | `t3` |
| the page still applies via gateway.writeSetting/clearSetting and throws ConfigurationException on a not-Saved/validation failure (unchanged apply gate, ac6) | `t3` |
| 'General' is selected/expanded on first render (a default-selection call is present) (ac5) | `t3` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChange 'InsrcSettingsConfigurable render shell' + api createComponent (the current flat renderBody/collapsibleGroup/settingRow/rowRefreshers + off-EDT read + apply fan-out being reworked)` — "renderBody's flat BoxLayout + collapsibleGroup + settingRow + rowRefreshers are REPLACED by the master JTree + detail; the JScrollPane wraps tree + detail independently (AS_NEEDED, no maximumSize caps"
- **[[c2]]** `prior-artifact` `LLD S001 api SettingsView.groupsOf + SettingsEditModel + dataModelChanges (SettingsTreeModel, SettingsTableModel, per-type Value cell editor) — the pure grouping/render/edit surface the tree + table reuse` — "groupsOf buckets options declared-group-first/out-of-groups-trailing/every-option-once; SettingsEditModel (controlKind/controlValue/editField/markResetToDefault/validationError/collectDirty/onSaved) i"
- **[[c3]]** `prior-artifact` `LLD S001 api SettingsSection (PerRoleSection/PerRepoSection hosted as tree nodes via section.title + section.component())` — "SettingsSection { title; component(); isModified(); apply(); reset() } implemented by PerRoleSection + PerRepoSection; hosting them as tree nodes uses section.title + section.component(), keeping the "

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-20T10:06:57.330Z

_No load-bearing premises were extracted._
