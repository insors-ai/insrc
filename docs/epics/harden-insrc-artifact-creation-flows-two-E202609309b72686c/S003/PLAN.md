<!-- insrc:artifact PLAN-9b72686c1746af2b-s3 -->

# Plan: E202609309b72686c:S003

## Summary

**Epic:** `harden-insrc-artifact-creation-flows-two`
**LLD run:** `wf-1790754396835-tpowdp`
**LLD effective hash:** `a96cc61752b7...`

Building S003 is a small, single-file change to src/workflow/runners/build/standalone-record.ts: add an additive optional BuildRecord.body.summary and a `## Summary` omit-slot section to renderPlanBuildRecordMd, mirroring the existing `## Changes`/`## Feedback` sections. The in-cycle feedback capture needs no new code — the existing append-only appendFeedback writer already appends to the BUILD json and the renderer already shows `## Feedback`. The tests prove the summary renders + persists, feedback accretes via appendFeedback, the upsert preserves a prior summary, and a record with neither is byte-identical to today.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add BuildRecord.body.summary + the `## Summary` omit-slot render section | S | — | smoke: smoke: npx tsc --noEmit is clean after adding body.summary + the `## Summary` omit-slot section | [[c1]] [[c2]] |
| 2 | **`t2`** Add unit + integration tests for the summary render + in-cycle feedback capture | S | `t1` | unit: unit: renderPlanBuildRecordMd with body.summary set -> `## Summary` present; empty/whitespace or absent -> no section; unit: unit: renderPlanBuildRecordMd with a summary XOR feedback -> only the present section renders; unit: unit: renderPlanBuildRecordMd with neither summary nor feedback -> byte-identical to the pre-S003 golden render; integration: integration: persistBuildRecord with body.summary -> json carries summary + md renders `## Summary` (ac1); integration: integration: appendFeedback against the persisted BUILD json -> body.feedback accretes + md renders `## Feedback` (ac2); integration: integration: a re-validate that omits body.summary -> mergeWithPrior preserves the prior summary; integration: integration: persistBuildRecord with neither summary nor feedback -> md byte-identical to today (ac3); smoke: smoke: npx tsx --test 'src/workflow/**/*.test.ts' + the build-step suite run green | [[c3]] [[c4]] |

### 1.1 E202609309b72686c:S003:T001 — Add BuildRecord.body.summary + the `## Summary` omit-slot render section

In src/workflow/runners/build/standalone-record.ts: (a) add `readonly summary?: string | undefined` to the BuildRecord.body interface (additive, optional); (b) in renderPlanBuildRecordMd add a `## Summary` section pushed ONLY when rec.body.summary is a non-empty (trimmed) string, mirroring the existing `## Changes`/`## Feedback` omit-slot pattern, positioned reader-first (after the header/commit line). Do NOT touch mergeWithPrior (its {...prior.body, ...rec.body} already carries the new field and preserves an omitted one) or the S002-owned standalone resolution. In-cycle feedback needs NO new code — the existing appendFeedback writer already appends to the BUILD json and renderPlanBuildRecordMd already renders `## Feedback`.

**Acceptance checks:**
- BuildRecord.body has an additive optional `summary?: string` field; every existing record json stays valid (no data rewrite)
- renderPlanBuildRecordMd emits a `## Summary` section carrying the narrative only when body.summary is a non-empty string; an empty/whitespace or absent summary emits no heading
- A record with neither summary nor feedback renders byte-identically to the pre-S003 output (k4)
- mergeWithPrior, the persistBuildRecord signature, and the S002-owned standalone resolution are unchanged (sc1 consumed as-is); npx tsc --noEmit is clean

### 1.2 E202609309b72686c:S003:T002 — Add unit + integration tests for the summary render + in-cycle feedback capture

Add tests (node:test / tsx --test, assert/strict), e.g. src/workflow/runners/build/__tests__/build-record-enrichment.test.ts. Unit: renderPlanBuildRecordMd over hand-built BuildRecords — summary set -> `## Summary` present; empty summary -> no section; summary XOR feedback -> only the present section; neither -> byte-identical golden. Integration (reuse the build-step.test.ts persist harness): persistBuildRecord with body.summary -> json carries summary + md renders `## Summary` (ac1); appendFeedback against the persisted BUILD json -> body.feedback accretes + md renders `## Feedback` (ac2); a re-validate omitting body.summary -> mergeWithPrior preserves the prior summary; persistBuildRecord with neither -> md byte-identical to today (ac3).

**Acceptance checks:**
- Unit tests cover the `## Summary` omit-slot (present / empty / XOR / byte-identical golden) [ac1, ac3]
- Integration tests prove persistBuildRecord writes+renders a summary [ac1], appendFeedback on the persisted BUILD json captures feedback + renders `## Feedback` [ac2], the upsert preserves a prior summary, and the neither-present record is byte-identical [ac3]
- The full workflow + build-step test sweeps run green

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderPlanBuildRecordMd with body.summary set -> a `## Summary` section carrying the narrative is present | `t2` |
| renderPlanBuildRecordMd with body.summary = '' (empty/whitespace) -> NO `## Summary` section (omit-slot) | `t2` |
| renderPlanBuildRecordMd with a summary XOR feedback -> only the present section renders | `t2` |
| renderPlanBuildRecordMd with neither summary nor feedback -> byte-identical to the pre-S003 render (golden string compare) | `t2` |
| persistBuildRecord with body.summary -> the json carries body.summary and the .md renders `## Summary` (ac1) | `t2` |
| appendFeedback against the persisted BUILD-<hash>-<storyId>.json -> body.feedback accretes the entry and the .md renders `## Feedback` (ac2) | `t2` |
| persistBuildRecord then a re-validate that omits body.summary -> mergeWithPrior PRESERVES the prior summary (upsert) | `t2` |
| persistBuildRecord with neither summary nor feedback -> the .md is byte-identical to today (ac3); fail-open on a persist error is unchanged (k5) | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails + dataModelChanges — the additive BuildRecord.body.summary field + the `## Summary` omit-slot in renderPlanBuildRecordMd (standalone-record.ts)` — "Add readonly summary?: string; renderPlanBuildRecordMd pushes `## Summary` only when non-empty, mirroring `## Changes`/`## Feedback`; mergeWithPrior + persistBuildRecord signature unchanged."
- **[[c2]]** `prior-artifact` `LLD s3 migration + invariantsToPreserve — additive omit-slot, byte-identity (k4), fail-open (k5), sc1 consumed unchanged` — "A record with neither summary nor feedback renders byte-identically to today; the S002-owned merge/resolution + persistBuildRecord signature are consumed unchanged."
- **[[c3]]** `prior-artifact` `LLD s3 contractDetails (appendFeedback) + errorPaths — in-cycle feedback captured via the existing append-only appendFeedback writer against the persisted BUILD json (fail-open)` — "appendFeedback appends body.feedback=[...existing,entry]; S003 reuses it in-cycle; renderPlanBuildRecordMd already renders `## Feedback`."
- **[[c4]]** `prior-artifact` `LLD s3 testStrategy — unit render tests + integration persist/summary + appendFeedback capture + byte-identity golden, extending build-step.test.ts` — "Unit render omit-slot tests + integration persist-summary + appendFeedback-on-BUILD-json + upsert-preserve + byte-identical golden."
