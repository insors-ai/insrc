# VS Code manual feedback correction — 2026-10-30

User authorization: “can’t proceed as I can’t add any connection, fix the given feedback.” This corrects existing S005 tasks t18 (renderer/host), t20 (entry/icon), and t30 (implementation preview). The user explicitly replaced the old two-pane layout with registration above list. Approved LLD/PLAN remain historical; implementation definitions and regenerated companion show the corrected layout.

Implemented: themed Connections tab icon; registration above list at all widths and in DOM/keyboard order; icon-only Add, Refresh, Previous, Next, Delete/Discard, Close controls with accessible labels and tooltips. Dynamic removal labels preserve the static SVG icon.

Add root cause: installed daemon capabilities version 2 advertises only safe-read and driver-descriptors. The host previously required a session before even loading descriptors, disabling the whole editor. It now strictly decodes public metadata before requesting session admission, and allows a local create draft for the selected registered root and current daemon epoch. Unsupported/malformed metadata and failed reads revoke draft eligibility. Save/Test/Remove retain independent capability admission and daemon authorization; no fallback to legacy writes. Initial admission refusal no longer reports a nonexistent temporary owner as expired.

Actual creation on the installed daemon remains blocked by upstream prerequisites. A metadata-only daemon supports draft editing, not Save/Test. Fully enabled signed disposable daemon fixtures cover actual Saved/Temporary creation and recovery; their injected fake driver factories do not establish real SQL/KV/file-source coverage. No production gate, daemon installation or daemon restart was changed.

Validation: extension TypeScript noEmit passed. All 31 VS Code Connections tests passed with Node v22.23.2, zero failed/skipped. Added regression coverage exercises metadata-only draft editing, zero privileged/legacy writes, catalog revocation, DOM section order and accessible icons. Entry coverage checks both themed icon files and wiring. Raw output: evidence/ui-feedback/connections-tests.txt. Initial sandbox-only socket failures were rerun with disposable Unix-socket test permission; first real run exposed missing-method classification, corrected and passed in the final 31-test run.

Builder inspection checked metadata root/epoch correlation and abort checks, stale and unavailable states, retained action authority, no new persistent/renderer sinks, static SVG accessibility and section order. This is builder inspection, not independent code-review approval. The generated implementation preview was source-checked, not visually accepted. Live UI checks remain assigned to the user.


## Committed package and final extension sweep

Runtime source commit: `63966e4ad`. The VSIX was built from a clean temporary `git archive` snapshot of that commit, excluding concurrent uncommitted chat edits. Archive: `vscode-plugin/insrc-vscode-0.5.16-s005-63966e4ad.vsix`; SHA256 `6bb08fe332e734e1752aa47d145a75ff1491fb07f01176f00bbff4b8416dad51`. Prepublish/typecheck/bundle passed; CRC, both themed icon files, revised bundle text and source/node_modules exclusion passed. Packaging tests: 11/11 passed. Not installed or published.

The full VS Code extension sweep covered all 115 test files in that snapshot using a 60-second per-file deadline, after an unbounded whole-suite invocation retained a handle and was stopped. Of 114 files with complete TAP totals: 1313 tests, 1298 pass, 3 fail, 12 skip. The remaining chat-panel file timed out after emitting 167 passing cases and no final totals; those partial cases are not added to complete totals. This sweep is not green. Failures: macOS `/proc/<pid>/stat` use in cli-adapter; repoRegisterProviders missing from the detail-renderers expected message set; stale repo-config import assertion in workspace/activation. These concern source outside the Connections correction. Raw logs and exact per-file results: evidence/ui-feedback/sweep/. No backend/native product code changed; their historical full-sweep results remain in BUILD-REPORT.md.

The first tracked t18 validation lost its daemon connection after mapped tests passed. After daemon reachability returned, the retry passed all checks, mapped tests and both root/extension typechecks. This is a task-validation verdict, not independent post-build code review or live UI acceptance.

