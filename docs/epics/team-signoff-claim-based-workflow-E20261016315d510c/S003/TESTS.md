<!-- insrc:artifact TESTS-315d510cb28100e2-s3 -->

# Tests: 315d510cb28100e2 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 108 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-17T16:54:20.088Z on commit `766d98c3`. Tests check: **passed**. 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/config/__tests__/github-split.test.ts: resolveGithubConfig returns none for a missing, unreadable, invalid-JSON and non-object file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveGithubConfig returns none for a missing, unreadable, invalid-JSON and non-object file | `src/workflow/config/__tests__/github-split.test.ts` |
| pass | resolveGithubConfig honors per-repo "type": "none" | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig honors default "type": "none" when no per-repo entry | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig prefers per-repo "none" over default owner/repo | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig returns type=github with owner/repo when configured | `src/workflow/config/__tests__/github.test.ts` |
| pass | a global default NEVER targets a repo — an unlisted repo resolves to its OWN git remote, not the default owner/repo | `src/workflow/config/__tests__/github.test.ts` |
| pass | a default enabling github targets the repo remote even when the repo has an unrelated per-repo entry absence | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig defaults to type=none when no matching entry AND no config file | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig defaults to type=none when file exists but has no matching entry | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig defaults to type=none when default entry is empty {} | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig with explicit "type": "github" but no owner/repo throws when git remote is absent | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig with explicit "type": "github" resolves via git remote when owner/repo omitted | `src/workflow/config/__tests__/github.test.ts` |
| pass | resolveGithubConfig without a config file does NOT auto-detect from git remote | `src/workflow/config/__tests__/github.test.ts` |
| pass | lenient resolver behaviour is unchanged | `src/workflow/config/__tests__/github.test.ts` |

**unit: src/workflow/config/__tests__/github-split.test.ts: characterization of a null own entry and a null default is unchanged by the split**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | characterization of a null own entry and a null default is unchanged by the split | `src/workflow/config/__tests__/github-split.test.ts` |
| pass | resolveGithubConfigFromFile gives the same result as resolveGithubConfig for a well-formed file | `src/workflow/config/__tests__/github-split.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/config/__tests__/github-split.test.ts` | 0 | 3 | 0.3 s |  |
| `src/workflow/config/__tests__/github.test.ts` | 0 | 19 | 0.4 s |  |

## t2

Run at 2026-10-17T16:59:36.085Z on commit `03cbacff`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/config/__tests__/github-store.test.ts: readRepoEntry rejects each malformed level and accepts missing parts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readRepoEntry rejects each malformed level and accepts missing parts | `src/workflow/config/__tests__/github-store.test.ts` |

**unit: src/workflow/config/__tests__/github-store.test.ts: mergeRepoEntryKeys changes only the named keys**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | mergeRepoEntryKeys changes only the named keys | `src/workflow/config/__tests__/github-store.test.ts` |

**unit: src/workflow/config/__tests__/github-store.test.ts: concurrent writes all land one at a time and a failure does not stall the queue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | concurrent writes all land one at a time and a failure does not stall the queue | `src/workflow/config/__tests__/github-store.test.ts` |

**unit: src/workflow/config/__tests__/github-store.test.ts: write-failed leaves the file and temp file as they were**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | write-failed leaves the file and temp file as they were | `src/workflow/config/__tests__/github-store.test.ts` |

**unit: src/workflow/config/__tests__/github-store.test.ts: verify step re-merges after an outside change and returns file-changed after the bounded attempts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verify step re-merges after an outside change and returns file-changed after the bounded attempts | `src/workflow/config/__tests__/github-store.test.ts` |

**integration: src/workflow/config/__tests__/github-store.test.ts: an unwritable directory returns write-failed with the operating-system message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unwritable directory returns write-failed with the operating-system message | `src/workflow/config/__tests__/github-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/config/__tests__/github-store.test.ts` | 0 | 6 | 0.9 s |  |

## t3

Run at 2026-10-17T17:03:59.440Z on commit `79953536`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/config/__tests__/repo-fields.test.ts: table keys, kinds, GithubEntry fields and one policy row per TeamPolicy rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | table keys, kinds, GithubEntry fields and one policy row per TeamPolicy rule | `src/config/__tests__/repo-fields.test.ts` |

**unit: src/config/__tests__/repo-fields.test.ts: branchPattern validator accepts and rejects every listed form with the failing rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | branchPattern validator accepts and rejects every listed form with the failing rule | `src/config/__tests__/repo-fields.test.ts` |

