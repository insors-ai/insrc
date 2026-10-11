<!-- insrc:artifact TESTS-8ca7382b0952a539-s1 -->

# Tests: 8ca7382b0952a539 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 141 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-11T05:30:46.538Z on commit `30d44dc0`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: start waits for the session lease, reports waiting, runs, and releases the lease when the process exits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | start waits for the session lease, reports waiting, runs, and releases the lease when the process exits | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: a second start drops a turn still waiting for its lease**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a second start drops a turn still waiting for its lease | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: a superseded turn reports nothing, reads to its end and clears its cursor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a superseded turn reports nothing, reads to its end and clears its cursor | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: a lease granted after the turn stopped being current is released**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a lease granted after the turn stopped being current is released | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: a lock failure and a missing adapter are reported through onError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a lock failure and a missing adapter are reported through onError | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: a beforeRun failure is reported, the session saved and the lease released**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a beforeRun failure is reported, the session saved and the lease released | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: the cursor is saved on spawn, throttled on progress and cleared before onTerminal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the cursor is saved on spawn, throttled on progress and cleared before onTerminal | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: invalidate and a closed panel suppress all sink calls; live names the turn being read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | invalidate and a closed panel suppress all sink calls; live names the turn being read | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |
| pass | a panel closed while a turn is read is told nothing more | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 9 | 1 s |  |

## t2

Run at 2026-10-11T05:35:50.660Z on commit `61db3e26`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: stop cancels the provider turn and stops the live process; idempotent with nothing running**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stop cancels the provider turn and stops the live process; idempotent with nothing running | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: stop and detach drop a turn waiting for its lease**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stop and detach drop a turn waiting for its lease | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: detach leaves a session-file turn running with its cursor saved and stops a pipe turn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | detach leaves a session-file turn running with its cursor saved and stops a pipe turn | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: stop continues past a failing cancel or process stop**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stop continues past a failing cancel or process stop | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 13 | 1.1 s |  |

## t3

Run at 2026-10-11T05:38:32.590Z on commit `00d42556`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: follow skips a running turn, a turn already followed and a turn owned by a live host**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | follow skips a running turn, a turn already followed and a turn owned by a live host | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: follow takes ownership from a dead host, reports every event, clears the cursor and calls onEnd**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | follow takes ownership from a dead host, reports every event, clears the cursor and calls onEnd | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: a failing resume keeps the cursor saved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing resume keeps the cursor saved | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: stop ends a followed turn's process; detach leaves it running**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stop ends a followed turn's process; detach leaves it running | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**unit: a detached session-file turn is resumed by follow**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a detached session-file turn is resumed by follow | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 18 | 1.2 s |  |

## t4

