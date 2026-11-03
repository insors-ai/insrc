<!-- insrc:artifact BUILD-17123b6d304af2a2-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-03T12:09:27.140Z  ·  **Updated:** 2026-11-03T12:32:31.653Z

**Commit:** 6028061ce

## Summary

Pinned standalone dependencies and implemented private persisted row codecs, explicit Arrow schema and a versioned embedding profile. Native store publication and qualification are not implemented yet.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-17123b6d304af2a2-s3.json` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1-packed-sandbox.tap` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1-packed.tap` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t1.md` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `package-lock.json` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/package.json` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/src/__tests__/packed.test.ts` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-consumer-retry.tap` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-packed-first-attempt.tap` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-packed.tap` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-tests.tap` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2.md` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/src/__tests__/fixtures/store-rows.ts` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/src/__tests__/store-codec.test.ts` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/src/__tests__/store-embedding-profile.test.ts` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/src/store/codec.ts` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/src/store/embedding-profile.ts` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `packages/project-memory/src/store/types.ts` — **insrc-build** (2026-11-03T12:32:31.653Z)
- `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/t2-gate-first.json` — **insrc-build** (2026-11-03T12:32:31.653Z)
