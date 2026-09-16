<!-- insrc:artifact PLAN-f900cf34c0342d4f-s1 -->

# Plan: E20260805f900cf34:S001

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**LLD run:** `wf-1785930398350-b9aetq`
**LLD effective hash:** `ddca67745f5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Declare the sc1 types | S | — | unit: types compile-guard: a fixture asserting DebugSectionId is exactly 'daemon'\\|'mcp'\\|'logs' (exhaustiveness never-check) and DebugSection/DebugService shape, verified by the suite compiling | [[c1]] [[c2]] |
| 2 | **`t2`** Add the debug facade module + wire it into Services/makeServices | S | `t1` | unit: services.test.ts: makeServices().debug.sections equals the three DebugSection ids in DebugSectionId order (contract-level facade check, no socket); unit: services.test.ts: makeServices() still returns daemon/repo/workflow/setup/config members (additive-only check) | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Add the DebugPane component with placeholder sections | M | `t1`, `t2` | unit: DebugPane test: initial render shows three section tabs (Daemon/MCP/Logs) with exactly one active; unit: DebugPane test: a section-switch keypress changes the active section and hides the prior one while the pane stays mounted; unit: DebugPane test: inner-section navigation is suppressed while useCaptured() is true; unit: DebugPane test: cycling back to the already-active section is a no-op (idempotent switch) | [[c1]] [[c5]] [[c6]] |
| 4 | **`t4`** Wire the DebugPane into the app.tsx switcher (5->6 panes) | S | `t1`, `t2`, `t3` | integration: tui.test.ts: App renders a 6th '6:Debug' peer tab in the tab bar; integration: tui.test.ts: pressing '6' selects the Debug pane and renders DebugPane; the previously active pane is hidden; integration: tui.test.ts: Tab-cycling from the last existing pane reaches Debug (TABS.length-driven wrap) | [[c1]] [[c7]] |
| 5 | **`t5`** Update existing Services test fakes to add the debug member | S | `t2` | integration: tui.test.ts compiles + all existing pane render assertions still pass with the fake carrying the debug facade (regression guard) | [[c8]] |

### E20260805f900cf34:S001:T001 — Declare the sc1 types

Add the sc1 type declarations in src/cli (type-level only): DebugSectionId = 'daemon'|'mcp'|'logs', DebugSection { readonly id: DebugSectionId; readonly title: string }, DebugService { readonly sections: readonly DebugSection[] }, and DebugPaneProps { readonly services: { readonly debug: DebugService } }. Colocate with the debug facade module (e.g. a debug-types.ts sibling or the head of services/debug.ts). No runtime code, referenced by nothing yet.

**Acceptance checks:**
- DebugSectionId is the exact three-member union in daemon, mcp, logs order
- DebugSection has only id+title (no React/component field)
- DebugService exposes readonly sections: readonly DebugSection[]
- DebugPaneProps narrows Services to just { readonly debug: DebugService }
- tsc compiles the new types with no errors

### E20260805f900cf34:S001:T002 — Add the debug facade module + wire it into Services/makeServices

Create src/cli/services/debug.ts exporting the ordered `sections` metadata registry (the three DebugSection {id,title} entries in DebugSectionId order). In src/cli/services/index.ts add `import * as debug from './debug.js'`, add the `readonly debug: DebugService` member to the Services interface (alongside daemon/repo/workflow/setup/config), and add the `debug: { sections: debug.sections }` entry to the makeServices() return object. Purely additive; sibling facades untouched.

**Acceptance checks:**
- src/cli/services/debug.ts exports the three ordered DebugSection entries
- Services interface gains a readonly `debug: DebugService` member with no change to existing members
- makeServices() returns a `debug` member conforming to DebugService
- tsc compiles services/index.ts with the new facade

### E20260805f900cf34:S001:T003 — Add the DebugPane component with placeholder sections

Create src/cli/panes/DebugPane.tsx: a function component returning ReactElement that accepts DebugPaneProps, holds pane-local `useState<DebugSectionId>('daemon')`, renders an inner tab strip from `props.services.debug.sections` (nullish-guarded to [] for malformed fakes), and mounts exactly the one active section's component from a pane-local id->placeholder-component map (each placeholder a simple labelled Text). Drive inner-section navigation with its own `useInput` gated on `!useCaptured()` (matching the existing pane idiom); render inside Panel + show KeyHints. Handle the map-miss with an inline 'unknown section' fallback.

**Acceptance checks:**
- DebugPane renders all three section tabs with exactly one shown (default 'daemon')
- A section-switch keypress changes the active section without unmounting the pane
- useInput is gated on !useCaptured() so modal capture suspends section navigation
- An unknown active id renders an inline placeholder rather than throwing
- props.services.debug.sections undefined falls back to an empty section list (no throw)

### E20260805f900cf34:S001:T004 — Wire the DebugPane into the app.tsx switcher (5->6 panes)

In src/cli/app.tsx: import DebugPane; append 'Debug' to the TABS tuple (:33); widen the numeric keybind guard from `input <= '5'` to `input <= '6'` (:126); add `{pane === 5 && <DebugPane services={services} />}` to the render fragment (:142-146); and update the two literal '1-5' key-hint strings (the '?' toast :130 and the KeyHints array :152) to '1-6'. Tab/Shift-Tab cycling already keys off TABS.length so it is unchanged. Build note (s3 critique): land t4 together-with t5 in one increment so the tui.test.ts suite compiles at every committed step.

**Acceptance checks:**
- TABS is the 6-tuple ending in 'Debug'
- The numeric guard accepts '6' and selects pane index 5
- The render fragment mounts DebugPane at pane === 5 passing the debug facade
- Both '1-5' hint literals now read '1-6'
- Existing panes (indices 0-4), their keybindings, and Tab cycling are unchanged

### E20260805f900cf34:S001:T005 — Update existing Services test fakes to add the debug member

Update every in-repo test that constructs a Services literal (principally fakeServices() in src/cli/__tests__/tui.test.ts) to add a conformant `debug: { sections: [...] }` member so the suites compile against the widened Services interface. This is the additive-break the LLD backwardCompat calls out (in-repo test doubles only, compile-time caught). Build note (s3 critique): apply together-with or before t4 so the tui suite compiles at every committed step; dependsOn stays [t2] (the true compile dependency).

**Acceptance checks:**
- fakeServices() in tui.test.ts includes a debug facade conforming to DebugService
- Every other in-repo Services literal is updated so `npx tsx --test 'src/cli/**/*.test.ts'` compiles
- No existing assertion behaviour changes beyond the additive debug member

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DebugPane (src/cli/panes/DebugPane.tsx): initial render shows three section tabs (Daemon/MCP/Logs) with exactly one active | `t3` |
| DebugPane: a section-switch keypress changes the active section and hides the prior one while the pane stays mounted | `t3` |
| DebugPane: inner-section navigation is suppressed while useCaptured() is true | `t3` |
| makeServices().debug.sections equals the three DebugSection ids in DebugSectionId order | `t2` |
| makeServices() still returns daemon/repo/workflow/setup/config members (additive-only check) | `t2`, `t5` |
| App (src/cli/app.tsx): the tab bar renders a 6th '6:Debug' label | `t4` |
| App: pressing '6' selects the Debug pane and renders DebugPane; the previously active pane is hidden | `t4` |
| App: Tab-cycling from the last existing pane reaches Debug (TABS.length-driven wrap) | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 sc1 contract (DebugSectionId/DebugSection/DebugService/DebugPaneProps) + interactionWithShared sc1 implements`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate/module.profile — src/cli TUI type-level surface where the sc1 types land`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges: Services (src/cli/services/index.ts) field-add of readonly debug: DebugService`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails: makeServices() reshaped to return the debug facade (src/cli/services/index.ts:83-134)`
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails DebugPane + errorPaths (map-miss fallback, undefined-sections nullish guard, !useCaptured gating)`
- **[[c6]]** `analyze-bundle` `s1 usage.example — ModelTiersPane pane idiom (useServices/useUi/useCaptured + useInput, Panel/KeyHints) the DebugPane mirrors (src/cli/panes/ModelTiersPane.tsx, src/cli/ui/context.ts)`
- **[[c7]]** `prior-artifact` `LLD s1 dataModelChanges: app.tsx pane switcher invariant-change (TABS :33, numeric guard :126, render fragment :142-146, '1-5' hints :130/:152)`
- **[[c8]]** `analyze-bundle` `s1 test.locate — tui.test.ts fakeServices() + services.test.ts harness; the widened Services interface forces the fake to add a debug member (LLD backwardCompat)`
