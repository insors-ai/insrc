<!-- insrc:artifact CR-4c7992cc0f79ef2a-S001 -->

# Code review: 4c7992cc0f79ef2a:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 4 · model `client`

**Changed files:** 7

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:612 | The changed code implements the approved PLAN tasks faithfully: repoStats() sends repo.stats with the repoPath key (t1/t2 acceptance — PARAM_REPO_PATH="repoPath", NOT the existing PARAM_REPO="repo"), classifies !r.ok\|\|r.error to Unavailable and never throws; registerProject gained a nullable-default steering param forwarding steering{claude,agents} only when non-null (t3, backward-compatible); the service delegates both. plugin.xml adds the first <actions> block on ProjectViewPopupMenu (t4) and stays platform-only. No adherence breach. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:588 | The diff follows the established plugin idioms: the new repoStats mirrors settingsCatalog/registeredRepos (sealed *Result Loaded\|Unavailable, DaemonUnavailableException+RuntimeException try/catch, verbatim-forward parse with Gson-Double coercion), and the registerProject overload keeps the existing r.ok classification. No IDE-specific <depends> was added (single-artifact-four-IDEs preserved). No convention breach observed in the tracked diff. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:600 | GROUNDING LIMITATION (reported honestly): the daemon grounding for this review is file-level diff-only over the 7 git-TRACKED changed files (Kotlin is not symbol-indexed, so there is no per-symbol testsReaching), and the core NEW files (ShowOrRegisterRepoAction / RepoStatusDialog / RegisterRepoDialog and their tests) are UNTRACKED and therefore absent from the diff grounding. Coverage was instead verified locally: the full gradlew test suite is green (46/46 test classes, 0 failures) INCLUDING the new RepoStatsGatewayTest (repoStats repoPath-key + Loaded/Unavailable classification + parseRepoStats Double->Int/Long boundary types + registerProject steering(true/false-false/null) backward-compat) and the new ShowOrRegisterRepoActionTest (source-scan of the action/plugin.xml/dialogs). Not a defect in the code — a limitation of the automated grounding. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:614 | Error handling is sound: repoStats never throws (DaemonUnavailableException + RuntimeException both map to Unavailable, mirroring the sibling reads), parseRepoStats coerces defensively (numberMap tolerates a non-map, absent optionals -> null, unknown status verbatim), and registerProject's buildMap omits the steering key entirely when null (no wire change for existing callers). An independent opposite-actor cold review (author != reviewer) traced the value flow against the real daemon repo.stats/repo.add handlers + the socket parse and returned SHIP (0 HIGH/0 MED/0 LOW) after a MED was fixed: actionPerformed no longer makes a blocking isProjectRegistered socket call on the EDT (it reuses the BGT-computed presentation client-property), and the BGT probe now also catches RuntimeException. No outstanding quality risk. |

