<!-- insrc:artifact BUILD-17123b6d304af2a2-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-03T12:09:27.140Z  ·  **Updated:** 2026-11-03T16:56:34.306Z

**Commit:** be98c1fd8

## Summary

Tasks 1–12 validated. After matching APFS/ext4 pre-wiring qualification (Linux 60 store tests), MemoryFactory now opens store before receipt-backed queue recovery, applies trusted transforms and composes ordered owned work. Seventeen focused host/lifecycle/admission/contention cases pass; public recall and delivery remain NOT_READY. Final packaging/isolation/resource tasks and full sweeps remain.

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
- ✓ `t11`
- ✓ `t12`
- ✓ `t13`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-17123b6d304af2a2-s3.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1-packed-sandbox.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1-packed.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `package-lock.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/package.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/packed.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-consumer-retry.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-packed-first-attempt.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-packed.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-rows.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-codec.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-embedding-profile.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/codec.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/embedding-profile.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/types.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-gate-first.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `.github/workflows/project-memory.yml` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-macos-first-attempt.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-macos.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-macos.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/node22.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-native-peer.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-native.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-native.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-ci-run.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/dependency-graph.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/package-lock.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/platform.log` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/store-sdk.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/store-sdk.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-node26-wrapper.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-tests-first-attempt.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-cleanup-peer.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-initialization.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/format.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/lance-store.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-gate-first.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-retry-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t5-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t5.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-plans.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-guards.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/guards.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/plan.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t5-gate-first.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t6-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t6.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-writer-peer.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-writer.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/queue/codec.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/writer.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-receipts.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/receipts.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7-gate-first.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7-retry-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t8-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t8.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-integration.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-barriers.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/barriers.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t9-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t9.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-reads.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/native-reads.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/reads.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t9-gate-first.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t9-retry-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-focused.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-macos.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-macos.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/store-crash-peer.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-crash.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `src/shared/__tests__/project-memory-platform-evidence.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-ci-run.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/dependency-graph.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/package-lock.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/platform.log` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/store-integration.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/store-integration.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/store-sdk.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-linux/project-memory-linux-node22-a4e040809abeaff4d966e79d6d1e4a639103654f/store-sdk.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10-platforms.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t10.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t11-final-overhead.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t11-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t11.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/README.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-admission.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/queue/admission.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/admission-policy.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t12-lifecycle-final.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t12-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t12.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-lifecycle.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/store/lifecycle.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-macos.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-macos.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-ci.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/dependency-graph.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/package-lock.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/platform.log` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/store-integration.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/store-integration.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/store-sdk.json` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-prewire-linux/project-memory-linux-node22-700c7f1e923a50717bbbf806105dc2b3d1bba98d/store-sdk.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13-tests.tap` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t13.md` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/host-options.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/fixtures/owner-peer.mjs` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/runtime.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/__tests__/store-host.test.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
- `packages/project-memory/src/host-node.ts` — **insrc-build** (2026-11-03T16:56:34.306Z)
