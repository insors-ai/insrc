<!-- insrc:artifact BUILD-17123b6d304af2a2-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-11-01T18:52:29.474Z  ·  **Updated:** 2026-11-01T20:10:39.454Z

**Commit:** 3ead05a91

## Summary

Built the independent S1 project-memory foundation with public contracts, embedded lifecycle, safe ownership and serialized model dispatch. After first-review corrections, all 19 package tests, 14 actual Linux/ext4 checks and the preserved root build pass; data capabilities remain NOT_READY for later stories.

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

- `.insrc/artifacts/PLAN-17123b6d304af2a2-s1.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `package-lock.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `package.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/.gitignore` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/LICENSE` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/README.md` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/package.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/contracts.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/fixtures/public-consumer.mts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/errors.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/host-node.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/index.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/types.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/tsconfig.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/t2/qualification.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/native.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/native.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/fixtures/node22.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/configuration.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/fixtures/options.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/configuration.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/ownership.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/ownership.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/model-dispatcher.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/model-dispatcher.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/runtime.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/runtime.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/contention.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/fixtures/owner-peer.mjs` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/__tests__/packed.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `.github/workflows/project-memory.yml` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/linux/native-lifecycle.tap` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/linux/packed-consumer.tap` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/linux/run.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `scripts/__tests__/project-memory-qualification.test.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/linux/platform.log` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/FOUNDATION-EVIDENCE.md` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/macos-combined.tap` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/root-build.txt` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `.insrc/artifacts/CR-17123b6d304af2a2-s1.json` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/CR.md` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `packages/project-memory/src/private-file.ts` — **insrc-build** (2026-11-01T20:10:39.454Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S001/evidence/review-round-1.md` — **insrc-build** (2026-11-01T20:10:39.454Z)
