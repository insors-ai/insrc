<!-- insrc:artifact BUILD-b94cf2c9058fd82a-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T13:31:05.601Z  ·  **Updated:** 2026-10-17T13:31:05.601Z

**Commit:** 36a2bcaf

## Summary

IndexQueue now holds an index lane and a summary lane (doc-summarise-repo and doc-summarise-entity), each with its own FIFO, drain loop and in-flight job; start runs both loops at the same time (awaited in turn, not Promise.all) and resolves when both stop. A single-document job goes ahead of a queued sweep; takeDocSummaryEdit, laneStatus and isStopping are added; depth, isProcessing and depthForRepo span both lanes; codeIndexWorkFor reads the index lane only. The existing code-index-work test asserts index-lane order only. Ten mutations each fail the tests.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `.insrc/artifacts/TESTS-670419c4ad8bea8e-s1.json` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/BUILD.md` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `docs/epics/understand-changes-before-committing-E20261017670419c4/S001/TESTS.md` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `src/daemon/server.ts` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `src/understanding/__tests__/service.test.ts` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `src/understanding/__tests__/storage.test.ts` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `src/understanding/service.ts` — **insrc-build** (2026-10-17T13:31:05.601Z)
- `src/understanding/storage.ts` — **insrc-build** (2026-10-17T13:31:05.601Z)
