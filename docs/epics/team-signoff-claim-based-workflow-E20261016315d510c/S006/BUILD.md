<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:33:11.671Z

**Commit:** d66c692a

## Summary

New src/workflow/team/handoff.ts (pure; no git, tracker or store): DEFAULT_BRANCH_PATTERN 'insrc/handoff/{type}-{id}'; handoffBranchName(pattern, unit, slug) validates the pattern with the existing validateBranchPattern grammar, requires {id}, fills {id} (epic hash, plus '-<storyId>' for a Story), {type} (epic|story) and a lower-cased branch-safe {slug}, then refuses a result that is empty, over 200 characters, has disallowed characters, a leading/trailing/doubled slash (an empty slug), '..', a '.lock' or trailing '.' or a dot-leading part; the HandoffCheckpoint types (RunCheckpoint with runId, epicKey, stage, intent without repoPath/repoIndexedAt, executor without intent at awaiting_llm_step, stepOutputs at awaiting_synthesize, owner, upstream; DraftCheckpoint; common schemaVersion 1, unit, parkedBy, parkedAt, sourceHead, repositoryId, artifactPaths); isUnitArtifactPath (only the unit's own .insrc/artifacts JSON ids, or markdown in the unit's work-item folder, with the Story's S<nnn> folder for a Story and not a Story folder for an Epic; absolute paths, '..' and backslashes are never the unit's); validateCheckpoint (schema version, kind, unit match incl. storyId, string fields, every parked path, and for runs the stage, intent with no machine paths, upstream list, executor iff awaiting_llm_step, stepOutputs iff awaiting_synthesize), each failure naming the field; rebindCheckpoint (version 1 payload with startedAtMs = now, repoPath and repoIndexedAt on the payload intent AND on the executor intent, executor/stepOutputs by stage); inferStageWorkflow (Epic: HLD present means complete else design.epic; Story: no LLD design.story, LLD without PLAN plan, both complete). repo-fields.ts: the branchPattern row gets default 'insrc/handoff/{type}-{id}', a description that says a parked draft goes to it and {id} is required, and loses the not-used-yet note (grammar unchanged). handoff-pure.test.ts has the three named tests. Because that row is pinned elsewhere I updated the shared fixture src/config/__tests__/fixtures/repo-fields-catalog.json, repo-fields.test.ts and settings-modal.test.ts (branchPattern now has no note and has the default); config 149, cli, daemon repo-settings and team suites pass; tsc clean. Note for the IDE repo: it mirrors that fixture.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:33:11.671Z)
