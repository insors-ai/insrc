<!-- insrc:artifact BUILD-315d510cb28100e2-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-10-17T16:53:11.562Z  ·  **Updated:** 2026-10-17T19:26:24.061Z

**Commit:** c77cdfe8

## Summary

Fixed the finding (commit 59f4c7ef): the contract test found a real gap, which t10's first acceptance check exists to catch. The JetBrains PerRepoSection drew rows without showing the daemon's row note, unlike the terminal and VS Code. PerRepoSection.trackerPanel now renders the note (a grey label) on every row that has one, added after the label and control so their child positions do not change (the existing field lookup in the t9 tests still passes). RepoFieldsContractTest gains a test that builds the real PerRepoSection from the shared fixture, calls component(), and asserts the Swing tree shows every fixture row's label and note and has a text field only for local rows, so the check covers what is rendered, not just RepoTrackerModel. This small production change is in t9's file but is required to meet this task's 'each client's rendered rows equal the fixture' check. Kotlin suite (21 bridge cases) passes under JDK 21.

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

- `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/S003/T001-PRESPLIT.md` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/RepoTrackerModel.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayServiceTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/SettingsCatalogDtoDefaultTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingCleanupIntegrationTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycleTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingWiringTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsTrackerTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSectionTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/RepoFieldsContractTest.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/TrackerFixtures.kt` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/__tests__/command.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/__tests__/repo-fields-contract.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/__tests__/tracker-setup-service.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/__tests__/tsconfig.fixtures.2390875.json` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/__tests__/tui.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/__tests__/zz-config-probe.2390875.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/command.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/panes/RepoSettingsModal.tsx` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/panes/ReposPane.tsx` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/panes/repo-settings-model.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/services/config.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/services/index.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/cli/services/workflow.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/config/settings-catalog.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/daemon/__tests__/repo-settings.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/daemon/repo-settings.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/shared/__tests__/ipc-client-timeout.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/shared/ipc-client.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/workflow/config/__tests__/github-split.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/workflow/config/__tests__/github-store.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/workflow/config/github-store.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/workflow/config/github.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/workflow/tracker/__tests__/setup-plan.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `src/workflow/tracker/setup.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/config/__tests__/gateway.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/config/__tests__/seam.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/config/__tests__/sync-engine.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/config/__tests__/truthful-sync.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/config/gateway.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/config/types.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/panels/__tests__/repo-config.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/panels/repo-config.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/panels/types.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/panels/webview-host.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
- `vscode-plugin/src/workspace/__tests__/activation.test.ts` — **insrc-build** (2026-10-17T19:26:24.061Z)
