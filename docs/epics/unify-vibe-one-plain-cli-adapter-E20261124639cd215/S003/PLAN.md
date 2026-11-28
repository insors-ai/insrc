<!-- insrc:artifact PLAN-639cd2159a87aedb-s3 -->

# Plan: STORY-639cd2159a87aedb-s3

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**LLD run:** `wf-1795767098909-53x0zo`
**LLD effective hash:** `67d59677de6a...`

Building this Story means giving the VS Code chat's own direct Vibe launch path the same safety machinery the backend adapter already has: a per-turn export directory it owns, a dispatchState tracker that mirrors the adapter's model exactly, and a real exit classification read from Vibe's own export.json instead of a guess. That classification gets stamped onto the one durable marker both the live writer and a reattaching follower already consult, so a resumed turn is judged exactly as safely as a live one. Once that's proven, the Story deletes the old worker-routed path it replaces and gates the final cutover on a live approval-flag equivalence check.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Stories covered:** `s1`, `s2`

s1 built the shared adapter (src/shared/vibe-adapter.ts) including the dispatchState model ('not-sent'->'possibly-sent'->'accepted') and buildArgv's 2-argument export-directory contract that Story s3's alternative a1 mirrors inside cli-adapter.ts's direct-spawn vibe branch; s1's own t7 FAILED (disclosed, a repo-wide contract test gap, unrelated to s3's scope). s2 built the read-only qualification suite (ReadOnlyCapability, qualifyReadOnlyCapability, the now-renamed argvExcludingTurnLocalFlags) on top of the SAME vibe-adapter.ts file, but its changed-files list (confirmed via its own BUILD record) touches only src/shared/vibe-adapter.ts and src/agent/providers/cli-provider.ts -- no file under vscode-plugin/src/chat/ -- and none of s2's additions touch buildArgv's ordinary (non-read-only) argv construction or the ordinary dispatchState transitions s3 mirrors; its own disclosed Task failures (t4: non-self-triggering readOnly field; t7: amendment filed via a different Story's workflow) are both scoped to the read-only authorization path. No contradiction or re-work needed: s3 may proceed mirroring s1's original dispatchState/export-directory model exactly as the approved LLD describes, without any HLD back-flow for epic-state reasons.

**Sources:**
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json
- .insrc/artifacts/BUILD-639cd2159a87aedb-s2.json
- src/shared/vibe-adapter.ts
- docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S002/BUILD.md

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Export buildArgv and readExitEvidence from vibe-adapter.ts | S | — | — | smoke: buildArgv and readExitEvidence import directly from vibe-adapter.ts and are callable | [[c4]] |
| 2 | **`t2`** Widen mapLine's row branches and delegate MCP tool-name parsing to VibeMcpNaming.fromStreamedName | S | — | — | unit: parseVibeMcpTool delegates to VibeMcpNaming.fromStreamedName; live: tool-activity naming parity against the installed vibe binary (carried from round 3) | [[c5]] |
| 3 | **`t3`** vibeMapper.buildArgs accepts an optional outputDir and delegates to buildArgv | S | — | `t1` | unit: vibeMapper.buildArgs threading outputDir through to buildArgv; integration: prompt transport via stdin, not argv (carried from round 3) | [[c6]] |
| 4 | **`t4`** Allocate and own a per-turn export directory in run()'s vibe branch | S | — | `t3` | integration: export-directory lifecycle across success/signal/spawn-failure/abort paths | [[c7]] |
| 5 | **`t5`** Track dispatchState through its three transition points in run()'s vibe branch | M | — | `t4` | unit: dispatchState transitions: 'not-sent' before spawn, 'possibly-sent' immediately after spawn succeeds, 'accepted' once a session-identity row is decoded; a subsequent stdin write/end failure does not revert it; integration: a spawn failure before any child exists is deterministic pre-dispatch-safe | [[c7]] [[c15]] |
| 6 | **`t6`** Extend the stdin-write gate to the vibe mapper, classified by dispatchState | S | — | `t5` | integration: a stdin write/end failure AFTER spawn succeeds is classified replay-unsafe | [[c8]] |
| 7 | **`t7`** Compute vibeOutcome from export.json on exit and clean up the export directory | M | — | `t4`, `t5` | unit: readExitEvidence-driven outcome classification: stopReason undefined -> 'ok'; stopReason present -> 'replay-unsafe'; export.json missing/malformed -> 'no-evidence'; integration: a fixture binary exiting cleanly with no stopReason yields vibeOutcome 'ok', read identically live and on reattach; integration: a fixture binary exiting cleanly with a stopReason yields vibeOutcome 'replay-unsafe' despite exit code 0 | [[c9]] |
| 8 | **`t8`** Widen TurnExit, Marker's turn-end variant, parseMarker and endTurn's marker construction | M | — | — | unit: parseMarker's turn-end case extracting code, signal, unknown, vibeDispatchState and vibeOutcome | [[c10]] |
| 9 | **`t9`** Pass the computed vibeDispatchState/vibeOutcome through to sessionOutput.endTurn for a vibe turn | S | — | `t7`, `t8` | unit: endTurn constructing the turn-end marker with the new fields present for vibe and absent for claude/codex; integration: detach/reattach producing identical classification | [[c11]] |
| 10 | **`t10`** Extend the follower's EOF-without-terminal-row path to read the new marker fields for a vibe turn | M | — | `t8`, `t9` | unit: the follower's missing-result branch for mapper.id==='vibe'; integration: detach/reattach producing identical classification; integration: host-loss simulation read as replayUnsafe | [[c12]] |
| 11 | **`t11`** Delete the vibeCatalog worker route and its now-superseded helpers | L | — | `t4`, `t5`, `t6`, `t7`, `t8`, `t9`, `t10` | unit: no production file under src/ or vscode-plugin/src/ references vibeCatalog, vibe-session-worker.ts, or runVibeChatJob/historyLines | [[c13]] |
| 12 | **`t12`** Live-verify approval-flag effective equivalence and export.json's real field shape; gate cutover | S | — | `t11` | live: export.json's real field names match readExitEvidence's expectations; live: approval-flag effective-equivalence comparison, gating the migration's cutover | [[c14]] |

