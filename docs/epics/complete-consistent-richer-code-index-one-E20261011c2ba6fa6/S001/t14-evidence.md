# s1/t14 evidence — JetBrains status dialog shows completeness

## What changed

- `RepoStatsDto` (jetbrains-plugin/.../daemon/DaemonGateway.kt) gains `completeness: RepoCompletenessDto?` (default null), with the new `RepoCompletenessDto` mirroring the daemon's `RepoCompleteness`. `parseCompleteness` decodes the field; an absent field, or one without a boolean `complete`, is null (unknown, never complete).
- `RepoStatusDialog` gains an "Index completeness" group, expanded for an incomplete repository. Its rows come from the pure `completenessRows`:
  - complete;
  - incomplete, with one row per reason (each reason carries its count), the awaiting / could-not-be-stored / files-not-indexed counts, and the files;
  - unknown.

## Recorded reply

`jetbrains-plugin/src/test/resources/fixtures/repo-stats-completeness.json` was generated from the daemon's own `completenessOf` (src/db/index-state.ts) over three states: complete, incomplete and no field. RepoStatsGatewayTest decodes it with Gson, as the transport does.

## Test runs (Gradle 8.10.2 wrapper, Corretto 21)

`./gradlew test --tests '...RepoStatsGatewayTest' --tests '...RepoStatusPopupLayoutTest'`:
- RepoStatsGatewayTest: tests="6" skipped="0" failures="0" errors="0", including "repoStats decodes a recorded repo-stats reply - one complete repository, one incomplete with its reasons and counts, and one without the field (unknown)"
- RepoStatusPopupLayoutTest: tests="5" skipped="0" failures="0" errors="0", including "the dialog's Index completeness group shows the reasons and counts of an incomplete repository, complete for a complete one, and unknown without the field"
- Whole plugin suite (`./gradlew test`): 411 tests, 0 failures, 0 errors, 0 skipped across 69 classes.

## Mutations

| Mutation | Result |
| --- | --- |
| completeness never parsed | RepoStatsGatewayTest fails (NullPointerException at the decoded complete repository) |
| reasons not listed in the rows | RepoStatusPopupLayoutTest's completeness case fails |
| an absent field shown as complete | RepoStatusPopupLayoutTest's completeness case fails |