The t20 entry/icon validation gate also passed. Task30 inventory checks initially found stale consumer hashes; the inventory now pins committed source 63966e4ad, including both icon assets, excluding unrelated in-flight activation edits. The regenerated narrative preserves the capability/acceptance statements checked by the existing artifact guard. Both task30 checks pass after alignment; initial failures are retained in evidence.

Final tracked results: t18, t20 and t30 validation gates all passed. No independent post-build code review or live UI acceptance is claimed; actual creation on the installed daemon remains unavailable. Runtime package remains pinned to 63966e4ad; subsequent commits contain documentation, inventory and validation evidence only.


## Pending manual feedback — 2026-10-31: new and edit forms below the list

User feedback: “the edit view of the connection should show below the connection list, not above.”

User clarification: “no, keep the new connection also below the list.”

Required layout: the connections list comes first, with both new connection registration and editing an existing selected connection below it. This supersedes the earlier registration-above-list requirement. Preserve the draft and its validation/actions when placing the form, and keep DOM/keyboard order consistent with the visible order.

Status: recorded for implementation. No runtime layout change or UI verification is claimed by this entry.


## Pending manual feedback — 2026-10-31: fixed registration message section

Registration messages appear in a fixed message section at the bottom of the Connections panel. The section occupies two lines, shows the latest message, and includes the number of messages. It remains at the bottom while the connections list and New/Edit form are scrolled.

Clicking the message section opens a popup where the user can cycle through the collected registration messages. Keep the section and popup keyboard-accessible and preserve the existing safe-message handling.

Status: recorded for implementation. No runtime message-section or popup change is claimed by this entry.


## Pending manual feedback — 2026-10-31: datasource type icons

Provide an icon for every supported datasource type. Show the matching icon beside the type name in the datasource dropdown, each connection in the list, and the connection edit view. Use the same icon for a given type across these surfaces. Retain readable type names and ensure icons remain legible in light and dark themes.

Status: recorded for implementation. No runtime icons or dropdown changes are claimed by this entry.


## Pending manual feedback — 2026-10-31: per-row delete/discard icon

Place an icon-only delete/discard button on each connection row in the list, replacing the shared list-level delete control. Each button targets its own row's connection, independently of the currently selected or edited connection. Provide a tooltip and accessible name appropriate to Saved deletion or Temporary discard. Preserve the existing confirmation, dirty-draft handling, capability checks and exact connection identity safeguards.

Status: recorded for implementation. No runtime row-action change is claimed by this entry.


## Feedback batch implementation — 2026-10-31

The pending October 31 layout, message-section, datasource-icon and row-delete items above are implemented in VS Code 0.5.21. List precedes both New and Edit forms in DOM and visual order. Each row has its own capability-gated Delete/Discard icon with captured key/revision; existing dirty-draft and removal confirmations remain authoritative. Cancel restores row focus; stale, filtered and unavailable targets cannot issue a removal.

All 29 datasource types have distinct locally bundled SVG monogram badges in the keyboard-accessible type picker, list and edit view. These are type badges rather than third-party logos; readable names remain alongside them and theme tokens govern contrast. No downloaded assets or additional dependencies.

A fixed two-line footer shows the latest registration message and retained count; clicking opens a native modal with wrapping Previous/Next message navigation. Recovery actions are available inside the same popup. History retains the latest 200 safe status messages per selected repository in workbench memory, survives manager close/reopen, and clears on root switch/disposal. Re-rendering does not duplicate messages. Draft values, passwords, raw RPC exceptions and webview persistence are excluded. Input guidance stays near fields; transient registration outcomes appear in the footer/history.

User feedback explicitly supersedes the historical two-pane and registration-above-list task/design copy. Structured implementation definitions and generated UX companion now reflect the revised flow. Ownership and daemon IPC contracts are unchanged; JetBrains layout is unchanged. Companion source was inspected; live native UI/theme acceptance remains assigned to the user.

Validation: 39 Connections tests passed, including new type-picker keyboard/icon, history cycling/retention/bound and per-row dirty/stale-target cases; both implementation artifact checks and root/extension typechecks passed. Early test-only assertions assumed a shorter validation message or no retained-draft notice on reopen; those expectations were corrected. Independent completion review and live UI acceptance are not claimed.
