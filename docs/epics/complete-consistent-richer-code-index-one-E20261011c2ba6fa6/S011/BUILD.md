<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s11 -->

# Build (plan-driven) — Story s11

**Standalone:** no  ·  **Created:** 2026-10-12T11:26:17.849Z  ·  **Updated:** 2026-10-12T11:51:53.497Z

**Commit:** f4298fae

## Summary

src/mcp/review-step and code-review-step move to src/daemon/steps with their tests (git mv; relative imports rewritten), together with the state-store leak test that exercises them; the review start phase resolves its repository through the daemon-side copy, and both keep calling the daemon's review requests through daemon-stream until t7. The three code-review conditional tests and the live-store audit list are repointed. A new test checks that no file under src/mcp but server.ts imports src/daemon/steps. Full sweep in docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md: nothing newly failing from this task.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-c2ba6fa62a148ed1-s11.json` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/sweeps.md` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/analyze/__tests__/report-head.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/analyze/classifier/__tests__/no-size.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/analyze/context/__tests__/bundle-report-schema.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/analyze/context/__tests__/completeness.live.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/analyze/context/__tests__/lookup-measure.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/analyze/explore/__tests__/executor-lmdb.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/config/__tests__/store-lmdb.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/daemon/__tests__/analyze-rpc-measure.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/daemon/__tests__/answer-step-failed-callers.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/daemon/steps/__tests__/workflow-rpc-imports.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/daemon/steps/analyze-oneshot.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/daemon/steps/resolve-repo.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/__tests__/conversations-lmdb.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/__tests__/delete-entities-by-id.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/__tests__/doc-summaries-lmdb.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/__tests__/entities-lmdb.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/__tests__/reindex-file-lmdb.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/__tests__/repos-lmdb.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/graph/__tests__/derived-indices.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/graph/__tests__/no-live-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/graph/store.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/lance/__tests__/helpers-opens-default-lance.fixture.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/lance/__tests__/live-vector-store-owner.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/lance/__tests__/no-live-vector-store-in-tests.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/db/lance/conn.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/indexer/__tests__/external-endpoints.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/indexer/__tests__/messaging-endpoints.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/shared/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/bugfix/types.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/code-review/__tests__/ux-conditional.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/draft-deps.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/questions.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/runners/brainstorm/__tests__/registration.test.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-12T11:51:53.497Z)
