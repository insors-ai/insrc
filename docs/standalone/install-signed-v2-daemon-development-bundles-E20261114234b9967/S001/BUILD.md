<!-- insrc:artifact BUILD-234b9967599e56d9-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-14T17:25:48.338Z  ·  **Updated:** 2026-11-15T08:40:25.501Z

**Commit:** 4e9d67267

## Summary

A fresh journal read leaves the trust-only root pristine while preserving checks for unsafe journal directories.

## Tasks validated

- ✓ `t1`
- ✗ `t2`
- ✓ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `scripts/__tests__/daemon-development-metadata.test.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/daemon-bundle-metadata.mjs` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/daemon-development-metadata.mjs` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/__tests__/package-daemon-development.test.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/package-daemon-development.mjs` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/__tests__/sign-daemon-development.test.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/sign-daemon-development.mjs` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/bin/insrc-daemon-control.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/__tests__/managed-development-bundle-proof.test.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/managed-bundle-proof.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/shared/__tests__/installation-mutation-gate.test.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/shared/daemon-bundle-release-floor.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/shared/installation-mutation-gate.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/cli/services/managed-daemon-control.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/qualify-daemon-development.mjs` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/bin/insrc-daemon-supervisor.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/__tests__/daemon-supervisor.test.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/supervisor.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/install-daemon-bundle.mjs` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `scripts/install-daemon-development-bundle.mjs` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/managed-daemon-probation.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/managed-update-recovery.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `docs/standalone/install-signed-v2-daemon-development-bundles-E20261114234b9967/S001/VERIFICATION.md` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/__tests__/fresh-managed-activation.test.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
- `src/daemon/fresh-managed-activation.ts` — **insrc-build** (2026-11-15T08:40:25.501Z)
