<!-- insrc:artifact BUILD-3275fb2e9a542cd6-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-20T05:11:29.464Z  ·  **Updated:** 2026-11-20T07:03:08.903Z

**Commit:** 63177dc29

## Summary

Implemented the approved harness: exclusive checkout ownership, bounded build/test actors, prepared-build consumers, fixture cleanup, isolated compiler probes and supported commands. Recorded sequential controller and focused backend evidence, preserved native failures for Batch 17, documented blocked recovery and abrupt-death limits; qualification remains pending.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t7`
- ✓ `t5`
- ✓ `t6`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/test-harness-build-2026-11-20.md` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-baseline-2026-11-20.json` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/__tests__/test-harness.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/test-harness/context.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/__tests__/test-harness-coordinator.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/test-harness/build.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/test-harness/process.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/test-harness/run.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/__tests__/test-harness-consumers.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/__tests__/review-retirement-package.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/__tests__/shutdown-bounded.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/__tests__/shutdown-watchdog.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/shared/__tests__/daemon-process-client.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/shared/__tests__/process-broker-native.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `package.json` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/__tests__/build-script.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/__tests__/test-harness-commands.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/connection-management-regression.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/connection-test-regression.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/test-harness/specialized.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/config/__tests__/check-model-definitions.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/tools/__tests__/typecheck-config.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-consumer-results-2026-11-20.json` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/cli/services/__tests__/daemon-stop-forced.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/tools/__tests__/_proc.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/tools/__tests__/fixture-lifetime.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/__tests__/test-harness-probes.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `scripts/test-harness/probe.mjs` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `AGENTS.md` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `CLAUDE.md` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `README.md` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/failing-tests-2026-11-20.md` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-0.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-1.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-2.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-3.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-4.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-5.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-6.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-7.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/backend-results.json` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/consumer-0.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/consumer-1.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/consumer-2.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/consumer-3.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/consumer-4.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/controllers.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-evidence-2026-11-20/coordinator-followup.tap` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-harness-final-validation-2026-11-20.json` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/plans/test-remediation-batches-2026-11-20.md` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/standalone/make-test-harness-hermetic-bounded-E202611203275fb2e/S001/sequence-diagram.html` — **insrc-build** (2026-11-20T07:03:08.903Z)
- `docs/testing.md` — **insrc-build** (2026-11-20T07:03:08.903Z)
