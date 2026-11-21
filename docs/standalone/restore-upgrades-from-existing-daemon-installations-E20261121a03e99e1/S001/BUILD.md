<!-- insrc:artifact BUILD-a03e99e17a364550-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T17:48:45.684Z  ·  **Updated:** 2026-11-21T17:48:45.684Z

**Commit:** 80ace719b

## Summary

Task t1 implements portable independently authenticated source qualification and staging, explicit Linux target catalogs/promotion evidence, and persisted bootstrap-floor checks. It reuses owned Node/npm and existing macOS lifecycle behavior; the remaining eleven tasks still own activation, recovery integration and full historical/native upgrade qualification.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `scripts/__tests__/source-upgrade-qualification-native.test.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `scripts/prepare-source-release.mjs` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/bin/insrc-release-bootstrap.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/daemon/__tests__/managed-release-bootstrap.test.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/daemon/__tests__/source-release-promotion.test.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/daemon/source-release-qualification.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/shared/source-release-compatibility.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
- `src/shared/source-release-target.ts` — **insrc-build** (2026-11-21T17:48:45.684Z)
