<!-- insrc:artifact BUILD-779e9a08142cb057-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T15:21:22.783Z  ·  **Updated:** 2026-11-21T18:29:06.540Z

**Commit:** f879b410a

## Summary

A further review of ab51d6839 found three more P2s: the raw (no-RoundWriter) persistence path wrote fresh meta with no lifecycle key at all, so a completed record's stamp was silently dropped and the storage layer's terminal-content check never even saw it; the read-merge-write was not serialized across overlapping calls, so two concurrent appends could drop one addition even though each write was individually serialized; and pass-through-codecs.test.ts's registered-kinds count was stale. Fixed: withStoredModel is now applied unconditionally so both paths carry the stored lifecycle forward (enforcing TerminalArtifactError on a completed record on both paths); the whole read-merge-write is now serialized in-process per (repoPath, epicHash, storyId); the stale test count was corrected to 17. Added tests for both: a real-lifecycle-service completion test and a concurrent-append test.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/review-round/__tests__/security-finding.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/security-finding.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `.insrc/artifacts/TASKS-779e9a08142cb057-s1.log.jsonl` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/__tests__/security-locator.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/security-locator.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/__tests__/evidence-provider.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/evidence-provider.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/artifact-ids.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/__tests__/receipt-record.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/receipt-record.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `.insrc/artifacts/PLAN-779e9a08142cb057-s1.json` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `docs/standalone/add-securityfinding-capability-family-delegates-framing-E20261118779e9a08/S001/PLAN.md` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/__tests__/security-schema.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/review-round/security-schema.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/artifact-core/__tests__/codec-create.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/artifact-core/__tests__/lifecycle-kit.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/artifact-core/__tests__/lifecycle-members.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
- `src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts` — **insrc-build** (2026-11-21T18:29:06.540Z)
