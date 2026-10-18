<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:35:02.752Z

**Commit:** 708e09d9

## Summary

Both findings fixed. (1) isUnitArtifactPath now accepts only a path already in normal form: posix.normalize(path) must equal the path and no segment may be empty, '.' or '..' (plus the existing absolute, drive-letter and backslash refusals), so 'docs/epics/<item>/./S001/LLD.md', '<item>//S001/LLD.md' and '.insrc/artifacts/./<id>.json' are refused; the checkpoint test lists those four forms for both the run and the draft variant, and the draft variant now also has its own kind, storyId-mismatch, epic-vs-story and empty-field cases. (2) inferStageWorkflow now counts an artifact only when it is committed at HEAD (git cat-file -e HEAD:<relative path> through runGit), so a draft that exists only in the working tree is not a completed stage. The named test runs in a real temporary git repository: an HLD present but uncommitted still gives design.epic, committing it gives complete; a committed LLD gives plan; an uncommitted PLAN still gives plan; committing it gives complete; an Epic being complete does not complete a Story. Everything else is as submitted; the handoff-pure test (3 tests) passes and tsc is clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:35:02.752Z)
