<!-- insrc:artifact CR-ce99b72065d03b1b-s5 -->

# Code review: ce99b72065d03b1b:s5

⚠️ **WARN** — HIGH 0 · MED 4 · LOW 4 · model `codex:gpt-6.1-sol`

**Changed files:** 46

**Reviewed on the diff:** the wait for a fresh index timed out after 122 s (code-index job in flight: no; queued: 0; stale files: src/daemon/db/__tests__/fixtures/session-source-inventory.json)

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/cli/services/models.ts:48 | Disconnected requests return down:false, so ModelTiersPane and RepoModelsView skip their daemon-down messages and show only the closed-connection explanation. Classify this condition so those panes display their required daemon-down message and recovery instruction. |
| MED | src/__tests__/no-default-tiers.test.ts:52 | The declaration-export rule checks only the first declared name, so `export const other = 1, DEFAULT_TIERS = {};` passes the scan despite exporting a retired name. Extend detection to all declarators and add a regression case so the scan enforces t11's prohibition. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/cli/panes/ModelCheckScreen.tsx:166 | The optional `tiers` property omits the documented explicit `\| undefined`. Declare it as `tiers?: Record<string, ...> \| undefined`. |
| LOW | src/cli/panes/RepoModelsView.tsx:138 | The optional `color` property omits the documented explicit `\| undefined`. Use `{ color?: 'cyan' \| undefined }` for the helper's return type. |

## coverage — 0 finding(s)

_No findings._

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/cli/panes/RepoModelsView.tsx:107 | Correctness: r remains enabled during a pending write. Its reload can finish before the write lands and clear saving, allowing another whole-map edit from the old snapshot to overwrite the first edit. Keep the write lock until that write's own reload completes. |
| LOW | src/cli/panes/ModelCheckScreen.tsx:127 | Avoidable complexity: restartThenSave merges restart failures and save failures into the same retry state. After a successful restart followed by a failed save, R unnecessarily restarts the daemon again. Track the completed restart separately so saving can be retried independently. |
| LOW | src/cli/__tests__/command.test.ts:33 | Duplication: ctxWith maintains another complete Services fake alongside the shared fakeServices factory, including identical model answers and workflow stubs. Service-contract changes consequently require parallel maintenance. Build from the shared factory and override methods requiring spies. |
| MED | src/cli/panes/ModelCheckScreen.tsx:169 | Unhandled error path: tierInConfig converts a failed config read into false. Following a disconnected write, this makes an unverifiable outcome display as 'the tier was not saved', even when it landed. Preserve an unknown outcome when readback fails and offer readback recovery. |

## ux — 0 finding(s)

_No findings._

