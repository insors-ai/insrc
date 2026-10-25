<!-- insrc:artifact LLD-83c85f38afad7843-s1 -->

# LLD: STORY-83c85f38afad7843-s1

## Summary

**Epic:** `keep-chat-turn-s-reply-when`
**HLD base run:** `wf-1792946090099-c25hob`
**HLD effective hash:** `0e559c7e6f25...`

Keep the user’s actual reply visible when Claude first finishes older queued work. Newly submitted turns carry a request UUID, and both live and reattached readers finish only on the result naming that UUID. Existing recordings without request identity remain readable through process exit, with an explicit legacy limitation.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `makeStreamAdapter`

```typescript
function makeStreamAdapter(mapper: ProviderMapper, deps: AdapterDeps): StreamAdapter
```

**Parameters:**
- `mapper: ProviderMapper` — Own provider input framing, completion classification and permission responses.
- `deps: AdapterDeps` — Existing process/output seams.

**Returns:** `StreamAdapter` — Existing run/resume/cancel/decide surface; no public signature change.

**Errors:**
- `TurnEvent(error)` when Spawn/input unavailable, process failure or stream missing a trustworthy own result.

**Preconditions:**
- Claude structured input requires writable stdin and a UUID-tagged user envelope; permission control responses share that stream.
- Session output remains owned by the existing lease/process lifecycle.

**Postconditions:**
- Exactly one terminal event per reader, only after own matching result or actual EOF/error.
- Assistant/tool events after earlier queued results remain visible.
- Returning on own result neither kills process nor releases its lease prematurely.
- Codex keeps its independent native completion rule pending protocol verification; no Claude fields are assumed for Codex.

## 3. Data model changes

### 3.1 `TurnCursor / host turnId` — invariant-change

For newly submitted Claude turns mint cryptographically random UUID and form a version-discriminated host turnId claude-request-<UUID>. The adapter alone creates/parses this exact prefix and canonical UUID. TurnCursor.turnId already persists it through segment markers, process handles, progress and reload; no cursor fields or file format change. One host turn owns one native request UUID; one UUID relates to many native frames and exactly one accepted terminal. Old claude-date-seq and arbitrary old turnIds are legacy, never interpreted as native UUIDs. Codex identity remains unchanged.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/session-output.ts`

### 3.2 `ProviderMapper / TurnState` — field-add

Private provider input framing takes the generated request UUID and emits one stream-json user envelope via existing SpawnedProcess.write after spawn readiness, before reading output/onSpawn consumer activity. Claude args enable input-format stream-json and replay-user-messages, retain output/verbose/resume/permission/read-dir/allowed-tool semantics, and remove positional prompt. Envelope has type=user, uuid, session_id='', parent_tool_use_id=null, message.role=user, message.content=unchanged prompt. stdin stays open for permission decisions. State derives expected UUID directly from turnId for both run and resume, independent of prior output offsets.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts`

### 3.3 `Claude completion classification` — invariant-change

Inspect a result's user_message_uuid and validated string-array user_message_uuids; accept if either names expected UUID. A result explicitly naming other requests is nonterminal, even if is_error or queue count is zero. Uncorrelated results on new UUID turns are nonterminal; retain diagnostic state and fail clearly at EOF if no own result is ever observed. Do not derive completion from queue count, num_turns, empty result text, result_index, wall-clock delay or first assistant frame. Preserve native result failure message on matching own result, including legitimate empty/zero-turn replies. Existing assistant/tool mapping remains in order. Generic uncorrelated provider error/spawn/auth events remain fatal; scoped result failures for other requests do not end this turn.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts`

### 3.4 `Legacy Claude replay and EOF outcome` — invariant-change

Legacy cursor identities cannot prove which result belongs to user: keep forwarding content and retain the latest result outcome, but defer terminal until segment/process ends. At EOF emit last outcome only if a result exists, otherwise existing failure behavior. New correlated turns missing matching result emit explicit failure after exit rather than synthesize success. Cancellation, abort, SegmentGone, PID reuse checks and session lease ownership retain existing semantics. Persist progress after every handled line including ignored results; ensure accepted terminal line cursor is checkpointed before yielding terminal so reload cannot replay it. Before following a saved legacy cursor, reconstruct the latest native result outcome from complete lines in the SAME retained turn segment preceding that saved byte offset, without re-emitting content or advancing progress. Extend SessionOutput.tail options additively with fromTurnStart and beforeOffset for this bounded read: anchor using the existing turn-start lookup in the recorded generation, never offset zero, never a different turn; stop at the saved offset, segment boundary or abort without waiting for new bytes. Normal tail defaults remain unchanged. Reconstruct on EVERY legacy attachment, including repeated reloads after the last result. If the needed prefix has rolled away, report SegmentGone rather than inventing success. No new cursor fields are required.

