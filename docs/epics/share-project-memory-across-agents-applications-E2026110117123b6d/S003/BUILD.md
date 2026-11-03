<!-- insrc:artifact BUILD-17123b6d304af2a2-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-03T12:09:27.140Z  ·  **Updated:** 2026-11-03T14:35:41.123Z

**Commit:** 38bc67cfe

## Summary

Tasks 1–6 passed. Task 7 receipt adapter's first validation found scalar lookup corruption could hide proof. Commit 38bc67cfe fixes it with full per-receipt startup codec checks and owner-tracked native version integrity; added identity/operation/both-column corruption tests require unavailable live authority, no replay mutation and cold refusal. 31 relevant tests and package build pass; original retained conflict/recycling contract stays unchanged. Tasks 8–17 remain pending; host wiring and full sweep still gated.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-17123b6d304af2a2-s3.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1-packed-sandbox.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1-packed.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1.md` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `package-lock.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/package.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/packed.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-consumer-retry.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-packed-first-attempt.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-packed.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-tests.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2.md` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/fixtures/store-rows.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/store-codec.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/store-embedding-profile.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/codec.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/embedding-profile.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/types.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-gate-first.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `.github/workflows/project-memory.yml` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-macos-first-attempt.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-macos.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-macos.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3.md` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/fixtures/node22.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/fixtures/store-native-peer.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/fixtures/store-native.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/store-native.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-ci-run.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/dependency-graph.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/package-lock.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/platform.log` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/store-sdk.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-linux/project-memory-linux-node22-24a61e760b4e8e10787e91e658db362e1d6ab254/store-sdk.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t3-node26-wrapper.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-tests-first-attempt.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-tests.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4.md` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/fixtures/store-cleanup-peer.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/store-initialization.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/format.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/lance-store.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-gate-first.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t4-retry-tests.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t5-tests.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t5.md` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/fixtures/store-plans.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/store-guards.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/guards.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/plan.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t5-gate-first.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t6-tests.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t6.md` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/fixtures/store-writer-peer.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/store-writer.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/queue/codec.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/writer.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7-tests.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7.md` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/__tests__/store-receipts.test.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `packages/project-memory/src/store/receipts.ts` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7-gate-first.json` — **insrc-build** (2026-11-03T14:35:41.123Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t7-retry-tests.tap` — **insrc-build** (2026-11-03T14:35:41.123Z)
