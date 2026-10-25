<!-- insrc:artifact PLAN-83c85f38afad7843-s1 -->

# Plan: STORY-83c85f38afad7843-s1

## Summary

**Epic:** `keep-chat-turn-s-reply-when`
**LLD run:** `wf-1792946090099-c25hob`
**LLD effective hash:** `0e559c7e6f25...`

Fix premature chat completion by linking each new Claude request to its own native result, preserving replies after queued work finishes first. Extend retained-output replay so older turns also keep their outcome across repeated reloads, then validate live, resumed and background-process behavior with provider-specific tests.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add bounded replay of retained turn prefixes | M | — | — | integration: bounded prefix selects only requested turn and complete pre-checkpoint lines; integration: bounded prefix terminates while writer lives; abort, rotated generation and missing marker; integration: existing default session-output tail behavior | [[c1]] [[c2]] |
| 2 | **`t2`** Correlate Claude requests and native completion | M | — | `t1` | unit: only designated request UUID singular/list result ends new Claude turn; unit: earlier empty/failed/uncorrelated results retain real assistant/tool reply; unit: own empty/error result returns before process exit without kill; unit: stream input preserves prompt/options and permission relay; input/EOF failures; integration: file/pipe live and midstream correlated reattach checkpoint handling | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Preserve legacy replay state and validate provider compatibility | M | — | `t1`, `t2` | integration: legacy failed result survives two reloads without repeated visible content; integration: legacy multiple-result EOF, abort, retention, stop and PID reuse; integration: Codex item versus turn completion and existing queue/panel/lifecycle/UTF8 suites; smoke: plugin noEmit TypeScript and full plugin test suite with baseline accounting; live: serial bounded installed-Claude new/resumed adapter smoke and Codex protocol verification | [[c1]] [[c2]] [[c3]] |

### 1.1 TASK-83c85f38afad7843-s1-t1 — Add bounded replay of retained turn prefixes

Extend SessionOutput.tail with additive fromTurnStart/beforeOffset options using the matching turn marker in the recorded generation. Read only complete lines before the saved offset, without polling or crossing segment boundaries; retain default tail behavior. Add temporary-file regressions for multiple turns, rollover, byte boundaries, abort and SegmentGone.

**Acceptance checks:**
- Prefix scan starts at the requested turn marker, stops before saved offset and never yields other turns or incomplete boundary lines.
- Prefix scan does not wait for live writer; abort and missing/rolled segment behavior remain explicit.
- Existing SessionOutput default-tail tests pass; cursor/marker schemas unchanged.

### 1.2 TASK-83c85f38afad7843-s1-t2 — Correlate Claude requests and native completion

Generate claude-request-UUID turn identity and stream-json user input over existing writable stdin; preserve launch options and permission control input. Classify new-turn Claude result completion by exact singular/list UUID correlation for live and resume, never by result order or heuristics. Preserve own result failures/empty completion and process-scoped lease/stop behavior, checkpoint handled terminal lines, and report missing trustworthy completion or input errors without duplicate retry. Adapt existing fixtures to dynamic request IDs and add failing-before/passing-after queued-result regressions.

**Acceptance checks:**
- Multiple earlier results including zero queued count and prior failures cannot truncate real assistant/tool/final reply in live pipe/file and correlated resume.
- Own singular or merged-list result, including empty/failed/zero-turn result, completes once while process remains alive without killing it.
- Prompt JSON preserves leading dashes, Unicode/newlines and resume/permission/read-dir/allowed-tool options; stdin decision relay remains usable.
- Missing/throwing stdin, malformed/missing correlation and clean/nonzero exit produce clear failures rather than false success or duplicated submissions.
- Identity survives midstream reload; ignored/terminal cursor progress is correct.
- Dynamic UUID fixture marks only designated own results, leaving earlier/malformed/uncorrelated results intact; original adapter demonstrably fails the premature-result regression.

### 1.3 TASK-83c85f38afad7843-s1-t3 — Preserve legacy replay state and validate provider compatibility

Use bounded prefix reconstruction on every legacy Claude attachment to recover the latest native result without replaying visible content. Follow remaining output through actual segment/process end and preserve the last native failure. Complete regressions for repeated reload, queue/panel/lifecycle/UTF8/stop behavior and independent Codex completion; record serial installed-Claude new/resumed smoke plus Codex protocol evidence, plugin tests and type checks. Maintain relevant design/evidence if implementation details change.

**Acceptance checks:**
- Two legacy reloads after a checkpointed failed result preserve its native failure text at EOF without duplicate assistant/tool output.
- Legacy multiple results retain later reply and last result outcome; missing prefix surfaces retention limit and never invents success.
- Existing cancellation, abort, PID reuse, permission relay, queue and lifecycle behavior remain covered.
- Codex item completion remains nonterminal and native turn completion remains immediate; documented protocol inspection/smoke evidence supports provider-specific handling.
- Affected chat and full plugin suites plus plugin TypeScript checks are recorded with any baseline failures separated; serial installed-Claude new/resumed adapter smoke confirms native correlation.
- Native checks use bounded timeouts and cleanup, run providers serially, and report unavailable auth/protocol evidence honestly; unrelated baseline failures are recorded without unrelated edits.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Claude args, exact UUID user envelope and prompt escaping; resume/permission modes/readDirs/allowedTools unchanged. | `t2` |
| Multiple prior results (including queue_count=0, zero-turn, placeholder, error), interleaved assistant/tools and delayed own result. | `t2` |
| Singular/list correlation, malformed/missing metadata, own empty/error, duplicate terminals, missing result at clean/nonzero EOF. | `t2` |
| Writable stdin absent/throws; no duplicate retry or orphan; control decision relay still writable. | `t2` |
| Live file-backed output and pipe fallback preserve full user reply. | `t1`, `t2`, `t3` |
| Resume from before early result and from after acknowledgement/assistant with UUID turnId; exactly one own terminal. | `t1`, `t2`, `t3` |
| Terminal and ignored-result cursor checkpoints; legacy identity reads all results to real segment end and preserves last failure. | `t1`, `t2`, `t3` |
| Abort/stop/PID reuse/SegmentGone/lease behavior plus queue-runner, turn-lifecycle and panel terminal consumption. | `t1`, `t2`, `t3` |
| Two legacy reloads: checkpoint a failed result, detach before exit, attach again after its offset, then end process; native failure text must survive. Prefix scan must not duplicate visible assistant/tool content. Cover multiple turns in one generation, rolled generation, saved offset boundary and abort. | `t1`, `t2`, `t3` |
| Codex item.completed is nonterminal; turn.completed is terminal even if process remains alive; other current native result/failure fixtures remain valid. | `t3` |
| npx tsc -p vscode-plugin/tsconfig.json --noEmit and affected chat test suites, then full plugin suite if affected tests pass. | `t3` |
| Existing ACK-only probe already confirms UUID echo/result membership. | `t3` |
| After implementation opt-in Claude new/resumed turn smoke through actual adapter, with tools/MCP disabled and time-bounded process cleanup. | `t3` |
| Inspect Codex installed help/protocol fixture or serial no-tool smoke for exec one-prompt completion; do not infer Claude queue bug applies to Codex. | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/S001/LLD.md`
- **[[c2]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts`
- **[[c3]]** `doc` `docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/S001/claude-correlation-probe.json`
