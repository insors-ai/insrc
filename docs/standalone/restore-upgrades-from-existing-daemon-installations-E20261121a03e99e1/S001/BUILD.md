<!-- insrc:artifact BUILD-a03e99e17a364550-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T17:48:45.684Z  ·  **Updated:** 2026-11-21T20:39:00.530Z

**Commit:** f906e433f

## Summary

Linux source transactions now reconcile both phase and prior-restoration execution checkpoints: preserve a verified already-running restored prior, prove descendants closed before retrying an exited restored actor, and fence unrecorded spawn intents. Real arm64/x64 fixtures also validate pinned leases, publication uncertainty, exact selector/running-state restoration and unchanged-release lifecycle actions; installer/client effect binding remains t5–t7.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `scripts/__tests__/source-upgrade-qualification-native.test.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `scripts/prepare-source-release.mjs` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/bin/insrc-release-bootstrap.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/__tests__/managed-release-bootstrap.test.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/__tests__/source-release-promotion.test.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/source-release-qualification.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/shared/source-release-compatibility.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/shared/source-release-target.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `.insrc/artifacts/TASKS-a03e99e17a364550-s1.log.jsonl` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `docs/plans/node-runtime-evidence/source-installation-state.md` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/shared/__tests__/source-installation.test.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/shared/managed-source-release.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/shared/source-installation.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `docs/plans/node-runtime-evidence/source-predecessor-recovery.md` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `scripts/__tests__/source-predecessor-native.test.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/bin/insrc-runtime-smoke.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/bin/insrc-source-recovery.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/source-predecessor.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `docs/plans/node-runtime-evidence/source-update-transaction.md` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/__tests__/helpers/source-linux.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/__tests__/source-update-transaction.test.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
- `src/daemon/source-update-transaction.ts` — **insrc-build** (2026-11-21T20:39:00.530Z)
