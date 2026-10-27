<!-- insrc:artifact BUILD-ce99b72065d03b1b-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-27T05:37:26.069Z  ·  **Updated:** 2026-10-27T07:35:06.554Z

**Commit:** 603f4728c

## Summary

Live check against the running daemon: the real Model tiers and per-repo sections were built over the live gateway and rendered (evidence PNGs), and a live models.check of an unlisted model ran (did not run → Approve disabled, Reject available). Not a runIde GUI walk: the sandbox IDE needs a person to drive it; approve/reject/restart were not run live because they write the user's real approved-model store.

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
- ✗ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `jetbrains-plugin/__tests__/s7-gradle.test.ts` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersSection.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRoleSection.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/SettingsWriteGatewayTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpcParseTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitions.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/ModelDefinitionsGatewayTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingCleanupIntegrationTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycleTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingWiringTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/__tests__/model-tiers-effort-gradle.test.ts` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/__tests__/model-tiers-unset-gradle.test.ts` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModel.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersWiringSourceScanTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckDialog.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlow.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelCheckFlowTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/ApplyCompletion.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableRestartTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/PerRepoOverridesGatewayTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoOverridesModelTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/evidence/s7-live-check.txt` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/evidence/s7-model-tiers-live.png` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S007/evidence/s7-per-repo-live.png` — **insrc-build** (2026-10-27T07:35:06.554Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/S7LiveRenderTest.kt` — **insrc-build** (2026-10-27T07:35:06.554Z)
