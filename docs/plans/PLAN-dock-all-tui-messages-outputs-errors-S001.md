<!-- insrc:artifact PLAN-93b2b1d6e5628b51-S001 -->

# Plan: S001

**Epic:** `dock-all-tui-messages-outputs-errors`
**LLD run:** `wf-1785146418242-eo8e7i`
**LLD effective hash:** `93b2b1d6e562...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Widen the Ui interface: MsgLine type + note/task methods | S | — | unit: tsc typecheck: widened Ui + MsgLine compile; the fake Ui in tui.test.ts satisfies the interface | [[c1]] [[c2]] |
| 2 | **`t2`** app.tsx: messages state + bounded/transient helper + Ui impl + single bottom render | L | `t1` | unit: pushMessage bounds to last N (pushing >N keeps only the last N, no growth); unit: clearTransient / toast(undefined) removes only the transient line, leaving sticky note/task lines; unit: transient-dismiss targets its own MsgLine by id; a concurrently-added sticky error survives; unit: an error-kind MsgLine persists (non-transient) and carries kind:'error'; integration: a transient toast auto-dismisses after its tick; the bottom region is the single render site | [[c1]] [[c3]] [[c5]] |
| 3 | **`t3`** Rewrite DaemonPane to stream via ui.task (drop local log + inline LogView) | M | `t2` | integration: pressing a daemon op key streams title+lines+result into the bottom region; DaemonPane body (Health+KeyHints) is unchanged (no inline LogView); integration: a failing daemon op (fakeServices throws) surfaces a sticky red error line in the bottom box, pane body untouched; integration: a multi-line update op does not grow the layout beyond the fixed bottom region height (bounded window) | [[c4]] |
| 4 | **`t4`** CommandBar input-only + route ':' output into messages | M | `t2` | integration: running a ':' command shows its output in the bottom box (not a full-body takeover); command bar stays just the ':' input + hints; integration: existing 'registered /tmp/viacmd' assertion updated to read the bottom region | [[c4]] [[c5]] |
| 5 | **`t5`** Tests: unit helper + integration coverage in tui.test.ts | M | `t2`, `t3`, `t4` | unit: message-log helper suite (bounded append, transient-clear-by-id, toast(undefined) clear, error persistence); integration: the four toast panes (Setup config-written, Repos add, Workflows approved, ModelTiers saved) still surface their one-liner in the bottom region with ui.toast unchanged; integration: full-app render: every message source (toast, task streaming, command output, errors) lands only in the bottom region; pane bodies stable | [[c6]] [[c7]] |

### `t1` — Widen the Ui interface: MsgLine type + note/task methods

In src/cli/ui/context.ts add `export interface MsgLine { id: number; text: string; kind: 'info' | 'error' | 'success'; transient: boolean }` and extend `interface Ui` with `note(line: string, kind?: 'info' | 'error'): void` and `task(title: string): { push(line: string): void; done(message: string): void; fail(message: string): void }`. Leave `toast(message?: string): void` and `capture(on: boolean): void` exactly as-is. Purely additive; no implementation here.

**Acceptance checks:**
- context.ts exports MsgLine with the four fields id/text/kind/transient
- Ui has note + task methods alongside the unchanged toast + capture
- tsc passes (interface-only change)

### `t2` — app.tsx: messages state + bounded/transient helper + Ui impl + single bottom render

Extract a pure helper (e.g. pushMessage(list, line, opts)/clearTransient(list) over MsgLine[]) that appends with a monotonic id, bounds to the last N (≈8), and clears-transient-by-id. Add `const [messages, setMessages] = useState<MsgLine[]>([])`. Implement the memoized ui: `toast(m?)` appends a transient success line (or clears the transient when undefined), `note(line,kind)` appends a sticky line, `task(title)` seeds a title line and returns {push,done,fail} that append info/success/error lines. Add the transient-dismiss effect (setTimeout + cleanup on unmount/next message). Replace the old single green toast render (app.tsx:112-115) with ONE bottom region that maps `messages` rows to COLOURED <Text> BY KIND directly in app.tsx (success=green, error=red, info=dim) — do NOT delegate colour to LogView (which renders all-dim); the load-bearing reuse is the bounded last-N append helper, not LogView's render. Reserve a fixed height so the layout does not jump. Keep capture + global useInput isActive:!captured unchanged.

**Acceptance checks:**
- ui exposes toast/note/task/capture matching the widened interface
- messages is the single source of truth; bottom region renders it once, mapping each row to a per-kind coloured <Text> in app.tsx (not via LogView's dim render)
- the old single-line toast render is gone (exactly one render site)
- transient toast auto-dismisses via a timer with a cleanup; toast(undefined) clears only the transient
- bounded to last N via the pure helper; global keys + capture behave as before
- tsc passes

### `t3` — Rewrite DaemonPane to stream via ui.task (drop local log + inline LogView)

In src/cli/panes/DaemonPane.tsx remove `const [log,setLog]`, the begin/push/done/fail log mutations, and the inline `{(busy||log.length>0) && ...<LogView lines={log}/>}` block (DaemonPane.tsx:82-87). Rework `run(title, fn)` to open a `const handle = ui.task(title)` and route success/failure through handle.done/handle.fail; thread handle.push to `svc.daemon.restart(push)` / `update({}, push)`. Keep ui.capture(true/false) around modal ops. Pane body becomes just <Health> + KeyHints.

**Acceptance checks:**
- DaemonPane has no local log state and no inline LogView between Health and KeyHints
- start/stop/restart/update/backup/compact stream their title + lines + result through ui.task into the bottom region
- a throwing op calls handle.fail and surfaces a sticky red line; pane body unchanged
- tsc passes

### `t4` — CommandBar input-only + route ':' output into messages

In src/cli/ui/CommandBar.tsx drop the `output: readonly string[]` prop and its top-truncated render block; keep the ':' input line, running marker, hints, and Esc-close. In src/cli/app.tsx remove `const [cmdOutput,setCmdOutput]`, stop passing `output` to CommandBar, and make runCmd append each output line (and the `: <cmd>` echo + `✗ <error>` on catch) into `messages` via ui.note instead of cmdOutput.

**Acceptance checks:**
- CommandBar no longer accepts/renders output; only the ':' input + hints + running marker remain
- app.tsx has no cmdOutput state; runCmd routes output + errors into messages
- running a ':' command shows output in the bottom box, not a full-body takeover; Esc still closes
- tsc passes

### `t5` — Tests: unit helper + integration coverage in tui.test.ts

Add a unit test file for the pure bounded-append/transient-clear helper (bounding to last N, transient-dismiss-by-id leaving sticky lines, toast(undefined) clears only transient, error kind persists) — this portion only needs t2 and may land as soon as t2 is done. In src/cli/__tests__/tui.test.ts extend the fake Ui/fakeServices to match the widened interface, repoint the existing ':' command-output assertion at the bottom region, and add integration tests (which need t3+t4): daemon op streams into the box with the DaemonPane body stable, a failing op shows a sticky red line, a multi-line op does not grow the layout (bounded), and the four toast panes still surface their one-liners.

**Acceptance checks:**
- unit tests cover bounded append, transient-dismiss-by-id, toast(undefined) clear, error persistence
- integration tests cover op-streaming-in-box, pane-body stability, error stickiness, bounded window, and the 4 toast panes
- existing command-bar test updated and green
- full CLI test sweep passes; tsc + build clean

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the bounded append + transient-clear logic behind the Ui surface (extracted as a pure helper in app.tsx or a small module, e.g. pushMessage/clearTransient over MsgLine[]) | `t2`, `t5` |
| src/cli/app.tsx bottom message region | `t2`, `t5` |
| src/cli/panes/DaemonPane.tsx op streaming (start/update/compact) via ui.task | `t3` |
| src/cli/ui/CommandBar.tsx input-only + command output in the box | `t4` |
| the four toast-only panes still surface their one-liners | `t5` |

## Citations

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api Ui.toast/note/task/capture + dataModel MsgLine` — "Ui gains note + task alongside the unchanged toast; MsgLine { id; text; kind; transient } is the unit stored in the shared bottom message log."
- **[[c2]]** `prior-artifact` `LLD S001 invariant c2 — toast signature preserved` — "Ui.toast(message?: string): void keeps its EXACT signature and clear-on-undefined behavior, so the four one-liner panes need no edits."
- **[[c3]]** `prior-artifact` `LLD S001 dataModel AppBody.messages + invariant c3 — single render site` — "New app.tsx state messages is the single source of truth; there is exactly one render site (the bottom region in app.tsx)."
- **[[c4]]** `prior-artifact` `LLD S001 dataModel DaemonPane.log + AppBody.cmdOutput + CommandBar (contractDetails/errorPaths)` — "Remove DaemonPane's inline LogView + local log and stream via ui.task; make CommandBar input-only and route its output into messages."
- **[[c5]]** `analyze-bundle` `s1 symbol.locate — LogView widget (src/cli/ui/widgets.tsx) + app.tsx state` — "LogView renders all-dim tail slice(-max); the bottom box needs per-kind colour, so app.tsx maps MsgLine rows to coloured Text itself. cmdOutput/messages state live in app.tsx."
- **[[c6]]** `prior-artifact` `LLD S001 testStrategy — node:test + ink-testing-library harness (src/cli/__tests__/tui.test.ts)` — "node:test (tsx --test) with ink-testing-library render/lastFrame/stdin, fakeServices facade + settle() helper."
- **[[c7]]** `stakeholder` `LLD S001 citation c7 — user design decisions` — "(1) bounded fixed-height last-N-lines box, not growing scrollback; (2) command-bar output folds into the same bottom region."
