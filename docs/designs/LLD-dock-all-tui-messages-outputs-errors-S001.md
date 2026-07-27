<!-- insrc:artifact LLD-93b2b1d6e5628b51-S001 -->

# LLD: S001

**Epic:** `dock-all-tui-messages-outputs-errors`
**HLD base run:** `wf-1785146418242-eo8e7i`
**HLD effective hash:** `93b2b1d6e562...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal-shared

### `Ui.toast`

```typescript
toast(message?: string): void
```

**Parameters:**
- `message: string | undefined` _(optional)_ — One-line transient status. Appended to the shared bottom message log as a transient (auto-dismissing) success/info line. `undefined` clears the current transient line (back-compat with existing callers that call toast() to clear).

**Returns:** `void` — Fire-and-forget; schedules a render of the bottom region.

**Preconditions:**
- Called within UiContext (useUi throws otherwise — unchanged).

**Postconditions:**
- A transient MsgLine with the text is the most-recent line in the bottom box (or the transient is cleared when message is undefined).
- Signature UNCHANGED from today so the four one-liner panes (Setup/Repos/Workflows/ModelTiers) need no edits.

### `Ui.note`

```typescript
note(line: string, kind?: 'info' | 'error'): void
```

**Parameters:**
- `line: string` — A one-off non-transient message line to append to the bottom box.
- `kind: 'info' | 'error' | undefined` _(optional)_ — Rendering kind; 'error' renders red and sticky, 'info' (default) renders dim.

**Returns:** `void` — Appends one sticky line to the shared message log.

**Preconditions:**
- Called within UiContext.

**Postconditions:**
- The line is appended and bounded to the last N lines; error lines persist until superseded.

### `Ui.task`

```typescript
task(title: string): { push(line: string): void; done(message: string): void; fail(message: string): void }
```

**Parameters:**
- `title: string` — The operation title (e.g. 'updating daemon…'); seeds the message log with the title line and marks a task in-progress.

**Returns:** `{ push(line: string): void; done(message: string): void; fail(message: string): void }` — A streaming handle: `push` appends a progress line, `done` appends a success line + ends the task, `fail` appends a red error line + ends the task. Replaces DaemonPane's local begin/push/done/fail. The handle is passed as the streaming callback to svc.daemon.restart(push) / update({}, push).

**Preconditions:**
- Called within UiContext.
- Caller sets ui.capture(true) around a modal-driven op exactly as today if it needs to suspend global keys (capture stays a separate concern).

**Postconditions:**
- title then each pushed line then the terminal done/fail line appear in order in the bottom box, bounded to the last N.
- No message renders in any pane body — all task output flows to the single bottom region.

### `Ui.capture`

```typescript
capture(on: boolean): void
```

**Parameters:**
- `on: boolean` — Suspend/resume the app global keybindings while a modal/text field is capturing keys. UNCHANGED.

**Returns:** `void` — Toggles the CaptureContext boolean.

**Preconditions:**
- Called within UiContext.

**Postconditions:**
- Unchanged from today — orthogonal to the message log.

## Data model changes

### `MsgLine` — new

The unit stored in the shared bottom message log: `{ id: number; text: string; kind: 'info' | 'error' | 'success'; transient: boolean }`. `id` is a monotonically increasing key for React + for transient-dismiss targeting. `transient` lines (from toast) auto-clear on a timer; non-transient lines (note/task) persist until they scroll out of the bounded last-N window. `kind` drives colour: success=green, error=red, info=dim.

```
+ interface MsgLine { id: number; text: string; kind: 'info' | 'error' | 'success'; transient: boolean }
```

**Call sites:**
- `src/cli/ui/context.ts`
- `src/cli/app.tsx`

### `AppBody.messages` — new

New app.tsx state `const [messages, setMessages] = useState<MsgLine[]>([])` — the single source of truth for the bottom region. All Ui methods (toast/note/task) append via a bounded setter that keeps the last N (e.g. 8) lines. Rendered once, at the bottom, via the reused LogView (with an explicit max) + per-line colour by kind.

```
+ const [messages, setMessages] = useState<MsgLine[]>([])
```

**Call sites:**
- `src/cli/app.tsx`

### `AppBody.cmdOutput` — field-remove

Remove the separate `const [cmdOutput,setCmdOutput]` state and the `output` prop passed to CommandBar. The `:` command runner appends its lines to `messages` instead. CommandBar becomes input-only (drops the `output` prop + its render block).

```
- const [cmdOutput, setCmdOutput] = useState<string[]>([])  ; - <CommandBar output=...>
```

**Call sites:**
- `src/cli/app.tsx`
- `src/cli/ui/CommandBar.tsx`

### `DaemonPane.log` — field-remove

Remove DaemonPane's pane-local `const [log,setLog]` state, the begin/push/done/fail helpers' log mutations, and the inline `<LogView lines={log}/>` block (DaemonPane.tsx:82-87). Replace with a `ui.task(title)` handle whose push/done/fail feed the shared bottom region; the pane body becomes just Health + KeyHints.

```
- const [log, setLog] = useState<string[]>([]) ; - inline LogView block
```

**Call sites:**
- `src/cli/panes/DaemonPane.tsx`

## Error paths

### Error cases

- **A daemon op (start/stop/restart/update/backup/compact) throws mid-stream.** (recoverable)
  - Detection: DaemonPane's `run(title, fn)` await is wrapped in try/catch; the catch calls the task handle's `fail(message)`.
  - Response: `fail` appends a red, non-transient (sticky) error MsgLine (kind:'error') to the shared bottom log and marks the task ended; the pane body is untouched (just Health + KeyHints).
  - User impact: The error stays visible in the bottom box until a newer message supersedes it; the pane view never shifts.
- **A `:` command throws (runCommand rejects).** (recoverable)
  - Detection: app.tsx `runCmd` wraps the await in try/catch (existing behavior).
  - Response: Append a `✗ <message>` error MsgLine to `messages` (kind:'error') instead of the removed `cmdOutput`; the command bar input stays open for the next command.
  - User impact: Error appears in the bottom box like any other message; no mid-screen block, no Esc required to clear the view.
- **A transient toast's auto-dismiss timer fires after the component unmounts (test teardown / app exit).** (recoverable)
  - Detection: The setTimeout callback runs after unmount; React would warn on a setState-after-unmount.
  - Response: The dismiss effect returns a cleanup that clears the pending timer on unmount / on the next message, so no orphaned setState fires.
  - User impact: None (invisible); prevents a React warning and a leaked timer.

### Edge cases

| Input | Expected |
| :--- | :--- |
| More messages arrive than the bounded window (e.g. an update op pushes 12 lines, N=8). | Only the last N lines render (LogView tail slice(-max)); older lines scroll off the top. No layout growth. |
| toast(undefined) called to clear while sticky error/info lines are present. | Only the current transient line is removed; sticky note/task lines remain. |
| The message log is empty (fresh app, no op run yet). | The bottom region reserves its fixed height and renders blank placeholder line(s) so the layout does not jump when the first message arrives. |
| A transient toast is followed immediately by a sticky error before the dismiss timer fires. | The transient dismiss targets only its own MsgLine by id; the sticky error is not removed by the earlier toast's timer. |
| A single message longer than the terminal width. | ink soft-wraps the line; the box still shows the last N logical lines (wrapping is cosmetic, consistent with today's LogView). |

### Invariants to preserve

- capture()/CaptureContext semantics are unchanged: global keybindings (app useInput isActive:!captured) and each pane's own useInput stay suspended while a modal/text field captures keys. The message-log change is orthogonal to key capture. Cited s1 bundle: 'Root shell layout' (app.tsx useInput isActive:!captured) + context.ts CaptureContext. [[c1]]
- Ui.toast(message?: string): void keeps its EXACT signature and clear-on-undefined behavior, so SetupPane/ReposPane/WorkflowsPane/ModelTiersPane need no edits. Cited s1 bundle: 'All ui.toast call-sites'. [[c2]]
- No message/output/error renders inside any pane body — there is exactly one render site (the bottom region in app.tsx). Cited s1 bundle: 'DaemonPane inline streaming log' (the block being removed) + 'Root shell layout'. [[c3]]
- CommandBar REPL semantics are preserved: Enter runs a command and the bar stays open for the next, `running…` marker while running, Esc closes; only its OUTPUT rendering relocates to the shared bottom box. Cited s1 bundle: 'CommandBar output rendering'. [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test) with ink-testing-library render/lastFrame/stdin, matching src/cli/__tests__/tui.test.ts`

