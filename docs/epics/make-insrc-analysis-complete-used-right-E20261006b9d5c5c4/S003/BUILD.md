<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-08T07:25:11.022Z  ·  **Updated:** 2026-11-08T12:11:24.206Z

**Commit:** 25568cc00

## Summary

Whole-Story verification. (1) provider-failure-kinds.test.ts now checks all four adapters (Claude, Codex, Vibe CLI; Ollama) through the real aggregator after every caller moved: a single-pass outage keeps the 'aggregator-llm-unavailable:' prefix (Vibe included) with the original as cause; a divided call ends typed model-failed or invalid-answer with no prefix; Ollama part calls carry num_predict 8,192 and a single pass the configured tokens. (2) The full sweep was run in foreground chunks and compared with a clean checkout of the commit before any s3 code: analyze 2 failures, identical to base (role-router-global-tiers, allowlisted seam files); daemon 48 failing files, identical counts to base (one fewer failing test on this tree); agent, shared, config, indexer, cli, workflow (30 failing files) identical to base; mcp 23 vs 25 failing (fewer on this tree); db has three slow/pre-existing failures also at base; docgen/design/artifact-theme/bin pass. The sweep found and this task fixed three regressions of this Story: an overridden synthesize step must win over the real answer step (driver), one part with one reference round is asked as the one reply, and an import cycle between handling.ts and driver.ts (the answer-step errors now live in a leaf module). (3) The live regression test docs-broad-live.test.ts is written (gated by INSRC_LIVE_TESTS=1, goes through the daemon, records docs/epics/.../S003/LIVE-RUN.json) but NOT run: the running daemon is the installed clone and does not contain this code until the user pushes and updates it. It is therefore not reported.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✗ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`
- ✓ `t13`
- ✗ `t14`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/analyze/__tests__/handling-contract.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/__tests__/handling-report.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/completeness.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/failure-contract.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/failure-data.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/model-failure.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/failure-data.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/model-failure.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/explore/lookup-failed.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/handling-admission.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/handling-table.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/part-output-cap.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/handling.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/partition-sections.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/section-envelope.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/sections.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/dependency-table.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/shared-context.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/dependency.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/handling-call.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/provider-failure-kinds.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/handling-call.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/partition-combine.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/handling-adapters.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/handling-parts.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/shared/aggregator.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/synthesize-driver-handling.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/synthesize-handling.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/synthesizer.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/agent/read-only-tool-loop.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/freeform-handling.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/final-emit.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/explore/executor.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/explore/freeform-probe.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/explore/types.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/__tests__/aggregate-absent-inputs.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/__tests__/aggregate-failure.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/__tests__/aggregate-fixtures.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/__tests__/aggregator-handling.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/__tests__/docs-aggregate-run.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/shared/__tests__/aggregator.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/runtimes/shared/aggregate-types.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/executor/index.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/executor/plan-sources.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/orchestrator/__tests__/aggregate-failure.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/orchestrator/__tests__/nested-aggregate-failure.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/orchestrator/__tests__/run-handling-report.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/orchestrator/__tests__/run-measure.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/orchestrator/driver.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/orchestrator/__tests__/docs-aggregate-run.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/__tests__/answer-failure-mapping.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/analyze-rpc.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/answer-progress.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/__tests__/step-tool-overload.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/__tests__/step-tool-parts.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/analyze-step/answer-turn.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/analyze-step/phases/bundle.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/analyze-step/phases/narrow.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/analyze-step/phases/plan.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/analyze-step/state.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/daemon/steps/analyze-step/types.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/context/answer-step-error.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
- `src/analyze/orchestrator/__tests__/docs-broad-live.test.ts` — **insrc-build** (2026-11-08T12:11:24.206Z)
