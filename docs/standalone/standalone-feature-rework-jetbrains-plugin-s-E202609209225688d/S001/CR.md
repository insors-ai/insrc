<!-- insrc:artifact CR-9225688d966a8588-S001 -->

# Code review: 9225688d966a8588:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 2 · model `client`

**Changed files:** 5

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:1 | Daemon code-review grounding is HOLLOW on Kotlin: it returned only 5 file-level nodes with no symbols, so automated coverage could not be graph-grounded (the recurring Kotlin-grounding gap). Coverage was instead verified LOCALLY (./gradlew test on JDK21 — 237 tests, 0 failures, incl. SettingsTreeModelTest 5 + SettingsTableModelTest 6 + the revised InsrcSettingsConfigurableTest source-scan 8) AND by an independent opposite-actor cold review (24-for-24) which found no HIGH/MED functional defect and confirmed the edit->validate->off-EDT-write->re-seed pipeline, tree/card wiring, default-selection, and Unavailable paths; 3 LOW/UX findings were fixed (redundant nested scroll panes, Value-cell selection highlight, immediate combo/checkbox commit) and re-reviewed clean. Recorded as an honest observation, not a gap. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:365 | Accepted design residual (cold-review finding 4): the Value column shows the effective value (controlValue = the catalog default for an unset setting), so an unset setting reads the same in Value and Default with no '(default)' marker (the old flat page marked it via SettingsView.displayValue). This is deliberate for the Key/Value/Default table — the separate Default column keeps the default discoverable — not a correctness defect. A future polish could italicize/gray an unset Value. |

