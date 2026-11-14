<!-- insrc:artifact BUILD-8a036e6436ae82ab-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-14T07:34:20.403Z  ·  **Updated:** 2026-11-14T07:52:09.882Z

**Commit:** ed6143d4c

## Summary

Use a protected promotion workflow to bind reviewed local evidence to the exact archived candidate and publish only unchanged bytes.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.github/workflows/daemon-candidate.yml` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/__tests__/package-daemon-candidate.test.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/package-daemon-candidate.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/__tests__/daemon-bundle-metadata.test.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/daemon-bundle-metadata.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/package-daemon-bootstrap.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/verify-daemon-bootstrap.sh` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/verify-daemon-bundle.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/__tests__/stage-daemon-bundle.test.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/stage-daemon-bundle.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/insrc` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/install-daemon-bundle.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/bin/insrc-daemon-control.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/daemon/fresh-managed-activation.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/daemon/managed-bundle-proof.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/daemon/managed-update-handoff.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/daemon/managed-update-recovery.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/shared/__tests__/daemon-bundle-release-floor.test.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/shared/daemon-bundle-release-floor.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `src/shared/installation-mutation-gate.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `.github/workflows/daemon-qualification-sign.yml` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `docs/standalone/pilot-prebuilt-macos-daemon-releases-E202611148a036e64/S001/QUALIFICATION.md` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/daemon-release-artifact.sh` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/prepare-daemon-qualification.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/record-daemon-qualification.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `.github/workflows/daemon-promotion.yml` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/__tests__/promote-daemon-candidate.test.ts` — **insrc-build** (2026-11-14T07:52:09.882Z)
- `scripts/promote-daemon-candidate.mjs` — **insrc-build** (2026-11-14T07:52:09.882Z)
