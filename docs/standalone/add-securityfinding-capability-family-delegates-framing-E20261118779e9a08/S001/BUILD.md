<!-- insrc:artifact BUILD-779e9a08142cb057-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T15:21:22.783Z  ·  **Updated:** 2026-11-21T19:32:03.230Z

**Commit:** 16fb6291d

## Summary

A fourth review round against 5243a4aea found one more P2: the wrapper computed canonicalRepo for the lock key but still passed the original (possibly relative) repoPath to persistVerificationReceiptUnlocked, so a relative repoPath wrote the json/change-log successfully via the lifecycle service's own path resolution but then failed refreshing RECEIPTS.md ("writeAtomic: path must be absolute"), leaving the document behind the json. Fixed by passing canonicalRepo through to the unlocked function instead of repoPath. Added a relative-repoPath test asserting json, history and the rendered RECEIPTS.md all reflect the write; confirmed it fails without the fix before restoring it.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/review-round/__tests__/security-finding.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/security-finding.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `.insrc/artifacts/TASKS-779e9a08142cb057-s1.log.jsonl` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/__tests__/security-locator.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/security-locator.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/__tests__/evidence-provider.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/evidence-provider.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/artifact-ids.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/__tests__/receipt-record.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/receipt-record.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `.insrc/artifacts/PLAN-779e9a08142cb057-s1.json` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `docs/standalone/add-securityfinding-capability-family-delegates-framing-E20261118779e9a08/S001/PLAN.md` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/__tests__/security-schema.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/review-round/security-schema.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/artifact-core/__tests__/codec-create.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/artifact-core/__tests__/lifecycle-kit.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/artifact-core/__tests__/lifecycle-members.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
- `src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts` — **insrc-build** (2026-11-21T19:32:03.230Z)
