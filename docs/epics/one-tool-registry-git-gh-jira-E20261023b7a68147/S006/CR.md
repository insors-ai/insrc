<!-- insrc:artifact CR-b7a68147dcf72034-s6 -->

# Code review: b7a68147dcf72034:s6

⛔ **BLOCK** — HIGH 1 · MED 10 · LOW 8 · model `codex:gpt-6.1-sol`

**Changed files:** 69

**Reviewed on the diff:** the wait for a fresh index timed out after 121 s (code-index job in flight: no; queued: 0; stale files: src/daemon/tools/builtins/jira/__tests__/jira-inputs.test.ts, src/daemon/tools/builtins/jira/__tests__/fixtures/README.md, src/daemon/tools/builtins/jira/__tests__/fixtures/auth-status-unauthorized.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/auth-status.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/batch-clone.json, src/daemon/tools/builtins/jira/__tests__/fixtures/batch-edit-success.json, src/daemon/tools/builtins/jira/__tests__/fixtures/batch-missing-key.json, src/daemon/tools/builtins/jira/__tests__/fixtures/batch-no-transition.json, src/daemon/tools/builtins/jira/__tests__/fixtures/batch-partial.json, src/daemon/tools/builtins/jira/__tests__/fixtures/count.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/visibility-group.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/visibility-role.txt, src/daemon/tools/builtins/jira/__tests__/jira-parsers.test.ts, src/daemon/tools/builtins/jira/__tests__/_fakeacli.ts, src/daemon/tools/builtins/jira/__tests__/jira-argv.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-failures.test.ts, src/daemon/tools/builtins/jira/__tests__/fixtures/attachment-list.json, src/daemon/tools/builtins/jira/__tests__/fixtures/comment-list.json, src/daemon/tools/builtins/jira/__tests__/fixtures/comment-update-bad.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/comment-update.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/link-delete.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/link-list.json, src/daemon/tools/builtins/jira/__tests__/fixtures/link-types.json, src/daemon/tools/builtins/jira/__tests__/fixtures/watcher-list.json, src/daemon/tools/builtins/jira/__tests__/jira-answers.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-output-schemas.test.ts, src/daemon/tools/builtins/jira/__tests__/_sample.ts, src/daemon/tools/builtins/jira/__tests__/jira-approval.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-family.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-output-validation.test.ts, src/daemon/tools/builtins/jira/__tests__/fixtures/search.json, src/daemon/tools/builtins/jira/__tests__/fixtures/view.json, src/daemon/tools/builtins/jira/__tests__/jira-workitem-reads.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-workitem-changes.test.ts, src/daemon/tools/builtins/jira/__tests__/fixtures/batch-comment-create.json, src/daemon/tools/builtins/jira/__tests__/jira-comment-link.test.ts, src/daemon/tools/builtins/jira/__tests__/fixtures/project-list.json, src/daemon/tools/builtins/jira/__tests__/fixtures/project-view.json, src/daemon/tools/builtins/jira/__tests__/jira-project-auth.test.ts, src/daemon/tools/builtins/jira/__tests__/_all-ops.ts, src/daemon/tools/builtins/jira/__tests__/jira-coverage.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-parser.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-registration.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-spawn-only.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-docs.test.ts, src/daemon/tools/builtins/jira/__tests__/jira-live.test.ts, src/daemon/tools/builtins/jira/__tests__/fixtures/project-archive.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/project-create.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/project-delete.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/project-restore.txt, src/daemon/tools/builtins/jira/__tests__/fixtures/project-update.txt, docs/plans/acli-recorded/jira-live-run-2026-10-26.txt)

