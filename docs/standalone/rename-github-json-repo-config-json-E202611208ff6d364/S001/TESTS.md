<!-- insrc:artifact TESTS-8ff6d364012cff02-s1 -->

# Tests: 8ff6d364012cff02 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 52 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-20T17:18:15.377Z on commit `13013e948`. Tests check: **failed**. 40 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repo-settings.test.ts and the existing tracker, build-step and daemon tests that named the old names, updated to the new names, still pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | makeServices exposes catalog, repoSettings and setRepoSetting and the fixtures satisfy Services | `src/cli/__tests__/settings-modal.test.ts` |
| pass | config step done, already and failed through the terminal service | `src/cli/__tests__/tracker-setup-service.test.ts` |
| pass | table keys, kinds, RepoConfigEntry fields and one policy row per TeamPolicy rule | `src/config/__tests__/repo-fields.test.ts` |
| pass | docs/daemon.md: the Build commands section is read against the shipped behaviour and states the add-time defaults, buildSetup and the Build section | `src/daemon/__tests__/build-commands-doc.test.ts` |
| pass | src/daemon/__tests__/git-hooks-methods.test.ts: repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed | `src/daemon/__tests__/git-hooks-methods.test.ts` |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | buildRepoSettings values, resolved target and policy rows | `src/daemon/__tests__/repo-settings.test.ts` |
| pass | tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult | `src/daemon/__tests__/tracker-sync-method.test.ts` |
| pass | comment-sync-callers.test.ts: implement and validate run the comment sync for the Task and the daemon method tracker.syncComments runs it on request, and neither is failed by it | `src/daemon/steps/build-step/__tests__/comment-sync-callers.test.ts` |
| pass | a validate turn records its round in the Task's own log, and a Task with no head writes the BUILD record only and has no round | `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` |
| pass | resolveTaskTestFiles maps plan test names to tracked __tests__ files, de-duplicates, and lists names with no match as unresolved | `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` |
| pass | tracker.push: happy path binds the Epic and Story heads to the pushed issues | `src/daemon/steps/workflow-step/__tests__/tracker-e2e.test.ts` |
| pass | coarse push with pushTasks: execute prompt carries the TASK TIER block + the approved plan tasks | `src/daemon/steps/workflow-step/__tests__/tracker-tasks-coarse.test.ts` |
| pass | the finalizers, tracker-auto, tracker/link, workflow-rpc and synthesize each fail before any file is created when no anchor exists | `src/workflow/__tests__/anchor-missing-producers.test.ts` |
| pass | approve() attaches the approved HLD, LLD and plan documents after its commit so the files are clean and the links name that commit, commits the attachment records in a second commit, skips attachment with a stated reason when commitArtifacts is false, and tracker.attach attaches a diagram companion or any target refused as uncommitted once it is committed | `src/workflow/__tests__/approve-attach.test.ts` |
| pass | a denied commit makes handleResolveComment answer its error result with the recorded count, never success | `src/workflow/__tests__/commit-denial-callers.test.ts` |
| pass | ensureDraftIssues returns not-applicable without a team policy and maps policy and sc1 failures to messages | `src/workflow/__tests__/draft-issues.test.ts` |
| pass | questionId: parses a leading [id / verdict] tag; falls back to a stable sha | `src/workflow/__tests__/questions.test.ts` |
| pass | a re-draft keeps the bound Epic and Story issues and the tracker block for sync, chain report and Task approval | `src/workflow/__tests__/redraft-preserves-tracker.test.ts` |
| pass | HLD approve creates the Epic issue, binds it on the Epic head and links docs | `src/workflow/__tests__/tracker-auto.test.ts` |
| pass | the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding | `src/workflow/__tests__/tracker-push-modes.test.ts` |
| pass | task push is opt-out by default (pushTasks unset) → skipped, no issues | `src/workflow/__tests__/tracker-tasks.test.ts` |
| pass | resolveGithubConfig returns none for a missing, unreadable, invalid-JSON and non-object file | `src/workflow/config/__tests__/github-split.test.ts` |
| pass | parseGithubRemoteUrl handles SSH remotes | `src/workflow/config/__tests__/github.test.ts` |
| pass | readRepoEntry rejects each malformed level and accepts missing parts | `src/workflow/config/__tests__/repo-config-store.test.ts` |
| pass | loadTracker accepts signoff-request once declared; openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url; readSignoffState maps review decision and merge state to open, changes-requested and completed; failure kinds map to PortResult kinds | `src/workflow/tracker/__tests__/github-signoff.test.ts` |
| pass | tracker-auto in team mode and individual mode writes artifact-id titles and markers | `src/workflow/tracker/__tests__/issue-title-guard.test.ts` |
| pass | unit-issue and the conventions bodies write an Epic, Story and Task title and marker that start with the artifact id | `src/workflow/tracker/__tests__/issue-title.test.ts` |
| pass | missingCapabilities names every capability the tracker does not declare | `src/workflow/tracker/__tests__/port.test.ts` |
| pass | refreshTrackerStatus writes epicStatus, storyStatus and lastSyncedAt only | `src/workflow/tracker/__tests__/refresh.test.ts` |
| pass | planTrackerConfig already, needs-write and no-origin cases | `src/workflow/tracker/__tests__/setup-plan.test.ts` |
| pass | all-green: auth ok, scopes present, config exists, labels/types already, project skipped → manualRemaining 0 | `src/workflow/tracker/__tests__/setup.test.ts` |
| pass | a denial at the milestone extra stops the Epic push: no comment is posted after it, the push throws the denial, and the Epic issue stays bound | `src/workflow/tracker/__tests__/tracker-denial.test.ts` |
| pass | a push creates the issue typed, links it under its parent, comments and closes it, in that order, through the registry | `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` |
| pass | ensureUnitIssue takes a unit and a port and returns a PortResult without a phase | `src/workflow/tracker/__tests__/unit-issue.test.ts` |

