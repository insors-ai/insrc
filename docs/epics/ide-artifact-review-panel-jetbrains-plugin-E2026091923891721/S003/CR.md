<!-- insrc:artifact CR-238917216d8fd532-s3 -->

# Code review: 238917216d8fd532:s3

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 2

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/resources/insrc-review/markdown-renderer.js:130 | The t3 additive heading-id + data-section-path emission is JS with no automated test (the renderer is JS-only). Behaviour is exercised manually via the JCEF page; the change is additive and does not alter the S002 escaping/link/CSP handling. |

## quality — 0 finding(s)

_No findings._

