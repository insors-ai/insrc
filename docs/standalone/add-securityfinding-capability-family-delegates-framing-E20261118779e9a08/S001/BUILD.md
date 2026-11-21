<!-- insrc:artifact BUILD-779e9a08142cb057-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T15:21:22.783Z  ·  **Updated:** 2026-11-21T17:57:24.724Z

**Commit:** 766da7c5a

## Summary

Post-build review found three P2s against t4's RECEIPTS machinery when exercised through a real RoundWriter/LifecycleService rather than the raw writer: no codec registered for RECEIPTS (UnknownArtifactKindError), persistVerificationReceipt collapsing an unreadable prior record into absent (destructive replacement), and RECEIPTS missing from STORY_RECORD_KINDS (never frozen on Story completion). Registered the codec, added a receiptRecordState-based refusal (ReceiptRecordUnreadableError) instead of the collapse, and added RECEIPTS to the completion/reopen membership list, with tests for all three through a real createRepoLifecycle-backed LifecycleService.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/review-round/__tests__/security-finding.test.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/security-finding.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `.insrc/artifacts/TASKS-779e9a08142cb057-s1.log.jsonl` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/__tests__/security-locator.test.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/security-locator.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/__tests__/evidence-provider.test.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/evidence-provider.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/artifact-ids.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/__tests__/receipt-record.test.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/receipt-record.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `.insrc/artifacts/PLAN-779e9a08142cb057-s1.json` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `docs/standalone/add-securityfinding-capability-family-delegates-framing-E20261118779e9a08/S001/PLAN.md` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/__tests__/security-schema.test.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/review-round/security-schema.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/artifact-core/__tests__/codec-create.test.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/artifact-core/__tests__/lifecycle-kit.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/artifact-core/__tests__/lifecycle-members.test.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-11-21T17:57:24.724Z)