**unit: src/config/__tests__/repo-fields.test.ts: a table copy with another placeholder changes what the validator accepts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a table copy with another placeholder changes what the validator accepts | `src/config/__tests__/repo-fields.test.ts` |

**unit: src/config/__tests__/repo-fields.test.ts: buildSettingsCatalog keeps existing fields, adds repoFields and never throws**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildSettingsCatalog keeps existing fields, adds repoFields and never throws | `src/config/__tests__/repo-fields.test.ts` |
| pass | buildSettingsCatalog({}) returns all options + groups + roles + tierNames with values = {} | `src/config/__tests__/settings-catalog.test.ts` |
| pass | buildSettingsCatalog resolves current values from a config: set paths present, unset/absent omitted, non-catalog keys excluded | `src/config/__tests__/settings-catalog.test.ts` |
| pass | buildSettingsCatalog is total: a garbage/array-shaped rawConfig never throws | `src/config/__tests__/settings-catalog.test.ts` |

**unit: src/config/__tests__/repo-fields.test.ts: validateRepoSetting per row for type, owner, repo, ghPath and ghHost**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validateRepoSetting per row for type, owner, repo, ghPath and ghHost | `src/config/__tests__/repo-fields.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/repo-fields.test.ts` | 0 | 5 | 0.4 s |  |
| `src/config/__tests__/settings-catalog.test.ts` | 0 | 4 | 0.5 s |  |

## t4

Run at 2026-10-17T17:05:47.013Z on commit `e29f09c5`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/shared/__tests__/ipc-client-timeout.test.ts: rpc without opts is unchanged for a reply, an error and a split reply**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rpc without opts is unchanged for a reply, an error and a split reply | `src/shared/__tests__/ipc-client-timeout.test.ts` |
| pass | rpc resolves the daemon result and writes the { label, pid } identity envelope on connect | `src/shared/__tests__/ipc-client.test.ts` |
| pass | rpc rejects with "daemon is not running" on ENOENT / ECONNREFUSED | `src/shared/__tests__/ipc-client.test.ts` |
| pass | rpc surfaces a daemon-side error and an unparseable line distinctly | `src/shared/__tests__/ipc-client.test.ts` |

**unit: src/shared/__tests__/ipc-client-timeout.test.ts: rpc with timeoutMs rejects on silence and on early close and cleans up**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rpc with timeoutMs rejects on silence and on early close and cleans up | `src/shared/__tests__/ipc-client-timeout.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/ipc-client-timeout.test.ts` | 0 | 2 | 0.7 s |  |
| `src/shared/__tests__/ipc-client.test.ts` | 0 | 8 | 0.6 s |  |

## t5

Run at 2026-10-17T17:14:21.374Z on commit `9502161c`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/__tests__/repo-settings.test.ts: buildRepoSettings values, resolved target and policy rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildRepoSettings values, resolved target and policy rows | `src/daemon/__tests__/repo-settings.test.ts` |

**unit: src/daemon/__tests__/repo-settings.test.ts: sign-in mapping for every whoAmI outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sign-in mapping for every whoAmI outcome | `src/daemon/__tests__/repo-settings.test.ts` |

**unit: src/daemon/__tests__/repo-settings.test.ts: repo identity uses the exact registered path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repo identity uses the exact registered path | `src/daemon/__tests__/repo-settings.test.ts` |

**integration: src/daemon/__tests__/repo-settings.test.ts: get returns what set wrote and shows an outside write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | get returns what set wrote and shows an outside write | `src/daemon/__tests__/repo-settings.test.ts` |

**integration: src/daemon/__tests__/repo-settings.test.ts: set refuses read-only, unknown, invalid and unregistered inputs and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | set refuses read-only, unknown, invalid and unregistered inputs and writes nothing | `src/daemon/__tests__/repo-settings.test.ts` |

**integration: src/daemon/__tests__/repo-settings.test.ts: only the signed-in-user read runs through s1's adapter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | only the signed-in-user read runs through s1's adapter | `src/daemon/__tests__/repo-settings.test.ts` |

**integration: src/daemon/__tests__/repo-settings.test.ts: malformed files return github-json-unreadable and keep their bytes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | malformed files return github-json-unreadable and keep their bytes | `src/daemon/__tests__/repo-settings.test.ts` |

**integration: src/daemon/__tests__/repo-settings.test.ts: get reads once, never writes, and resolves from the git remote when there is no own target**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | get reads once, never writes, and resolves from the git remote when there is no own target | `src/daemon/__tests__/repo-settings.test.ts` |

