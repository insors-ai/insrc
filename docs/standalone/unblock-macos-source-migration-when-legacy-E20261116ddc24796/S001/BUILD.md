<!-- insrc:artifact BUILD-ddc24796d6d788e6-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-16T05:34:06.053Z  ·  **Updated:** 2026-11-16T05:47:34.229Z

**Commit:** d02fb6408

## Scope

Defect: the signed macOS legacy cutover refuses a running aaae72fd7 daemon started with Node 26.5.1 and --import tsx/esm because its long-lived esbuild service child references the legacy checkout. Reproduced in disposable VM and matching child observed on host. Keep unrelated process rejection and verify a pinned predecessor-owned helper exits during drain before activation. Add targeted coverage and rerun the isolated signed source migration.

## Summary

Story source commit d02fb640882dd3a89840871d1631398f6b69c8e4 contains all three implementation/test paths and the Insrc-Story trailer. Inspect that commit's changes with git show and compare to its parent 733f0077ff7f3fa7c9d772e5a850719c9ec7c9c8. The earlier 85dcca940 is the pre-build baseline; unrelated dirty ISSUE and scratchpad docs predate this task. Local typecheck and five native cutover/run-guard tests passed.

## Tasks validated

- ✗ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/legacy-cutover-admission.test.ts` — **insrc-build** (2026-11-16T05:47:34.229Z)
- `src/daemon/legacy-cutover-admission.ts` — **insrc-build** (2026-11-16T05:47:34.229Z)
- `src/daemon/managed-update-recovery.ts` — **insrc-build** (2026-11-16T05:47:34.229Z)
