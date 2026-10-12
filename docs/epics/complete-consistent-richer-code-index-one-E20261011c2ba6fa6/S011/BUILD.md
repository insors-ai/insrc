<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T12:21:21.982Z

**Commit:** 0dc044c9

## Summary

New src/daemon/steps/host.ts: STEP_TOOL_NAMES (the seven tools), stepToolTable (insrc_analyze -> runAnalyzeOneShot, insrc_analyze_step, insrc_workflow_step, insrc_build_step, insrc_triage -> their handlers; insrc_review_step -> handleReviewStep(args, { signal }); insrc_code_review_step -> handleCodeReviewStep(args, { ...withStepClient(DEFAULT_DEPS), signal }), which also closes the t6 gate's note that withStepClient had no production caller) and createStepCallHandler. The handler checks the tool against the table (own keys only, so '__proto__'/'toString' are unknown) and answers 'step-unknown-tool'; checks the context (cwd required, envRepo string, client claude|codex) and answers 'step-failed' when malformed; runs the tool inside runInStepContext(context) with the stream's signal; sends one 'done' frame whose data is the handler's envelope object itself, or 'step-failed' with the thrown message. src/daemon/index.ts registers 'step.call' in its stream map (dynamic import, handler built once). The four moved state stores (analyze, workflow, review incl. its update path, code-review) now say the insrc daemon was restarted and the run must be started again with phase='start'. Tests: the equivalence test runs all seven real handlers on a temporary graph and vector store, once directly and once through step.call, and compares the envelopes with only the fresh state token normalised; the cancellation test serves step.call through the real IpcServer connection handling on a temporary socket and destroys the client socket during a design-review wait and a code-review wait, and the inner review handlers see their signals abort. Falsifying mutations (no context, either signal dropped, envelope altered, a miss message reverted) each fail a test. Full sweep in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md: nothing newly failing from this task (two git-maintenance.lock flakes outside the task, 3 of 3 alone).

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

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/__tests__/in-daemon-client.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/daemon-client.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T12:21:21.982Z)