**integration: src/daemon/__tests__/repo-settings.test.ts: ensure writes the five keys once and concurrent sets both land**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ensure writes the five keys once and concurrent sets both land | `src/daemon/__tests__/repo-settings.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/repo-settings.test.ts` | 0 | 9 | 1.3 s |  |

## t6

Run at 2026-10-17T17:21:22.993Z on commit `9681d524`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/setup-plan.test.ts: planTrackerConfig already, needs-write and no-origin cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | planTrackerConfig already, needs-write and no-origin cases | `src/workflow/tracker/__tests__/setup-plan.test.ts` |

**unit: src/workflow/tracker/__tests__/setup-plan.test.ts: planTrackerConfig fails on malformed files without throwing, calling the daemon or writing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | planTrackerConfig fails on malformed files without throwing, calling the daemon or writing | `src/workflow/tracker/__tests__/setup-plan.test.ts` |

**unit: src/workflow/tracker/__tests__/setup-plan.test.ts: runTrackerSetup reports a configOutcome verbatim and touches no file; existing behaviour without it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runTrackerSetup reports a configOutcome verbatim and touches no file; existing behaviour without it | `src/workflow/tracker/__tests__/setup-plan.test.ts` |
| pass | all-green: auth ok, scopes present, config exists, labels/types already, project skipped → manualRemaining 0 | `src/workflow/tracker/__tests__/setup.test.ts` |
| pass | missing scopes: issue-types + project are manual carrying the refresh command | `src/workflow/tracker/__tests__/setup.test.ts` |
| pass | missing config: the config step writes github.json and reports done | `src/workflow/tracker/__tests__/setup.test.ts` |
| pass | project views step is always manual with the UI click-list | `src/workflow/tracker/__tests__/setup.test.ts` |
| pass | ensureLabels with a timing-out label create records the label as failed and continues | `src/workflow/tracker/__tests__/setup.test.ts` |

**integration: src/cli/__tests__/tracker-setup-service.test.ts: config step done, already and failed through the terminal service**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | config step done, already and failed through the terminal service | `src/cli/__tests__/tracker-setup-service.test.ts` |

**integration: src/cli/__tests__/tracker-setup-service.test.ts: silent and early-closing daemon fail the config step within the deadline**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | silent and early-closing daemon fail the config step within the deadline | `src/cli/__tests__/tracker-setup-service.test.ts` |

**integration: src/cli/__tests__/tracker-setup-service.test.ts: the remaining setup steps still run after a failed config step**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the remaining setup steps still run after a failed config step | `src/cli/__tests__/tracker-setup-service.test.ts` |

**integration: src/cli/__tests__/tracker-setup-service.test.ts: malformed github.json fails the config step with no daemon call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | malformed github.json fails the config step with no daemon call | `src/cli/__tests__/tracker-setup-service.test.ts` |

**integration: src/cli/__tests__/tracker-setup-service.test.ts: makeServices always injects the config seam**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | makeServices always injects the config seam | `src/cli/__tests__/tracker-setup-service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/tracker-setup-service.test.ts` | 0 | 5 | 1.3 s |  |
| `src/workflow/tracker/__tests__/setup-plan.test.ts` | 0 | 3 | 0.8 s |  |
| `src/workflow/tracker/__tests__/setup.test.ts` | 0 | 5 | 1 s |  |

## t7

Run at 2026-10-17T17:32:21.674Z on commit `9390ec42`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/cli/__tests__/settings-modal.test.ts: makeServices exposes catalog, repoSettings and setRepoSetting and the fixtures satisfy Services**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | makeServices exposes catalog, repoSettings and setRepoSetting and the fixtures satisfy Services | `src/cli/__tests__/settings-modal.test.ts` |
| pass | makeServices() still returns every pre-existing facade (additive-only) | `src/cli/__tests__/services.test.ts` |

**integration: src/cli/__tests__/settings-modal.test.ts: the modal lists payload rows, edits local rows only and shows an error message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the modal lists payload rows, edits local rows only and shows an error message | `src/cli/__tests__/settings-modal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/services.test.ts` | 0 | 7 | 1.1 s |  |
| `src/cli/__tests__/settings-modal.test.ts` | 0 | 2 | 9.2 s |  |

## t8