**Call sites:**
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/session-output.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **CLI cannot accept correlated input** (recoverable)
  - Detection: Missing/throwing write seam, native unknown-option/input error, or EOF without matching result.
  - Response: Emit actionable error; stop a newly spawned process on input setup failure so no orphan waits for input. Preserve already mapped reply text. Do not silently fall back to first-result completion. Unsupported CLI must be updated; no positional retry that could duplicate submitted work.
  - User impact: Visible failure rather than false successful empty turn.
- **Own native result fails** (recoverable)
  - Detection: Result correlation contains expected UUID and is_error is true.
  - Response: Emit failed done once with native result message; stop reader, keep process lifecycle handling unchanged.
  - User impact: User sees own failure; earlier queued failure cannot hide later reply.
- **Nonzero exit/auth/signal before own result** (recoverable)
  - Detection: Actual process exit status and existing stderr/auth detection; expected UUID was never completed.
  - Response: Preserve existing informative process/auth error, or report missing correlated completion if exit was otherwise clean; never synthesize successful done.
  - User impact: Incomplete response remains visible with clear failure.
- **Reattached segment gone or follow aborted** (recoverable)
  - Detection: Existing SegmentGone or abort signal.
  - Response: Preserve existing behavior: warning/stop following, no process kill or invented success.
  - User impact: Existing retention/reattach limits remain.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Earlier notification or placeholder produces empty result with queue count zero, then user assistant/tool/reply frames. | Earlier result never ends new turn; all subsequent content reaches consumer until own UUID result. |
| Own UUID appears only in user_message_uuids merged list, or only singular; own result empty or zero-turn. | Both field forms accepted; empty/zero-turn own result completes normally without waiting for process exit. |
| Reload saved cursor lies after acknowledgement and first assistant. | Identity reconstructed from cursor.turnId, not earlier native lines; matching result completes and progress includes consumed terminal. |
| Malformed correlation, unrelated errors/results, duplicate matching result and extra lines. | Malformed/nonmatching result does not end new turn; first matching result yields one terminal, later lines drained; generic provider fatal errors retain existing handling. |
| Legacy cursor follows an alive process with multiple results. | Forward all content and defer completion through actual segment/process end; no guessed early done. Last native result outcome preserved, including failure. |
| Leading-dash, newline/Unicode prompt, permission decision and resume handle. | Exact prompt transmitted as JSON content, options retain semantics, control replies can still use stdin and resume flag is unchanged. |
| Codex emits item completions then turn.completed while process remains alive. | Item output is preserved and own native turn completion remains prompt; do not apply Claude UUID requirements. |

**Invariants to preserve**

- Own completion returns while CLI remains alive; cancellation/PID identity, permission routing and lease ownership remain process-scoped. [[c1]]
- Existing UTF8, live/reattached adapter consumer behavior and saved cursor semantics remain covered by adapter/lifecycle tests. [[c2]]

## 6. Test strategy

**Test framework:** `Existing node:test and node:assert/strict executed with tsx; fake spawner, real temporary session-output files and existing tick/waitFor seams. Baseline adapter suite 88/88 passed; new regression must fail against original behavior before fix.`

**Test levels**

- **unit** — Prevent premature terminal and verify provider wire boundary.
  - Subjects: `Claude args, exact UUID user envelope and prompt escaping; resume/permission modes/readDirs/allowedTools unchanged.`, `Multiple prior results (including queue_count=0, zero-turn, placeholder, error), interleaved assistant/tools and delayed own result.`, `Singular/list correlation, malformed/missing metadata, own empty/error, duplicate terminals, missing result at clean/nonzero EOF.`, `Writable stdin absent/throws; no duplicate retry or orphan; control decision relay still writable.`
  - Fixtures: `Sanitized retained early-result shape; dynamic request UUID taken from fake stdin, never hard-coded host-generated IDs.`, `Fake process remaining alive after own result; assert reader settles before exit and no kill signal.`
- **integration** — Prove identity survives durable output and consumer reload.
  - Subjects: `Live file-backed output and pipe fallback preserve full user reply.`, `Resume from before early result and from after acknowledgement/assistant with UUID turnId; exactly one own terminal.`, `Terminal and ignored-result cursor checkpoints; legacy identity reads all results to real segment end and preserves last failure.`, `Abort/stop/PID reuse/SegmentGone/lease behavior plus queue-runner, turn-lifecycle and panel terminal consumption.`, `Two legacy reloads: checkpoint a failed result, detach before exit, attach again after its offset, then end process; native failure text must survive. Prefix scan must not duplicate visible assistant/tool content. Cover multiple turns in one generation, rolled generation, saved offset boundary and abort.`
  - Fixtures: `Existing createSessionOutput temp dirs and fake-spawner/liveness seams.`
- **contract** — Protect independent Codex semantics and strict TypeScript compatibility.
  - Subjects: `Codex item.completed is nonterminal; turn.completed is terminal even if process remains alive; other current native result/failure fixtures remain valid.`, `npx tsc -p vscode-plugin/tsconfig.json --noEmit and affected chat test suites, then full plugin suite if affected tests pass.`