### 2.1 TASK-639cd2159a87aedb-s3-t1 — Export buildArgv and readExitEvidence from vibe-adapter.ts

Export buildArgv(request, outputDir) and readExitEvidence from src/shared/vibe-adapter.ts (both currently module-private), mirroring the existing export precedent other adapter primitives already use. No behavior change.

**Acceptance checks:**
- buildArgv and readExitEvidence are exported from src/shared/vibe-adapter.ts with their existing signatures unchanged
- a new, minimal test imports buildArgv and readExitEvidence directly from '../vibe-adapter.js' (not re-implemented or copy-pasted) and calls each once, proving the export surface is real and importable
- every existing vibe-adapter.ts test still passes with no behavior change

### 2.2 TASK-639cd2159a87aedb-s3-t2 — Widen mapLine's row branches and delegate MCP tool-name parsing to VibeMcpNaming.fromStreamedName

Add the new top-level reasoning/effect row branches to mapLine and replace parseVibeMcpTool's body with a call to VibeMcpNaming.fromStreamedName (sc2), so the chat decodes MCP tool names the same way the shared adapter does.

**Acceptance checks:**
- mapLine decodes the new reasoning/effect row shapes without breaking any existing native or legacy worker-bridged row decode path
- parseVibeMcpTool resolves an MCP tool name via VibeMcpNaming.fromStreamedName, not a second independent parser

### 2.3 TASK-639cd2159a87aedb-s3-t3 — vibeMapper.buildArgs accepts an optional outputDir and delegates to buildArgv

Change vibeMapper.buildArgs to accept an optional outputDir parameter and delegate to buildArgv(req, outputDir); set inputIsPrompt to false for the vibe mapper so the prompt travels via stdin, matching the shared adapter's own contract.

**Acceptance checks:**
- vibeMapper.buildArgs(req, outputDir) produces the same argv buildArgv itself would for the same request
- vibeMapper.inputIsPrompt is false

### 2.4 TASK-639cd2159a87aedb-s3-t4 — Allocate and own a per-turn export directory in run()'s vibe branch

In cli-adapter.ts's run() direct-spawn vibe branch, allocate a fresh per-turn export directory (mkdtemp) before spawn and wire it into buildArgs's outputDir parameter. Split from the original combined Task per s3 critique: this is the export-directory lifecycle half, independently testable from dispatchState tracking.

**Acceptance checks:**
- the vibe branch allocates its own export directory via mkdtemp before spawn and passes it to buildArgs's outputDir parameter
- a distinct export directory is allocated per turn, never reused across turns

### 2.5 TASK-639cd2159a87aedb-s3-t5 — Track dispatchState through its three transition points in run()'s vibe branch

