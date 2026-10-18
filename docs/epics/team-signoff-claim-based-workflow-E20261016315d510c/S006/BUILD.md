<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T18:18:11.224Z

**Commit:** 2ff7cd6b

## Summary

The one open check was the ordering of the identity check against the fetch. What can be known before the fetch is whether the receiving path HAS an identity; what it must equal (the checkpoint's repositoryId) is written inside the checkpoint on the handoff branch, so the comparison cannot precede reading the checkpoint, and no design that keeps the identity in the checkpoint can do otherwise. verifyReceivingRepo now enforces everything that can be done up front: it is the first step after the Task check, before the claims check, the stage, the gate and any remote access, and it now always requires the repository to have an identity of its own (a git repository with history, from rev-list --max-parents=0 HEAD), refusing 'is not a git repository with history' even when it is called without an id; the comparison with the checkpoint's id happens right after the checkpoint is read, which is before any file is restored and after only a fetch into a temporary ref that is always dropped (fetched by URL with --no-write-fetch-head, so no remote-tracking ref, FETCH_HEAD or working file changes; the tests assert refs, status and FETCH_HEAD are identical afterwards, including for the different-repository clone). The first named test gains a registered but history-less repository (git init with an origin remote) and a plain directory, both refused before the remote is touched (refs, status and FETCH_HEAD unchanged), in addition to the unregistered, registry-down, different-repository, moved-upstream cases it already had. The docstring of resumeCheck states this order. Team suite passes; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/s6-open-issues.md` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/__tests__/handoff-park-plan.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/__tests__/handoff-park.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/__tests__/handoff-resume-check.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T18:18:11.224Z)