Run at 2026-10-17T17:49:39.577Z on commit `04dd34f3`. Tests check: **passed**. 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: vscode-plugin/src/config/__tests__/gateway.test.ts: catalog keeps repoFields and the gateway calls repo.settings.get and repo.settings.set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | catalog keeps repoFields from the daemon payload and is empty when an older daemon omits them | `vscode-plugin/src/config/__tests__/gateway.test.ts` |
| pass | the gateway calls repo.settings.get and repo.settings.set with the repo path, key and value | `vscode-plugin/src/config/__tests__/gateway.test.ts` |
| pass | a daemon refusal becomes a reason-carrying result and a socket rejection propagates | `vscode-plugin/src/config/__tests__/gateway.test.ts` |

**integration: vscode-plugin/src/config/__tests__/per-role-engine.test.ts: FakeGateway returns repoFields and the test passes unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | applyChanges on a valid per-role change calls writeKeyPath with the segment array exactly once, NOT writeKey | `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` |
| pass | pullFromDaemon reads the current per-role override from rawConfig at the dotted key (defaultTier when absent) | `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` |
| pass | pullFromDaemon writes each catalog value, and the ConfigOption.default for an omitted path | `vscode-plugin/src/config/__tests__/sync-engine.test.ts` |
| pass | applyChanges on an INVALID value reports the reason AND reverts the setting to the last-synced value | `vscode-plugin/src/config/__tests__/truthful-sync.test.ts` |

**integration: vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: the stub catalog returns repoFields and the test passes unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | happy path: default core provider -> lists cli-claude models, picking one writes models.tiers.core.model once | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |
| pass | provider switch: runner write OK then model write REFUSES -> the partial state is surfaced (MED) | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |
| pass | a runner-write refusal on a provider switch aborts before the model write | `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` |

**integration: vscode-plugin/src/panels/__tests__/repo-config.test.ts: tracker section, routing through the consent gate, refusal and error message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderRepoConfig: the Tracker section lists local rows as inputs (including ghHost) and status and policy rows read-only | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | renderRepoConfig: an ok:false result shows its message; no repoFields renders no Tracker section; a transport rejection propagates; values are escaped | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | createRepoConfigWriteHandler: a tracker edit goes through consent to writeRepoSetting and never to the models.byRepo route | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | createRepoConfigWriteHandler: declined consent, an unregistered repo and a malformed tracker write write nothing; a refusal shows the daemon message | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |
| pass | renderRepoConfig: discrete per-repo form fields from models.byRepo[repoPath].tiers (NOT raw JSON); missing entry -> all-defaults | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**integration: vscode-plugin/src/workspace/__tests__/activation.test.ts: extension wiring patterns still match with the added dependencies**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S007 sc9: extension.ts wires the repo renderer + the consent-gated per-repo write over the shared sc8 gateway | `vscode-plugin/src/workspace/__tests__/activation.test.ts` |

**integration: vscode-plugin/src/panels/__tests__/detail-renderers.test.ts: closed message set includes repoTrackerWrite and the ghHost edit posts it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source-scan: the webview bootstraps post only the sanctioned message shapes (closed set) | `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` |
| pass | editing the ghHost row of the rendered tracker section posts repoTrackerWrite with repoPath, key and value | `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` |

**integration: vscode-plugin/src/config/__tests__/seam.test.ts: exactly the five daemon calls are allowed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the ConfigGateway references only config.catalog + config.show + config.write + repo.settings.get + repo.settings.set (no cloud/HTTP) | `vscode-plugin/src/config/__tests__/seam.test.ts` |

**integration: vscode-plugin/src/panels/__tests__/webview-host.test.ts: repoTrackerWrite is accepted and routed, errors become refusals, models.byRepo is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Story s3: a {repoTrackerWrite} is forwarded as a validated RepoTrackerWrite; the models.byRepo route and malformed tracker messages are unaffected | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | Story s3: a throwing tracker write sink is caught and logged; errors never reach the webview | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |
| pass | S007: a {selectRepo} message re-renders via repoRenderer(selectedRepo); a {repoWrite} forwards a validated RepoConfigWrite | `vscode-plugin/src/panels/__tests__/webview-host.test.ts` |

**integration: vscode-plugin/src/panels/__tests__/repo-config.test.ts: the sign-in row is rendered read-only with status and reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderRepoConfig: the sign-in row is rendered read-only with status and reason | `vscode-plugin/src/panels/__tests__/repo-config.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/config/__tests__/gateway.test.ts` | 0 | 3 | 1.6 s |  |
| `vscode-plugin/src/config/__tests__/per-role-engine.test.ts` | 0 | 9 | 1.5 s |  |
| `vscode-plugin/src/config/__tests__/seam.test.ts` | 0 | 3 | 1.9 s |  |
| `vscode-plugin/src/config/__tests__/sync-engine.test.ts` | 0 | 11 | 2.2 s |  |
| `vscode-plugin/src/config/__tests__/truthful-sync.test.ts` | 0 | 12 | 2 s |  |
| `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts` | 0 | 21 | 1.5 s |  |
| `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts` | 0 | 9 | 0.8 s |  |
| `vscode-plugin/src/panels/__tests__/repo-config.test.ts` | 0 | 14 | 0.8 s |  |
| `vscode-plugin/src/panels/__tests__/webview-host.test.ts` | 0 | 29 | 0.8 s |  |
| `vscode-plugin/src/workspace/__tests__/activation.test.ts` | 0 | 8 | 0.8 s |  |