Track a local dispatchState mirroring vibe-adapter.ts's own model: 'not-sent' -> 'possibly-sent' immediately after spawn succeeds, before the stdin write -> 'accepted' once a session-identity row is decoded. Split from the original combined Task per s3 critique: this is the dispatchState half, built on t4's export-directory lifecycle.

**Acceptance checks:**
- the local dispatchState transitions exactly match vibe-adapter.ts's own model at the same three points (pre-spawn, post-spawn-pre-stdin-write, post-session-identity-row)

### 2.6 TASK-639cd2159a87aedb-s3-t6 — Extend the stdin-write gate to the vibe mapper, classified by dispatchState

Extend the existing stdin-write gate (currently scoped to other mapper ids) to cover mapper.id==='vibe'; classify a write/end failure using whatever dispatchState the turn already holds at that point, instead of treating it as unconditionally pre-dispatch-safe.

**Acceptance checks:**
- a stdin write/end failure for a vibe turn is classified using the turn's own current dispatchState, never assumed pre-dispatch-safe

### 2.7 TASK-639cd2159a87aedb-s3-t7 — Compute vibeOutcome from export.json on exit and clean up the export directory

On process exit, read export.json via the now-exported readExitEvidence and classify vibeOutcome ('ok' | 'no-evidence' | 'replay-unsafe') from Vibe's real reported stopReason/outcome; remove the per-turn export directory (from t4) in a finally block on every exit path (clean exit, error, cancellation).

**Acceptance checks:**
- vibeOutcome is computed from export.json's real stopReason/outcome fields, never inferred from merely having decoded a row
- the export directory is removed on every exit path, including an error or cancelled turn

### 2.8 TASK-639cd2159a87aedb-s3-t8 — Widen TurnExit, Marker's turn-end variant, parseMarker and endTurn's marker construction

Add two new OPTIONAL vibe-outcome fields (dispatchState, outcome) to TurnExit and Marker's turn-end variant; widen parseMarker's turn-end case to parse and return them; widen endTurn's appendMarker call to include them (alongside the previously-discarded code/signal fields, which are already written but not yet exposed).

**Acceptance checks:**
- Marker's turn-end variant and parseMarker's turn-end case both carry the two new optional vibe fields plus the previously-written-but-undeclared code/signal fields
- a turn-end marker line written before this Story's build still parses successfully with the new fields simply absent

### 2.9 TASK-639cd2159a87aedb-s3-t9 — Pass the computed vibeDispatchState/vibeOutcome through to sessionOutput.endTurn for a vibe turn

Wire run()'s vibe branch to pass the final dispatchState and the computed vibeOutcome through the existing sessionOutput.endTurn(sessionId, turnId, exit) call site, using TurnExit's two new optional fields from t8.

**Acceptance checks:**
- a completed vibe turn's endTurn call carries its real dispatchState and vibeOutcome on the TurnExit object
- a non-vibe turn's endTurn call is unaffected (the new fields stay undefined)

### 2.10 TASK-639cd2159a87aedb-s3-t10 — Extend the follower's EOF-without-terminal-row path to read the new marker fields for a vibe turn

Extend the follower's existing EOF-without-terminal-row path to read the new dispatchState/outcome marker fields for mapper.id==='vibe' and surface replayUnsafe accordingly, instead of returning a flat, unclassified error; a host-loss synthesized unknown:true marker is always treated as replay-unsafe for a vibe turn.

**Acceptance checks:**
- a follower reattaching after a vibe turn's clean completion classifies replay safety from the real written outcome, not a flat unclassified error
- a follower reattaching after host loss (synthesized unknown:true marker) always classifies a vibe turn as replay-unsafe

### 2.11 TASK-639cd2159a87aedb-s3-t11 — Delete the vibeCatalog worker route and its now-superseded helpers

Delete the vibeCatalog branch in cli-adapter.ts and vibe-session-worker.ts/vibe-session-process.ts's runVibeChatJob/historyLines (the app-server-shaped route the direct-spawn mirroring in t4-t10 now fully supersedes); update esbuild.mjs's bundle entries and packaging.test.ts's assertions accordingly.

