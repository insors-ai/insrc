<!-- insrc:artifact BUILD-a5d5b2bb021655d0-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-27T14:35:22.914Z  ·  **Updated:** 2026-11-28T03:51:26.770Z

**Commit:** eb47d3528

## Summary

Implemented a fixed opt-in slow-vm timing policy across coordinator, manager, worker, Git, runtime I/O, resource drains and CI/operator containment while preserving normal numeric defaults, exact integrity, wire formats and ownership proof. Repeated drains share a cumulative ceiling and independently reobserve closure. Tasks1–6 are accepted, including actual fresh UTM Node22.22.1/npm10.9.4 live acquisition, zero-network reuse and native-consumer qualification with independent parent/worker closure. Final current-source scoped regression passed306 tests across67 files:284 tests in62 canonical files plus22 tests in5 direct serial controller files, with zero failures/cancellations/skips/todo. Independent audit verifies exact coverage, all16 LLD subjects, unchanged source/output fingerprints and all71 canonical plus48 controller command-group closures. The first normal-cap attempt remains failed/incomplete with verified cleanup; the full rerun used declared40-minute file/4-hour run bounds and repeated all62 canonical files. Approved separate ISSUE-e1aed06b860a76cb reconciled two stale controller test files; production inputs are otherwise identical to the UTM source. Evidence committed in eb47d3528; test source b06fb951d955e707408c246011a4c61aa1bd6ee0 remains byte-identical. Earlier isolated stale controller attempt remains blocked and untouched outside current main-checkout runs. No host daemon/Ollama update or activation, release enablement, current Linux/Windows qualification or foundation/S4 completion is claimed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `copy-assets.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-time-budgets.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/qualification-time-budgets.d.mts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/qualification-time-budgets.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t1.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t2.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `scripts/test-harness/context.d.mts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `scripts/test-harness/context.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `scripts/test-harness/process.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/dev-source-fixture.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/dev-toolchain-fixture.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/dev-toolchain.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/installed-dev-fixture.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-scopes.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/dev-git.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/dev-manager-fixture.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-manager.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t3.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-runtime-fixture.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-runtime.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/download.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/runtime-acquire.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/runtime-archive.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/runtime-metadata.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t4.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-worker-fixture.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-worker.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/dev-delivery.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/dev-worker.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.github/workflows/ci.yml` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t5.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/testing.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `scripts/__tests__/qualification-containment-fixture.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `scripts/__tests__/qualification-containment.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `scripts/qualification-containment.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `scripts/qualify-runtime-foundation.mjs` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `src/installer/__tests__/qualification-installed.test.ts` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-prerequisite.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-actual-budgets.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-audit.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-native-result.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-retired-vm-closure.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-supervisor.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/EPIC-a5d5b2bb021655d0.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/EPIC-a5d5b2bb021655d0.log.jsonl` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/ISSUE-a5d5b2bb021655d0.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/ISSUE-a5d5b2bb021655d0.log.jsonl` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASK-a5d5b2bb021655d0-s1-t1.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASK-a5d5b2bb021655d0-s1-t2.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASK-a5d5b2bb021655d0-s1-t3.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASK-a5d5b2bb021655d0-s1-t4.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASK-a5d5b2bb021655d0-s1-t5.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASK-a5d5b2bb021655d0-s1-t6.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASK-a5d5b2bb021655d0-s1-t7.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASKS-a5d5b2bb021655d0-s1.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `.insrc/artifacts/TASKS-a5d5b2bb021655d0-s1.log.jsonl` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/ISSUE.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/component-dependency.html` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-canonical-result.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-child-admissions.jsonl` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-child-disposals.jsonl` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-child-results.jsonl` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-cleanup.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-controller.tap` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-dev-complete-payload.tap` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-foundation-payload.tap` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-lld-subject-trace.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-normal-budget-failure.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-prepared.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-regression-audit.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-results.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7-selection.json` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t7.md` — **insrc-build** (2026-11-28T03:51:26.770Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/sequence-diagram.html` — **insrc-build** (2026-11-28T03:51:26.770Z)
