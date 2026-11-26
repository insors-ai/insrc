<!-- insrc:artifact BUILD-1b3caadf04023d33-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-24T09:37:44.295Z  ·  **Updated:** 2026-11-24T11:04:19.077Z

**Commit:** 7eada8bf5

## Summary

A later Story of an Epic now starts with a complete impact analysis of what the Epic has already built, and its BUILD cannot be approved without it. (1) The daemon builds a bounded, read-only, deterministic Epic built-state digest from the other Stories' approved BUILD, TESTS and LLD records (src/workflow/epic-built-state.ts: newest 3 Stories in full at 1800 characters each, older ones as one line and a path, whole digest at most 9000 characters, null for a standalone Story, the Define's first Story, or an Epic with no other approved BUILD; unreadable records are noted, never thrown). (2) The first step of design.story and plan and both build implement prompts lead with the instruction and carry the digest; a first or standalone Story gets only the one-line 'does not apply'. (3) The controller's epicImpact analysis is carried verbatim from the first step into the LLD and the PLAN (new optional 'Epic impact analysis' section; documents without it render byte-identical to before) and synthesize rejects a later Story without a real one (src/workflow/epic-impact-gate.ts); applicability is decided at synthesize against the current records, so a first-step analysis that said 'does not apply' before a sibling BUILD was approved is replaced by a current analysis supplied in the synthesized body, and the refusal says so (review finding, fixed). (4) BUILD approval refuses a later Story's BUILD whose summary has no 'Epic impact:' paragraph of at least 80 characters naming each covered Story (checkBuildEpicImpact; skipped[] kind 'epic-impact-missing'; explicit overrideReview passes; does not apply without an approved LLD, an epicImpact, or when applies is false; an unreadable record makes it not apply); a refusal writes nothing, including for a BUILD with no record yet, which is refused before the completion hook creates its record and log (review finding, fixed). (5) Steering text in the design.story, plan and build guides plus one line in the feature route (no marker pair added), and docs/workflow.md with a test that reads the label, kind and caps from the code. Evidence: all new tests mutation-checked; per-file sweep of src/workflow (405 files) and src/daemon, src/mcp, src/shared, src/agent, src/config, src/cli (676 files) before the two review fixes: 85 files fail, and every one also fails at the commit before this Story (16e691e99), except src/daemon/__tests__/handler-runtime.test.ts, which another session's commit 59af5ba80 (tracker kind-aware persistence) broke; after the fixes the four approval suites and the epic-impact tests were re-run and pass. src/analyze, src/db, src/indexer were not swept (they import none of the changed modules). Deviations and limits, disclosed: (a) the digest takes changed files from the BUILD record's own change log, not the LLD's storyChangeSet, because the prompt builders are synchronous; (b) a Story with no BUILD record at all is left out of the digest rather than listed with a note (an unreadable or malformed record is listed with a note); (c) the build gate marks tasks t1-t6 not passed, chiefly on the inventory acceptance check ('no inventory test case fails beyond the four that already fail on a clean checkout'), which it cannot prove (no inventory results); the manual comparison above is the evidence; (d) 'every existing refusal' for the approval check is evidenced by the existing approval suites passing, not by new assertions; (e) another Claude session in the same tree stashed and reset uncommitted work twice during t3; I re-applied it and committed after every edit, so commit 5b0893e1e also holds a t2 fix; (f) this Story's own BUILD is the first of its work item, so the approval check does not apply to it.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/artifacts/formats/lld.md` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/assets/artifacts/formats/plan.md` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/epic-impact-artifacts.test.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/fixtures/epic-impact/lld.golden.md` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/fixtures/epic-impact/plan.golden.md` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/helpers/epic-impact-fixtures.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/artifacts/epic-impact.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/artifacts/format/formats.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/artifacts/lld.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/artifacts/plan.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/runners/design-story/schemas.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/runners/epic-impact-schema.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/runners/plan/schemas.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/epic-built-state-digest.test.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/epic-built-state.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/epic-impact-gate.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/runners/design-story/index.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/runners/plan/index.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/epic-impact-prompts.test.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/daemon/steps/build-step/__tests__/render.test.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/daemon/steps/build-step/phases/implement.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/daemon/steps/build-step/render.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/prompts/build/implement-task.md` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/daemon/workflow-approve.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/epic-impact-build-check.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/epic-impact-build-check.test.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/daemon/__tests__/steering-epic-impact.test.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `docs/workflow.md` — **insrc-build** (2026-11-24T11:04:19.077Z)
- `src/workflow/__tests__/epic-impact-doc.test.ts` — **insrc-build** (2026-11-24T11:04:19.077Z)
