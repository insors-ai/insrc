<!-- insrc:artifact CR-2d9e9e694a94116b-s1 -->

# Code review: 2d9e9e694a94116b:s1

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 3 · model `client`

**Changed files:** 6

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/cli-adapter.ts:214 | classifyPermissionDenial detects a dir-block by a single case-insensitive phrase match on 'allowed working directories'. This is the LLD-mandated CONSERVATIVE predicate (a wording change in the installed CLI degrades safely to 'tool-gate', today's behaviour), so it is by design, not a defect. All other design invariants are met: additive command field (byte-identical when absent), no --add-dir / no sandbox widening, runTurn signature unchanged, codex/in-turn decide() fall-through untouched. |

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1525 | Graph grounding for the changed files is diff/file-level only (the just-edited files are not freshly indexed), so testsReaching is hollow — coverage was judged by RUNNING the suite instead: 269 tests, 265 pass, 0 fail, 4 pre-existing INSRC_LIVE_TESTS-gated skips. The new tests cover every planned branch: command-harvest (top-level/nested/empty), classifyPermissionDenial (dir-block phrasings + tool-gate/unknown/empty + a 6-row false-positive table), the approval-request optional command field, Approve tool-gate-with/without-command, Approve dir-block (informational post, no re-run, argv untouched), Deny (both kinds), and the codex/stale fall-through. No coverage gap. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:743 | The dir-block informational message is emitted as a live-only assistant-delta+done turn-event pair (turnId info-<requestId>) and is not written to the durable transcript, so it disappears on a session reload. This is intentionally consistent with the approval-request event being live-only (markerFor=null) and keeps the change additive; noting it only as a minor UX observation, not a defect. |

