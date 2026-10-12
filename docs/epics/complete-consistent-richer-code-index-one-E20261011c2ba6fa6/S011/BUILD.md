<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T11:58:13.894Z

**Commit:** 141bf9d7

## Summary

StepCallContext { cwd, envRepo?, client?: 'claude' | 'codex' } lives in src/shared/step-context.ts (shared because src/analyze/context/scope.ts reads it) and is carried in an AsyncLocalStorage (runInStepContext). Inside a context: the daemon-side resolveRepoPath (src/daemon/steps/resolve-repo.ts) asks the cwd lookup for the context's cwd and falls back to the context's INSRC_REPO (never the daemon's); the code-review handler's repo fallback reads the context's INSRC_REPO; directoryOf in scope.ts resolves a bare file name against the context's cwd. Outside a context all three keep process.cwd() and process.env.INSRC_REPO. withStepClient gives the code-review deps the context's client as it is; runAnalyzeOneShot, with no wrap given, runs inside runWithClientProviderContext of the converted 'cli-claude' | 'cli-codex' (new reader currentClientProviderKind in shaper-provider.ts). server.ts uses the shared stepClientOf for its two conversions. Six falsifying mutations (each reader reverted to the process value, the one-shot conversion removed, withStepClient made a no-op) each fail a test. Full sweep in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md: nothing newly failing from this task.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/context/shaper-provider.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/daemon/steps/__tests__/step-context.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T11:58:13.894Z)