**integration: the module-state and session-source inventory tests pass against the two fixtures edited only for the renamed paths and names**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module-state inventory: the scanner reports lets, constructed containers and written const literals, skips read-only and frozen tables, follows dynamic imports and skips modules outside the closure | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |
| pass | module-state inventory: the scanner throws on an unreadable tsconfig and is deterministic | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |
| pass | module-state inventory: the guard names a missing key, a stale key, an invalid class, a missing owner, a short reason and an unrouted shared-state owner, and reports nothing on a clean input | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |
| pass | module-state inventory: every move candidate carries a recorded decision, and every one-owner or shared-store entry names its mechanism | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/settings-modal.test.ts` | 0 | 3 | 8.3 s |  |
| `src/cli/__tests__/tracker-setup-service.test.ts` | 0 | 4 | 1.4 s |  |
| `src/config/__tests__/repo-fields.test.ts` | 0 | 5 | 0.5 s |  |
| `src/daemon/__tests__/build-commands-doc.test.ts` | 0 | 2 | 0.8 s |  |
| `src/daemon/__tests__/git-hooks-methods.test.ts` | 0 | 2 | 0.8 s |  |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 11 | 1.1 s |  |
| `src/daemon/__tests__/repo-settings.test.ts` | 0 | 17 | 0.8 s |  |
| `src/daemon/__tests__/tracker-sync-method.test.ts` | 0 | 2 | 1.3 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 1 | 3 | 16.2 s |  |
| `src/daemon/steps/build-step/__tests__/comment-sync-callers.test.ts` | 0 | 1 | 1.1 s |  |
| `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` | 0 | 5 | 1.2 s |  |
| `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` | 0 | 42 | 6.4 s |  |
| `src/daemon/steps/workflow-step/__tests__/tracker-e2e.test.ts` | 0 | 7 | 0.9 s |  |
| `src/daemon/steps/workflow-step/__tests__/tracker-tasks-coarse.test.ts` | 0 | 4 | 0.9 s |  |
| `src/daemon/threads/__tests__/module-state-inventory.test.ts` | 1 | 6 | 3.7 s |  |
| `src/workflow/__tests__/anchor-missing-producers.test.ts` | 0 | 1 | 1.7 s |  |
| `src/workflow/__tests__/approve-attach.test.ts` | 0 | 1 | 3.8 s |  |
| `src/workflow/__tests__/commit-denial-callers.test.ts` | 0 | 4 | 0.9 s |  |
| `src/workflow/__tests__/draft-issues.test.ts` | 0 | 8 | 0.8 s |  |
| `src/workflow/__tests__/questions.test.ts` | 0 | 8 | 0.9 s |  |
| `src/workflow/__tests__/redraft-preserves-tracker.test.ts` | 0 | 1 | 1.1 s |  |
| `src/workflow/__tests__/tracker-auto.test.ts` | 0 | 10 | 13.5 s |  |
| `src/workflow/__tests__/tracker-push-modes.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/__tests__/tracker-tasks.test.ts` | 0 | 5 | 6.9 s |  |
| `src/workflow/config/__tests__/github-split.test.ts` | 0 | 3 | 0.8 s |  |
| `src/workflow/config/__tests__/github.test.ts` | 0 | 19 | 0.8 s |  |
| `src/workflow/config/__tests__/repo-config-store.test.ts` | 0 | 6 | 0.6 s |  |
| `src/workflow/tracker/__tests__/github-signoff.test.ts` | 0 | 1 | 1.3 s |  |
| `src/workflow/tracker/__tests__/issue-title-guard.test.ts` | 0 | 6 | 0.8 s |  |
| `src/workflow/tracker/__tests__/issue-title.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/tracker/__tests__/port.test.ts` | 0 | 12 | 5.2 s |  |
| `src/workflow/tracker/__tests__/refresh.test.ts` | 0 | 6 | 1.3 s |  |
| `src/workflow/tracker/__tests__/setup-plan.test.ts` | 0 | 3 | 1.3 s |  |
| `src/workflow/tracker/__tests__/setup.test.ts` | 0 | 5 | 1.8 s |  |
| `src/workflow/tracker/__tests__/tracker-denial.test.ts` | 0 | 6 | 0.8 s |  |
| `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` | 0 | 8 | 0.9 s |  |
| `src/workflow/tracker/__tests__/unit-issue.test.ts` | 0 | 13 | 0.8 s |  |

**Failures outside the named cases**

- `src/daemon/db/__tests__/session-source-inventory.test.ts`: CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline
- `src/daemon/db/__tests__/session-source-inventory.test.ts`: CM-S4-GATE: reviewed removal sources include pure helpers owner boundaries and pending global affinity
- `src/daemon/threads/__tests__/module-state-inventory.test.ts`: module-state inventory: every scanned key under src/daemon/ has a valid fixture entry, and the s3 families are one-owner on the shared-state worker or shared-store
- `src/daemon/threads/__tests__/module-state-inventory.test.ts`: module-state inventory: every module-scope mutable value the session worker can load is classified (full guard over the repo)

## t2

Run at 2026-11-20T18:52:14.957Z on commit `40bd5ea14`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-config.test.ts: moveLegacyRepoConfig renames github.json to repo-config.json when only the old file exists, leaving no github.json and the same content byte for byte, and returns nothing-to-move when there is no github.json**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: moveLegacyRepoConfig renames github.json to repo-config.json when only the old file exists, leaving no github.json and the same content byte for byte, and returns nothing-to-move when there is no github.json | `src/workflow/config/__tests__/repo-config.test.ts` |

**unit: repo-config.test.ts: moveLegacyRepoConfig leaves both files untouched and returns both-exist when both exist, never overwrites an existing repo-config.json, returns failed with a note and leaves github.json in place when the rename throws, and never throws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: moveLegacyRepoConfig leaves both files untouched and returns both-exist when both exist, never overwrites an existing repo-config.json, returns failed with a note and leaves github.json in place when the rename throws, and never throws | `src/workflow/config/__tests__/repo-config.test.ts` |
| pass | repo-config.test.ts: a repo-config.json created between the presence check and the move is not replaced, and neither file changes | `src/workflow/config/__tests__/repo-config.test.ts` |
| pass | repo-config.test.ts: the old name is removed only if it is still the file that was moved, so a newer github.json that replaced it is kept | `src/workflow/config/__tests__/repo-config.test.ts` |
| pass | repo-config.test.ts: where hard links are not supported the move fails with a note to rename the file by hand, and changes nothing | `src/workflow/config/__tests__/repo-config.test.ts` |

**unit: repo-config.test.ts: a second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: a second move after a successful one returns nothing-to-move, and a symbolic-link github.json is moved as a link | `src/workflow/config/__tests__/repo-config.test.ts` |

**integration: repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: a source check that src/daemon/index.ts calls moveLegacyRepoConfig after the directories are ensured and before the database is opened, inside a try/catch and only when INSRC_REPO_CONFIG is unset | `src/workflow/config/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/config/__tests__/repo-config.test.ts` | 0 | 11 | 0.9 s |  |

## t3

Run at 2026-11-20T17:24:39.985Z on commit `c06134c36`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: repo-config.test.ts: repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: repoConfigPath returns the INSRC_REPO_CONFIG value when it is set and non-empty, PATHS.insrc/repo-config.json otherwise, and ignores INSRC_GITHUB_CONFIG | `src/workflow/config/__tests__/repo-config.test.ts` |

**integration: repo-config.test.ts: after a boot move, repo.settings.get and repo.settings.set through the real handlers read and write repo-config.json and keep the repo's entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: after a boot move, repo.settings.get and repo.settings.set through the real handlers read and write repo-config.json and keep the repo's entry | `src/workflow/config/__tests__/repo-config.test.ts` |

**integration: repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: a source scan finds no file under src that names INSRC_GITHUB_CONFIG, githubConfigPath, github-store, GithubConfigFile, GithubEntry, loadGithubConfigFile or GithubConfigError | `src/workflow/config/__tests__/repo-config.test.ts` |

**integration: repo-config.test.ts: a source scan finds the GitHub-tracker names (resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl) still exported from github.ts and the file layer exported from repo-config.ts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo-config.test.ts: a source scan finds the GitHub-tracker names (resolveGithubConfig, resolveGithubConfigFromFile, resolveBranchPattern, resolveStrictTrackerTarget, parseGithubRemoteUrl) still exported from github.ts and the file layer exported from repo-config.ts | `src/workflow/config/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/config/__tests__/repo-config.test.ts` | 0 | 8 | 0.8 s |  |

## t4

Run at 2026-11-20T17:26:34.202Z on commit `9152056f0`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: the JetBrains settings tests (PerRepoSectionTest and InsrcSettingsTrackerTest) pass under JDK 21 with the new file name and error code in their sample data**

Reported by the builder, not run by the gate: **pass**. Evidence: jetbrains-plugin/build/test-results/test/TEST-ai.insors.insrc.jetbrains.settings.PerRepoSectionTest.xml (6 tests, 0 failures) and TEST-ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest.xml (7 tests, 0 failures), from JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew cleanTest test --tests '*PerRepoSectionTest' --tests '*InsrcSettingsTrackerTest' --no-configuration-cache, BUILD SUCCESSFUL

## t5

Run at 2026-11-20T19:00:22.595Z on commit `74629bfa2`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-commands-doc.test.ts: docs/daemon.md and the other live docs name repo-config.json and INSRC_REPO_CONFIG in line with the code | `src/daemon/__tests__/build-commands-doc.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/build-commands-doc.test.ts` | 0 | 3 | 0.8 s |  |
