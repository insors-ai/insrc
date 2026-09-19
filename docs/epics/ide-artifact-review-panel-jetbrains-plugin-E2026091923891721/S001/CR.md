<!-- insrc:artifact CR-238917216d8fd532-s1 -->

# Code review: 238917216d8fd532:s1

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 10

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt:97 | Surfacing a non-empty string `result.error` as ok=false is a GLOBAL transport change (applies to every handler, not just workflow.pending). It is convention-aligned — the daemon-wide failure shape is `{ error: string }`, and no current Kotlin caller reads a success-payload `error` field as data — so it is safe today and actually corrects a latent bug where all 12 `{error}`-returning handlers were invisible as failures to the client. Recorded as an invariant to preserve: a future handler must not put a non-empty `error` string inside a SUCCESS result. Guarded correctly against over-correction (empty string / null / object error are not misclassified). |

