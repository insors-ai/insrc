<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:46:56.854Z

**Commit:** bb85e188

## Summary

Both gaps closed. Startup: src/daemon/index.ts now imports registerParkOffer and main() calls it right after installStepDaemonClient(...) before the IPC server starts (stepToolTable keeps its idempotent call too), and a new test in park-offer.test.ts checks that wiring in main(). Terminal: the CLI runs the gate in its own process with no run store, so makeServices() in src/cli/services/index.ts registers a provider there that offers on an uncommitted draft only: handoff.ts gains draftParkOffer(repo, unit) (unitDraftFiles non-empty for an Epic or Story unit, never throws), which the daemon's hasUnparkedWork also uses for its draft half. The named integration test now also drives the real terminal command: with bob holding the Story and no draft, 'team claim <hash> s1' prints exactly '✗ not claimed — held by bob'; after an untracked LLD.md appears in the Story's folder it prints '✗ not claimed — held by bob; ... team park <epicHash> [storyId]'. Everything else in that test (owned run in each stage, case-insensitive owner, no meta / empty meta / another owner / another story / another repo / non-claim-unit workflow giving false, untracked, committed, modified and markdown drafts, the workflow-step refusal text with and without an offer) is unchanged and passes. park-offer.test.ts has 3 passing tests; team suite 81 and cli 207 pass (the cli poll-interval flake aside); tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/steps/workflow-step/park-offer.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:46:56.854Z)
