<!-- insrc:artifact LLD-f900cf34c0342d4f-s1 -->

# LLD: E20260805f900cf34:S001

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**HLD base run:** `wf-1785928117126-v61buv`
**HLD effective hash:** `ddca67745f5c...`

## HLD context

**Framework:** A new Debug pane (peer *Pane.tsx in app.tsx's switcher, k6) with pane-local inner sub-tab navigation over three sections — Daemon, MCP, Logs — backed by a new debug service added to makeServices. The chosen shape (a1) keeps the daemon surface minimal: the status card reuses the existing daemon.status IPC, and the ONE genuinely new daemon contract (a read-only debug-status IPC that returns the daemon's own list of currently-attached socket clients, backed by per-connection tracking in the socket server) is built and consumed entirely inside the MCP-section story. Everything else is client-side: the POSIX orphan scan/kill keys on the managed daemon entry and OS signals (k3), and the log viewer fs.watch-tails the two rotated files on disk (k4) — so the Daemon and Logs sections keep working when the daemon is unreachable. The only cross-STORY contract is the pane's section-hosting shape + the debug-service facade that every section plugs into; it is owned by the foundational scaffold story (S001) that every section story already depends on.
**Rollout phase:** Phase A — pane foundation
**Owns:** `sc1` (Debug pane section-hosting shape + DebugService facade)

## Contract details

**Surface level:** internal-shared

### `DebugSectionId`

```typescript
export type DebugSectionId = 'daemon' | 'mcp' | 'logs'
```

**Returns:** `type-alias` — The closed union of the three Debug-pane inner sections; the stable identifier every section story (s2-s5) keys its component + facade methods on.

**Postconditions:**
- The union is exactly these three ids, in this authored order, matching the HLD sc1 sketch.

### `DebugSection`

```typescript
export interface DebugSection { readonly id: DebugSectionId; readonly title: string }
```

**Returns:** `interface` — A section's tab-strip metadata: its id and the human title shown in the Debug pane's inner tab bar. Metadata ONLY — per the sc1 sketch (which lists id+title, not a component field) and the s3 winner refinement, the React view component is NOT a field here; the DebugPane maps id→component locally, keeping React out of the services layer (k6).

**Postconditions:**
- Carries no React/view type, so a fake DebugService in tests supplies only {id,title} entries.

### `DebugService`

```typescript
export interface DebugService { readonly sections: readonly DebugSection[] }
```

**Returns:** `interface` — The sc1 facade added to the top-level Services object. For s1 (scaffold) it holds exactly the ordered `sections` metadata registry (all three sections). Each later story (s2-s5) augments this interface with its own read methods (status card, orphan scan/kill, debug-status clients, log tail) — the single stable seam the section stories extend.

**Postconditions:**
- `sections` lists all three DebugSection metadata entries in DebugSectionId order.
- The interface exposes no socket/fs handle directly — only method signatures (k1), so a same-shape fake is injectable via ServicesContext.

### `DebugPaneProps`

```typescript
export interface DebugPaneProps { readonly services: { readonly debug: DebugService } }
```

**Returns:** `interface` — The DebugPane component's props: a narrowed view of Services exposing just the `debug` facade the pane and its sections read from.

### `DebugPane`

```typescript
export function DebugPane(props: DebugPaneProps): ReactElement
```

**Parameters:**
- `props: DebugPaneProps` — Supplies the `debug` facade (sc1) whose `sections` drive the inner tab strip.

**Returns:** `ReactElement` — The peer *Pane.tsx rendered when the outer switcher selects pane index 5. Holds pane-local `useState<DebugSectionId>('daemon')`, renders the inner tab strip from `props.services.debug.sections`, and mounts exactly the one active section's component (from a pane-local id→component map) full-height. Drives inner-section navigation via its own `useInput` gated on `!useCaptured()`, matching the existing pane idiom.

