<!-- insrc:artifact TESTS-1bd72813bfa795f4-S001 -->

# Tests: 1bd72813bfa795f4 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 156 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T20:12:03.037Z on commit `afdedb5b3`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: session-store status/pendingRequests persistence + old-row compat (vscode-plugin/src/chat/session-store.ts, session-file-store.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t1: setStatus persists status+lastActivityAt; old rows without them load unchanged (back-compat) | `vscode-plugin/src/chat/__tests__/session-store.test.ts` |
| pass | E202611031bd72813:S001 t1: file store setStatus persists status+lastActivityAt into the head; pendingRequests survive a fresh-store reload; stale save does not regress them | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 22 | 0.9 s |  |
| `vscode-plugin/src/chat/__tests__/session-store.test.ts` | 0 | 28 | 0.7 s |  |

## t2

Run at 2026-11-03T21:53:17.138Z on commit `c15bb8b5c`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: status precedence + failure/observation-failure transitions (turn-lifecycle.ts, stream-events.ts, cli-adapter.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t2: an output-read failure ends the follow as observation-failed and keeps the cursor | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | E202611031bd72813:S001 t2: resume() marks an output-read failure as observationFailure, not a real terminal | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | E202611031bd72813:S001 t2: turn start -> working; terminal with no pending requests -> done | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t2: mid-turn approval-request -> waiting-input; terminal with pending card stays waiting-input; decision -> done | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t2: an error terminal is a failure exit -> done | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t2: two pending requests keep waiting-input until BOTH are decided; selection-request also waits | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t2: resolving the last request while the turn is still unfinished (liveTurn kept, e.g. after observation failure) does NOT mark done | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t2: Stop (cancel-turn) is a failure exit -> done | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t2: an adapter failure (onError, not onTerminal) is a failure exit -> done | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t2: an unanswered card timing out re-evaluates the chat status (completed turn goes done, no stale waiting-input) | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 175 | 5.8 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 12 | 1.1 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 94 | 1.5 s |  |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 33 | 2 s |  |

## t3

Run at 2026-11-03T22:10:30.413Z on commit `299eea20d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: activeChats filter + purge fake clock + capped-store eviction regression (session-store.ts, session-file-store.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t3: activeChats lists working/waiting always, done only within the 30-min purge window; purge is a pure read | `vscode-plugin/src/chat/__tests__/session-store.test.ts` |
| pass | E202611031bd72813:S001 t3: capped store never evicts an active/waiting session or one with unresolved requests | `vscode-plugin/src/chat/__tests__/session-store.test.ts` |
| pass | E202611031bd72813:S001 t3: file store activeChats applies the 30-min purge and skips old heads; evictBeyondCap never evicts active/unresolved sessions | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |
| pass | E202611031bd72813:S001 t3: active-list is posted on open and on every status change; the timer recomputes it (purge) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 176 | 5.8 s |  |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 23 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/session-store.test.ts` | 0 | 30 | 0.4 s |  |

## t4

Run at 2026-11-03T22:26:01.370Z on commit `375209e20`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: active-list/ActiveChatEntry + open-doc/docs-content protocol shapes (protocol.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4: active-list is a host->webview kind and ActiveChatEntry carries id/title/status/lastActivityAt; open-chat stays the only open message | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**integration: webview dropdown render + open (chat-panel.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t4: #insrc-active chip sits LEFT of the .right history chip; active-list populates dot-coded entries; selecting posts open-chat { chatId } | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |
| pass | E202611031bd72813:S001 t4: selecting an active-chat entry (open-chat { chatId }) opens that chat exactly like the history dropdown | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 177 | 5.8 s |  |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 13 | 0.6 s |  |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 14 | 0.5 s |  |

## t5

Run at 2026-11-05T08:10:31.186Z on commit `dfee30261`. Tests check: **passed**. 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: observer own-cursor + retention + SegmentGone + decoder checkpoints (session-output.ts, cli-adapter.ts, turn-lifecycle.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t5: a registered cursor pins its generation across rollover (archived, not discarded); unregister drops it; oldestRetainedGeneration reflects it | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | E202611031bd72813:S001 t5: a pinned generation replays its payload losslessly after rollover, and recoverTurn re-anchors a lost turn into it | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | E202611031bd72813:S001 t5: an in-progress pinned reader follows a rollover rename (re-resolves its generation every read) and never switches generations mid-read | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | E202611031bd72813:S001 t5: a registered cursor writes a durable pin marker, so a RECREATED WRITER also archives the pinned generation instead of discarding it | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | E202611031bd72813:S001 t5: pins are refcounted PER READER — one unregister keeps another reader's archive alive | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | E202611031bd72813:S001 t5: pinned archives are discovered from disk by a RECREATED store (lossless recovery across reloads) | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | E202611031bd72813:S001 t5: resume() on a segment that rolled away (SegmentGone) reports an observationFailure, not a terminal, and the turn stays recoverable | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | E202611031bd72813:S001 t5: starting a new turn clears the observer checkpoint (it is turn-scoped) | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | E202611031bd72813:S001 t5: detach orphans the saved turn (ownerHostPid 0) so the background observer reconciles it | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | E202611031bd72813:S001 t2: an output-read failure ends the follow as observation-failed and keeps the cursor | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | E202611031bd72813:S001 t5: the observer reconciles a detached chat with a dead owner — ingests requests (waiting-input), then terminal -> done, clears cursor, persists checkpoint | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: the observer resumes from the PERSISTED checkpoint across passes — a split marker consumed up to the checkpoint offset resolves via the restored decoder buffer+seq (request id sel-<turn>-5) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: the observer recovers a segment lost through a REAL rollover (stale cursor at a discarded generation -> SegmentGone -> oldestRetainedGeneration/recoverTurn replay from the archived generation -> done) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: the observer reconciles an ORPHANED turn (ownerHostPid 0, e.g. left by a detach in this window) — it is not skipped as this host's own | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: the observer budget watchdog ends a pass even when the followed process is idle (no events), and later ticks still run (no overlap) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: a checkpoint of ANOTHER turn is ignored — the observer re-anchors to the turn start, so a split marker at the liveTurn cursor still resolves (waiting-input, not a silent done) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: follow() restores the follow cursor's OWN decoder state into the resume and saves it back as it advances (reattach between marker fragments loses nothing) | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | E202611031bd72813:S001 t8: the observer dispatches a DETACHED chat's insrc_present to the presenter, deduped by declarationId across passes | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: a terminal seen in a budget-limited pass rewinds the checkpoint INCLUDING the decoder seq/buffer — a marker split ACROSS the terminal completes on the retry with a stable requestId | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: a fully drained segment whose process is VERIFIED DEAD completes via the death gate even without a terminal event (no synthetic observation failure blocks it) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: an unterminated trailing line after the terminal — flushed when the writer is DEAD (no turn-end marker, no endTurn call), held while it lives and ingested when completed | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t5: recoverTurn failure falls back to the liveTurn cursor PAIRED with the lifecycle decoder state — a mid-marker offset is not resumed with an empty decoder | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: fake session-output detached reconciliation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t5 integration: observer ingests a REAL session-output file — a split select marker resolves to one persisted request with prompt+options, then done -> waiting-input kept | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 220 | 9.7 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 97 | 1.5 s |  |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 14 | 1.5 s |  |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 36 | 1.9 s |  |

## t6

Run at 2026-11-05T08:08:39.478Z on commit `dfee30261`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: approval-queue snapshot/restore round-trip + delivery result correlation (approval-queue.ts, cli-adapter.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t6: snapshot/restore round-trips the full queue state (waiting order, batch decisions, ended turns, grants) | `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` |
| pass | E202611031bd72813:S001 t6: decide() reports delivery — {delivered:true} on a successful write (consumed once), {delivered:false} on a failed write WITHOUT consuming (a retry can still deliver); registerPending re-registers a restored request | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: detach/reattach + reload request restoration (chat-panel.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t6: switching chats persists the unresolved request; reopening restores it by its original requestId (card re-posted), and deciding it runs the follow-up and marks the persisted outcome | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t6: a RESTORED request whose stdin is dead (decide reports undelivered) is delivered as a follow-up run and marked approved — never a silent no-op | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` | 0 | 4 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 220 | 10.2 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 97 | 1.5 s |  |

## t7

Run at 2026-11-04T12:28:55.104Z on commit `4e2987f81`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: presentKey uniqueness + per-declaration dedup, old test updated (review-presenter.ts, extension.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t7: dedup is PER DECLARATION — the same document declared twice in one insrc_present opens once, but a second declaration opens again under a fresh presentKey; keys are host-wide unique | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` | 0 | 10 | 0.5 s |  |

## t8

Run at 2026-11-04T20:28:05.132Z on commit `76ff96770`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: panels map create/reveal/dispose + title (docs-review-panel.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t8: each presentKey opens its OWN editor panel (titled with the key); a repeat present reveals instead of replacing; dispose removes only its entry; the legacy single-panel path is unchanged | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**integration: double-present two panels; detached present one panel (docs-review-panel.ts, extension.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t8: the observer dispatches a DETACHED chat's insrc_present to the presenter, deduped by declarationId across passes | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 209 | 8.8 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 236 | 21 s |  |

## t9

Run at 2026-11-04T12:42:28.777Z on commit `853cee732`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: docs-review-comments composite key A->B->A (docs-review-comments.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | E202611031bd72813:S001 t9: drafts are keyed by the composite presentKey:artifactId — two panels showing the same artifact keep isolated drafts, and A->B->A within one panel restores A | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 234 | 14.5 s |  |

## t10

Run at 2026-11-05T08:20:08.129Z on commit `dfee30261`. Tests check: **passed**. 106 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: all unit subjects incl. protocol shapes unchanged (protocol.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval queue: requests are kept in arrival order and only the head is actionable; a decision for any other id is refused | `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` |
| pass | approval queue: a batch is complete only when its turn has ended and every request is decided | `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` |
| pass | claude: text turn maps to status + assistant-delta(s) + done(ok) | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | claude: tool_use maps to tool-call (with mcp parse) and file-edit with a hunk diff | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | governor: check passes the reconciled operations to showSections and calls nothing when nothing changed | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |
| pass | governor: checks run one at a time, a call made during a check causes exactly one more, and its promise resolves after that one | `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` |
| pass | the adapter spawns the CLI directly via node:child_process (k1) | `vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts` |
| pass | the exec path never reaches the daemon IPC (k1: extension-managed, bypasses daemon) | `vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts` |
| pass | markerFor maps every sc2 status phase to the right class + label | `vscode-plugin/src/chat/__tests__/markers.test.ts` |
| pass | markerFor(tool-call): bare ev.tool with no mcp, `${server} · ${name}` with mcp (ac2) | `vscode-plugin/src/chat/__tests__/markers.test.ts` |
| pass | mock round-trip: each mock's <style> equals renderTerminalStyle(terminalTheme) byte-for-byte | `vscode-plugin/src/chat/__tests__/mocks-contract.test.ts` |
| pass | mock files are up to date with the generator (regenerating produces no diff) | `vscode-plugin/src/chat/__tests__/mocks-contract.test.ts` |
| pass | every existing WebviewToHost message still constructs with its original shape (no drift, k2) | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |
| pass | S004 (ux polish): a selection-decision message typechecks with requestId + selected ids | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |
| pass | resolveWithin refuses .. escapes, absolute paths, missing files and a symlink that points outside the root | `vscode-plugin/src/chat/__tests__/resolve-within.test.ts` |
| pass | over a real temporary directory with two store instances on one session: each appends, then the first saves its held object twice more with a get between; the rows file holds every row of both, was never replaced, and a torn last line written by hand is dropped and cut back | `vscode-plugin/src/chat/__tests__/session-file-store.integration.test.ts` |
| pass | a session the migration kept in globalState keeps its output files through the start-up sweep | `vscode-plugin/src/chat/__tests__/session-file-store.integration.test.ts` |
| pass | a save of a session with new rows appends exactly those rows to the rows file and replaces the head; the bytes written do not grow with the rows already stored (1,000 stored rows, one new row) | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |
| pass | a save with no new rows writes the head only | `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` |
| pass | a lease released without a process grants the waiter; release is idempotent | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |
| pass | past the timeout the holder is stopped (SIGTERM, then SIGKILL after the grace period), its exit is awaited, then the lease is granted | `vscode-plugin/src/chat/__tests__/session-lock.test.ts` |
| pass | tailing again from a yielded cursor resumes exactly after that line; a segment without a turn-end marker ends at the next turn-start or once the writer is finished | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | the err log keeps only the current turn, and errTail returns its end | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | draft(): an in-memory session NOT persisted until saved (no empty chats in history) | `vscode-plugin/src/chat/__tests__/session-store.test.ts` |
| pass | round-trip: create/append/save then get/list reflect it | `vscode-plugin/src/chat/__tests__/session-store.test.ts` |
| pass | clampSessionTitle: a name longer than 32 chars -> 32 chars + a trailing ellipsis (ac4) | `vscode-plugin/src/chat/__tests__/session-title.test.ts` |
| pass | clampSessionTitle: a name of exactly 32 chars is unchanged (no ellipsis) | `vscode-plugin/src/chat/__tests__/session-title.test.ts` |
| pass | ToolCallEvent accepts an optional command; a command-less tool-call is still valid (additive) | `vscode-plugin/src/chat/__tests__/stream-events.test.ts` |
| pass | every existing TurnEvent kind still constructs with its original shape (no shape drift, k2) | `vscode-plugin/src/chat/__tests__/stream-events.test.ts` |
| pass | a live row rendered by the registry while the view is scrolled up leaves scrollTop unchanged and trims nothing, even with more than 300 rows held | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |
| pass | a live row rendered by the registry while the view is at the bottom moves the view to the bottom; with more than 300 rows held the oldest nodes are then removed back to a user row leaving about 200, and the view is still at the bottom | `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` |
| pass | latestWindow: a transcript no longer than one page is returned whole with firstIndex 0 | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |
| pass | latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows | `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` |
| pass | start waits for the session lease, reports waiting, runs, and releases the lease when the process exits | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | a start made while another waits for its lease runs after it instead of dropping it | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**integration: webview-level end-to-end (chat-panel.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |
| pass | attachment store: sweep removes only directories of sessions not kept whose files are all older than the age | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |
| pass | overloaded, rate limit, 429 and 5xx texts, timeouts and connection failures map to their causes | `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` |
| pass | CLI not found and any unmatched text, including a model refusal, map to other | `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` |
| pass | outbox projection: processing rows are dropped, failed and not-delivered rows have no place, blockedBy comes from another chat's processing row, attachments are counted and the note is carried | `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` |
| pass | a retrying row carries attempt and nextAttemptAt | `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` |
| pass | E202611031bd72813:S001 t3: active-list is posted on open and on every status change; the timer recomputes it (purge) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t4: host round trip — the open-chat { chatId } the shell posts (webview->host) is answered session-restored for that exact chat (the shell script execution itself is covered end-to-end in chat-shell.test.ts) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | E202611031bd72813:S001 t4: selecting an active-chat entry (open-chat { chatId }) opens that chat exactly like the history dropdown | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | submit-turn posts each TurnEvent INCREMENTALLY (deltas observable before done) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | single-in-flight: a second submit waits for the first, which reports to its end — no interleave; the first is not killed (H1/M2) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | FAULT INJECTION: an overload result before any tool call waits as retrying, runs again when due, and ends done with one user row and the retrying line stored; retry-now runs it at once; an overload after an edit stays failed | `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` |
| pass | chat host outbox: two messages sent while a turn runs are posted in the outbox with their places, and another chat's earlier message is counted ahead | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |
| pass | chat host outbox: cancelling a waiting message removes it from the queue and the outbox, and it never runs | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |
| pass | a queued turn that ends with done ok:false resolves failed with the text, not done | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |
| pass | a turn that emitted a tool-call, file-edit or tool-result before its error reports acted true; one that failed with none reports acted false with the classified cause | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |
| pass | extension wiring: the repo key hashes the real path of the git top-level of the chat folder, the window key is kept in workspaceState, the store opens under ~/.insrc/chat-queue, engines.vscode is ^1.141.0 and engines.node >=22.13, isAlive combines the pid and start-time checks, and when node:sqlite cannot load the chat is disabled and the notice is shown once | `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` |
| pass | when the queue cannot be opened the chat is disabled with a notice chosen by cause (node:sqlite cannot load, newer plugin, any other failure), each saying the chat is disabled, shown once | `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` |
| pass | chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |
| pass | schema 2: a fresh queue file is created with the waiting_on column at version 2, and a processing row can be marked waiting | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |
| pass | worker recovery: a reloaded window reclaims a lease whose CLI lives and does not fail the message | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |
| pass | worker recovery: a dead holder and dead CLI of another window is freed only after LEASE_TAKEOVER_MS and the next message runs | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |
| pass | the shell script runs: a windowed restore shows one page at the bottom with the bar, a page request round-trips and keeps the reader's place, a live row does not move a reader who scrolled up, and an old-style restore still works | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |
| pass | the shell script bounds the view of a long active session: rows past the limit are trimmed at the bottom and come back on request | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |
| pass | chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown) | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |
| pass | chat theme: the history chip is one wrapper around the select with a masked icon in the current text colour; the select keeps its id and options, and every image source the shell declares is allowed by its content security policy | `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` |
| pass | renderTerminalStyle: opens/closes <style>, contains every token + var(--vscode-*,<fallback>), CSP-safe | `vscode-plugin/src/chat/__tests__/design-tokens.test.ts` |
| pass | renderTerminalStyle: deterministic (two calls byte-identical) | `vscode-plugin/src/chat/__tests__/design-tokens.test.ts` |
| pass | a click on an added or context line posts open-code-ref with its path and new-side line | `vscode-plugin/src/chat/__tests__/diff-click.test.ts` |
| pass | a click on a removed line posts the new-side line it sat before | `vscode-plugin/src/chat/__tests__/diff-click.test.ts` |
| pass | the extension is matched without regard to case and a Dockerfile has a language | `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` |
| pass | nested spans and a span that crosses a newline are flattened per line with the innermost class | `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` |
| pass | parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |
| pass | parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |
| pass | a TypeScript diff line is split into keyword, string and comment tokens carrying their classes | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |
| pass | a block comment opened on a context line colours an added line as comment | `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` |
| pass | ISSUE-6dbf14435972af7a: content() of a document-less artifact id (no mdPath, e.g. AMD) falls back to workflow.deliveryEvidence; pendingDocuments() keeps it | `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` |
| pass | pending() maps PendingArtifact -> DocsArtifactSummary (id/kind/title/status, and the open-question count) | `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` |
| pass | docs review host: a decision with no comments sends the chat the decision line alone | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |
| pass | docs review host: send feedback works on a read-only open and on a document just approved, while approve and reject are refused for a document that is not pending or not the open one | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |
| pass | E202611031bd72813:S001 t8: each presentKey opens its OWN editor panel (titled with the key); a repeat present reveals instead of replacing; dispose removes only its entry; the legacy single-panel path is unchanged | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | open() posts the pending list from client.pending() | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | open-doc for a known id posts docs-content mapped from the client | `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` |
| pass | t3: deriveSectionIndex returns anchors in DOCUMENT ORDER with level set to the ATX depth | `vscode-plugin/src/chat/__tests__/docs-sections.test.ts` |
| pass | t3: two identically-titled headings get DISTINCT slugs via an appended ordinal and NEITHER is dropped | `vscode-plugin/src/chat/__tests__/docs-sections.test.ts` |
| pass | extension.ts gates the chat command on insrc.chat.enabled (config read) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | extension.ts constructs createChatPanelHost with the real injected vscode seams + memento store | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | the shared fake DOM records writes, parses and traps innerHTML, clears children on textContent, and models namespaces, text nodes, parent and sibling links, moves, querying and listeners | `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` |
| pass | allOf walks pre-order, root first, and skips text nodes | `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` |
| pass | git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged | `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` |
| pass | git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |
| pass | git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |
| pass | isChatTabInput: true for the host-prefixed runtime form and the bare view type | `vscode-plugin/src/chat/__tests__/group-lock.test.ts` |
| pass | isChatTabInput: false for other webviews, near-misses, and non-webview inputs | `vscode-plugin/src/chat/__tests__/group-lock.test.ts` |
| pass | a code reference with a line in running text becomes a link carrying its path and line | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |
| pass | text inside code and pre and existing anchors is not wrapped | `vscode-plugin/src/chat/__tests__/link-markup.test.ts` |
| pass | the host opens a valid http url externally and refuses a non-http url | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |
| pass | the host opens an existing in-workspace path with the line selected | `vscode-plugin/src/chat/__tests__/link-opener.test.ts` |
| pass | renderRow dispatches to a registered renderer for its kind | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | the fallback renderer applies the vm cssClass (byte-identical to line(s,cls)) | `vscode-plugin/src/chat/__tests__/render-registry.test.ts` |
| pass | chooseReviewColumn picks a group without the chat tab, the active one first, else the lowest column, and none when only the chat's group is open | `vscode-plugin/src/chat/__tests__/review-column.test.ts` |
| pass | chooseReviewColumn: a tab whose input is not an object or has no viewType does not mark its group as the chat's | `vscode-plugin/src/chat/__tests__/review-column.test.ts` |
| pass | vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from the companion frame is posted to the host as an open-code-ref message | `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` |
| pass | vscode-plugin/src/chat/__tests__/review-frame-message.test.ts: a reference from any other window is ignored | `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` |
| pass | review icon: the light and dark SVG pair exists, draws the insrc spiral behind a document glyph with no background, ships in the package, and is declared by the insrc.chat.docsReview command | `vscode-plugin/src/chat/__tests__/review-icon.test.ts` |
| pass | a turn with no declaration opens nothing at its end, and a tool result carrying a pendingApproval block opens nothing | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |
| pass | the output-parsing path is gone: presentedPathOf and the end-of-turn guess no longer exist | `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` |
| pass | evaluating the highlighter module highlights TypeScript, JSON and Python text as span markup | `vscode-plugin/src/chat/__tests__/webview-hljs.test.ts` |
| pass | the highlighter module holds no script tag and its byte length stays under 250 KB | `vscode-plugin/src/chat/__tests__/webview-hljs.test.ts` |
| pass | E202611031bd72813:S001 t4: #insrc-active chip sits LEFT of the .right history chip; active-list populates dot-coded entries; selecting posts open-chat { chatId } | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |
| pass | E202611031bd72813:S001 t4: TRUE end-to-end round trip — the shell dropdown selection posts open-chat, the real host receives it, and answers session-restored for that chat | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/approval-queue.test.ts` | 0 | 4 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` | 0 | 6 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/chat-failure.test.ts` | 0 | 3 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` | 0 | 3 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 220 | 10.3 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` | 0 | 1 | 1.1 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` | 0 | 11 | 3.9 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 12 | 1 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` | 0 | 2 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 18 | 0.9 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 20 | 1.2 s |  |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 14 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/chat-theme.test.ts` | 0 | 11 | 0.7 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 97 | 1.4 s |  |
| `vscode-plugin/src/chat/__tests__/design-tokens.test.ts` | 0 | 17 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/diff-click.test.ts` | 0 | 4 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/diff-highlight.test.ts` | 0 | 5 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` | 0 | 7 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/diff-tokens.test.ts` | 0 | 6 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` | 0 | 17 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` | 0 | 14 | 0.9 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` | 0 | 236 | 18.3 s |  |
| `vscode-plugin/src/chat/__tests__/docs-sections.test.ts` | 0 | 12 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/edit-governor.test.ts` | 0 | 14 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts` | 0 | 5 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 26 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` | 0 | 4 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` | 0 | 1 | 1 s |  |
| `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` | 0 | 4 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/group-lock.test.ts` | 0 | 15 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/link-markup.test.ts` | 0 | 11 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/link-opener.test.ts` | 0 | 7 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/markers.test.ts` | 0 | 13 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/mocks-contract.test.ts` | 0 | 6 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 14 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/render-registry.test.ts` | 0 | 75 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/resolve-within.test.ts` | 0 | 1 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/review-column.test.ts` | 0 | 2 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/review-frame-message.test.ts` | 0 | 4 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/review-icon.test.ts` | 0 | 1 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/review-presenter.test.ts` | 0 | 10 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/session-file-store.integration.test.ts` | 0 | 2 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/session-file-store.test.ts` | 0 | 23 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/session-lock.test.ts` | 0 | 17 | 1.2 s |  |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 14 | 1.4 s |  |
| `vscode-plugin/src/chat/__tests__/session-store.test.ts` | 0 | 30 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/session-title.test.ts` | 0 | 5 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/stream-events.test.ts` | 0 | 7 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/transcript-pager.test.ts` | 0 | 12 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` | 0 | 6 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 36 | 1.9 s |  |
| `vscode-plugin/src/chat/__tests__/webview-hljs.test.ts` | 0 | 2 | 0.4 s |  |
