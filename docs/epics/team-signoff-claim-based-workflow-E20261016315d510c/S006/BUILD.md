<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:43:59.622Z

**Commit:** e36c49ef

## Summary

New src/daemon/steps/workflow-step/park-offer.ts: hasUnparkedWork(repo, unit, actor) is true when listStates holds a run whose meta.owner equals the actor (case-insensitive), whose intent maps through authorUnitOf to the same repo (resolved), unit kind, epic hash and story id, in any stage (awaiting_plan, awaiting_llm_step, awaiting_synthesize); or, for an Epic or Story unit, when unitDraftFiles(repo, unit) finds a changed, staged or untracked artifact of the unit; a run with no meta, no owner or another owner never counts; it never throws. registerParkOffer() registers it with the gate through registerParkOfferProvider, and stepToolTable() in src/daemon/steps/host.ts (where the daemon builds its step tools and already registers the workflow runners) calls it, so it is registered at daemon startup. handoff.ts gains unitDraftFiles (git status --porcelain=v1 -z --untracked-files=all over .insrc/artifacts and docs, rename entries handled, filtered by isUnitArtifactPath), which park will reuse. park-offer.test.ts's second test (named in the plan) calls stepToolTable() to get the registration, uses a real temporary git repo and the real state store and gate (fake tracker with bob as holder, actor alice): no work gives offerPark false; an owned run in each of the three stages gives true (and ALICE owner too); no meta, empty meta, another owner, another story, another repo and a non-claim-unit workflow give false; an untracked LLD json gives true, committed gives false, modified gives true again, an untracked PLAN.md in the Story's folder gives true, committed false, an unrelated changed docs file gives false; and handleWorkflowStep start for the held plan returns team-gate-refused whose message matches 'held by bob; ... team park <epicHash> [storyId]' with an owned run, and exactly 'held by bob' without one. Suites: steps 387, team 80 pass; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:43:59.622Z)
