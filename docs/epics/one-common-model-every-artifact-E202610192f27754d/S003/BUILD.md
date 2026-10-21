<!-- insrc:artifact BUILD-2f27754d4ad00b8e-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-21T05:22:31.620Z  ·  **Updated:** 2026-10-21T06:31:27.497Z

**Commit:** 29a9c401

## Summary

Added LifecycleConflictError (artifactId, reason), IllegalTransitionError, TerminalArtifactError, ReviewRequiredError and UnreadableChildError (unreadable ids) and the IntegrityReason type to src/workflow/artifact-core/types.ts; the exports test in types-contract.test.ts now pins exactly the eleven error classes, and a new test checks the five classes' names, reasons and ids.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/__tests__/artifact-write-inventory.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/__tests__/gates-lifecycle-guard.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/__tests__/gates-lifecycle-service.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/__tests__/prepare-lifecycle.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/codec-create.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/content-hash.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/decode.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-ac7.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-errors.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-integrity.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-kit.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-members.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-reconcile.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-table.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/lifecycle-transition.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/pass-through-codecs.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/store-children-strict.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/store-lifecycle-write.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/store-update.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/store-write.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/__tests__/types-contract.test.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/codecs.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/completion-evidence.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/lifecycle-service.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/lifecycle.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/store.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-core/types.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/artifact-write-inventory.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/runners/build/completion-record.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
- `src/workflow/storage.ts` — **insrc-build** (2026-10-21T06:31:27.497Z)
