<!-- insrc:artifact CR-dd277f9cddd6d879-s1 -->

# Code review: dd277f9cddd6d879:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 9 · model `claude:opus`

**Changed files:** 5

## adherence — 0 finding(s)

_No findings._

## conventions — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/pending.ts:70 | `handleWorkflowPending` declares its params as `{ repo?: string } \| undefined` — the optional property `repo` is not declared `\| undefined`, as the documented exactOptionalPropertyTypes rule requires (`repo?: string \| undefined`). The same file repeats the pattern on `PendingArtifact.workItemId` (line 49), `ArtifactShape.meta` / `body` (lines 92-93) and the inline descriptor type at line 154. I could not confirm whether these lines were introduced by this Story or predate it. |
| LOW | src/workflow/__tests__/artifact-content.test.ts:38 | `makeFixture` options declare `md?: string`, `json?: unknown \| string \| null` and `mdRel?: string` (lines 38-40) without the explicit `\| undefined` the documented rule requires for optional properties. |
| LOW | src/workflow/__tests__/review-decision.test.ts:46 | `makeFixture` options declare `meta?: Record<string, unknown>` and `reviewed?: boolean` without the explicit `\| undefined` the documented rule requires for optional properties. |
| LOW | vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:6494 | `savedEntry` declares its optional properties (`author?`, `decision?`, `kind?`, `quote?`, `slug?`, `version?`, `file?`, lines 6494-6495) without `\| undefined`. This breaks the documented rule and also drifts from the same file's own idiom: `fakeClient`, `runWebview` and `loadPlace` all write `?: T \| undefined`. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/pending.ts:108 | Caveat, not a gap: the graph's testsReaching edges are hollow for this Story (every production symbol in src/workflow/pending.ts shows an empty set), so the empty edges were not treated as breaches. Checked directly instead: src/workflow/__tests__/pending.test.ts imports deriveMdPath, listPendingArtifacts and handleWorkflowPending from ../pending.js and exercises them in 13 tests, which reach the private helpers (kindFromFilename, toDescriptor, buildRecordMdPath, deriveWorkItemId, deriveTitle, str) transitively. Running that file gave 13 pass, 0 fail. The other changed files are test files only; artifact-content.test.ts, review-decision.test.ts and vscode-plugin docs-review-panel.test.ts were not run here, so their pass-state is unverified. |

## quality — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/pending.ts:123 | Correctness risk: a BUILD record is surfaced as awaiting approval on the mere PRESENCE of a same-named `CR-…json` filename in the directory listing. The CR file is never parsed here, so a zero-byte, truncated (mid-write) or malformed CR record — which the loop itself would skip with a warning when it reaches that file — still unlocks its BUILD for the pending list. The comment's premise ("its Story's code review has run") is asserted from a filename, not from a readable record carrying a verdict. Consider requiring the CR file to parse (and carry a verdict) before listing the BUILD. |
| LOW | src/workflow/pending.ts:227 | Duplication: `deriveMdPath` repeats the same hash resolution (`epicHash ?? specHash ?? issueHash`), the same createdAt resolution (`epicCreatedAt ?? createdAt`), the same undefined guard and the same guarded `deriveWorkItemIdentity(hash, createdAt, storyId)` call that `deriveWorkItemId` performs at lines 200-208. `toDescriptor` calls both for every artifact, so the identity is derived twice and the two anchor-precedence rules can drift apart. One shared helper returning the identity (or undefined) would serve both. |
| LOW | src/workflow/pending.ts:191 | Unhandled/silent error path: `buildRecordMdPath` swallows any open/read failure of the BUILD.md (EACCES, EISDIR, EMFILE) with a bare `catch { return ''; }` and no log, unlike the malformed-artifact path at line 129 which warns. The record is then listed with an empty path indistinguishable from the two documented legacy shapes, so a real I/O fault is undiagnosable. A `log.warn` here would match the file's own convention. |
| LOW | src/workflow/pending.ts:135 | Correctness edge: pending-ness is decided only when `approvedAt` / `rejectedAt` is a non-empty STRING. A record stamped with any other truthy shape (a numeric epoch, a Date-serialised object) is treated as still pending and re-listed for approval. Safe only as long as every writer stamps an ISO string; the check does not defend that assumption. |
| LOW | src/workflow/__tests__/review-decision.test.ts:69 | Duplication (test helper): the one-line `cleanup(repo)` (`rmSync(repo, { recursive: true, force: true })`) is defined identically in artifact-content.test.ts:58 and again in pending.test.ts:48, and the `Fixture` / `makeFixture` temp-repo scaffolding is re-declared per file. A shared test-fixture helper would remove three copies; not a blocking risk. |

