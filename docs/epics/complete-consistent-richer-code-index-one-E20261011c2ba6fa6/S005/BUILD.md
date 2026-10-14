<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-14T04:19:19.274Z

**Commit:** ad942c86

## Summary

Shipped s5: the installed daemon was updated to e5e374b5 and restarted with no store migration and no re-index. Smoke 1 first failed on the step tool (it announced XL for an unindexed path), fixed as ISSUE-7c255f61, then passed; smoke 2 and 3 passed on a reindex of AFM. Results in S005/smoke.md.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`
- ✓ `t13`
- ✓ `t14`
- ✓ `t15`
- ✓ `t16`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-0c845762241ba26c.json` — **insrc-build** (2026-10-14T04:19:19.274Z)

## Feedback

- **subho@insors.io (decision, recorded by the controller)** (2026-10-14T04:19:17.181Z) `comment` — `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S005/CR.md`: Story s5 BUILD approved with the code review's warn verdict (stakeholder decision 2026-10-14, after 3 daemon review rounds). Round 1 (0/3/16): cache hit vs miss rule, duplicated under-index rule and five real LOWs fixed in 96d4c105. Round 2 (0/5/8): cancellation wrapped as a failed model call (plus complete() retrying an abort and the retry helper rewriting it) and a cache hit skipping the not-indexed check fixed in e0edb0bb; the executePlan catch and two 'smoke not visible' MEDs judged not defects. Round 3 (0/3/11) accepted: MED driver.ts:373 (docs not refused at runShaper) is ISSUE-0c845762; MED handler.ts:123 (a 'repo-indexing' refusal for a FAILED last index is marked retryable) and MED ollama.ts:774 (Ollama request errors such as a 400 now read as an outage) are filed together as one bugfix. All LOWs accepted as they stand, and the plan's wording that a generic run under index is refused is accepted as superseded by the LLD's edge case (generic is not checked), which the code follows. Smoke results: S005/smoke.md.
