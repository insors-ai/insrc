<!-- insrc:artifact BUILD-b220bb6174a2f5ed-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-30T09:03:14.752Z  ·  **Updated:** 2026-10-30T09:15:42.376Z

**Commit:** ae950609d

## Summary

Re-validated after the code-review fixes: the unsavable reason for a host family's undeclared model says 'is not supported by <family>', and the test asserts the refused effort is not selected.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `jetbrains-plugin/__tests__/b220-s5-gradle.test.ts` — **insrc-build** (2026-10-30T09:15:42.376Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitions.kt` — **insrc-build** (2026-10-30T09:15:42.376Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt` — **insrc-build** (2026-10-30T09:15:42.376Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt` — **insrc-build** (2026-10-30T09:15:42.376Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt` — **insrc-build** (2026-10-30T09:15:42.376Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt` — **insrc-build** (2026-10-30T09:15:42.376Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt` — **insrc-build** (2026-10-30T09:15:42.376Z)
