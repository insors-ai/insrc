<!-- insrc:artifact BUILD-0f0e4f45f698aeb6-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-17T17:40:45.667Z  ·  **Updated:** 2026-10-17T18:31:25.996Z

**Commit:** 2a691353

## Triage rationale

One minor change with one obvious approach in one module, on top of the just-shipped lanes (Story b94cf2c9): the summary lane waits for an idle index lane before each job, and a running sweep waits the same way before each document and edit.

## Summary

Code work comes first, checked next to every summary start. Queue: waitForIndexIdle resolves once the index lane has no job running or queued, or on stop(); the summary lane loops on isIndexIdle before taking a job, no await after the last check. Sweep, per document: wait for code work, check shutdown, run an edit queued meanwhile, read the document, then check shutdown (fixed @0cf92d04) and code work again - stop, or go back to the wait - and summarise with no await after those checks. Single-document summary: after its read it waits out code work, returns on shutdown, summarises with no await after the last check. The single-document test now states what it covers (waits while code runs, resumes after it, not started on shutdown). Thirteen mutations, including every defect the gate found, each fail the tests.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-ae864466e7f1f4ea-S001.json` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `.insrc/artifacts/CR-ae864466e7f1f4ea-S001.json` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `.insrc/artifacts/LLD-0f0e4f45f698aeb6-S001.json` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `AGENTS.md` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `CLAUDE.md` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `docs/standalone/resolve-calls-methods-class-defined-another-E20261017ae864466/S001/BUILD.md` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `docs/standalone/resolve-calls-methods-class-defined-another-E20261017ae864466/S001/CR.md` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `src/daemon/__tests__/queue-lanes.test.ts` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `src/indexer/__tests__/doc-summary-sweep.test.ts` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `src/indexer/__tests__/summary-sweep-progress.test.ts` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `src/indexer/doc-summary-sweep.ts` — **insrc-build** (2026-10-17T18:31:25.996Z)
- `src/indexer/index.ts` — **insrc-build** (2026-10-17T18:31:25.996Z)
