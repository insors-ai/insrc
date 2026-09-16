<!-- insrc:artifact LLD-1a0f5c8261c17e42-S001 -->

# LLD: S001

**Epic:** `add-t-tracker-setup-action-tui`
**HLD base run:** `wf-1785144673051-xxc9iq`
**HLD effective hash:** `1a0f5c8261c1...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `svc.workflow.trackerSetup`

```typescript
trackerSetup(repoPath: string, opts?: TrackerSetupOptions): TrackerSetupReport
```

**Parameters:**
- `repoPath: string` — the selected repo (current.path) to set up
- `opts: TrackerSetupOptions` _(optional)_ — omitted → includeProject defaults false → the Project board + views steps are skipped

**Returns:** `TrackerSetupReport` — { steps: TrackerSetupStep[]; manualRemaining } — SYNCHRONOUS; existing service reused verbatim, no change [[c2]]

**Errors:**
- `Error` when gh/git shell-out throws unexpectedly; the pane wraps the call and renders a synthetic failed step rather than crashing

**Preconditions:**
- a repo is selected (current !== undefined)

**Postconditions:**
- no engine/service change; the pane is a second caller alongside src/cli/command.ts:285 [[c3]]

### `trackerStatusGlyph`

```typescript
trackerStatusGlyph(status: TrackerSetupStatus): { readonly glyph: string; readonly color: string }
```

**Parameters:**
- `status: TrackerSetupStatus` — one of done|already|manual|skipped|failed

**Returns:** `{ glyph: string; color: string }` — presentation mapping (done/already ✓ green, manual ! yellow, skipped ∘ gray, failed ✗ red) for the modal rows

**Postconditions:**
- total over the closed TrackerSetupStatus union (exhaustive switch) [[c2]]

### `trackerReportSummary`

```typescript
trackerReportSummary(report: TrackerSetupReport): string
```

**Parameters:**
- `report: TrackerSetupReport` — the finished report

**Returns:** `string` — one-line footer, e.g. 'all set — press any key' or 'N step(s) need manual action — run the commands above, then press any key'

### `ReposPane`

```typescript
ReposPane(props: { daemon: DaemonState; nonce: number; selectedRepo: string; onSelectRepo: (path: string) => void }): ReactElement
```

**Parameters:**
- `props: ReposPaneProps` — unchanged props; internal state + a `t` handler + a 'tracker' modal are added

**Returns:** `ReactElement` — same pane; gains the `t` action + tracker report modal [[c1]]

**Postconditions:**
- `t` only fires while modal==='none' && !captured && current!==undefined
- the 'tracker' modal captures input (ui.capture(true)) and any key / esc dismisses it → modal='none', ui.capture(false)

## Data model changes

### `Modal (ReposPane-local union)` — field-add

Add the 'tracker' member: `type Modal = 'none'|'add'|'steer-claude'|'steer-agents'|'confirm-remove'|'tracker'`. Plus pane-local state `report: TrackerSetupReport | null` and `running: boolean` for the tracker modal. [[c1]]

```
+ 'tracker' in Modal; + report/running useState
```

**Call sites:**
- `src/cli/panes/ReposPane.tsx`

### `trackerReport view helper module` — new

New pure module src/cli/panes/tracker-report.ts exporting trackerStatusGlyph + trackerReportSummary (and re-using TrackerSetupReport/Step/Status types from src/workflow/tracker/setup.ts). Presentation-only, no ink import → unit-testable. [[c5]]

```
+ src/cli/panes/tracker-report.ts
```

**Call sites:**
- `src/cli/panes/ReposPane.tsx`
- `src/cli/__tests__/tracker-report.test.ts`

## Error paths

### Error cases

- **trackerSetup throws (gh/git shell-out fails unexpectedly, not one of the engine's own handled 'failed' steps).** (recoverable)
  - Detection: The deferred microtask that calls svc.workflow.trackerSetup(current.path) is wrapped in try/catch.
  - Response: Set the tracker modal to a synthetic report of one failed step ('tracker setup' / status:'failed' / detail: the error message) so the modal shows the failure rather than the pane crashing; running=false.
  - User impact: The user sees a red failed row with the message instead of a blank/frozen pane; can dismiss and retry.
- **`t` pressed with no repo selected (empty registry).** (recoverable)
  - Detection: The `t` case guards on `current !== undefined` (same guard as i/d).
  - Response: No-op — the modal is not opened.
  - User impact: Nothing happens; consistent with reindex/remove which also require a selected repo.

### Edge cases

| Input | Expected |
| :--- | :--- |
| gh is not authenticated. | The report's gh-auth step is status:'manual' with action 'gh auth login'; the modal renders it as a yellow row with the command, manualRemaining >= 1. |
| Missing admin:org scope. | The issue-types step is 'manual' with the scope-refresh command in `action`; shown as a yellow row so the user can copy/run it. |
| The selected repo has no GitHub origin remote. | The config step is status:'failed' ('could not determine owner/repo'); rendered as a red row; other steps still render their own status. |
| A key is pressed while the setup is still running (report not yet set). | The modal shows 'running…'; a dismiss key returns to the list, and the in-flight sync call's setState is harmless (the modal is no longer 'tracker'). |
| All steps already satisfied (re-run on an already-set-up repo). | Every step is 'already'/'done', manualRemaining===0; the summary reads 'all set' — idempotent, no duplicate labels/types (engine uses --force / check-then-act). |

### Invariants to preserve

- The pane's input gating is preserved: `t` (like a/i/d) only fires while `modal==='none' && !captured`, and the 'tracker' modal sets ui.capture(true) so keystrokes don't leak to the list underneath; dismiss restores ui.capture(false). [[c1]]
- No engine/service change: svc.workflow.trackerSetup / runTrackerSetup are reused verbatim; the pane is purely an additional caller alongside the command-bar path. includeProject stays false so the Project board is skipped. [[c2]]
- The selected-repo contract is untouched: `current` and the onSelectRepo effect keep driving which repo the Workflows pane targets; the `t` action reads `current.path` and changes nothing about selection. [[c1]]
- The status→glyph mapping is exhaustive over the closed TrackerSetupStatus union (done|already|manual|skipped|failed) — a new status member is a compile error, not a silent blank glyph. [[c2]]

## Test strategy

**Test framework:** `node:test + node:assert/strict (pure helpers); ink-testing-library render + stdin for the pane wiring`

### Test levels

- **unit** — The pure presentation helpers in src/cli/panes/tracker-report.ts — no ink, directly assertable.
  - Subjects: `unit: trackerStatusGlyph returns the right glyph+color for each of done/already/manual/skipped/failed (5 cases), exhaustive over TrackerSetupStatus`, `unit: trackerReportSummary === an 'all set' phrasing when manualRemaining===0`, `unit: trackerReportSummary names the count when manualRemaining>0 (e.g. mentions the number of manual steps)`
  - Fixtures: `in-memory TrackerSetupReport objects (no gh)`
- **integration** — The Repos-pane `t` wiring + tracker modal, rendered with a fake Services (no real gh).
  - Subjects: `integration: pressing `t` on a pane with a selected repo calls svc.workflow.trackerSetup with current.path (project NOT included) and opens the tracker modal`, `integration: the tracker modal renders one row per report step with its detail and, for manual steps, the `action` command, plus the summary line`, `integration: `t` with an empty repo registry is a no-op (no trackerSetup call, no modal)`, `integration: a fake trackerSetup that throws yields a single failed row in the modal (no crash)`, `integration: dismissing the modal (a key/esc) returns to the repo list and releases input capture; the KeyHints row includes the `t` hint`
  - Fixtures: `fake Services with a stub workflow.trackerSetup returning a canned report (and a throwing variant)`, `ink-testing-library render + stdin.write for keypresses (fallback: assert the extracted key-handler when the lib is unavailable)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: pressing `t` on a pane with a selected repo calls svc.workflow.trackerSetup with current.path (project NOT included) and opens the tracker modal`, `integration: `t` with an empty repo registry is a no-op (no trackerSetup call, no modal)` |
| `ac2` | `integration: the tracker modal renders one row per report step with its detail and, for manual steps, the `action` command, plus the summary line`, `unit: trackerReportSummary names the count when manualRemaining>0` |
| `ac3` | `unit: trackerStatusGlyph returns the right glyph+color for each of done/already/manual/skipped/failed (5 cases), exhaustive over TrackerSetupStatus`, `unit: trackerReportSummary === an 'all set' phrasing when manualRemaining===0` |
| `ac4` | `integration: a fake trackerSetup that throws yields a single failed row in the modal (no crash)`, `integration: `t` with an empty repo registry is a no-op (no trackerSetup call, no modal)` |
| `ac5` | `integration: dismissing the modal (a key/esc) returns to the repo list and releases input capture; the KeyHints row includes the `t` hint` |

## Migration

**State before:** Tracker setup is reachable ONLY from the command bar (`: tracker setup [--project]` → svc.workflow.trackerSetup(ctx.repoPath), src/cli/command.ts:285). The Repos pane (src/cli/panes/ReposPane.tsx) exposes only a/d/i actions and has no way to run setup for the highlighted repo; its Modal union is 'none'|'add'|'steer-claude'|'steer-agents'|'confirm-remove'. [[c1]] [[c3]]

**State after:** The Repos pane also binds `t` → run tracker setup (includeProject:false) for the selected `current` repo and show the full TrackerSetupReport in a new 'tracker' modal (per-step glyph/color + detail + manual `action` commands + a summary), dismissable with a key. The command-bar path is unchanged. No engine/service/schema change.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the pure presentation module src/cli/panes/tracker-report.ts (trackerStatusGlyph, trackerReportSummary) re-using the TrackerSetupReport/Step/Status types — no ink, no behaviour change. — ↩ rollbackable
2. In ReposPane: extend the Modal union with 'tracker'; add report/running local state; add the `t` case to useInput (guarded on current!==undefined) that opens the modal, sets running, and defers the synchronous trackerSetup call a microtask (wrapping a throw into a synthetic failed step). — ↩ rollbackable
3. Add the 'tracker' modal early-return that renders 'running…' then the report rows + summary via the helper, and dismisses (any key/esc) back to 'none' with ui.capture(false); add the ['t','tracker setup'] KeyHints entry. — ↩ rollbackable
4. Add tests: unit for the pure helpers; a pane-render integration test with a fake Services (canned + throwing trackerSetup). — ↩ rollbackable

**Backward compat:** Purely additive and TUI-local. No public API changes: svc.workflow.trackerSetup / runTrackerSetup are reused verbatim, and the `: tracker setup` command-bar path is untouched. The Modal union gains a member (internal to the pane). Rollback is a straight revert of the pane + helper + tests; nothing persisted changes, so a downgraded binary behaves exactly as before.

## Alternatives considered

### a1: 'tracker' modal Panel + deferred sync run + pure formatter — **CHOSEN**

Add a 'tracker' member to the pane's Modal union that renders the full TrackerSetupReport; run the sync engine on a deferred microtask after painting a running state; drive the render from a pure status→glyph/color + report→lines helper.

Extend `type Modal` with 'tracker' and add `report` + `running` state. On `t` (when modal==='none' && current!==undefined): ui.capture(true), setModal('tracker'), set running=true; then queueMicrotask/Promise.resolve().then(() => { const rep = svc.workflow.trackerSetup(current.path); setReport(rep); setRunning(false); }) wrapped so a throw becomes a synthetic failed step. The 'tracker' modal early-returns a <Panel title="Repos · tracker setup"> showing 'running…' while running, else each step as `<glyph> title — detail` (indented `action` line when present) plus a summary line (manualRemaining) and a dismiss hint; any key / esc → setModal('none'), ui.capture(false). A pure module helper renders status→{glyph,color} and report→display rows so it unit-tests without ink.

### a2: Reuse act() → one-line toast summary

Wrap trackerSetup in the existing act() helper and toast a single summary line (e.g. '3 done, 1 manual').

On `t`, call act('tracker', async () => { const rep = svc.workflow.trackerSetup(current.path); return `${done} done, ${rep.manualRemaining} manual`; }). No new modal or state — reuses the pane's one-line toast path exactly as reindex/remove do.

**Rejected because:** Violates surface-full-report: a one-line toast drops the per-step detail + the manual `action` commands (the core value), forcing the user back to the command bar. ui-feedback-not-frozen only partial.

### a3: Streaming log surface in the Repos pane

Add a Daemon-pane-style live log to Repos and push each step line as it runs.

Introduce a log/push channel into ReposPane (mirroring the Daemon pane's run/push) and emit each step as a line. Since trackerSetup is synchronous and returns the whole report at once, the 'stream' would just be a post-hoc dump of the finished report into the log region.

**Rejected because:** Over-builds: a streaming surface for a synchronous one-shot engine violates small-blast-radius (a new log-region concept) with only partial ui-feedback benefit.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — ReposPane structure (Modal union, current, act, useInput gating, KeyHints, ui.capture)` — "src/cli/panes/ReposPane.tsx: Modal union + `current` selected repo + act() one-line toast + useInput gated on modal==='none' && !captured + KeyHints."
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — reused tracker-setup engine + service + report shape` — "svc.workflow.trackerSetup(repoPath, opts?) : TrackerSetupReport is SYNCHRONOUS → runTrackerSetup; TrackerSetupStatus = done|already|manual|skipped|failed; includeProject:false skips the Project steps."
- **[[c3]]** `analyze-bundle` `s1 usage.example — existing command-bar caller of trackerSetup` — "src/cli/command.ts:285 calls svc.workflow.trackerSetup(ctx.repoPath,{includeProject}); the pane is a second caller on current.path."
- **[[c4]]** `analyze-bundle` `s1 symbol.locate — shared TUI widgets (Panel/KeyHints/prompts) + context (useServices/useUi/useCaptured)` — "src/cli/ui/widgets.ts exports Panel, KeyHints, TextPrompt, ConfirmPrompt; a multi-step report needs a dedicated modal Panel."
- **[[c5]]** `analyze-bundle` `s1 test.locate — CLI pane test idiom (pure helpers + fake-Services)` — "model-tiers.test.ts tests pure helpers; command.test.ts tests via fake Services — so the report presentation is a pure helper and the wiring a fake-services render/keypress test."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-07-27T09:38:33.161Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | citation | LOW | manual | ReposPane (src/cli/panes/ReposPane.tsx) has a Modal union 'none'\|'add'\|'steer-claude'\|'steer-agents'\|'confirm-remove', a `current` selected repo, an act() one-line helper, useInput gated on modal==='none' && !captured with a/i/d keys, ui.capture, and a KeyHints row — the surface the `t` action extends. | src/cli/panes/ReposPane.tsx:27 has the exact Modal union and :74 the `isActive: modal === 'none' && !captured` gating; useInput/ui.capture/KeyHints all present. Surface confirmed. | none — verified sound. |
| cl2 | semantic | LOW | manual | svc.workflow.trackerSetup(repoPath, opts?) is SYNCHRONOUS and returns TrackerSetupReport (delegating to runTrackerSetup in src/workflow/tracker/setup.ts); opts.includeProject defaults false so the Project board/views steps are skipped. | src/cli/services/workflow.ts:307 `export function trackerSetup(repoPath, opts: TrackerSetupOptions = {})` returns TrackerSetupReport (synchronous, not a Promise) via runTrackerSetup; includeProject present. Confirmed. | none — verified sound. |
| cl3 | closed-union | LOW | manual | TrackerSetupStatus is the closed union 'done'\|'already'\|'manual'\|'skipped'\|'failed', and TrackerSetupReport = { steps: TrackerSetupStep[]; manualRemaining } with TrackerSetupStep = { key; title; status; detail; action? } — the shape the pure helpers + modal render against. | src/workflow/tracker/setup.ts:54 `TrackerSetupStatus = 'done'\|'already'\|'manual'\|'skipped'\|'failed'` (closed union), :56 interface TrackerSetupStep, :62 `action?: string`, manualRemaining present. Report/step shape + status union confirmed. | none — verified sound; the status→glyph switch must stay exhaustive over these 5. |
| cl4 | citation | LOW | manual | The command bar already calls svc.workflow.trackerSetup(ctx.repoPath, { includeProject }) (src/cli/command.ts:285) — the pane action is a second caller of the SAME service; no engine/service change. | src/cli/command.ts:285 `svc.workflow.trackerSetup(ctx.repoPath, { includeProject })` — the pane action is a genuine second caller of the same service; no engine/service change. | none — verified sound. |
| cl5 | citation | LOW | auto | The shared TUI widgets Panel, KeyHints, TextPrompt, ConfirmPrompt exist in src/cli/ui/widgets.ts and useServices/useUi/useCaptured come from src/cli/ui/context.js — what the tracker modal reuses. | Panel/KeyHints/TextPrompt/ConfirmPrompt are exported from src/cli/ui/widgets.TSX (:14/:26/:39), not widgets.ts as the citation wrote; context (useServices/useUi/useCaptured) is likewise a real module. The NodeNext `../ui/widgets.js` specifier ReposPane already uses resolves to the .tsx, so the design is buildable — only the citation's filename extension is off. | Build note: import from '../ui/widgets.js' (resolves to widgets.tsx); the .ts in the citation is a typo, not a real path. No design change. |
| cl6 | citation | LOW | manual | The CLI pane test idiom the strategy extends exists: pure-helper tests (src/cli/__tests__/model-tiers.test.ts) and fake-Services tests (src/cli/__tests__/command.test.ts). | src/cli/__tests__/model-tiers.test.ts exists (pure-helper idiom) and command.test.ts (fake-Services idiom) is referenced across the suite; the new tests extend a real pattern. | none — verified sound. |
| cl7 | semantic | LOW | manual | The proposed helper module src/cli/panes/tracker-report.ts is NEW (does not yet exist) — trackerStatusGlyph / trackerReportSummary are added, not pre-existing. | trackerStatusGlyph / trackerReportSummary appear ONLY in the LLD doc, nowhere in src — confirming src/cli/panes/tracker-report.ts is genuinely NEW, not claimed to pre-exist. | none — verified sound. |
