<!-- insrc:artifact PLAN-f4e2ae0fdc016e87-S001 -->

# Plan: E20261030f4e2ae0f:S001

## Summary

**Epic:** `group-repo-configuration-panel-s-role`
**LLD run:** `wf-1793371499927-g416o8`
**LLD effective hash:** `f4e2ae0fdc01...`

Building this Story is a four-task sequence: add the shared CSS for the new section/row/chip classes, rewrite renderRepoConfig to group the 34 roles into two native <details> sections and give the core floor its own section, rewrite renderProvidersSection into status cards, then extend the existing test suite to cover the regrouping while confirming the write path is untouched. No new file, no script change, no daemon capability change.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the grouped-section CSS rules to webview-host.ts's shared shellHtml style block | S | — | unit: webview-host.test.ts: the shared shellHtml style block defines .section/.section-head/.count/.rows/.role-row/.provider-row/.status-chip/.floor-row rules | [[c2]] |
| 2 | **`t2`** Rewrite renderRepoConfig/tierRow to group role rows into two <details> sections by criticality | M | `t1` | unit: repo-config.test.ts: renderRepoConfig renders 14 critical roles in an open <details> group and 20 peripheral roles in a closed <details> group, not one flat 34-row table; unit: repo-config.test.ts: the core floor renders in its own <details>/section, separate from the role groups | [[c1]] |
| 3 | **`t3`** Rewrite renderProvidersSection to render status-card rows | S | `t1` | unit: repo-config.test.ts: renderProvidersSection renders a 'registered' status chip with no checkbox for an already-registered provider, a checkable input plus a 'not registered' chip for an available-unregistered one, and a 'CLI not found on PATH' chip with no checkbox for an unavailable one | [[c1]] |
| 4 | **`t4`** Extend repo-config.test.ts for the grouped roles, status-card Providers, and the unchanged write path | M | `t2`, `t3` | unit: repo-config.test.ts: every existing data-segments / createRepoConfigWriteHandler / createRepoRegisterProvidersHandler test still passes against the regrouped markup, proving the write path is unchanged; unit: repo-config.test.ts: all roles at 'global' still render all 34 rows across both groups; unit: repo-config.test.ts: no checkable providers omits the 'Register selected providers' button; unit: repo-config.test.ts: an mcpRegistration() rejection degrades only the Providers section to a hint paragraph; role groups and core floor still render | [[c3]] |

### 1.1 E20261030f4e2ae0f:S001:T001 — Add the grouped-section CSS rules to webview-host.ts's shared shellHtml style block

Add .section/.section-head/.count/.rows/.role-row/.provider-row/.status-chip/.floor-row CSS rules to the shared <style> block, additive to the existing .tier/.note/.hosting-chip rules the Model Tiers Story already added. No .chev/.collapsed rules (native <details>/<summary> needs none); optionally restyle the native marker via summary::marker.

**Acceptance checks:**
- the shared shellHtml style block renders readable, correctly laid-out .section/.role-row/.provider-row/.status-chip/.floor-row elements with no reliance on a .chev or .collapsed class

### 1.2 E20261030f4e2ae0f:S001:T002 — Rewrite renderRepoConfig/tierRow to group role rows into two <details> sections by criticality

Partition reasoningRoleTaxonomy().roles by criticality into two RoleGroup values, render each as a <details class="section"> (critical open, peripheral closed) via a reshaped tierRow emitting <div class="role-row"> instead of <tr>; give the core floor its own section. No write-path change.

**Acceptance checks:**
- 14 critical roles render inside an open <details> group and 20 peripheral roles inside a closed <details> group, not one flat 34-row table
- the core floor renders in its own section, separate from the role groups
- every role row's data-segments attribute and option list is identical to today's values
- a future third Criticality value is a compile-time error (exhaustive partition over the closed union), not a silently-dropped role
- the mcpRegistration() local try/catch (repo-config.ts:120-129) and its hint-paragraph degrade are preserved unchanged — distinct from the propagating registeredRepos()/rawConfig() rejections, which still bubble to the host's try/catch

### 1.3 E20261030f4e2ae0f:S001:T003 — Rewrite renderProvidersSection to render status-card rows

Replace the three <label><input></label> checkbox variants with status-card rows: a registered provider shows a 'registered' chip (no checkbox), an available-unregistered one keeps its checkable <input type=checkbox data-provider> plus a 'not registered' chip, an unavailable one shows a 'CLI not found on PATH' chip (no checkbox).

**Acceptance checks:**
- a registered provider renders a 'registered' status chip with no checkbox
- an available-unregistered provider keeps its real checkable data-provider input plus a 'not registered' chip
- an unavailable provider renders a 'CLI not found on PATH' chip with no checkbox
- the 'Register selected providers' button still appears only when at least one provider is checkable, exactly as today

### 1.4 E20261030f4e2ae0f:S001:T004 — Extend repo-config.test.ts for the grouped roles, status-card Providers, and the unchanged write path

Add tests for the two-group role split (14/20 counts, open/closed defaults), the core-floor section separation, the three Providers status-card variants, the mcpRegistration() local-catch hint degrade, and confirm every existing data-segments/createRepoConfigWriteHandler/createRepoRegisterProvidersHandler test still passes unmodified against the regrouped markup.

**Acceptance checks:**
- every acceptanceMapping proving test named in the LLD's ac1/ac2/ac3 rows exists and passes
- the all-roles-at-global, no-checkable-providers, and repo-switch-resets-collapse-state edge cases are each covered
- an mcpRegistration() rejection is tested to degrade only the Providers section to a hint paragraph, while the role groups and core floor still render
- no existing repo-config.test.ts fixture needed modification, confirming the write-path regex assertions are wrapper-agnostic as the LLD states

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/src/panels/repo-config.ts (renderRepoConfig, tierRow) | `t2`, `t4` |
| vscode-plugin/src/panels/repo-config.ts (renderProvidersSection) | `t3`, `t4` |
| vscode-plugin/src/panels/repo-config.ts (createRepoConfigWriteHandler, createRepoRegisterProvidersHandler) | `t4` |
| vscode-plugin/src/panels/webview-host.ts (shellHtml's shared <style> block) | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api[renderRepoConfig, tierRow, renderProvidersSection] + dataModelChanges[RoleGroup] + errorPaths`
- **[[c2]]** `prior-artifact` `LLD S001 migration.migrationSteps[1] (webview-host.ts shared CSS)`
- **[[c3]]** `prior-artifact` `LLD S001 testStrategy + errorPaths.edgeCases`