## adherence — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/daemon/tools/builtins/jira/workitem.ts:103 | Clone requires toProject and rejects calls that omit it, although the approved contract declares toProject optional. The live CLI requirement explains the implementation choice but does not satisfy the approved input contract. |
| MED | src/daemon/tools/builtins/jira/project.ts:61 | Mutation readers accept operation-specific text without a success mark and reject a mark alone. This departs from the approved requirement that create, update, restore, archive and delete readers accept the success mark only. Recorded live output satisfies the probe requirement but does not amend that reader contract. |
| MED | src/daemon/tools/builtins/jira/schemas.ts:25 | Both visibility properties are optional, so an empty object passes validation despite containing neither approved answer shape. Require either groups or roles so callers receive the requested visibility data. |
| MED | src/daemon/tools/builtins/jira/project.ts:45 | Project mutations use patternAnswer, which accepts operation-specific success text without a check mark. This affects create, update, archive, restore and delete: an exit-0 response lacking the required mark can set ok instead of rejecting with ToolFailure and retaining stdout in original. Require the check mark before accepting these results. |
| MED | src/daemon/tools/builtins/jira/answers.ts:17 | For an unreadable answer longer than 2000 characters, rejected() truncates stdout before storing it in failure.original. This loses the raw text required by the clause, potentially removing the malformed row or JSON content needed to diagnose the failure. Preserve the complete raw answer in original. |
| MED | src/daemon/tools/builtins/jira/workitem.ts:13 | withValues removes every top-level null property from work-item view and search results. Extra REST properties with null values therefore disappear instead of passing through as unknown, as required. |
| MED | src/daemon/tools/builtins/jira/project.ts:19 | brief retains only key, id and name in project list and view results, discarding all extra REST properties, including null values. The clause requires those properties to pass through as unknown. |
| MED | src/daemon/tools/builtins/jira/__tests__/jira-live.test.ts:152 | The probe records archive output before updating `archived`. If the archive succeeds but writing its fixture throws, `finally` sees `archived === false`, skips restore, and attempts to delete an archived project, which Jira refuses. This leaves the scratch project behind, contrary to the requirement to delete it even if a step fails. Update cleanup state before the fallible recording operation. |

## conventions — 8 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/daemon/tools/builtins/jira/coverage.ts:12 | Optional toolIds omits the explicitly required `\| undefined`. |
| LOW | src/daemon/tools/builtins/jira/coverage.ts:13 | Optional op omits the explicitly required `\| undefined`. |
| LOW | src/daemon/tools/builtins/jira/coverage.ts:14 | Optional reason omits the explicitly required `\| undefined`. |
| LOW | src/daemon/tools/builtins/jira/answers.ts:16 | Optional original parameter omits the explicitly required `\| undefined`. |
| LOW | src/daemon/tools/builtins/jira/answers.ts:26 | Optional clone property omits the explicitly required `\| undefined`. |
| LOW | src/daemon/tools/builtins/jira/input.ts:43 | Optional type and items properties omit the explicitly required `\| undefined`. |
| LOW | src/daemon/tools/builtins/jira/readers.ts:89 | AuthStatus's optional site, email and authType properties omit the explicitly required `\| undefined`. |
| LOW | src/daemon/tools/builtins/jira/__tests__/_fakeacli.ts:33 | The options type's optional stdout, probe and exit properties omit the explicitly required `\| undefined`. |

## coverage — 0 finding(s)

_No findings._

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/daemon/tools/builtins/jira/__tests__/jira-live.test.ts:136 | The preflight treats every failed view as proof that the scratch key is free. A network or permission failure can hide an existing project; create then fails, but the unconditional cleanup attempts to delete that existing project. Require positive evidence of absence before enabling cleanup. |
| MED | src/daemon/tools/builtins/jira/exec.ts:15 | The new local bytesToText duplicates the UTF-8 capture conversion previously imported from gh/helpers.js. Maintaining two implementations risks divergent handling of truncated multibyte output; retain the existing shared helper. |
| MED | src/daemon/tools/builtins/jira/__tests__/jira-live.test.ts:79 | Temporary work item cleanup ignores the delete result. A refused or timed-out deletion lets the read test pass while leaving the item behind without reporting cleanup failure. Assert the cleanup result and include the item key in the failure. |

## diagram — 0 finding(s)

_No findings._

