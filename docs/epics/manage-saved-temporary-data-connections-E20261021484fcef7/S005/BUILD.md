<!-- insrc:artifact BUILD-484fcef7efaf229e-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-29T14:41:37.350Z  ·  **Updated:** 2026-10-29T15:42:56.912Z

**Commit:** 3fa48b8f5

## Summary

Adds pure native Kotlin state/effect reducer matching all fifteen shared TypeScript manager scenarios, including roots, complete key/revision identity, stale list refusal, counts/search and authoritative reveal. Defensive view copies preserve prior snapshots; no platform or persistent state added.

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

- `.insrc/artifacts/PLAN-484fcef7efaf229e-s5.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t1/focused.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t1/junit.xml` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t1/result.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/build.gradle.kts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/connections/ConnectionCorpusTest.kt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/connection-manager-corpus.test.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/fixtures/connection-corpus.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `test-fixtures/connection-management/.gitattributes` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `test-fixtures/connection-management/v1/corpus.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `test-fixtures/connection-management/v1/manifest.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t1/task-validation.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t2/focused.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t2/result.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t2/typecheck.txt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/connection-manager-wire.test.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/connection-manager/wire.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t2/task-validation.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t3/focused.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t3/result.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t3/typecheck.txt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/connections/ConnectionProtocol.kt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/connections/ConnectionProtocolTest.kt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/connection-manager-kotlin-wire.test.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/fixtures/connection-junit.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t3/task-validation.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t4/focused.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t4/result.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t4/typecheck.txt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/ipc-lane.test.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/ipc-client.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t4/task-validation.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t5/focused.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t5/result.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t5/typecheck.txt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/PersistentDaemonLaneTest.kt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/connection-manager-kotlin-transport.test.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t5/task-validation.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t6/focused.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t6/result.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t6/reuse-analysis.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t6/typecheck.txt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/connection-manager-model.test.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/connection-manager/model.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t6/task-validation.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t7/attempt1-failed.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t7/focused.tap` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t7/result.json` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t7/typecheck.txt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/connections/ConnectionsManagerModel.kt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/connections/ConnectionsManagerModelTest.kt` — **insrc-build** (2026-10-29T15:42:56.912Z)
- `src/shared/__tests__/connection-manager-kotlin-model.test.ts` — **insrc-build** (2026-10-29T15:42:56.912Z)
