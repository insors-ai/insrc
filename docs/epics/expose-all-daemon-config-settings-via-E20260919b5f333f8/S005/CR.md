<!-- insrc:artifact CR-b5f333f8d7ba421b-s5 -->

# Code review: b5f333f8d7ba421b:s5

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 9

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:74 | createComponent issues perRoleOverrides() and perRepoOverrides() as two SEPARATE config.show round-trips (plus config.catalog + repo.list) — four sequential socket trips where two share an identical config.show read. Accepted efficiency nit: the reads are on the page-open off-EDT path (not hot), and merging them would couple the S004/S005 gateway methods. No correctness impact. |