**Preconditions:**
- Mounted only while the outer pane index === 5 (one-at-a-time render, so only this pane's useInput is live).

**Postconditions:**
- ac1: presents all three sections with exactly one shown.
- ac2: switching the active section hides the prior section's component and shows the newly selected one WITHOUT unmounting the DebugPane (pane-local state change only).

### `Services`

```typescript
export interface Services { /* existing */ readonly debug: DebugService }
```

**Returns:** `interface` — The existing top-level Services facade (src/cli/services/index.ts:32-81) gains one additive readonly `debug` member of type DebugService, alongside daemon/repo/workflow/setup/config.

**Postconditions:**
- Additive only — no existing member changes; existing fake Services in tests must add a `debug` stub to stay conformant.

### `makeServices`

```typescript
export function makeServices(): Services
```

**Returns:** `Services` — The existing constructor (src/cli/services/index.ts:83-134) is reshaped to also return a `debug` entry built from a new `import * as debug from './debug.js'` module, matching the per-domain binding pattern of the sibling facades. For s1 the debug module exports only the `sections` registry.

**Postconditions:**
- The returned object carries a `debug` member conforming to DebugService.

## Data model changes

### `Services (src/cli/services/index.ts)` — field-add

Add a readonly `debug: DebugService` member to the Services interface and a corresponding `debug: { sections }` entry in the makeServices() return object, sourced from a new src/cli/services/debug.ts module. Purely additive; the sibling facades (daemon/repo/workflow/setup/config) are unchanged.

```
interface Services { ...; + readonly debug: DebugService }
```

**Call sites:**
- `src/cli/services/index.ts`
- `src/cli/app.tsx`

### `app.tsx pane switcher (src/cli/app.tsx)` — invariant-change

Extend the fixed 5-pane switcher to 6: append 'Debug' to the TABS tuple (:33), widen the numeric keybind guard from `input >= '1' && input <= '5'` to `'6'` (:126), add `{pane === 5 && <DebugPane services={services} />}` to the render fragment (:142-146), and update the two literal '1-5' key-hint strings (:130, :152) to '1-6'. Tab/Shift-Tab cycling already keys off TABS.length so it needs no change. This widens the standing invariant 'the TUI has exactly five peer panes' to six.

```
const TABS = ['Daemon','Repos','Workflows','Setup','Tiers','Debug'] as const
```

**Call sites:**
- `src/cli/app.tsx`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 is the sc1 owner (HLD boundary: owns=[sc1]). It defines the DebugSectionId/DebugSection/DebugService/DebugPaneProps types (type-level, in src/cli), registers the DebugPane in app.tsx's switcher, and wires the `debug` facade into makeServices with the `sections` registry populated. Refinement vs the sketch: DebugSection stays {id,title} metadata (no component field) and the DebugPane owns the id→component map — preserving sc1's facade shape (`DebugService.sections`) while keeping React components in panes/ (k6). s2-s5 consume this by augmenting DebugService with read methods and swapping their placeholder section component for the real one. |

## Error paths

### Error cases

- **The active DebugSectionId in pane-local state has no matching entry in the id→component map (e.g. a section id was renamed in the union but its map entry was missed).** (recoverable)
  - Detection: The DebugPane's `map[active]` lookup returns undefined when it goes to mount the active section component.
  - Response: Render a small inline 'unknown section' placeholder Text for that section rather than throwing; the tab strip and the other sections stay navigable. A TypeScript exhaustiveness check (a `never` assertion over DebugSectionId) makes this a compile-time error in practice, so the runtime fallback is a belt-and-suspenders guard.
  - User impact: The operator sees a harmless placeholder for one section and can still switch to the others; the pane does not crash the TUI.
- **The injected Services object lacks a conformant `debug` facade (e.g. an out-of-date test fake, or a partial mock) so `props.services.debug.sections` is undefined.** (recoverable)
  - Detection: Reading `services.debug.sections` yields undefined; the pane guards with a nullish fallback to an empty array before mapping.
  - Response: Fall back to an empty section list — the pane renders its frame with no inner tabs rather than throwing on `.map` of undefined. In the real app this cannot happen (makeServices always populates `debug`); it only guards malformed test doubles.
  - User impact: None in production; in a misconfigured test the pane renders empty instead of crashing, surfacing the fake's gap clearly.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The operator presses a section-switch key while the DebugPane is NOT the active outer pane (pane index != 5). | No effect — the DebugPane is unmounted when another pane is active (one-at-a-time render), so its `useInput` is not live; only the active pane's input handler and the global switcher keys fire. |
| The operator presses a section-switch key while a modal TextPrompt is open (useCaptured() === true). | The section does not change — the pane's `useInput` is gated on `!useCaptured()`, matching the existing pane idiom, so modal capture suspends inner-section navigation just as it suspends the global keys. |
| The operator repeatedly cycles sections (e.g. holds the cycle key) landing back on the already-active section. | Idempotent — setting the active id to its current value is a no-op re-render; the section component is not unmounted/remounted and no data re-fetch is triggered (s1 sections are placeholders anyway). |
| The operator presses the outer numeric key '6' (newly enabled) or Tab-cycles onto Debug and immediately back off. | The Debug pane mounts on entry (active section defaults to 'daemon') and unmounts on leave; re-entering resets to the default 'daemon' section since pane-local state is not persisted across unmounts — acceptable for a scaffold with placeholder sections. |

### Invariants to preserve

- The TUI renders exactly one pane at a time by index, so only the active pane's `useInput` is live; the DebugPane must keep this property (mounted only at pane index 5) and must not register any always-on global input handler. [[c1]]
- A new pane is a peer *Pane.tsx wired into app.tsx's switcher and backed by a service in src/cli/services (the makeServices facade) — the DebugPane + DebugService follow this exact convention; no component reaches the socket/fs directly, all data flows through the injected Services facade. [[c1]]
- The Services facade is an interface-level contract injected via ServicesContext so tests supply a same-shape fake; adding the `debug` member must stay additive and keep every existing member unchanged, preserving the existing panes' behaviour and keybindings. [[c1]]

## Test strategy

**Test framework:** `node:test (via `npx tsx --test`) with ink-testing-library for TUI component render + stdin keypress simulation, matching the existing pane tests that inject a fake Services through ServicesContext`

### Test levels

- **unit** — Prove the DebugPane's section-hosting behaviour in isolation — renders all three sections' tabs with one shown, and switches the shown section on a keypress without unmounting — by rendering it against a fake DebugService via ServicesContext.
  - Subjects: `DebugPane (src/cli/panes/DebugPane.tsx): initial render shows three section tabs (Daemon/MCP/Logs) with exactly one active`, `DebugPane: a section-switch keypress changes the active section and hides the prior one while the pane stays mounted`, `DebugPane: inner-section navigation is suppressed while useCaptured() is true`
  - Fixtures: `A fake Services whose `debug.sections` lists the three DebugSection {id,title} entries, injected through ServicesContext`, `ink-testing-library render + stdin.write to simulate the section-switch keypress`
- **contract** — Prove the sc1 facade shape is real and additive: makeServices() returns a `debug` member conforming to DebugService with the three ordered sections, and the top-level Services interface still carries every pre-existing facade unchanged.
  - Subjects: `makeServices().debug.sections equals the three DebugSection ids in DebugSectionId order`, `makeServices() still returns daemon/repo/workflow/setup/config members (additive-only check)`
  - Fixtures: `Direct call of the real makeServices() (no socket needed — s1 debug facade is pure metadata)`
- **integration** — Prove the outer switcher wiring: the App renders the Debug pane as the 6th peer tab, numeric key '6' and Tab-cycling reach it, and selecting it shows the Debug pane while hiding the others.
  - Subjects: `App (src/cli/app.tsx): the tab bar renders a 6th '6:Debug' label`, `App: pressing '6' selects the Debug pane and renders DebugPane; the previously active pane is hidden`, `App: Tab-cycling from the last existing pane reaches Debug (TABS.length-driven wrap)`
  - Fixtures: `ink-testing-library render of <App services={fake} /> with a fake Services carrying the debug facade`, `stdin.write('6') and Tab keypress simulation`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: App renders a 6th '6:Debug' peer tab and pressing '6' opens the Debug pane (peer-of-existing-panes assertion)`, `unit: DebugPane initial render shows all three sections (Daemon/MCP/Logs) with exactly one shown`, `contract: makeServices().debug.sections lists the three sections so the pane has all three to present` |
| `ac2` | `unit: a section-switch keypress on an open DebugPane shows the newly selected section and hides the previously shown one, with the DebugPane remaining mounted (no leave)`, `unit: cycling back to the already-active section is a no-op (idempotent switch)` |

## Migration

**State before:** The insrc TUI (src/cli/app.tsx) hosts exactly five peer panes via a hardcoded `const TABS = ['Daemon','Repos','Workflows','Setup','Tiers']` (:33), a numeric keybind guard `input >= '1' && input <= '5'` (:126), a render-by-index fragment for pane 0-4 (:142-146), and two literal '1-5' key-hint strings (:130, :152). The Services facade (src/cli/services/index.ts:32-81) exposes five sub-facades (daemon/repo/workflow/setup/config) and no `debug` member; makeServices() (:83-134) binds them from per-domain modules. There is no DebugPane, no DebugService, and no src/cli/services/debug.ts. [grounded on the s1 app.tsx and makeServices analyze bundles]

**State after:** The TUI hosts six peer panes: TABS gains 'Debug', the numeric guard widens to '1'..'6', the render fragment gains `{pane === 5 && <DebugPane services={services} />}`, and the two hint strings read '1-6'. A new src/cli/panes/DebugPane.tsx implements the sc1 section-hosting shape (pane-local active-section state over the DebugSectionId union, an id→component map to placeholder section components, `useInput` gated on `!useCaptured()`). A new src/cli/services/debug.ts + a `readonly debug: DebugService` member on the Services interface expose the ordered `sections` metadata registry, wired into makeServices(). The pane is empty-but-navigable (placeholder section bodies); no daemon/socket/fs access is added in this story.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sc1 type declarations (DebugSectionId, DebugSection {id,title}, DebugService {sections}, DebugPaneProps) in src/cli — pure additive type surface, referenced by nothing yet. — ↩ rollbackable
2. Add src/cli/services/debug.ts exporting the ordered `sections` metadata registry (the three DebugSection entries), then add the `readonly debug: DebugService` member to the Services interface and the `debug` entry to the makeServices() return object. Additive — existing facades untouched. — ↩ rollbackable
3. Add src/cli/panes/DebugPane.tsx: the pane component with pane-local active-section state, the id→placeholder-component map, and the `!useCaptured()`-gated section-switch input handler. — ↩ rollbackable
4. Wire the pane into the switcher in src/cli/app.tsx: append 'Debug' to TABS, widen the numeric guard to '6', add the `pane === 5` render branch, and update the two '1-5' hint strings to '1-6'. This is the single step that changes existing user-visible behaviour (a new tab appears); reverting it fully restores the five-pane TUI. — ↩ rollbackable

**Backward compat:** The Services interface change is additive (a new readonly `debug` member); no existing member signature changes, so every current pane and the daemon/repo/workflow/setup/config consumers compile and behave unchanged. In-repo callers that construct a Services value — principally test fakes injected via ServicesContext — must add a `debug` stub to remain interface-conformant; this is an internal (non-published) contract, so the break is contained to this repo's own test doubles and is caught at compile time. The app.tsx switcher change is purely additive (a 6th tab); existing panes keep their indices (0-4), keybindings ('1'-'5', Tab/Shift-Tab), and rendering. No IPC method, socket path, or on-disk shape changes, so the IDE-fork IPC contract is untouched.

## Alternatives considered

### a1: HLD-literal section registry on the facade — **CHOSEN**

Realize sc1 exactly as sketched: DebugService.sections is a readonly array of DebugSection descriptors (id + title + view component), the pane maps over it and renders the selected one; each section story appends its descriptor and augments the facade with its data methods.

sc1's types land verbatim: `DebugSectionId = 'daemon'|'mcp'|'logs'`, `DebugSection { id; title; view: ComponentType }`, `DebugService { readonly sections: readonly DebugSection[]; ... }`. makeServices().debug.sections is the single source of truth for which sections exist and in what order; DebugPane holds `useState<DebugSectionId>('daemon')`, renders the tab strip from `sections`, and mounts `sections.find(s=>s.id===active).view`. s1 ships all three descriptors pointing at placeholder view components; s2-s5 each swap their placeholder for the real component and add that section's read methods onto the `debug` facade. The section registry (including the React component refs) lives in the services/debug facade.

### a2: View/data split — sections defined in the pane, facade is data-only

Keep the section registry (id/title/component) as a const in the DebugPane (panes/debug/) and make DebugService a pure data facade that each section story augments with read methods only — no React components on the facade.

sc1 is refined within the HLD's intent: the stable hosting shape stays (`DebugSectionId` union + a `DebugSection` view-descriptor type used inside the pane), but the ordered section list is a pane-level `const SECTIONS` rather than a `DebugService.sections` field. DebugService becomes the data facade the section stories extend (`debug.daemonStatus()`, `debug.scanOrphans()`, etc.) with NO component refs. DebugPane owns `useState<DebugSectionId>`, renders the tab strip + the active section component from its local SECTIONS map. This preserves the codebase's panes-vs-services separation (components in panes/, IPC/data in services/).

**Rejected because:** Best layering hygiene (k6 satisfies) but pays for it with sc1-partial: dropping `sections` from the facade drifts from the approved sketch. The a1 winner captures a2's layering benefit (components in the pane) without the sc1 drift by keeping the metadata-only `sections` field on the facade.

### a3: Per-section sub-facade namespacing

Shape DebugService as one namespaced sub-object per section — `debug.daemon`, `debug.mcp`, `debug.logs` — mirroring the outer Services shape, with section components kept in the pane keyed by a SectionId union.

DebugService = `{ readonly daemon: {...}; readonly mcp: {...}; readonly logs: {...} }`, each sub-facade owned/augmented by exactly one section story, mirroring how the top-level Services groups daemon/repo/workflow/setup/config. The section-hosting shape stays a `DebugSectionId` union + a pane-local render switch; components live in panes/debug/. s1 ships all three sub-facades empty; s2-s5 fill in their own sub-facade's methods, giving each story a private, non-overlapping slice of the facade type.

**Rejected because:** Best per-story isolation but the heaviest sc1 drift (nested grouping not in the sketch) plus needless type surface on the s1 scaffold (three empty sub-facades). Over-structures a facade the HLD says will only ever hold a few read methods.

## Citations

- **[[c1]]** `analyze-bundle` `s1 module.profile + symbol.locate — src/cli TUI pane architecture: app.tsx pane host/switcher (TABS 5-tuple :33, numeric guard :126, render-by-index :142-146, KeyHints :130/:152), panes/*Pane.tsx idiom (useServices/useUi/useCaptured + useInput), services/index.ts Services interface (:32-81) + makeServices (:83-134)`
- **[[c2]]** `code` `src/cli/panes/ModelTiersPane.tsx — the existing pane component idiom the DebugPane follows: function component returning ReactElement, hooks from ../ui/context.js, pane-local useState selection, useInput gated on !useCaptured(), Panel + KeyHints widgets`
- **[[c3]]** `prior-artifact` `Approved HLD-f900cf34c0342d4f sc1 (Debug pane section-hosting shape + DebugService facade), boundary owns=[sc1] for s1, Phase A — pane foundation; and DEF constraint k6 (peer *Pane.tsx + makeServices convention)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-08-05T11:57:29.173Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| migration/dm | citation | LOW | auto | src/cli/app.tsx declares the pane tab set as a hardcoded 5-tuple `const TABS = ['Daemon','Repos','Workflows','Setup','Tiers']` at line 33. | read src/cli/app.tsx:33 = "const TABS = ['Daemon', 'Repos', 'Workflows', 'Setup', 'Tiers'] as const;" — the 5-tuple is at the cited line. | None — anchor resolves verbatim. |
| dm | citation | LOW | auto | The numeric pane-switch keybind guard in src/cli/app.tsx is `input >= '1' && input <= '5'` at line 126. | read src/cli/app.tsx:126 = "if (input >= '1' && input <= '5') { setPane(Number(input) - 1); return; }" — the numeric guard is exactly as cited. | None — anchor resolves. |
| dm | citation | LOW | auto | src/cli/app.tsx renders panes one-at-a-time by index in a fragment (pane === 0..4 branches) around lines 142-146. | read src/cli/app.tsx:142 = "{pane === 0 && <DaemonPane daemon={daemon} nonce={nonce} />}" — the render-by-index fragment begins at the cited line. | None — anchor resolves. |
| dm | citation | LOW | auto | The '1-5/Tab switch' key-hint literal appears in src/cli/app.tsx (around lines 130 and 152). | read src/cli/app.tsx:152 = KeyHints hints array containing ['1-5/Tab', 'switch'] — the hint literal is at the cited line (:130 is the other in-code '1-5' toast). | None — anchor resolves. |
| contractDetails | citation | LOW | auto | The top-level Services interface is defined in src/cli/services/index.ts (around lines 32-81) with sub-facades daemon/repo/workflow/setup/config and no debug member. | read src/cli/services/index.ts:32 = "export interface Services {" — the interface starts at the cited line; grep confirms the daemon..config sub-facades and no debug member. | None — anchor resolves. |
| contractDetails | citation | LOW | auto | makeServices() is defined in src/cli/services/index.ts (around lines 83-134) and binds the sub-facades from per-domain modules. | read src/cli/services/index.ts:83 = "export function makeServices(): Services {" — the constructor is at the cited line. | None — anchor resolves. |
| contractDetails | closed-union | LOW | auto | No DebugPane, DebugService, or src/cli/services/debug.ts exists today; all sc1 types + the debug facade are genuinely new. | grep DebugService\|DebugPane\|DebugSectionId over src/ returned zero source hits (only docs) — confirming the sc1 types, DebugPane, and debug.ts are genuinely new. | None — the new-surface premise holds. |
| c2 | citation | LOW | auto | src/cli/panes/ModelTiersPane.tsx is an existing pane that follows the component idiom (function returning ReactElement, hooks from ../ui/context.js incl. useCaptured, pane-local useState, useInput) the DebugPane mirrors. | read src/cli/panes/ModelTiersPane.tsx:55 = "const svc = useServices();"; grep confirms it imports/uses useCaptured + useInput — the existing pane idiom the DebugPane mirrors. | None — anchor resolves. |
| errorPaths | semantic | LOW | auto | The existing pane idiom gates its useInput on !useCaptured() so a modal TextPrompt suspends the pane's keys; the DebugPane preserves this. | grep confirms the !useCaptured() gating idiom across panes (DaemonPane/ModelTiersPane/ReposPane use useCaptured()) and app.tsx:131 gates the global keys on `isActive: !captured` — the DebugPane preserving this is consistent with the codebase. | None — idiom confirmed. |
| interactionWithShared | cross-artifact | LOW | auto | The HLD (HLD-f900cf34c0342d4f) assigns sc1 ownership to story s1 (boundary owns=[sc1]) in Phase A, which this LLD implements. | Cross-artifact: the approved HLD-f900cf34c0342d4f boundary assigns owns=[sc1] to s1 in Phase A, and this LLD's interactionWithShared declares role=implements for sc1 — the ownership trace holds (grep hits are the framework's own boundary-shape test fixtures, matching the pattern). | None — cross-artifact trace consistent. |
