<!-- insrc:artifact CR-315d510cb28100e2-s3 -->

# Code review: 315d510cb28100e2:s3

⛔ **BLOCK** — HIGH 19 · MED 0 · LOW 0 · model `codex:gpt-6-astra`

**Changed files:** 63

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 19 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/workflow/config/github.ts:1 | The resolver split has empty testsReaching edges for these symbols. The promised characterization tests are present and passing, but do not establish symbol coverage under the supplied ground truth. |
| HIGH | src/workflow/config/github-store.ts:1 | The new storage read, merge and write paths and their helpers have empty testsReaching edges. All promised storage tests are present and passing, but these symbols remain unexercised according to the supplied edges. |
| HIGH | src/config/repo-fields.ts:1 | The field-validation symbols have empty testsReaching edges, despite the corresponding promised tests being present and passing. |
| HIGH | src/shared/ipc-client.ts:1 | The settlement and early-close helpers have empty testsReaching edges. The promised timeout tests pass and rpc has a passing reaching file, but coverage cannot be transferred to helpers whose own edges are empty. |
| HIGH | src/daemon/repo-settings.ts:1 | The new settings handlers and payload/error helpers have empty testsReaching edges. All nine promised daemon tests are present and passing; the supplied graph nevertheless records no tests reaching these symbols. |
| HIGH | src/workflow/tracker/setup.ts:1 | The setup planning and config-outcome behavior has empty testsReaching edges. The three promised setup-plan tests are present and passing, but no reaching tests are recorded for these symbols. |
| HIGH | src/cli/services/workflow.ts:1 | The daemon-backed tracker setup path has empty testsReaching edges, despite all five promised terminal setup-service tests being present and passing. |
| HIGH | src/cli/services/config.ts:1 | The catalog and repository-settings service functions have empty testsReaching edges. Passing facade/modal tests do not supply the missing symbol-reaching evidence. |
| HIGH | src/cli/services/index.ts:1 | makeServices has an empty testsReaching list for the changed service wiring. The promised facade and config-seam tests are present and passing, but no reaching edge is recorded. |
| HIGH | src/cli/panes/RepoSettingsModal.tsx:1 | The new modal and save behavior have empty testsReaching edges. The promised modal integration test is present and passing, but neither symbol has recorded test reachability. |
| HIGH | src/cli/panes/repo-settings-model.ts:1 | The status, target and policy formatting helpers have empty testsReaching edges. buildSettingsRows is reached by a passing contract test, but its coverage cannot substitute for the helpers' empty edges. |
| HIGH | vscode-plugin/src/panels/repo-config.ts:1 | The tracker renderer and write-routing symbols have empty testsReaching edges. The promised tracker, consent, refusal and sign-in tests are present and passing; only renderRepoConfig has a recorded passing reaching file. |
| HIGH | vscode-plugin/src/panels/webview-host.ts:1 | handleRepoMessage has no reaching tests recorded for the added repoTrackerWrite handling. The promised routing/error tests are present and passing, but the symbol's testsReaching list is empty. |
| HIGH | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1 | The repository-settings gateway methods and parsers have empty testsReaching edges. The Kotlin bridge explicitly records the promised catalog/read/write tests as passing, but supplies no reaching edges to these symbols. |
| HIGH | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt:1 | Both added service forwarding methods have empty testsReaching edges. The promised forwarding test is present and passing in the Kotlin bridge, but neither method has recorded test reachability. |
| HIGH | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt:1 | The explicit-null serialization and error parsing symbols have empty testsReaching edges. The bridge records the null-on-wire test as passing, but no symbol-reaching evidence is supplied. |
| HIGH | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:1 | The settings-page loading and integration symbols have empty testsReaching edges. The promised pooled-thread/page-routing tests are present and passing in the bridge, but do not establish reachability for these symbols. |
| HIGH | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt:1 | The tracker section's rendering and edit lifecycle have empty testsReaching edges. The promised failure-isolation and read-only sign-in tests are present and passing, but these symbols have no recorded reaching tests. |
| HIGH | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/RepoTrackerModel.kt:1 | The new tracker model's state, rendering, edit and save behavior has empty testsReaching edges throughout. Passing Kotlin test titles do not fill these symbol-level gaps. |

## quality — 0 finding(s)

_No findings._

