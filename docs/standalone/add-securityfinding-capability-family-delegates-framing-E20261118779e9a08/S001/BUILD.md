<!-- insrc:artifact BUILD-779e9a08142cb057-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T15:21:22.783Z  ·  **Updated:** 2026-11-21T19:16:35.745Z

**Commit:** 521962e00

## Summary

A third review round against 38933ec4c found one more P2: the serialization lock key used repoPath verbatim, so two spellings of the same repository (e.g. a trailing slash) acquired different locks while updating the same receipt file, reopening the same race the prior serialization fix closed. Canonicalized repoPath with resolve+realpathSync before it enters the lock key, matching the canonicalization daemon/lifecycle-registry.ts already uses for the identical reason. Added a concurrent-append test using repo and `${repo}/`; confirmed it fails without the fix (the aliased receipt is dropped) before restoring it.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/review-round/__tests__/security-finding.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/security-finding.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `.insrc/artifacts/TASKS-779e9a08142cb057-s1.log.jsonl` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/__tests__/security-locator.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/security-locator.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/__tests__/evidence-provider.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/evidence-provider.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/artifact-ids.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/path-scheme.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/__tests__/receipt-record.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/receipt-record.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `.insrc/artifacts/PLAN-779e9a08142cb057-s1.json` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `docs/standalone/add-securityfinding-capability-family-delegates-framing-E20261118779e9a08/S001/PLAN.md` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/__tests__/security-schema.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/review-round/security-schema.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/artifact-core/__tests__/codec-create.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/artifact-core/__tests__/lifecycle-kit.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/artifact-core/__tests__/lifecycle-members.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
- `src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts` — **insrc-build** (2026-11-21T19:16:35.745Z)
