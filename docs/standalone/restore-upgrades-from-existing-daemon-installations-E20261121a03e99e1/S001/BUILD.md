<!-- insrc:artifact BUILD-a03e99e17a364550-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T17:48:45.684Z  ·  **Updated:** 2026-11-21T19:10:57.925Z

**Commit:** 50a172185

## Summary

Tasks t1–t2 provide independently verified staging and Linux selector/journal persistence. Task t2 now retains complete displaced source selections, including initial/candidate snapshots and their receipt/binding metadata, enforces source floors for every referenced selection, and reconciles ambiguous publication through pinned descriptors; lifecycle activation and launcher integration remain in t3–t12.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `scripts/__tests__/source-upgrade-qualification-native.test.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `scripts/prepare-source-release.mjs` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/bin/insrc-release-bootstrap.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/daemon/__tests__/managed-release-bootstrap.test.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/daemon/__tests__/source-release-promotion.test.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/daemon/source-release-qualification.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/shared/source-release-compatibility.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/shared/source-release-target.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `.insrc/artifacts/TASKS-a03e99e17a364550-s1.log.jsonl` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `docs/plans/node-runtime-evidence/source-installation-state.md` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/shared/__tests__/source-installation.test.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/shared/managed-source-release.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
- `src/shared/source-installation.ts` — **insrc-build** (2026-11-21T19:10:57.925Z)
