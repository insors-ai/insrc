<!-- insrc:artifact PLAN-f900cf34c0342d4f-s5 -->

# Plan: E20260806f900cf34:S005

**Epic:** `seed-from-approved-specartifact-spec-bfa1f6c830c53982`
**LLD run:** `wf-1786006696239-lrppgj`
**LLD effective hash:** `ddca67745f5c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the LogCategory/LogLine/LogFilter types + widen the DebugService interface | S | — | integration: debug-types: LogCategory/LogCategoryId/LogLine/LogFilter round-trip (closed union + required raw + optional fields) and the widened DebugService compiles | [[c1]] [[c2]] |
| 2 | **`t2`** Implement the tailLogWith core + LogFilter predicate + logCategories/tailLog facade wrappers | L | `t1` | unit: tailLogWith: resolves the active segment (highest-N/newest-mtime) and emits its last-N lines on start; unit: tailLogWith: a watch 'change' event emits the newly-appended lines (live follow); unit: tailLogWith: a newer higher-N segment appearing re-resolves+follows it and emits its lines (rotation follow, lc2); unit: tailLogWith: non-JSON/partial line -> LogLine raw-only; valid pino JSON -> time/level/module/msg; unit: tailLogWith: empty/missing dir or no segment emits [] and never throws (k4); unit: tailLogWith: a readTail/watch throw is swallowed and the subscription survives; unit: tailLogWith: dispose() removes the watcher and suppresses any post-dispose onLines emit (idempotent); unit: matchesFilter: minLevel keeps level>=; a non-JSON (no level) line is dropped under an active minLevel; unit: matchesFilter: module ci-match on LogLine.module; text ci-substring over LogLine.raw; unit: matchesFilter: unset fields impose no constraint; level+module+text are ANDed; unit: matchesFilter: free-text still matches a non-JSON line via raw (level/module cannot); unit: logCategories() returns exactly [daemon, agent] and opens no stream; integration: makeServices().debug exposes logCategories + tailLog bound to the real impls | [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Update the in-repo debug-facade test fakes for logCategories/tailLog | S | `t1` | integration: Every in-repo debug facade fake (tui/command/DebugPane/DaemonSection/MCPSection/LogsSection) carries logCategories + tailLog stubs so the widened DebugService compiles | [[c2]] |
| 4 | **`t4`** Add the LogsSection component + wire it into DebugPane | L | `t2` | unit: LogsSection: on open renders the daemon + agent category list and calls neither tailLog (no stream until select) (ac1); unit: LogsSection: selecting a category calls tailLog once + renders its lines; selecting another disposes the first before subscribing (single stream) (ac2); unit: LogsSection: an emit AFTER dispose (stale subscription) does not appear in the view; unit: LogsSection: setting a level/module/text filter limits the visible lines while emits accumulate; clearing re-reveals them (ac3); unit: LogsSection: no key deletes/rotates/clears a log — only select + filter + section-nav honoured (k2); the subscription is disposed on unmount; integration: DebugPane 'logs' section maps to <LogsSection/> (the s1 placeholder is gone) | [[c5]] [[c6]] |

### E20260806f900cf34:S005:T001 — Add the LogCategory/LogLine/LogFilter types + widen the DebugService interface

In src/cli/services/debug-types.ts add the new CLI-side view-model types: LogCategoryId = 'daemon'|'agent'; LogCategory { id; title; stem }; LogLine { raw; time?; level?; module?; msg? }; LogFilter { minLevel?; module?; text? }. Widen the DebugService interface with logCategories(): readonly LogCategory[] + tailLog(categoryId: LogCategoryId, onLines: (lines: readonly LogLine[]) => void): () => void. Additive; existing members unchanged. Build note: land WITH t3 (the fakes) since the interface widening breaks them.

**Acceptance checks:**
- LogCategoryId is the closed union 'daemon'|'agent'; LogCategory/LogLine/LogFilter are exported with the stated fields (LogLine.raw required, the rest optional)
- DebugService interface gains logCategories() + tailLog(); existing members unchanged
- tsc compiles

### E20260806f900cf34:S005:T002 — Implement the tailLogWith core + LogFilter predicate + logCategories/tailLog facade wrappers

In src/cli/services/debug.ts add: (a) logCategories() returning the two static categories (daemon->stem 'daemon', agent->stem 'agent'); (b) tailLogWith(deps) over an injectable fs seam { listSegments(stem), readTail(file,maxLines), watch(file,cb)->unwatch } — resolves the active `<stem>.<N>.<ext>` segment (highest-N/newest-mtime), emits its last-N lines, fs.watch-follows appends, re-resolves+follows across a rotation (lc2), parses each line best-effort into a LogLine (pino JSON → level/module/msg; non-JSON → raw only), a `disposed` guard suppresses post-dispose emits, never throws (empty/missing dir → empty emit); (c) a pure matchesFilter(line, filter) predicate (minLevel>=, module ci-match, text ci-substring over raw; unset=no constraint; ANDed; non-JSON dropped by an active level/module filter); (d) zero-arg facade wrappers logCategories()/tailLog() over realDeps bound to node:fs (readdirSync/readFileSync/watch); bind both onto the makeServices() debug entry. Build note: land WITH t3 (the fakes) in one increment.

**Acceptance checks:**
- logCategories() returns exactly [daemon, agent] and opens no stream
- tailLogWith resolves the active segment + emits its last-N lines on start; a watch 'change' emits appended lines; a newer higher-N segment appearing re-resolves+follows it (lc2)
- tailLogWith parses pino JSON into level/module/msg and a non-JSON line into raw-only; an empty/missing dir emits [] and never throws; a readTail/watch throw is swallowed (subscription survives)
- dispose() removes the watcher and suppresses any post-dispose onLines emit (idempotent)
- matchesFilter honours minLevel/module/text (ANDed, unset=no constraint; non-JSON dropped under an active level/module filter, still matched by text via raw)
- makeServices().debug.logCategories + .tailLog are bound to the real impls; no real fs.watch/disk in unit tests (deps injected); tsc compiles

### E20260806f900cf34:S005:T003 — Update the in-repo debug-facade test fakes for logCategories/tailLog

Add conformant logCategories + tailLog stubs to every in-repo `debug` facade fake so the widened DebugService compiles: fakeServices() in tui.test.ts, the ctxWith base in command.test.ts, the 2 inline props in DebugPane.test.ts, the 2 fakes (renderSection + renderOrphans) in DaemonSection.test.ts, and the makeDebug fake in MCPSection.test.ts — exactly 5 files (defaults logCategories -> [daemon,agent], tailLog -> a no-op returning a no-op dispose). Build note: apply together-with t2 in ONE increment (mirrors s2/s3/s4 fakes-lockstep); dependsOn stays [t1] (the interface widening is the compile dependency).

**Acceptance checks:**
- Every in-repo debug-facade fake (tui/command/DebugPane/DaemonSection x2/MCPSection) includes logCategories + tailLog stubs returning valid values
- `npx tsx --test 'src/cli/**/*.test.ts'` compiles against the widened DebugService
- No existing assertion behaviour changes beyond the additive stubs

### E20260806f900cf34:S005:T004 — Add the LogsSection component + wire it into DebugPane

Add src/cli/panes/LogsSection.tsx: renders the category list from logCategories() with NO stream until a selection (ac1); on select, subscribes via tailLog into a bounded ring buffer, disposing any prior subscription first (single stream) and on unmount/section-change (ac2/lc2); renders the buffer via the LogView widget filtered by a persistent LogFilter bar applied as a pure predicate (matchesFilter), with the free-text entry capture-gated (like TextInput) and useCaptured/useInput gated exactly as MCPSection/DaemonSection; strictly read-only — no key deletes/rotates/clears a log (k2). Swap DebugPane's SECTION_VIEWS logs entry from the placeholder to <LogsSection services={{ debug }} /> (the final placeholder, completing the pane).

**Acceptance checks:**
- LogsSection on open renders the daemon + agent category list and starts NO stream (tailLog not called) (ac1)
- Selecting a category calls tailLog once + renders its emitted lines; selecting another disposes the first subscription before subscribing (only one stream); a post-dispose emit does not appear (ac2)
- Setting a level/module/text filter limits the visible lines while emits keep accumulating; clearing re-reveals buffered lines (ac3); the ring buffer is bounded
- No key disconnects/deletes/rotates/clears a log — only category-select + filter entry + section-nav are honoured (k2); the subscription is disposed on unmount
- DebugPane's 'logs' section maps to <LogsSection/> (placeholder gone); tsc compiles

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| tailLogWith: resolves the active segment (highest-N / newest-mtime among `<stem>.*.log`) and emits its last-N lines on start | `t2` |
| tailLogWith: a watch 'change' event on the active file emits the newly-appended lines (live follow) | `t2` |
| tailLogWith: when the active file stops growing AND a newer higher-N segment appears, re-resolves to it and emits the new segment's lines (rotation follow, lc2) | `t2` |
| tailLogWith: a non-JSON / partial line parses to a LogLine with only `raw` (no level/module/msg); a valid pino JSON line fills time/level/module/msg | `t2` |
| tailLogWith: an empty/missing log dir or no matching segment emits an empty initial batch and does NOT throw (k4) | `t2` |
| tailLogWith: a readTail/watch throw is swallowed and the subscription survives (re-resolve on the next event) | `t2` |
| tailLogWith: dispose() removes the watcher and suppresses any post-dispose onLines emit (idempotent) | `t2` |
| filter predicate: minLevel keeps LogLines whose numeric level >= minLevel; a LogLine with no level (non-JSON) is dropped when minLevel is set | `t2` |
| filter predicate: module matches (case-insensitive) LogLine.module; free-text is a case-insensitive substring over LogLine.raw | `t2` |
| filter predicate: an unset field imposes no constraint; combined level+module+text are ANDed | `t2` |
| filter predicate: free-text still matches a non-JSON line via `raw` even though level/module cannot | `t2` |
| LogsSection: on open, renders the daemon + agent category list and calls neither tailLog (no stream until select) (ac1) | `t4` |
| LogsSection: selecting a category calls tailLog once and renders its emitted lines; selecting a second category disposes the first subscription before subscribing (only one active stream) (ac2) | `t4` |
| LogsSection: an emit AFTER dispose (stale subscription) does not appear in the view | `t4` |
| LogsSection: setting a level/module/text filter limits the visible lines while later emits keep accumulating; clearing re-reveals them (ac3) | `t4` |
| LogsSection: no key deletes/rotates/clears a log — only category-select + filter entry + section-nav are honoured (k2); the subscription is disposed on unmount (no watcher leak) | `t4` |
| Every in-repo `debug` facade fake (tui/command/DebugPane/DaemonSection/MCPSection/LogsSection tests) carries logCategories + tailLog stubs so the widened DebugService compiles | `t3` |
| The DebugPane 'logs' section maps to <LogsSection/> (the s1 placeholder is gone) — completing the three live sections | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 handoff: new CLI-side view-model types LogCategory/LogCategoryId/LogLine/LogFilter (debug-types.ts)`
- **[[c2]]** `prior-artifact` `LLD s5 handoff: DebugService facade widening with logCategories() + tailLog() (additive, sc1 flat-facade extension; the widening breaks the in-repo fakes)`
- **[[c3]]** `prior-artifact` `LLD s5 handoff: tailLogWith(deps) fs.watch rotation-aware tailer core (resolve active `<stem>.<N>.<ext>` segment, emit tail, follow appends + rotation lc2, best-effort pino-JSON parse, dispose guard, never throws — k4)`
- **[[c4]]** `prior-artifact` `LLD s5 handoff: the pure matchesFilter(line, filter) predicate (minLevel>=, module ci-match, text ci-substring over raw; ANDed; non-JSON graceful degrade) for ac3`
- **[[c5]]** `prior-artifact` `LLD s5 handoff: LogsSection component — category list (ac1) + single-stream tailLog subscription into a ring buffer (ac2/lc2) + persistent filter bar over LogView (ac3), strictly read-only (k2)`
- **[[c6]]** `prior-artifact` `LLD s5 handoff: DebugPane SECTION_VIEWS swaps the 'logs' placeholder for <LogsSection/> (the final placeholder, completing the three-section pane; no change to hosting shape/DebugSectionId/navigation)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-08-06T09:13:52.821Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | auto | src/cli/services/debug-types.ts hosts the DebugService interface (with the s2/s3/s4 members) that t1 widens with logCategories/tailLog + the new Log* types. | src/cli/services/debug-types.ts:35 reads `export interface DebugService {` (with the s2/s3/s4 members) — the facade t1 widens exists as cited. | None. |
| t2 | citation | LOW | auto | src/cli/services/debug.ts holds the injectable-deps cores + realDeps + facade wrappers (scanOrphansWith/mcpStatusWith/attachedClientsWith) that t2's tailLogWith + matchesFilter + facade wrappers extend, and it already imports node:fs. | src/cli/services/debug.ts holds the injectable-deps cores (scanOrphansWith/mcpStatusWith) + imports from node:child_process (:15) and node:fs (:16, existsSync/readFileSync) — the pattern + fs access t2 extends are present; readdirSync/watch are additive to the existing node:fs import. | None. |
| t2 | citation | LOW | auto | PATHS.logDir + PATHS.daemonLog + PATHS.agentLog give the log stems the tailer resolves (daemon.*.log / agent.*.log under logDir). | src/shared/paths.ts:103 reads `logDir: LOG_DIR,` with daemonLog/agentLog at :104-105 — the log stems the tailer resolves are confirmed. | None. |
| t4 | citation | LOW | auto | The LogView render widget the LogsSection reuses exists at src/cli/ui/widgets.tsx (bounded last-N tail), alongside TextInput for the capture-gated filter entry. | src/cli/ui/widgets.tsx:66 reads `export function LogView(props: { lines: readonly string[]; max?: number })` — the render widget the LogsSection reuses exists (TextInput is in the same file). | None. |
| t4 | citation | LOW | auto | src/cli/panes/DebugPane.tsx maps the 'logs' SECTION_VIEWS entry to a placeholder ('Log viewer — coming soon.') that t4 swaps for <LogsSection/> (the daemon/mcp slots already live). | src/cli/panes/DebugPane.tsx:36 comment reads 'Daemon (s2) + MCP (s4) are live; logs remains a placeholder until s5' — the SECTION_VIEWS logs placeholder swap target is confirmed. | None. |
| t2 | external-contract | LOW | auto | The shared logger writes via pino, so file lines are pino JSON carrying numeric level + `name` (module) + msg, and it rotates to `<stem>.<N>.<ext>` segments (pino-roll) — the shape tailLogWith parses. | src/shared/logger.ts:66 reads `target: 'pino-roll',` — pino-roll rotation + pino JSON line shape (numeric level, name, msg) confirmed; the `<stem>.<N>.<ext>` segment naming was verified live. | None. |
| t3 | inventory | LOW | auto | The in-repo debug facade fakes needing logCategories/tailLog stubs live in exactly 5 test files: tui.test.ts, command.test.ts, DebugPane.test.ts, DaemonSection.test.ts (2 fakes), MCPSection.test.ts. | grep for mcpStatus:/attachedClients: matches across the 5 named test files (tui/command/DebugPane/DaemonSection/MCPSection) — the fake inventory (5 files, DaemonSection carrying 2 fakes) is accurate; the new LogsSection test adds its own. | None. |
| plan | ordering | LOW | auto | The task dependency graph is acyclic (t1 root; t2<-t1; t3<-t1; t4<-t2) with order 1..4 a valid topological sort. | dependency graph t1 root -> {t2,t3}; t2->t4 is acyclic with order 1..4 a valid topological sort; matches the checklist.verify audit. | None — ordering consistent. |