- **live** — Confirm actual installed CLI accepts framed request and permission-compatible input; never run providers concurrently.
  - Subjects: `Existing ACK-only probe already confirms UUID echo/result membership.`, `After implementation opt-in Claude new/resumed turn smoke through actual adapter, with tools/MCP disabled and time-bounded process cleanup.`, `Inspect Codex installed help/protocol fixture or serial no-tool smoke for exec one-prompt completion; do not infer Claude queue bug applies to Codex.`
  - Fixtures: `No direct cloud REST or SDK dependency; use installed OAuth CLI.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Multiple earlier results cannot hide assistant/tool/final user reply in live pipe/file modes.` |
| `ac2` | `Own result settles reader before hangUntilKilled process exits; zero-turn and failed own results included.` |
| `ac3` | `Persisted UUID turnId reattach at midstream cursor, legacy EOF handling, terminal checkpoint and existing stop/lease tests.` |
| `ac4` | `Independent Codex item/turn terminal regressions; CLI protocol evidence recorded.` |

## 7. Migration

**State before:** c1: Claude positional prompt and first-result terminal handling in live and resumed readers; c3: retained early zero-queue result precedes real reply. c2: existing background completion and cursor tests pass but omit this scenario.

**State after:** New Claude turns use UUID-tagged stream input and persisted turnId correlation; only matching result completes promptly. Legacy cursor turns preserve output through exit. Codex retains verified provider-specific semantics.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Record sanitized reproduction/protocol evidence, add failing new-turn and replay regressions, then update private adapter framing/completion and fixture generation together. Keep output/cursor schema unchanged. — ↩ rollbackable
2. Validate affected/full plugin tests, TypeScript and serial installed CLI smoke. Review code independently and record BUILD/TESTS evidence before asking for completion approval. — ↩ rollbackable
3. After normal extension build/install, newly started turns use UUID identity. Existing running processes retain their original launch; reload readers recognize legacy turn IDs and wait for actual end. Do not restart daemon or deploy extension as part of source-only fix. — ↩ rollbackable

**Backward compat:** Public adapter signatures, SegmentCursor fields and marker format remain unchanged. turnId is an opaque string to consumers; new prefix carries request identity. Old turns remain readable, but safe early completion cannot be guaranteed without UUID: they wait for process/segment end, and can still be stopped using existing controls. Old CLI versions rejecting structured input or omitting correlation fail visibly rather than retrying a prompt or reporting false success. Rolling back restores old first-result behavior and its known loss risk; retained transcripts are not rewritten. SessionOutput.tail gains optional bounded prefix-read options; default callers are unchanged. Legacy attachments reconstruct result state from the matching retained segment before the checkpoint, so repeated reloads preserve the last result failure.

## 8. Alternatives considered

### 8.1 a1: Request-correlated Claude stream input — **CHOSEN**

Stamp each new native request and complete only its result; retain existing adapter and cursor seams.

Use Claude stream-json input with a host UUID and provider-local correlation. Encode the UUID in the existing host turnId so SegmentCursor persists identity without a storage format change. Match singular/list result correlation for new turns in live and resume. Older recorded turns without this identity consume through actual exit, retaining all output rather than guessing an early terminal. Codex retains its provider-specific completion unless protocol evidence establishes the same ambiguity.

### 8.2 a2: Complete every stream only on process exit

Treat all provider result frames as intermediate and close on process exit.

Keep positional prompt input and existing cursor shape. Forward assistant/tool frames and retain the last native result until stdout closes and the process exits. Apply the same rule to live and replay paths without correlation metadata.

**Rejected because:** Always waiting for exit reproduces hung completion for background processes.

### 8.3 a3: Persist a separate native request UUID in cursor metadata

Use request correlation with an additive cursor and output-marker identity field.

Send the same UUID-stamped stream input as a1, but persist a dedicated requestUuid in SegmentCursor and turn markers and carry it through all cursor producers/consumers. Retain legacy EOF behavior for cursors without identity.

**Rejected because:** Equivalent correctness with unnecessary cursor/marker migration.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:881-1160`
- **[[c2]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts`
- **[[c3]]** `doc` `docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/S001/claude-correlation-probe.json`
- **[[c4]]** `doc` `https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/CHANGELOG.md`
- **[[c5]]** `prior-artifact` `.insrc/artifacts/ISSUE-83c85f38afad7843.json`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 5 hold** · template `design-issue` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-25T16:52:16.286Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| preserved-behaviour | The linked sequence companion renders consistently with the proposed interaction. | Inspected the generated HTML and embedded Mermaid source. It describes UUID input, ignoring an earlier result, forwarding content, checkpointing the own terminal and leaving the process alive. The prose separately documents request/frame ownership and legacy compatibility adequately. No rendered browser inspection was performed, so layout and successful Mermaid rendering are unverified. [files: docs/standalone/keep-chat-turn-s-reply-when-E2026101383c85f38/S001/sequence-diagram.html] | Render the supplied companion and inspect it before claiming visual verification; correct or regenerate it if rendering fails. |
