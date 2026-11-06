# Second sync: VS Code chat overlap (conflict items 1 to 5), detailed analysis

Read-only analysis on 2026-11-06 from the diffs `a19eaa8e5..v2` and `a19eaa8e5..origin/main` for `vscode-plugin/src/chat/` and the dry-run tree `25827ced`. Nothing was built or run; every claim below is from reading code, and the ones that need a live check are marked **verify live**.

Scope: `cli-adapter.ts` (7 hunks), `session-output.ts` (2), and the three test files that follow them. Main's concurrent-chats work (epic E202611031bd72813, S001) is the base the merged code must keep working: several chats active at once, any provider, a turn that keeps running when its chat is detached, and a background observer that finishes it.

## 1. What each side built, and why

### main: owned, resumable turns (concurrent chats)

| Piece | Where | What it guarantees |
|---|---|---|
| Detach and observe | `chat-panel.ts` `observeDetached` (about 640-900), `turn-lifecycle.ts` `detachThis` | A chat that is switched away from keeps its CLI running (`ownerHostPid = 0`); any window's observer reads the session file with `adapter.resume(..., { drain: true })` and completes the turn. |
| Observer checkpoint | `session-store.ts` `observerCheckpoint` (turnId, generation, offset, selectionSeq, selectionBuffer, sessionId, toolCommands, editPaths, `sawTerminal`) | A pass ends at a time budget and the next pass continues with the same decoder state. A terminal seen in a pass that is not caught up is rewound once (`rewind`), so completion is only recorded after the checkpoint is saved. |
| Decoder state in the adapter | `resume()` restores `decoderState`; `run()` and `resume()` report `onDecoderState` (before `onProgress`, so offset never runs ahead of decoder) | A resume never reuses a selection id or loses a split marker. |
| EOF rule | `resume()` end: EOF without a terminal is an observation failure unless a recorded pid is verified dead; `finished = pid !== undefined && !isTheProcess()`; `drain` reads past the terminal | No synthetic completion from an unverifiable process. |
| Generation pinning | `session-output.ts` `registerCursor`, `unregisterCursor`, `recoverTurn`, `oldestRetainedGeneration`, pin markers, per-session lock file, archived `.pinned.<gen>` files; `tail` awaits `pinIo`, re-resolves the file on every read, verifies the generation of what it read, ignores `ENOENT` mid-rename | A reader in any window keeps its generation readable across rollover; a replay from the turn start is always possible (`recoverTurn`) and lossless (requests dedupe by id). |
| Delivery contract | `write(data, onError): boolean`, `decide(): { delivered }`, `registerPending`, `onDeliveryFailed`, `stopTurnVerified`, `shouldSpawn` | A decision is consumed only after an accepted write; an async write failure re-registers it and notifies the panel (outcome becomes delivery-failed, a follow-up run answers it). |
| Other | `resolveOllamaTarget` (Claude on an Ollama host), Vibe `--prompt=` binding | Independent of the above. |

Claude is still started as `claude -p ... -- <prompt>` on main: the prompt is in argv, stdin is only used for decision replies, and the CLI exits by itself after its answer.

### v2: correlated Claude turns (epic 6fab702a, s1)

| Piece | Where | What it fixes |
|---|---|---|
| Structured input | `buildArgs` ends with `--`; `formatInput` writes one `{type:'user', uuid, message}` line to stdin; flags `--input-format=stream-json --replay-user-messages` | A leading-dash prompt cannot be read as an option, and every request has a UUID. |
| Result correlation | turn id is `claude-request-<uuid>`; `mapLine` for `result` accepts only `user_message_uuid` (or an entry of `user_message_uuids`) equal to the request | A queued or background result no longer ends the turn early and truncates the reply. |
| `endInput()` | called inside `run()` when the correlated terminal arrives | Stream-json input keeps the CLI waiting after its result; closing stdin lets it exit and frees the session's chat lock (commit `31ebd07c2`). It exists *because of* the structured input. |
| Legacy turn ids | a turn id without a request UUID defers the `result` to the end of the segment (`state.result`) | An in-flight turn started before the change still ends correctly. |
| Prefix replay | `resume()` for Claude reads the turn from its start up to the saved offset (`tail` options `fromTurnStart`, `beforeOffset`, abort checks) to rebuild `state.result` and the session id; `run()` calls `onProgress` for the terminal *before* yielding it | A cursor saved after the terminal line no longer loses the result across one or two reloads. |
| Write as acknowledgement | `write()` returns a promise; the initial input is awaited before `onSpawn`; a failure stops the process with a visible error | The first message is never silently lost. |
| UTF-8 | `onUtf8Data`, `setEncoding('utf8')` in `nodeSpawner` | Multi-byte characters split across reads. (Independent, merges cleanly except for the spawner hunk.) |

