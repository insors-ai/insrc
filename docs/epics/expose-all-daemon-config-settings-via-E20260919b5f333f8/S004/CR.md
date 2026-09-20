<!-- insrc:artifact CR-b5f333f8d7ba421b-s4 -->

# Code review: b5f333f8d7ba421b:s4

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 9

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:1 | Daemon grounding for this Story is hollow on Kotlin: only 9 file-level nodes (no symbol-level entries; the new PerRoleOverridesModelTest / PerRoleOverridesGatewayTest / PerRoleSection are not listed), so the graph testsReaching edges COVERAGE relies on are unavailable. Coverage was verified LOCALLY: the pure per-role logic is directly unit-tested (PerRoleOverridesModelTest — rows override-vs-default, add/change/remove intent, same-tier-not-dirty, remove-of-unset no-op, explicit-default override, revert, onSaved, and the DOTTED roleId->one-literal-segment mapping + per-key isolation), the config.show-backed gateway read is tested against the real UnixSocketDaemonRpc.parse boundary (PerRoleOverridesGatewayTest — Loaded from data.models.tasks, missing/non-map→Loaded empty, non-string tier skipped, DaemonUnavailable→Unavailable, WireRpc real-parse of a dotted key), and the section + host fan-out is source-scanned (InsrcSettingsConfigurableTest). Full JDK21 gate = 199 tests, 0 failures. Recorded as a grounding-quality observation, not a code defect. |

## quality — 0 finding(s)

_No findings._