## t9

Run at 2026-10-17T18:29:17.325Z on commit `3faa3eda`. Tests check: **passed**. 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: jetbrains-plugin InsrcSettingsTrackerTest: parseCatalog keeps repoFields, the page loads them on a pooled thread and edits route to writeRepoSetting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | InsrcSettingsTrackerTest: parseCatalog keeps repoFields and an older daemon without them gives an empty list | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | InsrcSettingsTrackerTest: readRepoSettings maps loaded, a daemon refusal and a transport fault | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | InsrcSettingsTrackerTest: writeRepoSetting calls repo_settings_set and maps saved, a refusal and a transport fault | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | InsrcSettingsTrackerTest: repo_settings_set keeps a null value on the wire as an explicit null while config_write still drops it | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | InsrcSettingsTrackerTest: the page reads each repo's settings on the pooled thread and hands them with repoFields to PerRepoSection | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | InsrcSettingsTrackerTest: a ghHost edit goes to writeRepoSetting, a model-tier edit still goes to writeSetting | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | InsrcSettingsTrackerTest: a refused tracker edit is reported with the daemon's message and stays pending | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |

**integration: jetbrains-plugin SettingsCatalogDtoDefaultTest: the DTO defaults repoFields and the five settings tests pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SettingsCatalogDtoDefaultTest: the DTO built without repoFields defaults to an empty list | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | SettingsCatalogDtoDefaultTest: the five settings tests build the DTO without repoFields and are unchanged | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | SettingsTreeModelTest: every test passes | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | SettingsTableModelTest: every test passes | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | ModelTiersModelTest: every test passes | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | SettingsEditModelTest: every test passes | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | SettingsViewTest: every test passes | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |

**integration: jetbrains-plugin DaemonGatewayServiceTest: forwards readRepoSettings and writeRepoSetting and the four doubles compile**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DaemonGatewayServiceTest: the service forwards readRepoSettings and writeRepoSetting to its delegate | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | DaemonGatewayServiceTest: the gateway declares both methods and calls repo_settings_get and repo_settings_set, not config_write | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | DaemonGatewayServiceTest: the four DaemonGateway test doubles implement both new methods | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |

**integration: jetbrains-plugin PerRepoSectionTest: one repo's failure shows its reason and the others still render**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PerRepoSectionTest: one repo's failure shows its reason and the others still render | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |

**integration: jetbrains-plugin PerRepoSectionTest: the sign-in row is read-only for signed-in and every failure state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PerRepoSectionTest: the sign-in row is read-only for signed-in and every failure state | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` | 0 | 19 | 9 s |  |

## t10

Run at 2026-10-17T18:36:28.181Z on commit `59f4c7ef`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/cli/__tests__/repo-fields-contract.test.ts: terminal rows equal the shared catalog fixture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the shared fixture equals the daemon table and the config.catalog payload | `src/cli/__tests__/repo-fields-contract.test.ts` |
| pass | terminal rows equal the shared catalog fixture | `src/cli/__tests__/repo-fields-contract.test.ts` |
| pass | a row added to a copy of the table appears in the terminal rows with no client change | `src/cli/__tests__/repo-fields-contract.test.ts` |

**integration: vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts: VS Code rows equal the shared catalog fixture and a new row appears**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VS Code rows equal the shared catalog fixture and a new row appears | `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` |

**integration: jetbrains-plugin RepoFieldsContractTest: JetBrains rows equal the shared catalog fixture and a new row appears**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | RepoFieldsContractTest: JetBrains rows equal the shared catalog fixture and a new row appears | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |
| pass | RepoFieldsContractTest: the rendered Tracker block shows each fixture row's label and note, and only local rows have a text field | `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/test-bridge/kotlin-suite.test.ts` | 0 | 21 | 5.6 s |  |
| `src/cli/__tests__/repo-fields-contract.test.ts` | 0 | 3 | 0.7 s |  |
| `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts` | 0 | 1 | 0.7 s |  |