## 2. Which pieces overlap, and how

| # | Seam | main | v2 | Compatible? |
|---|---|---|---|---|
| a | `SpawnedProcess.write` | sync `boolean`, `onError` callback, never throws | `void | Promise<void>`, awaited, rejects | Not as written. v2 needs an acknowledgement for the first input; main's `decide` needs the boolean and the re-register path. |
| b | process stdin lifetime | open for decisions, CLI exits itself | open for input *and* decisions, closed by `endInput` at the result | Yes for a live `run()`; **no for a detached turn** (see risk R1). |
| c | turn id | opaque `claude-<ts>-<n>`; stored in `liveTurn`, `observerCheckpoint`, `pendingRequests` | `claude-request-<uuid>`, and `resume()` parses the UUID out of it | Yes if every consumer treats the id as opaque (main's panel code does: it only compares ids). |
| d | `result` line | maps to `done` immediately | maps to `done` only if correlated; suppressed for legacy ids | Conflicts for main's resume/drain tests that use legacy-style ids (R3). |
| e | restoring state on resume | persisted `decoderState` plus `sawTerminal` in the observer checkpoint; whole-turn replay via `recoverTurn` when no valid checkpoint | rebuild by reading the prefix of the segment each time | Two answers to the same question (R2). Keeping both runs the prefix read on every observer pass. |
| f | checkpoint around the terminal | cursor stays before the terminal until the pass is caught up; one rewind | cursor is moved past the terminal *before* the terminal is yielded | Incompatible: main's resume from a cursor past the terminal ends in an observation failure (`sawTerminal` exists only in the observer checkpoint, not in `liveTurn`). |
| g | `tail` | pin, re-resolve, generation check | `fromTurnStart`, `beforeOffset`, abort | Compatible as a union, but only needed if prefix replay stays (e). |
| h | EOF at the end of `resume()` | observation failure unless the pid is verified dead | `done` from `state.result` for a legacy id, else error | Merge: keep main's rule, add v2's `done` only for the legacy result seen in the same pass. |

## 3. Risks in the concurrent-chat setting

- **R1 (high): a detached Claude turn would never close its stdin.** v2 calls `endInput()` only inside the live `run()` loop when it reads the terminal. Main's detach (`finishIterator`, `ownerHostPid = 0`) abandons the iterator; `run()`'s `finally` only kills a *pipe* turn (`!terminal && output === undefined`), a session-file turn is left to run. With structured input the CLI then waits for more input after its result: the observer completes the chat on the terminal (`caughtUp && sawTerminal`), but the process stays alive and holds the session's chat lock, so the next message in that chat is blocked or kills it. This is exactly the scenario concurrent chats make common (switch to another chat while a turn runs). The merge must close the input on abandonment (in `run()`'s `finally` for a correlated turn, and in the observer path once it sees the correlated terminal and the pid is alive), and the behaviour of the CLI on EOF mid-turn (finish and exit, or abort?) is **verify live**.
- **R2 (medium): two state-recovery mechanisms.** Prefix replay is O(turn length) per resume and the observer resumes in budgeted passes (2 s), so a long turn would be re-read from its start on every pass. Main's decoder state, `sawTerminal` and `recoverTurn` already cover what the replay was added for, provided the cursor is never moved past the terminal (f).
- **R3 (medium): legacy deferral breaks main's drain.** For an id without a UUID, v2's mapper never emits the terminal, so `sawTerminal` stays false and a drained pass ends in an observation failure. After the merge only turns started before the upgrade (and main's new tests that use `claude-1-0` style ids) are legacy.
- **R4 (medium): initial input and Stop/detach.** v2 awaits the initial write before `onSpawn`; during that await the lifecycle has no `TurnProcess` to stop. The window is short but real with `shouldSpawn` and `stopTurnVerified` in the picture. The write itself should use main's `write(..., onError)`; the first input needs an acknowledgement or an `onError` path that fails the turn once.
- **R5 (low): per-chat state is isolated.** Request UUIDs are per turn; `live` and `pendingByTurn` are keyed by turn id; each CLI has its own stdin. v2 adds no shared mutable state, so concurrent chats on one provider do not interact through it.
- **R6 (low): other providers.** `formatInput` and `endInput` apply to Claude only. Codex and Vibe keep `closeInput` and argv prompts; the only shared change is the `write` type, which v2 uses for Claude input and for decisions.
- **R7 (verify live): Claude on an Ollama host** (`ollamaClaudeEnv`, main). The CLI flags are backend-independent, but `user_message_uuid` correlation has only been exercised against Anthropic's backend.
- **R8 (low): minimum CLI version.** Correlation needs a CLI that echoes `user_message_uuid`; v2 reports "update the CLI" only when the process exits without a result. A CLI that ignores the flags would sit idle. Pre-existing on v2.

## 4. Proposed merge design

Keep v2's correlation protocol and main's recovery model; drop v2's second recovery mechanism.

| Item | Decision | Why |
|---|---|---|
| Structured input, request-UUID turn id, correlated `result` | Keep (v2) | Fixes a real Claude defect; independent of concurrency. |
| `write` seam | main's `boolean` plus `onError`; initial input sent with it; a `false` return or an `onError` before the first event fails the turn with the visible error v2 had | One contract for decisions and input. |
| `endInput` | Keep, and call it also from `run()`'s `finally` when a correlated turn is abandoned, and from the observer path (new `resume` option or handle) after a correlated terminal with a live pid | Closes R1. |
| Prefix replay (`fromTurnStart`, `beforeOffset`, the abort checks in `tail`) | Drop | Covered by main's decoder state, `sawTerminal` and `recoverTurn` (R2). The `session-output.ts` conflict then resolves to main's `tail` unchanged. |
| `onProgress` before the terminal yield | Drop | Incompatible with main's rewind (f). |
| Legacy-id deferral | Keep only as: legacy ids emit the terminal immediately (main's behaviour) | Avoids R3; the in-flight-at-upgrade window is the only loser, and the observer finishes such a turn on verified death anyway. **Needs your call** if you want the deferral kept. |
| `resume()` end (hunk 6) | main's rule | See (h). |
| `decide` (hunk 3) | main's | Delivery-failed contract. |
| UTF-8 changes | Keep (v2) | Independent. |

Resulting test work (the merge does not run them; the sweep does):
- v2's `cli-adapter-correlation.test.ts` (12 tests): adapt to the boolean `write`; remove or rewrite the five that pin prefix replay and the legacy replay ("correlated resume reconstructs identity...", "legacy failed result survives two reloads...", "checkpointed own terminal is recovered on reattach...", "legacy replay waits through multiple results...", and the checkpoint-before-terminal expectation).
- `session-output.test.ts`: v2's two bounded-prefix tests go; main's pin tests stay.
- main's new `cli-adapter.test.ts` cases that start a Claude turn through `run()` need the stdin input and the `--` argv; those that use `resume()` with legacy ids need UUID ids.
- New tests: endInput on abandonment (R1), observer ends input after a correlated terminal, initial write failure through `onError`, two concurrent Claude turns in one adapter (distinct UUIDs, results not crossed).
- Live checks (INSRC_LIVE_TESTS or by hand): R1 EOF behaviour, R7 Ollama host, two Claude chats at once with one detached.

## 5. Decisions needed

1. Drop v2's prefix replay and pre-terminal checkpoint in favour of main's recovery model (recommended)? The alternative keeps both and costs a prefix read on every observer pass.
2. Legacy turn ids: terminal emitted immediately (recommended) or v2's deferral to the end of the segment?
3. R1 fix scope: end the input in `run()`'s `finally` only, or also from the observer path. The second is needed for a turn detached by a *previous* host window, where this host has no stdin handle; there the only lever is stopping the idle process after the verified terminal. Which do you want?
