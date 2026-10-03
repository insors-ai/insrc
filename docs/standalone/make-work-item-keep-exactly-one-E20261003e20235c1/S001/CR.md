<!-- insrc:artifact CR-e20235c17f083a16-S001 -->

# Code review: e20235c17f083a16:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 1 · model `client`

**Changed files:** 1

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | .insrc/artifacts/PLAN-e20235c17f083a16-S001.json:330 | The plan's stated 'fifty-two path-construction sites' does not reproduce. Measured non-test on the baseline: 17 resolveArtifactMdPath + 44 across TWELVE named *ArtifactPaths builders = 61, not 52; the LLD counted only seven of the twelve builders. The companion figure of 35 derivation sites DOES reproduce exactly (16 workItemKindOf + 19 workItemAnchorCreatedAt). The load-bearing claim is unaffected: 0 changed lines touch any derivation or path-construction call site, which holds at 35, 52 and 61 alike. Recorded rather than restated so the artifact's number is not treated as verified. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 0 finding(s)

_No findings._

## diagram — 0 finding(s)

_No findings._

