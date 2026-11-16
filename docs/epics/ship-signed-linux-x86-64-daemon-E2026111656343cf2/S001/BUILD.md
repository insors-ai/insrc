<!-- insrc:artifact BUILD-56343cf2a9c3b509-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-11-16T10:09:36.480Z  ·  **Updated:** 2026-11-16T11:52:44.564Z

**Commit:** 14599ab17

## Summary

Recorded direct packaged native lifecycle smoke evidence. The exact packager is unchanged between guest fixture 11f65c779 and signing fix 14599ab17.

## Tasks validated

- ✓ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `scripts/__tests__/linux-daemon-metadata.test.ts` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/linux-daemon-metadata.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/__tests__/package-linux-daemon-candidate.test.ts` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/package-daemon-candidate.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/package-linux-daemon-candidate.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `.github/workflows/daemon-linux-candidate.yml` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/__tests__/linux-daemon-dispatch.test.ts` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/linux-daemon-dispatch.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/__tests__/fetch-linux-daemon-candidate.test.ts` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/fetch-linux-daemon-candidate.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/__tests__/fixtures/linux-daemon-release.ts` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/__tests__/linux-daemon-qualification.test.ts` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/linux-daemon-qualification.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/__tests__/linux-daemon-final-signing.test.ts` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/linux-daemon-signing-ledger.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
- `scripts/sign-linux-daemon-candidate.mjs` — **insrc-build** (2026-11-16T11:52:44.564Z)
