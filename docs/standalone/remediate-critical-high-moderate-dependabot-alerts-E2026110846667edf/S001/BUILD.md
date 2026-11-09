<!-- insrc:artifact BUILD-46667edffe5cc451-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-08T18:41:33.396Z  ·  **Updated:** 2026-11-09T04:36:37.697Z

**Commit:** 166764991

## Summary

The root build passed and the combined sweep exited 1. The unchanged baseline reproduced 601 of 602 failure and cancellation signatures, tracked in GitHub #143. The branch-specific diagnostic pins were corrected, and all seven targeted checks and t2 revalidation passed. Live SQL Server and authenticated post-deployment alert reconciliation remain deferred or pending as documented.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `package-lock.json` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `package.json` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/daemon/tools/builtins/http/__tests__/transport.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/mcp/__tests__/stdio-dependencies.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/daemon/db/__tests__/saved-csv-dependencies.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/indexer/target-resolution/__tests__/core-and-parsers.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/daemon/db/__tests__/cassandra-zip-dependencies.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/daemon/tools/builtins/notify/__tests__/smtp-dependencies.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/daemon/tools/builtins/notify/index.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/DRIVER-QUALIFICATION.md` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/daemon/db/__tests__/saved-driver-dependencies.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/NATIVE-QUALIFICATION.md` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/agent/providers/__tests__/onnx-native-dependencies.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `packages/project-memory/README.md` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `packages/project-memory/package.json` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `packages/project-memory/scripts/Apache-2.0.txt` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `packages/project-memory/scripts/pack-release.mjs` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `packages/project-memory/src/__tests__/packed.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `.github/workflows/project-memory.yml` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `packages/project-memory/src/__tests__/fixtures/packed-store-consumer.mjs` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/RELEASE-VERIFICATION.md` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `docs/standalone/remediate-critical-high-moderate-dependabot-alerts-E2026110846667edf/S001/release-verification.test.ts` — **insrc-build** (2026-11-09T04:36:37.697Z)
- `src/daemon/db/__tests__/fixtures/session-sdk-diagnostics.json` — **insrc-build** (2026-11-09T04:36:37.697Z)
