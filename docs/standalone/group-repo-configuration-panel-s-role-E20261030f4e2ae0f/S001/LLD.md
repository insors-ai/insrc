<!-- insrc:artifact LLD-f4e2ae0fdc016e87-S001 -->

# LLD: E20261030f4e2ae0f:S001

## Summary

**Epic:** `group-repo-configuration-panel-s-role`
**HLD base run:** `wf-1793371499927-g416o8`
**HLD effective hash:** `f4e2ae0fdc01...`

This Story reworks the VS Code Repo Configuration panel's presentation: the flat 34-row role-tiers table becomes two collapsible groups (Critical, open by default; Peripheral, collapsed) split on the existing RoleDescriptor.criticality field, the core floor gets its own section, and the Providers checkbox list becomes status-card rows (registered / not registered / CLI unavailable) — delivering the same grouping/collapse behavior the approved mock at mocks/repo-config-grouped.html demonstrates, via native <details>/<summary> disclosure (resolving the mock's own open question about client-side JS: none is needed) rather than the mock's own div+.collapsed+.chev markup. No write path, message shape, or daemon capability changes; this is a presentation-only rework of the already-shipped Story S007 panel. Non-goals: (1) the mock's 'Show N more' truncation inside an expanded group (left as an explicit open question for round 2 in the mock's own caption) is NOT implemented by this Story — a1's win over a2 was specifically that it needs no new client-side script, and truncation would require one; an expanded group always renders its full role list. (2) the mock's custom .chev indicator is NOT reproduced — the native <summary> disclosure triangle is the sole expand/collapse indicator, so no separate chevron element risks doubling up with it.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `renderRepoConfig`

```typescript
export function renderRepoConfig(deps: RepoConfigRendererDeps): RepoConfigRenderer
```

**Parameters:**
- `deps: RepoConfigRendererDeps` — unchanged: registeredRepos + rawConfig + mcpRegistration reads

**Returns:** `RepoConfigRenderer` — unchanged (selected) => Promise<string> shape; the returned HTML now groups role rows into two <details> sections (open=Critical, closed=Peripheral) instead of one flat <table class="role-tiers">, delivering the same grouping/collapse behavior the approved mock at mocks/repo-config-grouped.html demonstrates — via native <details>/<summary>, not the mock's own div+.collapsed+.chev markup

**Preconditions:**
- same as today: registeredRepos()/rawConfig() rejections propagate unchanged (uncaught, bubbling to the host's renderRepoPanel try/catch); mcpRegistration() rejections are instead caught LOCALLY inside renderRepoConfig (repo-config.ts:120-129) and degrade to an in-section hint paragraph, never propagating — these are two different behaviors, not one

**Postconditions:**
- role rows are split by reasoningRoleTaxonomy().roles[].criticality into two <details class="section"> groups (the 'critical' group rendered with the open attribute, 'peripheral' without), each carrying a role count in its <summary>, delivering the approved mock's default-expand/collapse states
- the native <summary> disclosure triangle is the ONLY expand/collapse indicator — no separate .chev element is rendered, so there is no risk of a double indicator; only its color/size may be restyled via the summary::marker pseudo-element
- core floor keeps its own <section>, visually separated from the role groups (was already its own <table> today; now styled as its own section like the role groups)
- no change to which segments a field write addresses (vscode-plugin/src/panels/repo-config.ts:52-55's isRepoModelWrite is untouched)
- does NOT implement the mock's 'Show N more' truncation inside an expanded group (non-goal; see Summary) — an expanded <details> group always renders its full role list, matching a1's no-new-script design

### 2.2 `tierRow`

```typescript
function tierRow(label: string, segments: readonly string[], current: string): string
```

**Parameters:**
- `label: string` — the role id or 'coreFloor' shown as the row's label
- `segments: readonly string[]` — the write-path segments carried on the row's <select data-segments>, unchanged
- `current: string` — the row's currently stored tier value ('' = global), unchanged

**Returns:** `string` — one role row's markup; reshaped from a <tr><td>...</td><td>...</td></tr> table row (vscode-plugin/src/panels/repo-config.ts:65) to a <div class="role-row">...</div> flex row living inside a <details> group's rows container, matching the mock's .role-row styling

**Preconditions:**
- same as today

**Postconditions:**
- identical data-segments attribute and option list as today — only the wrapping markup (div vs tr) and CSS class change; the write-path contract is untouched

### 2.3 `renderProvidersSection`

```typescript
function renderProvidersSection(regs: readonly McpRegistrationView[]): string
```

**Parameters:**
- `regs: readonly McpRegistrationView[]` — unchanged: per-provider MCP registration state from mcp.status

**Returns:** `string` — reshaped from three <label><input></label> checkbox variants (vscode-plugin/src/panels/repo-config.ts:150-170) to a <div class="provider-list"> of status-card rows: a registered provider shows a 'registered' chip (no checkbox), an available-but-unregistered one keeps its real checkable <input type=checkbox data-provider> plus a 'not registered' chip, and an unavailable one shows a 'CLI not found on PATH' chip (no checkbox) — matching the mock's status-chip styling

**Preconditions:**
- same as today

**Postconditions:**
- the checkable input (data-provider attribute) is preserved exactly where it exists today — the existing 'Register selected providers' button + REPO_BOOTSTRAP's querySelectorAll('input[data-provider]') collection logic (webview-host.ts:119-126) needs no change

## 3. Data model changes

### 3.1 `RoleGroup` — new

A local (module-private, not exported) grouping shape built inside renderRepoConfig: { criticality: Criticality; label: string; roles: readonly RoleDescriptor[] }. Criticality is the existing type from role-taxonomy.ts; this is purely an internal rendering grouping, not a new daemon or config shape.

**Call sites:**
- `vscode-plugin/src/panels/repo-config.ts:82-141`

## 4. Error paths

**Error cases**

- **A future third Criticality value is added to role-taxonomy.ts without updating the grouping logic in renderRepoConfig.** (recoverable)
  - Detection: TypeScript's exhaustiveness checking on the closed 'critical'|'peripheral' union (Criticality, role-taxonomy.ts) fails to compile if the grouping switch/partition does not handle every member — caught at build time (npx tsc --noEmit), not at runtime.
  - Response: The grouping code must be written as an exhaustive switch/partition over Criticality so a new member is a compile error, not a silently-dropped role.
  - User impact: None in practice — this is a build-time guard, not a runtime failure a user would ever see.
- **registeredRepos() / rawConfig() rejects while rendering the grouped panel.** (recoverable)
  - Detection: Same as today: the await inside renderRepoConfig's async body rejects (uncaught at this level).
  - Response: Unchanged — the rejection propagates to the host's existing never-throw wrapper (renderRepoPanel's try/catch in webview-host.ts), which degrades to the existing error body. No new error handling is added or needed for the regroup.
  - User impact: Unchanged from today: an in-panel error state instead of the form.
- **mcpRegistration() rejects while rendering the Providers section.** (recoverable)
  - Detection: Same as today: repo-config.ts:120-129's own local try/catch around `await deps.mcpRegistration()` catches the rejection — it never reaches renderRepoConfig's outer scope.
  - Response: Unchanged — the catch renders an in-section hint paragraph (an 'unknown method' update prompt when the message matches /unknown method/, else a generic unavailability hint) in place of the Providers list; the rest of the panel (role groups, core floor) still renders normally. This is a DIFFERENT behavior from the registeredRepos()/rawConfig() case: it does not propagate and does not degrade the whole panel.
  - User impact: The Providers section shows a hint instead of the provider list; the role-tier groups and core floor remain fully usable.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with every role and the core floor left at 'global' (no overrides at all). | Both groups still render all 34 rows (14 critical + 20 peripheral) each showing 'global' selected; grouping is independent of whether any override exists. |
| Every known provider is either already registered or unavailable (none checkable). | Every provider renders as a non-checkable status card (registered or CLI-unavailable chip); the 'Register selected providers' button is omitted, exactly as today's checkable-count check already does. |
| The user switches the selected repo (a fresh selectRepo re-render). | The new document's <details> elements reset to their markup-declared default state (critical open, peripheral closed) — a previously-expanded peripheral group does not persist across a repo switch, since each render is a fresh HTML document with no client-side state carried over. |

**Invariants to preserve**

- A field write addresses only ['tasks', roleId] or ['coreFloor'] segments — the grouped/card presentation changes no write-path segment shape. [[c5]]
- A registeredRepos()/rawConfig() rejection propagates to the host's existing never-throw degrade path, unchanged by the regroup; an mcpRegistration() rejection is instead caught locally inside renderRepoConfig and degrades only the Providers section — these two distinct behaviors are both preserved unchanged. [[c1]]
- The checkable provider input's data-provider attribute and REPO_BOOTSTRAP's querySelectorAll('input[data-provider]') collection for the Register button are preserved exactly — the status-card rework does not touch the registration message flow. [[c4]]
- All 34 roles (14 critical + 20 peripheral, per reasoningRoleTaxonomy().roles) continue to render somewhere in the grouped output — none silently dropped by the criticality partition. [[c2]]

## 5. Test strategy

**Test framework:** `node:test (via npx tsx --test), matching repo-config.test.ts / webview-host.test.ts`

**Test levels**

- **unit** — Verify renderRepoConfig groups all 34 roles into two <details> sections by criticality, open=critical/closed=peripheral by default, with the core floor in its own section, and that all roles are present (none dropped).
  - Subjects: `vscode-plugin/src/panels/repo-config.ts (renderRepoConfig, tierRow)`
  - Fixtures: `a fake registeredRepos()/rawConfig() returning a selected repo with a mix of overridden and 'global' role tiers`, `the real reasoningRoleTaxonomy().roles (already imported by repo-config.ts) to assert the real 14/20 split`
- **unit** — Verify renderProvidersSection renders status cards (registered / not registered / CLI unavailable chips) and preserves the checkable data-provider input exactly where it exists today.
  - Subjects: `vscode-plugin/src/panels/repo-config.ts (renderProvidersSection)`
  - Fixtures: `McpRegistrationView fixtures covering all three states: registered, available+unregistered, unavailable`
- **unit** — Verify the existing write-path tests (data-segments values, createRepoConfigWriteHandler, createRepoRegisterProvidersHandler) still pass unmodified against the regrouped markup, confirming the regroup changed no write-path contract.
  - Subjects: `vscode-plugin/src/panels/repo-config.ts (createRepoConfigWriteHandler, createRepoRegisterProvidersHandler)`
  - Fixtures: `none needed — the existing repo-config.test.ts fixtures (REPOS, fakeConsent, fakeStatus, makeWriteDeps) and their data-segments/<option> regex assertions (e.g. repo-config.test.ts:47-48,212) match on attribute content, not the row's wrapper element, so they are wrapper-agnostic (tr vs div) and require no change`
- **unit** — Verify the shared shellHtml CSS block carries the new .section/.role-row/.status-chip rules the regrouped markup depends on, matching the Model Tiers Story's precedent for a panel-specific CSS addition.
  - Subjects: `vscode-plugin/src/panels/webview-host.ts (shellHtml's shared <style> block)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `repo-config.test.ts: renderRepoConfig renders 14 critical roles in an open <details> group and 20 peripheral roles in a closed <details> group, not one flat 34-row table`, `repo-config.test.ts: the core floor renders in its own <details>/section, separate from the role groups` |
| `ac2` | `repo-config.test.ts: renderProvidersSection renders a 'registered' status chip with no checkbox for an already-registered provider, a checkable input plus a 'not registered' chip for an available-unregistered one, and a 'CLI not found on PATH' chip with no checkbox for an unavailable one` |
| `ac3` | `repo-config.test.ts: every existing data-segments / createRepoConfigWriteHandler / createRepoRegisterProvidersHandler test still passes against the regrouped markup, proving the write path is unchanged` |

## 6. Migration

**State before:** renderRepoConfig renders one flat <table class="role-tiers"> with all 34 roles as plain <tr> rows (no grouping), one <table class="core-floor"> row, and renderProvidersSection renders a flat list of three different <label><input></label> checkbox variants — no visual structure beyond <h3> section headers (vscode-plugin/src/panels/repo-config.ts:131-139).

**State after:** renderRepoConfig renders role rows split into two <details class="section"> groups by criticality (Critical open by default, Peripheral closed), the core floor in its own section, and renderProvidersSection renders status-card rows (registered / not registered / CLI-unavailable chips) — delivering the same grouping/collapse behavior as mocks/repo-config-grouped.html via native <details>/<summary> rather than its div+.collapsed+.chev markup. The write path, message shapes, and daemon reads are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the new .section/.section-head/.count/.rows/.role-row/.provider-row/.status-chip/.floor-row CSS rules to webview-host.ts's shared shellHtml style block, additive to the existing .tier/.note/.hosting-chip rules the Model Tiers Story already added there. Unlike the mock, no .chev/.collapsed rules are needed (native <details>/<summary> provides its own disclosure marker and open/closed state); optionally restyle the marker's color via the summary::marker pseudo-element. — ↩ rollbackable
2. Rewrite renderRepoConfig to partition reasoningRoleTaxonomy().roles by criticality into two RoleGroup values and render each as a <details> section via the reshaped tierRow; give the core floor its own section wrapper. — ↩ rollbackable
3. Rewrite renderProvidersSection to render status-card rows instead of the three checkbox-label variants, preserving the checkable data-provider input exactly where it exists today. — ↩ rollbackable

**Backward compat:** No public API signature changes: renderRepoConfig/createRepoConfigWriteHandler/createRepoRegisterProvidersHandler keep their existing exported signatures. tierRow and renderProvidersSection are module-private helpers, so their internal markup reshape is not a breaking change to any consumer. The webview->host message shapes (selectRepo/repoWrite/repoRegisterProviders) and the write-path segment validation (isRepoModelWrite) are untouched.

## 7. Alternatives considered

### 7.1 a1: Native <details>/<summary> collapsible sections — **CHOSEN**

Render each role group as a standard HTML5 <details> element (open by default for Critical, closed for Peripheral) with no new client-side script.

renderRepoConfig emits <details class="section" open><summary class="section-head">Critical roles <span class="count">14</span></summary><div class="rows">...</div></details> for the critical group and the same without open for peripheral. The browser's native disclosure behavior handles expand/collapse; no postMessage, no REPO_BOOTSTRAP change. Providers becomes a <div class="provider-list"> of status-card rows replacing the three checkbox label variants.

### 7.2 a2: Custom div sections with a REPO_BOOTSTRAP click-toggle

Reproduce the mock's exact .section/.section-head/.collapsed markup, with a new click listener in REPO_BOOTSTRAP toggling a 'collapsed' class.

renderRepoConfig emits plain div-based section markup matching the mock verbatim; REPO_BOOTSTRAP gains a new listener toggling .collapsed — a local DOM class flip, no postMessage.

**Rejected because:** Functionally equivalent to a1 but costs more (a new script listener) for a purely cosmetic gain (pixel-exact chevron) — fails the smallest-complete-change constraint a1 satisfies.

### 7.3 a3: Grouped but always-expanded (no collapse)

Keep both groups visually separated but always fully expanded — drop the collapse/expand interaction entirely.

Same two-group split and status-card Providers as a1/a2, but render both groups always expanded with no <details>/no toggle.

**Rejected because:** Cheapest, but fails the collapse-behavior constraint outright — the user explicitly approved a mock whose entire point was hiding the 20-role peripheral group by default; always-expanded reintroduces the problem the Story exists to solve.

## 8. References

- **[[c1]]** `analyze-bundle` `vscode-plugin/src/panels/repo-config.ts:57-66,82-141` — "renderRepoConfig / tierRow — the flat table-row renderer"
- **[[c2]]** `analyze-bundle` `src/config/role-taxonomy.ts:35-41,52-90` — "RoleDescriptor { id, criticality, defaultTier } — 14 critical / 20 peripheral"
- **[[c3]]** `analyze-bundle` `vscode-plugin/src/panels/repo-config.ts:144-170` — "renderProvidersSection — the flat checkbox-variant list"
- **[[c4]]** `analyze-bundle` `vscode-plugin/src/panels/webview-host.ts:98-118,558-620` — "shellHtml's shared style block + REPO_BOOTSTRAP — where new CSS/script must land"
- **[[c5]]** `analyze-bundle` `vscode-plugin/src/panels/repo-config.ts:52-55` — "isRepoModelWrite — the write-path validation this Story must not touch"
- **[[c6]]** `analyze-bundle` `vscode-plugin/src/panels/__tests__/repo-config.test.ts; vscode-plugin/src/panels/__tests__/webview-host.test.ts` — "existing test templates this Story extends"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T15:02:40.603Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
