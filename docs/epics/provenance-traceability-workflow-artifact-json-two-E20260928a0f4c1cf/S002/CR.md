<!-- insrc:artifact CR-a0f4c1cfe262a497-s2 -->

# Code review: a0f4c1cfe262a497:s2

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 3 · model `client`

**Changed files:** 8

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/runners/build/changed-files.ts:67 | Grounding is diff-based and hollow (8 fresh files, every testsReaching edge empty), so testsReaching cannot be used as coverage ground-truth — a HIGH per empty edge would be fabricated. Coverage was instead verified by RUNNING the suite: 716 tests / 715 pass / 0 fail / 1 pre-existing live-skip across runners/build + artifacts + the code-review suites + workflow. Every plan-promised test is present (BuildRecord type-shape, changedFiles derivation + NoBuildChangesError, collectBuildChangeLog mapping/version/empty/git-swallow, changeLogBodyLines absent/empty/present, renderPlanBuildRecordMd present/byte-identical-absent, re-validate preservation, appendFeedback integration, legacy byte-identity), AND the code-review suites stay green (t2 extract is behaviour-preserving). No real coverage gap. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/mcp/build-step/phases/validate.ts:96 | The change-log's author is stamped with the fixed constant 'insrc-build' and no commit `version` is threaded (none is exposed in this phase), so ChangeLogEntry attribution is a placeholder rather than the real build actor/model or the build commit. The LLD anticipated this (author fallback; version optional in sc1), so it satisfies ac1/k2 for the shipped scope — but threading the real build attribution (from the build's ArtifactModelAttribution) + the commit sha would make the provenance genuinely attributed. Non-blocking; a natural follow-on with the deferred line-ranges (a2). |
| LOW | src/workflow/runners/build/changed-files.ts:84 | collectBuildChangeLog is invoked once per per-task validate, and mergeWithPrior lets the newest write's changeLog replace the prior — so on a multi-task plan-driven build the change-log is recomputed each validate. This is correct (each recompute reflects the current full working-tree changed set, so the final write carries the complete set) but slightly wasteful (N git_diff derivations). Non-blocking; could compute once at the terminal validate if perf ever matters. |