### Test levels

- **unit** — Prove the message-log reducer/append helper in isolation: bounding to last N, transient-dismiss-by-id, kind colouring selection, and toast(undefined) clearing only the transient.
  - Subjects: `the bounded append + transient-clear logic behind the Ui surface (extracted as a pure helper in app.tsx or a small module, e.g. pushMessage/clearTransient over MsgLine[])`
  - Fixtures: `hand-built MsgLine[] arrays`
- **integration** — Render the whole App via ink-testing-library and assert messages/outputs/errors appear ONLY in the bottom region, pane bodies stay stable, and each source (toast, daemon task streaming, command output, errors) lands in the box.
  - Subjects: `src/cli/app.tsx bottom message region`, `src/cli/panes/DaemonPane.tsx op streaming (start/update/compact) via ui.task`, `src/cli/ui/CommandBar.tsx input-only + command output in the box`, `the four toast-only panes still surface their one-liners`
  - Fixtures: `fakeServices() facade (extended: daemon.update/restart already accept a push callback)`, `settle() 25ms helper`, `stdin.write driving keys`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: pressing a daemon op key (e.g. 'c' compact / 'u' update) renders the op title + streamed lines + result in the bottom region, and the DaemonPane body (Health + KeyHints) is unchanged (no 'last run:'/LogView between Health and KeyHints)` |
| `ac2` | `integration: running a ':' command shows its output in the bottom box (not a full-body takeover); the command bar remains just the ':' input line + hints`, `integration: existing test 'registered /tmp/viacmd appears' updated to read the bottom region` |
| `ac3` | `unit: transient toast line is removed after its dismiss tick while a concurrently-added sticky error line remains`, `unit: toast(undefined) clears only the transient, leaving note/task lines` |
| `ac4` | `unit: pushing >N lines keeps only the last N (bounded window, no growth)`, `integration: a multi-line update op does not grow the layout beyond the fixed bottom region height` |
| `ac5` | `unit: an error MsgLine renders with kind:'error' (red) and persists (non-transient)`, `integration: a failing daemon op (fakeServices throws) surfaces a red sticky error line in the bottom box, pane body untouched` |
| `ac6` | `integration: the four one-liner panes (Setup config-written, Repos add toast, Workflows approved, ModelTiers saved) still surface their toast in the bottom region with ui.toast unchanged` |

## Migration

**State before:** Messages fan out across three inconsistent surfaces (cited s1): (1) a single green toast line at the bottom of app.tsx (app.tsx:112-115) that never auto-clears; (2) DaemonPane's pane-local `log` state rendered as an inline LogView block in the MIDDLE of the pane body between Health and KeyHints (DaemonPane.tsx:82-87), which pushes the view during ops; (3) the `:` command bar output rendered full-body via CommandBar (flexGrow=1) requiring Esc to dismiss. The four other panes only call ui.toast for one-liners.

**State after:** One bounded (last-N) message region docked at the bottom of app.tsx is the single render site for every message. `Ui` gains `note` + `task` alongside the unchanged `toast`; all three append MsgLine entries to one `messages` array. DaemonPane's inline log + local state are gone (body = Health + KeyHints only); it streams via `ui.task`. CommandBar is input-only; the `:` runner appends output to the shared `messages`. Transient toasts auto-dismiss; errors are sticky/red; nothing renders mid-screen.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the `MsgLine` type + `note`/`task` methods to the `Ui` interface in context.ts (toast/capture signatures unchanged). Purely additive to the interface. — ↩ rollbackable
2. In app.tsx add the `messages` state + a bounded append helper (keep last N) + a transient-dismiss effect; implement `toast` as an append-transient (preserving clear-on-undefined), and `note`/`task` as append helpers; render the single bottom region via the reused LogView with per-line kind colouring. Keep the old single-line toast render removed in the same step so there is exactly one render site. — ↩ rollbackable
3. Rewrite DaemonPane to drop its local `log` state + inline LogView block and route begin/push/done/fail through `ui.task(title)`; pass the handle's push to svc.daemon.restart/update. Pane body becomes Health + KeyHints. — ↩ rollbackable
4. Make CommandBar input-only: drop the `output` prop + its render block, keep the `:` input line + hints + running marker + Esc-close. In app.tsx remove `cmdOutput` state and route the `:` runner's lines into `messages`. — ↩ rollbackable
5. Update src/cli/__tests__/tui.test.ts: repoint the command-output assertion at the bottom region, add the fakeServices message assertions, and add new tests for DaemonPane op streaming in the box + pane-body stability + error stickiness + bounded window. No pane other than DaemonPane/CommandBar changes. — ↩ rollbackable

**Backward compat:** Ui.toast(message?: string): void keeps its EXACT signature and clear-on-undefined semantics, so the four one-liner panes (Setup/Repos/Workflows/ModelTiers) compile and behave unchanged with zero edits. The only breaking internal ripple is the CommandBar prop shape (drops `output`) and DaemonPane's internals — both are internal-to-the-cli-module components with no external consumers. The test fake Ui must add note/task to match the widened interface.

## Alternatives considered

### a1: Unified bounded message log; toast becomes sugar — **CHOSEN**

One append-only bounded message array in app.tsx; Ui exposes `message`/streaming helpers and `toast` is just an append of a transient line.



### a2: Two channels: keep toast, add a separate streaming `log` handle

Ui = { toast, capture, log }, where `log` is a begin/push/done/fail streaming handle; the bottom box stacks a toast line above a bounded LogView.



**Rejected because:** Lowest-churn DaemonPane diff, but its two-channel render partially misses the 'single bounded box' the user explicitly chose and creates two overlapping 'show the user something' surfaces (done/fail already double as toast), inviting drift.

### a3: Reducer-backed typed message bus

A useReducer store of typed message events (toast/task-start/task-line/task-end/error) exposed via context; the bottom region subscribes and derives the bounded view.



**Rejected because:** Achieves the same visible behavior as a1 but with a reducer + action union that is more machinery than a 5-pane TUI needs; identical user value at a larger diff and more indirection.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — Root shell layout: toast state, bottom region, command-bar wiring (src/cli/app.tsx)` — "AppBody holds const [toast,setToast] rendered as a single green line at the bottom (app.tsx:112-115); global keys via useInput(..., { isActive: !captured })."
- **[[c2]]** `analyze-bundle` `s1 search.text — All ui.toast call-sites (Setup/Repos/Workflows/ModelTiers/Daemon panes)` — "Panes call ui.toast for success/error one-liners; only DaemonPane additionally streams multi-line via its pane-local log."
- **[[c3]]** `analyze-bundle` `s1 usage.example — DaemonPane inline streaming log (src/cli/panes/DaemonPane.tsx:82-87)` — "renders LogView INLINE between Health and the KeyHints — this is the block that appears in the middle of the pane and pushes the view."
- **[[c4]]** `analyze-bundle` `s1 usage.example — CommandBar output rendering (src/cli/ui/CommandBar.tsx)` — "Because app.tsx renders it with flexGrow=1 replacing the whole body, its output occupies mid-screen until Esc."
- **[[c5]]** `analyze-bundle` `s1 symbol.locate — LogView widget (src/cli/ui/widgets.tsx)` — "LogView({lines, max=12}) already renders the tail (lines.slice(-max)) of dim lines — exactly the bounded last-N-lines behavior the new bottom box needs."
- **[[c6]]** `analyze-bundle` `s1 test.locate — existing TUI render tests (src/cli/__tests__/tui.test.ts)` — "uses ink-testing-library render/stdin.write/lastFrame + fakeServices + settle(25ms); existing assertions read messages from the bottom."
- **[[c7]]** `stakeholder` `User design decisions for S001` — "(1) bounded fixed-height last-N-lines box, not growing scrollback; (2) command-bar output folds into the same bottom region."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-07-27T10:09:06.301Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contract/Ui.toast | citation | LOW | manual | src/cli/ui/context.ts declares the `Ui` interface with a `toast(message?: string): void` method and a `capture(on: boolean): void` method. | grep confirms src/cli/ui/context.ts:20 `export interface Ui {`, :22 `toast(message?: string): void;`, :24 `capture(on: boolean): void;`. Both signatures resolve in source. | none — verified sound |
| migration/stateBefore | citation | LOW | manual | src/cli/app.tsx holds a `toast` state rendered as a single line near the bottom of the layout (around app.tsx:112-115), and gates global keys with useInput isActive:!captured. | app.tsx:48 `const [toast, setToast]`, :113 `<Text color="green">{toast}</Text>`, :112 `<Box marginTop={1} flexDirection="column">`, :93 `{ isActive: !captured }`. The single bottom green toast line + capture-gated global keys are exactly as cited. | none — verified sound |
| dataModel/DaemonPane.log | citation | LOW | manual | src/cli/panes/DaemonPane.tsx keeps pane-local `const [log, setLog]` state and renders an inline LogView block between Health and the KeyHints (around DaemonPane.tsx:82-87). | DaemonPane.tsx:28 `const [log, setLog]`, :82 `{(busy \|\| log.length > 0) && (`, :85 `<LogView lines={log} />`. The inline pane-local log block is confirmed at the cited lines. (SetupPane has a parallel pattern but the LLD's scope is DaemonPane, which is correct.) | none — verified sound |
| errorPaths/daemon-op-throws | citation | LOW | manual | DaemonPane's `run(title, fn)` helper wraps the op in try/catch and calls `fail(...)` on error; begin/push/done/fail helpers manage the log. | DaemonPane.tsx:38 `const run = async (title, fn)`, :40 `try { done(await fn()); } catch (err) { fail(...) }`, :33 `const begin`, :36 `const fail`. The try/catch→fail error path and begin/push/done/fail helpers exist as described. | none — verified sound |
| dataModel/AppBody.cmdOutput | citation | LOW | manual | src/cli/app.tsx has `cmdOutput` state and renders CommandBar with an `output` prop; runCmd wraps runCommand in try/catch. | app.tsx:54 `const [cmdOutput, setCmdOutput]`, :102 `<CommandBar output={cmdOutput} running={cmdRunning} onSubmit={runCmd} onClose={closeCmd} />`, :68 `const runCmd = async`. cmdOutput state + output prop + runCmd all confirmed. | none — verified sound |
| contract/CommandBar | citation | LOW | manual | src/cli/ui/CommandBar.tsx accepts an `output: readonly string[]` prop and renders it above the ':' input line, with Esc closing (props.onClose) and a running marker. | CommandBar.tsx:19 `output: readonly string[];` and :26 `useInput((_input, key) => { if (key.escape) props.onClose(); })` confirmed. The `running` grep was swamped by doc matches (50-cap), but the running marker is real in source (props.running conditional renders the `running…` marker vs the TextInput) — a probe-noise artifact, not a contradiction. | none — verified sound |
| s1/LogView | citation | LOW | manual | src/cli/ui/widgets.tsx exports a LogView component that renders the tail of its lines via slice(-max) with a default max of 12. | widgets.tsx:66 `export function LogView(props: { lines: readonly string[]; max?: number })`, :67 `const max = props.max ?? 12`, :68 `const tail = props.lines.slice(-max)`. Bounded-tail LogView with default max 12 confirmed — reuse target is sound. | none — verified sound |
| invariant/c2 | inventory | LOW | manual | Exactly four panes other than DaemonPane call ui.toast for one-liners: SetupPane, ReposPane, WorkflowsPane, ModelTiersPane. | grep ui.toast( → SetupPane (4 hits), ReposPane (:72), WorkflowsPane (6 hits), ModelTiersPane (6 hits), and DaemonPane (:35,:36). The four named non-Daemon panes all call ui.toast and no fifth non-Daemon pane does; the premise correctly excludes DaemonPane (which the LLD moves to ui.task). Inventory holds. | none — verified sound |
| contract/Ui.task | semantic | LOW | manual | The daemon service methods restart and update accept a streaming push callback (so a ui.task push handle can be threaded to svc.daemon.restart(push) / update({}, push)). | DaemonPane.tsx:50 `await svc.daemon.restart(push)` and :55 `await svc.daemon.update({}, push)` are existing, compiling call-sites — the push-callback contract is already exercised today, so threading a ui.task push handle in is sound. (services/index.ts wires restart/update to maintenance.*; existing call-sites prove the signature accepts push.) | none — verified sound |
| testStrategy/framework | citation | LOW | manual | src/cli/__tests__/tui.test.ts uses ink-testing-library render + lastFrame + stdin.write, a fakeServices() facade, and a settle() helper. | tui.test.ts:19 `import { render } from 'ink-testing-library'`, :50 `function fakeServices(): Services`, :29 `const settle = () => new Promise(r => setTimeout(r, 25))`, and 27 render/lastFrame/stdin uses (e.g. :117 `const { lastFrame, stdin, unmount } = render(...)`). Test harness matches the strategy exactly. | none — verified sound |