Run at 2026-10-11T05:43:27.275Z on commit `21fe0419`. Tests check: **passed**. 123 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-panel.test.ts passes unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | submit-turn posts each TurnEvent INCREMENTALLY (deltas observable before done) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | single-in-flight: a second submit supersedes the first — no interleave; it waits for the first instead of killing it (H1/M2) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | new-chat mid-stream stops the prior turn (no cross-session post) (M3) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | malformed submit-turn (non-string text) is a no-op, no unhandled rejection (M4) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | an errored turn persists its transcript rows (L3) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | empty/whitespace submit-turn is a no-op (no run) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a terminal error TurnEvent is posted inline; unknown-provider is surfaced, not thrown | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | onDidDispose cancels the active turn and stops posting further | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | unknown / edit-* / docs-* inbound messages are accepted-but-ignored no-ops | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | no provider installed: open posts an error notice (no crash) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | rendered shell: one nonce'd inline script + strict CSP + sc1 style + no remote origin | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | rendered shell mints a FRESH nonce per render | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 rendered shell: non-delta turn-events route through the marker mapper (sc1 class, not the bare bracket) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 integration: a status->tool-call(mcp)->status->file-edit->done turn posts a marker per event and persists status+done rows (ac1/ac2, k8) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (ux polish): a tool-result event persists a STRUCTURED role:tool-result row (command+output), never a marker | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (ux polish): a turn with NO tool-result events persists a byte-identical transcript (no tool-result rows) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 shell: provider-selector options == available + history-dropdown; one script + CSP intact | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 shell: empty providers.available -> disabled selector | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 open() posts a history-list | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | open()/close leaves NO empty session in history — the chat opens a draft, persisted only on first turn | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | LLM titling: the first turn swaps the truncated-prompt title for the LLM-derived name (+ refreshes history) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | LLM titling: a failed/empty derivation keeps the truncated-prompt fallback | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | LLM titling: with no deriveTitle injected, the truncated-prompt fallback is kept (no built-in CLI call) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 new-chat: valid provider creates a fixed-provider session + re-posts history; non-available is a no-op | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 open-chat: restores a prior transcript; a missing id is a no-op + refreshes history | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 ac3 native resume: turn 2 carries resume from turn 1 done.sessionId; only the new prompt is sent | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 switching chat mid-stream cancels the in-flight turn (single-in-flight preserved) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S005 a first-turn error still refreshes the history dropdown (title label) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S008 integration: a turn persists each marker row with cssClass === markerFor(ev).cssClass (ac2); assistant rows carry none | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S008 integration: open-chat restore posts marker rows carrying their cssClass (ac1) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 shell: session-restored replay routes through the sc1 registry (keyed, single-sourced, carries the stored class); CSP/one-script/textContent intact | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): the edit-review gate is RETIRED — even a legacy set-edit-mode:review turn is visualize-only (no revert) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S006 integration: an AUTO turn renders visualize-only (no accept/reject revert on reject) + edit marker still renders | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S006 integration: set-edit-mode updates + persists session.editMode | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S006 integration: diffView=editor routes to the native editor seam (no chat edit-prompt) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S006: without editGovernance the host behaves as before (no edit-prompt; file-edit marker still renders) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S006 shell: edit-mode toggle + diff renderer live inside the ONE nonce'd script; CSP/textContent invariants intact | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): the edit-prompt is always visualize-only (review flag never set) — the gate is retired | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 ac1: submit-turn posts a live user-row (the prompt appears during the turn, not only on reload) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 lc1: two identical prompts yield two distinct-keyed live user-rows | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002 ac2: a cancel-turn message cancels the in-flight turn (cancelActive -> provider.cancel) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002: a cancel-turn with no active turn is an idempotent no-op (no throw) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002 (ux-polish) ac1/ac2/t3: the leading ">" prompt (#insrc-prompt) is the send/stop control; the trailing #insrc-send button is retired | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (74bc0120) ac5: the session dropdown cap doubles to 36ch; the rest of the chip is untouched | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (74bc0120) ac4: the no-CLI capability gate is the sole render-time disable and still wins | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (74bc0120) ac1/ac2/ac3: the lock starts closed and is settled at all three session transitions | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (74bc0120) regression: the lock is additive — the surrounding handlers are unchanged | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | both message bubbles span the full row (100%) and the assistant carries no magenta left rail; wrapper stays 100% | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002 ac1: the fixed-region layout holds — #insrc-term is the only scroll region; header + input stay flex:0 | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): the <body> carries no surface class — so .insrc-term-<surface>{display:block} cannot override body{display:flex} and collapse the flex-fill | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002 ac1/k1: all pre-existing element ids remain; one inline script; no innerHTML/remote origin | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002: an empty submit is a host no-op (no turn starts) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002 ac3: renderShell embeds a single #insrc-progress widget above the input, hidden at rest | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S002 ac3/lc1: status events are never persisted to the durable transcript (host skip unchanged) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 t1: renderShell embeds the role-tone + markdown/JSON widget + caption CSS (inline, CSP-safe) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): renderShell has the SINGLE merged mode control + wires the approval seams | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (fidelity) ac1: the input is a FLUSH 2-line prompt — #insrc-input has no box chrome, rows=2 kept, ❯ top-aligned | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (fidelity) ac2: the placeholder gains the interrupt hint | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | ISSUE-6ae99f6e: the header holds ONLY the session dropdown; the provider + mode selects live in the footer status bar | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | UI: the #insrc-history session dropdown carries a leading history/clock glyph so its purpose reads | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | ISSUE-095906bac5bbacaf: every image source the shell DECLARES is permitted by its own CSP (a declared-but-blocked icon must fail) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (fidelity) ac4 (regression): the S002 send/stop control + mode/provider switching are unchanged | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): a turn's mode defaults to manual; set-permission-mode switches the NEXT turn (edit-auto / auto) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): an invalid set-permission-mode is dropped (mode unchanged) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 t7: permission-decision is relayed to the live turn adapter.decide with (turnId, requestId, decision) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 t7: permission-decision with no active turn is a safe no-op (never throws) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 adopt(channel) wires + posts theme/session-restored/history-list (restored panel shows history) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 adopt() supersedes an already-live channel (prior disposed; single active channel) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 adopt() with no agentic CLI posts the same error a fresh open does | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 the webview posts a ready handshake AFTER attaching its message listener (initial load + every reload) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 a ready message (re)posts theme + active session + history — a reloaded webview repopulates | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 ready before any open-time delivery still populates history (models the dropped initial post) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): approving a permission-denied request re-runs the blocked action with the tool pre-allowed, resuming the session | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): denying a permission-denied request does NOT re-run (the turn stays denied) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): Approve on a tool-gate WITH a command re-runs naming the EXACT command (not the vague nudge) + pre-allows the tool | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): Approve on a tool-gate WITHOUT a command falls back to the tool-name phrasing (+ allowedTools) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): Approve on a dir-block does NOT re-run/grant — it posts an informational message; argv/allowlist untouched | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix) + S003 (ux polish): Deny drops both a tool-gate and a dir-block — no re-run; posts ONLY the rejected outcome chip | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): a stale/idless permission-decision (no pendingPerms entry) falls through to adapter.decide (codex/in-turn relay unchanged) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 ac2: approving a tool-gate WITH a command re-runs with [toolName] but posts ZERO user-row echoes (suppressEcho) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 ac2: a NORMAL user turn still posts its user-row echo (suppressEcho gates ONLY the synthetic grant re-run) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 ac2: the tool-name FALLBACK grant (no command) also suppresses the echo + records the approved outcome | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 ac3: a dir-block Approve records an approved outcome (even though it does NOT re-run) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S003 ac4: after an approve, the persisted transcript carries the outcome row and NO approval-request (the pending card never replays) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): set-permission-mode persists onto the active (saved) session | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): the mode FOLLOWS the session — opening a chat adopts its persisted mode | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S001 (bugfix): the webview sets the mode control from a restored session | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 (ux polish): renderShell wires the selection decision sink + routes selection turn-events (approval path intact) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 (ux polish): a selection-decision records the outcome (chosen LABELS) AND continues the run via a synthesized user turn | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 (ux polish): a selection-decision for an unknown/stale requestId is a safe no-op (no outcome, no run) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | S004 (ux polish): a selection-decision with an empty/invalid selected list is dropped (no outcome, no run) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a message sent while the previous CLI process is still alive after its answer waits, shows 'Waiting for the previous turn to finish', and starts only after that process exits | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | with a short timeout, the still-running holder is stopped and the new turn starts after its exit is confirmed | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | Stop ends the running process at once and cancels a waiting message; the generation guard still keeps superseded events out of the transcript | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a lock failure other than a dropped wait is logged and shown, never a silent no-op | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a turn whose adapter fails to start releases the session lease (the next turn does not wait) | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a turn records its cursor on the session as lines are handled and clears it at the terminal event | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | after a reload (a new host over the same store) a session with a live cursor is followed from the saved offset, only new events are posted and appended, and the cursor is cleared at the end | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a cursor whose generation is gone (rolled over twice) is cleared without resuming | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a second live window that is not the cursor's owner does not follow it; once the owner host is gone it takes over | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | switching chat or closing the panel stops following a turn writing to the session file without stopping its process, and showing the session again resumes it; a turn without one is still stopped | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | Stop ends a resumed turn's process through the handle resume() hands over | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | closing the panel mid-turn leaves a session-file turn running with its cursor saved | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | a failing store save or a failing process stop never becomes an unhandled rejection | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**integration: extension-chat-wiring.test.ts passes unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension.ts gates the chat command on insrc.chat.enabled (config read) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | extension.ts constructs createChatPanelHost with the real injected vscode seams + memento store | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | the chat host + protocol + store modules are vscode-free | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | package.json contributes the chat command + the insrc.chat.enabled config (default on) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | S006: package.json contributes insrc.chat.diffView (string enum chat\|editor, default chat) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | S006: extension.ts reads insrc.chat.diffView (full dotted key) + injects editGovernance seams | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | S006: the edit-governor module is vscode-free | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | group-lock: package.json contributes insrc.chat.lockGroup (boolean, default true, machine scope) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | group-lock: extension.ts wires thin seams into createChatGroupLock and attaches it in the one panel adapter | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | group-lock: the module is vscode-free | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | S007: package.json contributes the insrc.chat.docsReview command | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | S007: extension.ts wires the docs-review host inside the chat gate over the shared client | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | S007: the docs-review host + client modules are vscode-free | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | editor-title: the chat opens from an editor/title icon, NOT an Activity Bar container | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | editor-title: the real insrc icon SVGs exist, are non-empty, and ship in the .vsix | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | editor-title: extension.ts opens the chat as an editor-tab panel + gates the icon, docs-review intact | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | the extension passes a file-backed lock registry and the turnLockTimeoutMs setting | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | package.json contributes insrc.chat.turnLockTimeoutMs (number, default 600000, minimum 1000) | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |
| pass | the extension builds a session output on ~/.insrc/chat-output, passes it to the provider registry, and wires onEvict and the start-up sweep | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 104 | 1.4 s |  |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 19 | 0.3 s |  |
