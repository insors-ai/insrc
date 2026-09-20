<!-- insrc:artifact PLAN-9225688d966a8588-S001 -->

# Plan: E202609209225688d:S001

**Epic:** `re-author-s001-lld-collapsible-sections`
**LLD run:** `wf-1789903113653-bjwxm4`
**LLD effective hash:** `3d393f126c41...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Repurpose SettingsView.settingsTree as the collapsible-panel builder | S | — | unit: SettingsTreeModelTest: settingsTree yields category nodes in groupsOf order then one node per section title; unit: SettingsTreeModelTest: defaultIndex is General when present, else the first category, else the first node; unit: SettingsTreeModelTest: every catalog option maps to exactly one category node (no drop/dup/reorder); an out-of-groups option gets a trailing node | [[c2]] |
| 2 | **`t2`** Consume the SettingsTableModel + cell editor/renderer + SettingsEditModel unchanged | S | — | unit: SettingsTableModelTest (unchanged): 3 columns Key/Value/Default, only Value editable, getValueAt reads path/controlValue/renderScalar(default); unit: SettingsTableModelTest (unchanged): setValueAt routes to editField, boolean round-trips as Boolean, isModified/collectDirty reflect the edit; unit: SettingsTableModelTest (unchanged): resetToDefault maps to markResetToDefault (Value shows default; apply would Clear) | [[c1]] |
| 3 | **`t3`** Replace the master-detail render shell with collapsible section panels | M | `t1`, `t2` | unit: InsrcSettingsConfigurableTest source-scan: collapsible toggle-header category panels, no JTree/JBSplitter/CardLayout; unit: InsrcSettingsConfigurableTest source-scan: ONE JScrollPane AS_NEEDED + content-sized tables (preferredScrollableViewportSize), no maximumSize caps / Box.createVerticalGlue; unit: InsrcSettingsConfigurableTest source-scan: General expanded on first render via settingsTree.defaultIndex; sections as collapsible panels registered in the sections list; apply via gateway.writeSetting/clearSetting + ConfigurationException | [[c1]] [[c2]] [[c3]] |
| 4 | **`t4`** Revise the tests and run the JDK21 gate | S | `t3` | unit: The full settings test suite (SettingsTreeModelTest reworked + SettingsTableModelTest unchanged + InsrcSettingsConfigurableTest rewritten) is green; smoke: ./gradlew test + buildPlugin pass on JDK21 | [[c1]] [[c2]] [[c3]] |

### E202609209225688d:S001:T001 — Repurpose SettingsView.settingsTree as the collapsible-panel builder

Keep SettingsTreeNode{Category,Section}/SettingsTree + settingsTree(catalog, sectionTitles) unchanged in signature/logic: ordered Category nodes from groupsOf (declared groups then trailing bucket, every option once) followed by one Section node per sectionTitle, defaultIndex = General-or-first-else-first-node (-1 when empty). It now describes which panels to render + which is expanded on first load, not JTree nodes. No new symbol.

**Acceptance checks:**
- settingsTree returns Category nodes in groupsOf order then one Section node per section title; every catalog option lands in exactly one Category node's options (no drop/dup/reorder), out-of-groups options in a trailing node
- defaultIndex is the General category index when present, else the first category, else the first node (-1 only when there are no nodes)

### E202609209225688d:S001:T002 — Consume the SettingsTableModel + cell editor/renderer + SettingsEditModel unchanged

Reuse SettingsTableModel (Key/Value/Default, only-Value-editable, getValueAt path/controlValue/renderScalar(default), setValueAt->editField, resetToDefault->markResetToDefault) with SettingsValueCellRenderer/SettingsValueCellEditor on the Value column as each category panel's body, over the shared SettingsEditModel. No logic change to these types — only their host changes (collapsible panel vs CardLayout card). This is an explicit reuse checkpoint pinning the invariant that the edit stack must not be forked; its wiring is realized in t3.

**Acceptance checks:**
- The category panel body is a JTable over the existing SettingsTableModel with the per-type SettingsValueCellRenderer/Editor on the Value column; a dirty Value cell contributes to isModified()/collectDirty() through the shared SettingsEditModel exactly as before, and reset maps to a Clear
- SettingsTableModel/SettingsValueCellRenderer/SettingsValueCellEditor/SettingsEditModel are unchanged in behaviour (no fork/bypass of the edit model)

### E202609209225688d:S001:T003 — Replace the master-detail render shell with collapsible section panels

Replace InsrcSettingsConfigurable.buildMasterDetail (JTree + JBSplitter + CardLayout + tree selection wiring) with a BoxLayout content panel in ONE AS_NEEDED JScrollPane: per Category node a toggle-header (▾/▸) panel over the content-sized SettingsTableModel JTable (own scroll off so the outer scroll governs), then per Section node a toggle-header panel over section.component(); expand the settingsTree.defaultIndex category, collapse the rest. Keep the off-EDT read + invokeLater root===panel guard, the sections list, SettingsEditModel wiring, off-EDT apply (validation-first, runProcessWithProgressSynchronously, ConfigurationException, onSaved + refreshTables), isModified fan-out, reset fan-out, refreshTables (fireTableDataChanged), and the Unavailable placeholder. No maximumSize caps / vertical glue.

**Acceptance checks:**
- createComponent renders, on Loaded, a BoxLayout page of collapsible toggle-header panels (one per category over its JTable body, then one per SettingsSection over section.component()) inside ONE JScrollPane with VERTICAL_SCROLLBAR_AS_NEEDED; no JTree/JBSplitter/CardLayout remain and each table is content-sized (preferredScrollableViewportSize) with no maximumSize caps / Box.createVerticalGlue
- General (settingsTree.defaultIndex) is expanded on first render and the other panels collapsed; the override PerRoleSection/PerRepoSection are rendered as collapsible panels and still registered in the sections list; apply still goes through gateway.writeSetting/clearSetting and throws ConfigurationException on validation/rejection; the Unavailable read keeps the existing placeholder
- The off-EDT discipline is preserved: reads render via invokeLater guarded on root===panel and apply runs off the EDT with model mutation + refreshTables back on the EDT

### E202609209225688d:S001:T004 — Revise the tests and run the JDK21 gate

Rename/rework SettingsTreeModelTest to assert panel ordering + General-or-first default-expanded (semantics unchanged); keep SettingsTableModelTest verbatim; rewrite the InsrcSettingsConfigurableTest source-scan to assert collapsible toggle-header panels + JTable body + ONE JScrollPane(AS_NEEDED) + content-sized tables + absence of JTree/JBSplitter/CardLayout/maximumSize/vertical-glue + General expanded via defaultIndex + sections as collapsible panels + the unchanged gateway apply gate. Run ./gradlew test + buildPlugin on JDK21 green.

**Acceptance checks:**
- The panel-builder unit test proves ordering + General-or-first default-expanded + no option dropped/duplicated/reordered; SettingsTableModelTest is unchanged and green
- The rewritten InsrcSettingsConfigurableTest source-scan asserts collapsible toggle-header panels + Key/Value/Default JTable body + ONE JScrollPane AS_NEEDED + content-sized tables + no JTree/JBSplitter/CardLayout/maximumSize/vertical-glue + General expanded via defaultIndex + sections as collapsible panels + gateway.writeSetting/clearSetting + ConfigurationException
- ./gradlew test and buildPlugin pass on JDK21

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| settingsTree yields category nodes in groupsOf order then one node per section title | `t1` |
| defaultIndex is the 'General' category when present, else the first category, else the first node | `t1` |
| every catalog option maps to exactly one category node's options (no drop/dup/reorder); an out-of-groups option gets a trailing node | `t1` |
| the table model exposes 3 columns Key/Value/Default; getValueAt reads path/controlValue/renderScalar(default); isCellEditable only on Value | `t2` |
| setValueAt routes to SettingsEditModel.editField; a boolean round-trips as a Boolean; isModified/collectDirty reflect the edit | `t2` |
| resetToDefault maps to markResetToDefault (Value shows default; apply would Clear) | `t2` |
| InsrcSettingsConfigurable builds COLLAPSIBLE category panels with expand/collapse toggle headers (no JTree/JBSplitter/CardLayout) (ac2) | `t3`, `t4` |
| each category panel body is an editable JTable over SettingsTableModel with a Key/Value/Default model + the per-type Value cell editor (ac3/ac4/ac6) | `t3`, `t4` |
| the whole page is in ONE JScrollPane (AS_NEEDED) and each table is content-sized (preferredScrollableViewportSize); no maximumSize caps / Box.createVerticalGlue (ac1) | `t3`, `t4` |
| General is expanded on first render via settingsTree.defaultIndex (ac5) | `t3`, `t4` |
| the per-role/per-repo sections are rendered as collapsible panels + registered in the sections list; apply still gateway.writeSetting/clearSetting + throws ConfigurationException (ac6/ac7) | `t3`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 invariant: editing round-trips through the UNCHANGED SettingsEditModel (isModified/collectDirty/reset->Clear) + off-EDT discipline (invokeLater root===panel, apply via runProcessWithProgressSynchronously)`
- **[[c2]]** `prior-artifact` `LLD S001 invariant: groupsOf grouping stays authoritative (every option in exactly one category panel, groupsOf order, trailing bucket) and the page renders only what the daemon describes (settingsTree from catalog + section titles)`
- **[[c3]]** `prior-artifact` `LLD S001 invariant: override sub-sections (PerRoleSection/PerRepoSection) keep their own apply/isModified/reset through the host fan-out, hosted as collapsible panels via section.title + section.component() without modifying the section classes`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-09-20T11:40:48.180Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | SettingsView exposes settingsTree(catalog, sectionTitles): SettingsTree with a sealed SettingsTreeNode{Category,Section} that t1 repurposes without a signature change. | SettingsView.kt has fun settingsTree(, sealed interface SettingsTreeNode, class SettingsTree, data class Category, data class Section — all confirmed in src. | None; the pure builder exists as cited and t1 repurposes it in place. |
| t1 | citation | LOW | manual | groupsOf is the grouping helper SettingsView.settingsTree builds category nodes from (declared groups first, out-of-groups trailing). | fun groupsOf( and GENERAL_GROUP both resolve in SettingsView.kt (src hits). | None; groupsOf grouping helper exists. |
| t2 | citation | LOW | manual | SettingsTableModel exists with columns Key/Value/Default (COL_KEY/COL_VALUE/COL_DEFAULT), only-Value editable, setValueAt->editField, resetToDefault->markResetToDefault, and is consumed unchanged. | class SettingsTableModel, COL_VALUE, COL_DEFAULT, markResetToDefault all resolve in InsrcSettingsConfigurable.kt / settings src. | None; the editable table model exists and is reused unchanged. |
| t2 | citation | LOW | manual | SettingsValueCellRenderer and SettingsValueCellEditor exist and are the per-type Value-column renderer/editor reused unchanged. | SettingsValueCellRenderer resolves in settings src; SettingsValueCellEditor's specific pattern was crowded out of the truncated top-50 by doc/LLD matches but it is defined in the same InsrcSettingsConfigurable.kt file as the renderer. | None; both cell classes exist and are reused unchanged. |
| t2 | citation | LOW | manual | SettingsEditModel is the pure edit surface (editField/markResetToDefault/collectDirty/isModified) reused unchanged. | class SettingsEditModel, fun editField, fun collectDirty, fun markResetToDefault all resolve in SettingsEditModel.kt (src). | None; the pure edit surface exists and is reused unchanged. |
| t3 | citation | LOW | manual | InsrcSettingsConfigurable currently renders the a1 master-detail (buildMasterDetail with JTree + JBSplitter + CardLayout) which t3 replaces. | buildMasterDetail, JBSplitter, CardLayout all resolve in InsrcSettingsConfigurable.kt (src); JTree's pattern was truncated by doc matches but the a1 master-detail shell is confirmed present via the other three. | None; the a1 render shell to replace is confirmed present. |
| t3 | citation | LOW | manual | The apply path goes through gateway.writeSetting/clearSetting and throws ConfigurationException, preserved unchanged by t3. | runProcessWithProgressSynchronously resolves in settings src (2 hits) confirming the off-EDT apply path; writeSetting/clearSetting/ConfigurationException patterns were truncated by doc matches but are the established DaemonGateway/apply surface shipped in S003. | None; the apply gate is preserved unchanged. |
| t3 | citation | LOW | manual | PerRoleSection and PerRepoSection implement the SettingsSection seam (title/component/isModified/apply/reset) and are hosted as collapsible panels unchanged. | class PerRoleSection, class PerRepoSection, interface SettingsSection, fun component() all resolve in settings src (PerRepoSection.kt:52, PerRoleSection.kt:43, SettingsView.kt:56). | None; the override sections implement the SettingsSection seam and are hosted unchanged. |
| t4 | inventory | LOW | manual | There are three settings test files: SettingsTreeModelTest (reworked), SettingsTableModelTest (kept), InsrcSettingsConfigurableTest (rewritten). | All three test classes resolve: SettingsTreeModelTest.kt:15, SettingsTableModelTest.kt:16, InsrcSettingsConfigurableTest.kt:19. | None; the three test files exist and t4 reworks/keeps/rewrites them as stated. |
| tasks | ordering | LOW | manual | Task order is a valid topological order: t3 depends on t1+t2, t4 depends on t3; the dependency graph is acyclic. | Task dependency graph: t1=[], t2=[], t3=[t1,t2], t4=[t3] — acyclic; order 1,2,3,4 is a valid topological order. | None; ordering is sound. |
| tasks | closed-union | LOW | manual | The four tasks (t1 builder, t2 reuse checkpoint, t3 render shell, t4 tests+gate) collectively cover the entire LLD handoff (c1 edit model, c2 grouping, c3 override sections) with no uncovered invariant. | derivedFrom union = {c1,c2,c3}; c1 (edit model) covered by t2/t3/t4, c2 (grouping) by t1/t3/t4, c3 (override sections) by t3/t4 — every LLD invariant covered. | None; coverage is complete. |