**Acceptance checks:**
- a new, durable repo-wide contract test (mirroring Story s1's t7 no-vibe-session-transport.test.ts convention) greps every production .ts file under src/ and vscode-plugin/src/ for vibeCatalog, vibe-session-worker.ts and vibe-session-process.ts's runVibeChatJob/historyLines, and fails if any production file still references them
- esbuild.mjs and packaging.test.ts no longer name the deleted files/bundle entries, and the plugin still packages cleanly

### 2.12 TASK-639cd2159a87aedb-s3-t12 — Live-verify approval-flag effective equivalence and export.json's real field shape; gate cutover

GATED (migration step 12, open question q11e93349 resolved as 'gate cutover at step 12'): live-verify that --approval-policy is effectively equivalent to the old --agent route before finalizing t11's route removal, and live-verify export.json's real field shape against what t7/t10 assume. Proceed with --approval-policy only if parity holds; otherwise keep --agent or record an explicit accepted deviation on the ledger before cutover.

**Acceptance checks:**
- the approval-flag live-verification result (parity holds, or an explicit accepted deviation) is recorded before this Task is considered complete
- export.json's real field shape is confirmed live against what t7/t10 assume, with any mismatch corrected before cutover is considered final

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| dispatchState transitions: 'not-sent' before spawn, 'possibly-sent' immediately after spawn succeeds, 'accepted' once a session-identity row is decoded; a subsequent stdin write/end failure does not revert it | `t5`, `t6` |
| readExitEvidence-driven outcome classification: stopReason undefined -> 'ok'; stopReason present -> 'replay-unsafe'; export.json missing/malformed -> 'no-evidence' | `t7` |
| parseMarker's turn-end case extracting code, signal, unknown, vibeDispatchState and vibeOutcome | `t8` |
| endTurn constructing the turn-end marker with the new fields present for vibe and absent for claude/codex | `t9` |
| The follower's missing-result branch for mapper.id==='vibe' | `t10` |
| vibeMapper.buildArgs threading outputDir through to buildArgv | `t3` |
| A fixture binary exiting cleanly with no stopReason -> vibeOutcome 'ok', read identically live and on reattach | `t7`, `t9`, `t10` |
| A fixture binary exiting cleanly with a stopReason -> vibeOutcome 'replay-unsafe' despite exit code 0 | `t7` |
| A stdin write/end failure AFTER spawn succeeds -> 'replay-unsafe' | `t6` |
| A spawn failure before any child exists -> deterministic pre-dispatch-safe | `t5` |
| Detach/reattach producing identical classification | `t9`, `t10` |
| Host-loss simulation read as replayUnsafe | `t10` |
| Export-directory lifecycle across success/signal/spawn-failure/abort paths | `t4`, `t7` |
| Prompt transport (carried from round 3) | `t3` |
| export.json's real field names match readExitEvidence's expectations | `t12` |
| Tool-activity naming parity (carried from round 3) | `t2` |
| Approval-flag effective-equivalence comparison, gating the migration's cutover | `t12` |

## 4. References

- **[[c4]]** `prior-artifact` `LLD s3 §8 migration steps 1-2: export buildArgv and readExitEvidence from src/shared/vibe-adapter.ts`
- **[[c5]]** `prior-artifact` `LLD s3 §8 migration step 3: widen mapLine's row branches and delegate to VibeMcpNaming.fromStreamedName`
- **[[c6]]** `prior-artifact` `LLD s3 §8 migration step 4: vibeMapper.buildArgs accepts an optional outputDir and delegates to buildArgv`
- **[[c7]]** `prior-artifact` `LLD s3 §8 migration step 5: allocate a per-turn export directory and track dispatchState in run()'s vibe branch`
- **[[c8]]** `prior-artifact` `LLD s3 §8 migration step 6: extend the stdin-write gate to mapper.id==='vibe'`
- **[[c9]]** `prior-artifact` `LLD s3 §8 migration step 7: compute vibeOutcome from export.json on exit and remove the export directory`
- **[[c10]]** `prior-artifact` `LLD s3 §8 migration step 8: widen TurnExit, Marker's turn-end variant, parseMarker and endTurn's marker construction`
- **[[c11]]** `prior-artifact` `LLD s3 §8 migration step 9: pass vibeDispatchState/vibeOutcome through to sessionOutput.endTurn`
- **[[c12]]** `prior-artifact` `LLD s3 §8 migration step 10: extend the follower's EOF-without-terminal path for mapper.id==='vibe'`
- **[[c13]]** `prior-artifact` `LLD s3 §8 migration step 11: delete the vibeCatalog branch and vibe-session-worker.ts/vibe-session-process.ts's runVibeChatJob/historyLines`
- **[[c14]]** `prior-artifact` `LLD s3 §8 migration step 12: GATED live-verify approval-flag effective equivalence and export.json's real field shape before cutover`
- **[[c15]]** `prior-artifact` `LLD s3 §9.1 alternative a1 (chosen): mirror dispatchState + own export-directory lifecycle, widen the existing generic turn-end marker`
