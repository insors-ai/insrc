<!-- insrc:artifact CR-ba132c185fe45860-s4 -->

# Code review: ba132c185fe45860:s4

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 8

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1055 | GROUNDING CAVEAT (honest): the daemon graph grounding is HOLLOW — every symbol is kind:'file' and the two NEW files (ModelTiersModel.kt, ModelTiersSection.kt) + the new tests are not indexed at all (the recurring stale-Kotlin-index gotcha). Adherence judged by direct reading + the local suite (375/0/0 via ./gradlew test --no-build-cache). Verdict: ADHERENT. S004 consumes sc2 ONLY via the new DaemonGateway.listModels over the existing DaemonRpc (no new daemon capability, k3); the write reuses config.write writeSetting/clearSetting on the EXISTING models.tiers.<tier>.model keys (no schema change). The pure ModelTiersModel + section import no cloud/HTTP client (k1, source-scan-enforced). Dropdown-only non-editable combo (k4). Mirrors S003 for cross-plugin parity (k6). The load-bearing available:false≠Unavailable distinction is implemented (Loaded(false,[]) on a reachable-but-empty provider). |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 0 finding(s)

_No findings._

