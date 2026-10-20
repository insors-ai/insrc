<!-- insrc:artifact CR-2f27754d4ad00b8e-s1 -->

# Code review: 2f27754d4ad00b8e:s1

⛔ **BLOCK** — HIGH 1 · MED 1 · LOW 2 · model `codex:gpt-6-astra`

**Changed files:** 176

**Reviewed on the diff:** the wait for a fresh index timed out after 135 s (code-index job in flight: no; queued: 0; stale files: package-lock.json, src/workflow/runners/build/__tests__/admit-build.test.ts, src/workflow/runners/build/__tests__/build-record.test.ts, src/workflow/runners/build/__tests__/completion-anchor.test.ts, src/workflow/runners/build/__tests__/completion-record.test.ts, src/workflow/runners/build/__tests__/range-base.test.ts, src/workflow/runners/build/__tests__/record-intent.test.ts, src/workflow/runners/build/__tests__/standalone-record-commit.test.ts, src/workflow/runners/build/__tests__/test-record-revision.test.ts, src/workflow/runners/build/__tests__/test-record.test.ts, src/workflow/runners/build/completion-record.ts, src/workflow/runners/build/own-files.ts, src/workflow/runners/build/standalone-record.ts, src/workflow/runners/build/test-record.ts)

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/__tests__/anchor-folders.test.ts:120 | The new delivery assertions require IDs such as E20261001c0ffee00:S001. This pins the removed work-item scheme instead of the approved EPIC-/STORY- artifact IDs and would reject a delivery graph using the unified identity scheme. Update the grouping assertions to use artifact IDs while checking the anchor separately. |
| LOW | docs/workflow.md:297 | The hash documentation introduces an exception allowing SPEC and ISSUE hashes of at least 8 characters. The approved contract requires 16 lowercase hex characters for these kinds too; their distinction is that they use their own run hash. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/__tests__/anchor-producers.test.ts:65 | The new Meta type declares createdAt?: string and epicCreatedAt?: string without explicit `\| undefined`. Add it to both optional properties to follow the documented strict optional-property convention. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/artifact-ids.ts:1 | Every supplied changed symbol has an empty testsReaching array, so each is a not-exercised gap under the required coverage rule. All 34 promised tests are present and recorded as passing; those results do not establish the missing reachability edges. This finding concerns the supplied coverage grounding, not an assertion that those tests are missing or failing. |

## quality — 0 finding(s)

_No findings._

