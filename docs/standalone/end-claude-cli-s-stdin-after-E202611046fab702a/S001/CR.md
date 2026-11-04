<!-- insrc:artifact CR-6fab702a7015853e-s1 -->

# Code review: s1

Status: **passed** · task-based schema version 2

## review-6fab702a7015853e-s1-r1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-04T05:40:54.897Z

1 selected task assessment(s): passed.

### Submitted scope

- `31ebd07c29b70c5a46b3a6295c59f8b4f15aeab1:vscode-plugin/src/chat/cli-adapter.ts` — [{"after":[194,199]},{"after":[1208,1210]},{"after":[1599,1602]}]
- `31ebd07c29b70c5a46b3a6295c59f8b4f15aeab1:vscode-plugin/src/chat/__tests__/fixtures.ts` — [{"after":[38,39]},{"after":[137,137]},{"after":[200,202]},{"after":[209,209]}]
- `31ebd07c29b70c5a46b3a6295c59f8b4f15aeab1:vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` — [{"after":[221,245]}]

### s1: passed

The fix correctly ends the Claude CLI's stdin exactly once the turn's own correlated terminal result (done or error) has been seen, releasing the chat lock without disturbing the permission relay or other provider paths. Both added tests pass, and the change typechecks cleanly.

Coverage: **verified** — Two new tests in cli-adapter-correlation.test.ts directly exercise the acceptance checks: (1) a correlated turn's stdin is ended exactly once, at its own result, with inputEnds()==0 confirmed at the assistant-delta event (before the own result) and ==1 at done, and signals() empty (process left to finish, not killed); (2) a prompt-argument (codex) CLI never calls endInput, confirming the guard is scoped to the correlated (formatInput-defined, i.e. claude-only) path. I traced the mapLine correlation logic (vscode-plugin/src/chat/cli-adapter.ts:700-709) and confirmed state.result/the terminal done event is only produced when obj.user_message_uuid (or user_message_uuids) matches state.requestUuid, so the new `if (state.requestUuid !== undefined) proc.endInput?.()` guard at the terminal branch fires only on the turn's own result, matching the acceptance check's 'at the correlated result, not before' requirement. I ran the test file directly (13/13 pass) and the full vscode-plugin/src/chat test tree (1035/1042 pass; the 7 failures are in unrelated files — approval-subscribe.test.ts, cli-adapter.test.ts's stale --input-format arg expectation, and docs-review-panel.test.ts — none touched by this commit, confirmed pre-existing via git log/diff against the parent commit). tsc --noEmit in vscode-plugin is clean.


Optional verification and advice (nonblocking):

- Optional execution: ran the full vscode-plugin/src/chat test tree beyond the mapped tests to check for regressions; the 7 unrelated failures (approval-subscribe.test.ts, a stale CLI-args expectation in cli-adapter.test.ts, docs-review-panel.test.ts) pre-date this commit (confirmed via git log on those files vs. the fix commit) and are not caused by this change.
- The resume()/reattach path (cli-adapter.ts around line 1330) that reconnects to a session file after a reload does not call endInput, since it never holds the SpawnedProcess handle — it only re-derives TurnEvents from the on-disk session log. This is pre-existing behavior unrelated to this diff and the reproduction/acceptance checks describe the live (non-reload) path, so it is out of scope here, not a defect in this change.

Inspected references:

- `93f314f0bc001ae696caffb60ba3e0fb7585303b:docs/standalone/end-claude-cli-s-stdin-after-E202611046fab702a/ISSUE.md`
- `31ebd07c29b70c5a46b3a6295c59f8b4f15aeab1:vscode-plugin/src/chat/cli-adapter.ts`
- `31ebd07c29b70c5a46b3a6295c59f8b4f15aeab1:vscode-plugin/src/chat/__tests__/fixtures.ts`
- `31ebd07c29b70c5a46b3a6295c59f8b4f15aeab1:vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts`

Test: `npx tsx --test --test-force-exit vscode-plugin/src/chat/__tests__/cli-adapter-correlation.test.ts` — pass
Ran directly: 13/13 tests pass in the file (includes the 2 new tests plus 11 pre-existing correlation tests, all passing).

Test: `npx tsx --test --test-force-exit 'vscode-plugin/src/chat/**/*.test.ts'` — pass
1035/1042 pass; 7 failures are in approval-subscribe.test.ts, cli-adapter.test.ts (stale --input-format/--replay-user-messages arg expectation) and docs-review-panel.test.ts, none of which this commit touches; confirmed pre-existing by checking file history against the fix commit and its parent.
