<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:17:17.485Z

**Commit:** fbb57f00

## Summary

New src/workflow/team/run-meta.ts holds UpstreamRevision, RunEntryMeta (re-exported by state-store.ts, which no longer defines them), snapshotUpstream(repo, workflow, params) and runMetaFor(repo, workflow, params). snapshotUpstream: design.epic reads the Define; design.story the Define and the effective HLD; plan the Story LLD, the effective HLD and the Define (the binding build requirement s6-R3-1); revisions come from readRevision so a missing or unreadable file reads as 0; the effective HLD entry is keyed '<HLD id>@<effective hash>' (getEffectiveHash over the base HLD and the approved amendments) with the base revision, so approving an amendment changes the entry and a pending one does not; with no HLD file the entry is the plain id at revision 0, so a standalone Story (no Define or HLD) never fails; no epicHash gives []. runMetaFor returns undefined unless claimsEnforcedFor(repo) is 'yes', else { owner: actingUser(repo), upstream }. gate.ts gains actingUser(repo): the tracker login (whoAmI after loadTracker with the claim capability) when claims are enforced, else undefined with no tracker call, never throwing. handleStart now calls encodeState(state, runMetaFor(repoPath, input.workflow, params)); plan.ts and step.ts already use reencodeState, which carries the meta (t2). Tests: snapshot-upstream.test.ts (2 tests) shows the artifacts per workflow, revisions incl. a missing one as 0, pending vs approved amendment effect on the effective HLD entry, a standalone Story, actingUser and runMetaFor with and without a policy and a failing tracker; handoff-ownership.test.ts drives the real handleWorkflowStep: a plan run's stored entry has owner alice and the LLD(7)/HLD(5)/Define(3) snapshot, a stub run's owner survives the plan turn onto the new token (old token gone), and a no-policy repo stores meta undefined with zero tracker loads. Suites: workflow-step 74, team 76, daemon 295 pass; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:17:17.485Z)
