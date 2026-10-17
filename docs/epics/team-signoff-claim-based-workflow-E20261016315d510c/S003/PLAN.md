<!-- insrc:artifact PLAN-315d510cb28100e2-s3 -->

# Plan: E20261017315d510c:S003

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1792248840617-kln45r`
**LLD effective hash:** `3738518e4be6...`

Building s3 starts with the shared definitions and a strict, serialised github.json module inside the daemon, then the three daemon methods, then the bounded terminal setup path, and finally each client (terminal, VS Code, JetBrains) and a contract test that proves all three show the same rows. Existing behaviour of the lenient resolver and of the shared socket client is pinned by tests before it is touched, and the many client tests that break when the shared types grow are updated in the same task that breaks them.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Split resolveGithubConfig and add the GithubEntry fields | S | — | unit: src/workflow/config/__tests__/github-split.test.ts: resolveGithubConfig returns none for a missing, unreadable, invalid-JSON and non-object file; unit: src/workflow/config/__tests__/github-split.test.ts: characterization of a null own entry and a null default is unchanged by the split | [[c3]] [[c8]] |
| 2 | **`t2`** Strict github.json reader and the serialised, verified writer | M | `t1` | unit: src/workflow/config/__tests__/github-store.test.ts: readRepoEntry rejects each malformed level and accepts missing parts; unit: src/workflow/config/__tests__/github-store.test.ts: mergeRepoEntryKeys changes only the named keys; unit: src/workflow/config/__tests__/github-store.test.ts: concurrent writes all land one at a time and a failure does not stall the queue; unit: src/workflow/config/__tests__/github-store.test.ts: write-failed leaves the file and temp file as they were; unit: src/workflow/config/__tests__/github-store.test.ts: verify step re-merges after an outside change and returns file-changed after the bounded attempts; integration: src/workflow/config/__tests__/github-store.test.ts: an unwritable directory returns write-failed with the operating-system message | [[c3]] [[c9]] |
| 3 | **`t3`** REPO_TRACKER_FIELDS table, branchPattern grammar and repoFields in the catalog | M | `t1` | unit: src/config/__tests__/repo-fields.test.ts: table keys, kinds, GithubEntry fields and one policy row per TeamPolicy rule; unit: src/config/__tests__/repo-fields.test.ts: branchPattern validator accepts and rejects every listed form with the failing rule; unit: src/config/__tests__/repo-fields.test.ts: a table copy with another placeholder changes what the validator accepts; unit: src/config/__tests__/repo-fields.test.ts: buildSettingsCatalog keeps existing fields, adds repoFields and never throws; unit: src/config/__tests__/repo-fields.test.ts: validateRepoSetting per row for type, owner, repo, ghPath and ghHost | [[c1]] [[c10]] |
| 4 | **`t4`** Opt-in deadline on the shared rpc | S | — | unit: src/shared/__tests__/ipc-client-timeout.test.ts: rpc without opts is unchanged for a reply, an error and a split reply; unit: src/shared/__tests__/ipc-client-timeout.test.ts: rpc with timeoutMs rejects on silence and on early close and cleans up | [[c11]] |
| 5 | **`t5`** Daemon methods repo.settings.get, repo.settings.set and repo.trackerConfig.ensure | L | `t2`, `t3` | unit: src/daemon/__tests__/repo-settings.test.ts: buildRepoSettings values, resolved target and policy rows; unit: src/daemon/__tests__/repo-settings.test.ts: sign-in mapping for every whoAmI outcome; unit: src/daemon/__tests__/repo-settings.test.ts: repo identity uses the exact registered path; integration: src/daemon/__tests__/repo-settings.test.ts: get returns what set wrote and shows an outside write; integration: src/daemon/__tests__/repo-settings.test.ts: set refuses read-only, unknown, invalid and unregistered inputs and writes nothing; integration: src/daemon/__tests__/repo-settings.test.ts: only the signed-in-user read runs through s1's adapter; integration: src/daemon/__tests__/repo-settings.test.ts: malformed files return github-json-unreadable and keep their bytes; integration: src/daemon/__tests__/repo-settings.test.ts: get reads once, never writes, and resolves from the git remote when there is no own target; integration: src/daemon/__tests__/repo-settings.test.ts: ensure writes the five keys once and concurrent sets both land | [[c1]] [[c3]] [[c9]] [[c12]] |
| 6 | **`t6`** Terminal tracker setup through the daemon with a validated plan | M | `t2`, `t4`, `t5` | unit: src/workflow/tracker/__tests__/setup-plan.test.ts: planTrackerConfig already, needs-write and no-origin cases; unit: src/workflow/tracker/__tests__/setup-plan.test.ts: planTrackerConfig fails on malformed files without throwing, calling the daemon or writing; unit: src/workflow/tracker/__tests__/setup-plan.test.ts: runTrackerSetup reports a configOutcome verbatim and touches no file; existing behaviour without it; integration: src/cli/__tests__/tracker-setup-service.test.ts: config step done, already and failed through the terminal service; integration: src/cli/__tests__/tracker-setup-service.test.ts: silent and early-closing daemon fail the config step within the deadline; integration: src/cli/__tests__/tracker-setup-service.test.ts: the remaining setup steps still run after a failed config step; integration: src/cli/__tests__/tracker-setup-service.test.ts: malformed github.json fails the config step with no daemon call; integration: src/cli/__tests__/tracker-setup-service.test.ts: makeServices always injects the config seam | [[c4]] [[c11]] [[c13]] |
| 7 | **`t7`** Terminal client: Services members and the settings modal | M | `t5`, `t6` | integration: src/cli/__tests__/settings-modal.test.ts: makeServices exposes catalog, repoSettings and setRepoSetting and the fixtures satisfy Services; integration: src/cli/__tests__/settings-modal.test.ts: the modal lists payload rows, edits local rows only and shows an error message | [[c2]] [[c5]] |
| 8 | **`t8`** VS Code client: snapshot, renderer, webview message and fixtures | L | `t5` | integration: vscode-plugin/src/config/__tests__/gateway.test.ts: catalog keeps repoFields and the gateway calls repo.settings.get and repo.settings.set; integration: vscode-plugin/src/config/__tests__/per-role-engine.test.ts: FakeGateway returns repoFields and the test passes unchanged; integration: vscode-plugin/src/models/__tests__/model-tier-picker.test.ts: the stub catalog returns repoFields and the test passes unchanged; integration: vscode-plugin/src/panels/__tests__/repo-config.test.ts: tracker section, routing through the consent gate, refusal and error message; integration: vscode-plugin/src/workspace/__tests__/activation.test.ts: extension wiring patterns still match with the added dependencies; integration: vscode-plugin/src/panels/__tests__/detail-renderers.test.ts: closed message set includes repoTrackerWrite and the ghHost edit posts it; integration: vscode-plugin/src/config/__tests__/seam.test.ts: exactly the five daemon calls are allowed; integration: vscode-plugin/src/panels/__tests__/webview-host.test.ts: repoTrackerWrite is accepted and routed, errors become refusals, models.byRepo is unchanged; integration: vscode-plugin/src/panels/__tests__/repo-config.test.ts: the sign-in row is rendered read-only with status and reason | [[c2]] [[c6]] |
| 9 | **`t9`** JetBrains client: gateway, DTO, settings page and fixtures | L | `t5` | integration: jetbrains-plugin InsrcSettingsTrackerTest: parseCatalog keeps repoFields, the page loads them on a pooled thread and edits route to writeRepoSetting; integration: jetbrains-plugin SettingsCatalogDtoDefaultTest: the DTO defaults repoFields and the five settings tests pass unchanged; integration: jetbrains-plugin DaemonGatewayServiceTest: forwards readRepoSettings and writeRepoSetting and the four doubles compile; integration: jetbrains-plugin PerRepoSectionTest: one repo's failure shows its reason and the others still render; integration: jetbrains-plugin PerRepoSectionTest: the sign-in row is read-only for signed-in and every failure state | [[c2]] [[c7]] |
| 10 | **`t10`** Contract test that all three clients show the same rows | S | `t7`, `t8`, `t9` | integration: src/cli/__tests__/repo-fields-contract.test.ts: terminal rows equal the shared catalog fixture; integration: vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts: VS Code rows equal the shared catalog fixture and a new row appears; integration: jetbrains-plugin RepoFieldsContractTest: JetBrains rows equal the shared catalog fixture and a new row appears | [[c1]] [[c2]] |

### 1.1 E20261017315d510c:S003:T001 — Split resolveGithubConfig and add the GithubEntry fields

In src/workflow/config/github.ts split resolveGithubConfig into loadGithubConfigFile plus a new exported resolveGithubConfigFromFile with the selection and resolution logic moved unchanged, and add optional ghPath, ghHost and branchPattern to GithubEntry (ignored by the resolvers). Before the move, record the current behaviour for loader-rejected inputs and for a null own entry and a null default as characterization tests.

**Acceptance checks:**
- Every existing resolveGithubConfig test passes without edits
- resolveGithubConfig returns none for a missing file, an unreadable file, invalid JSON and a non-object top level
- Characterization tests pin today's result or TypeError for a null own entry and for a null default and pass before and after the split
- resolveStrictTrackerTarget and the other callers are unaffected by the new optional fields

### 1.2 E20261017315d510c:S003:T002 — Strict github.json reader and the serialised, verified writer

Add readRepoEntry (strict level-by-level object validation, read and parse errors reported, missing file is empty), mergeRepoEntryKeys, and the daemon-side writeRepoEntryKeys: one in-process promise queue, read-validate-merge-temp write, verify size, mtime and content hash immediately before the rename with a bounded retry, write-failed and file-changed results, queue never left rejected. No lock file anywhere.

**Acceptance checks:**
- readRepoEntry rejects every malformed level and names it, and accepts missing file, default, repos and entry
- Concurrent writes for different keys all land and never overlap; a failing write does not stall the queue
- A hook that changes the file after the temp write makes the writer re-merge from the new content, and after the bounded attempts return file-changed with nothing written
- Temp-write and rename failures return write-failed with the operating-system message and leave the file as it was
- Only the named keys change; default, other repos and unknown keys are preserved; null removes a key and is a no-op for an unset key

### 1.3 E20261017315d510c:S003:T003 — REPO_TRACKER_FIELDS table, branchPattern grammar and repoFields in the catalog

Add the single REPO_TRACKER_FIELDS table next to CONFIG_CATALOG with local, status and policy rows (one policy row per TeamPolicy rule), the value validators, and the branchPattern grammar on its row (placeholders {id}, {slug}, {type} only, allowed characters, length and structural rules). Expose the definitions as the static repoFields field of buildSettingsCatalog, which stays pure and total.

**Acceptance checks:**
- Keys are unique, every local key is a GithubEntry field and there is one policy row per TeamPolicy rule
- buildSettingsCatalog keeps every existing field unchanged, adds repoFields and never throws
- The branchPattern validator accepts and rejects exactly the forms in the LLD, each rejection naming the failing rule
- A test copy of the table with an added placeholder changes what the validator accepts with no other change

### 1.4 E20261017315d510c:S003:T004 — Opt-in deadline on the shared rpc

Add the optional fourth parameter { timeoutMs } to rpc in src/shared/ipc-client.ts: with it the request rejects on the deadline and on the socket ending or closing before a reply, always destroys the socket and clears the timer; without it nothing changes. src/cli/client.ts keeps re-exporting it.

**Acceptance checks:**
- Existing ipc-client tests pass unchanged and rpc without opts behaves as before
- A silent fake socket rejects with a timeout error and a socket that ends or closes before a reply rejects with a closed error
- The socket is destroyed and the timer cleared on every outcome, and a reply inside the deadline resolves normally

### 1.5 E20261017315d510c:S003:T005 — Daemon methods repo.settings.get, repo.settings.set and repo.trackerConfig.ensure

Register the three IPC methods in the daemon, built and validated in the order get, set, ensure: exact registered-path check, one strict read and resolution from that snapshot, the exhaustive sign-in mapping from whoAmI on s1's adapter (read only), policy rows from PolicyReader, validation and refusal of non-local keys, writes through writeRepoEntryKeys, and the trackerConfig patch (type github, owner, repo, pushTasks true, commitArtifacts true). Business errors are returned as data.

**Acceptance checks:**
- get returns what set wrote and a write made outside the daemon on the next get; get never writes github.json or the policy file
- set refuses policy and status rows, unknown keys, invalid values (including branchPattern) and unregistered or aliased repo paths with the right code and writes nothing
- A fake gh shows only the signed-in-user read runs, once, when the type is github and none when the type is none, and every PortResult failure maps to a sign-in state
- get and set on malformed files return github-json-unreadable and leave the bytes untouched; get reads the file once
- ensure writes the five keys in one write, returns changed false when already complete, and refuses unregistered repos and invalid owner or name; concurrent set calls through the socket both land

### 1.6 E20261017315d510c:S003:T006 — Terminal tracker setup through the daemon with a validated plan

Add planTrackerConfig (strict readRepoEntry first; any structural failure is a failed plan; then the existing completeness test), the optional configOutcome seam on runTrackerSetup, and make trackerSetup in src/cli/services/workflow.ts asynchronous: plan, call repo.trackerConfig.ensure through rpc with timeoutMs 15000 when a write is needed, then run the remaining steps. Update the command layer, the TUI and Services callers. The deadline bounds only the config call; the other steps run afterwards and are not bounded by it.

**Acceptance checks:**
- planTrackerConfig returns failed with the strict message, calls no daemon and writes nothing for a null own entry with a complete default, a null default, non-object levels and invalid JSON, without throwing
- With a running test daemon the config step reports done or already with today's detail text; with no daemon, a silent daemon and an early-closing daemon it reports failed within the deadline and says the daemon owns the file
- In every failure branch the remaining setup steps still execute and report, asserted separately from the timeout assertion; no test claims a 15 second total setup time
- makeServices always passes configOutcome into runTrackerSetup and a source search test fails if production code outside the daemon and tests calls it without it
- Existing runTrackerSetup tests pass unchanged without the seam

### 1.7 E20261017315d510c:S003:T007 — Terminal client: Services members and the settings modal

Add catalog, repoSettings and setRepoSetting to Services.config (functions in src/cli/services/config.ts, wired in makeServices), the settings modal on the repos pane listing repoFields rows with local rows editable and policy and status rows read-only, and update the four Services fixtures.

**Acceptance checks:**
- makeServices exposes the three members and the command, tui, services and team-service fixtures satisfy the interface
- The modal shows the same labels and values as the shared payload, edits local rows including ghHost only, and shows the message of an ok:false result

### 1.8 E20261017315d510c:S003:T008 — VS Code client: snapshot, renderer, webview message and fixtures

Build in this order so the tests that break are updated in the same task: gateway and types first, then the renderer and write-handler dependencies, then the repoTrackerWrite webview message and its consent-gated route with the extension wiring, then the fixtures: seam test allowed set, the FakeGateway tests, model-tier-picker, repo-config, detail-renderers and activation tests.

**Acceptance checks:**
- catalog keeps repoFields (empty when the daemon omits it) and the tracker section renders with local rows editable and policy and status rows read-only
- repo-config.test.ts renderRepoConfig calls and makeWriteDeps supply the new dependencies, model-tier assertions pass unchanged, and tracker routing, refusal and error-message cases are added
- detail-renderers.test.ts allows repoTrackerWrite and a new test shows the ghHost edit posts it; seam test allows exactly the five daemon calls; activation.test.ts passes
- The three FakeGateway tests and the model-tier-picker test pass with the new fields

### 1.9 E20261017315d510c:S003:T009 — JetBrains client: gateway, DTO, settings page and fixtures

Add readRepoSettings and writeRepoSetting to DaemonGateway, DaemonGatewayImpl and DaemonGatewayService, repoFields with an emptyList default to SettingsCatalogDto and parseCatalog, the RepoSettingsResult type, the pooled-thread load in InsrcSettingsConfigurable and the tracker rows in PerRepoSection, and update the four DaemonGateway test doubles and the five settings tests. If the Kotlin tests cannot be run in the build environment, the build notes say so.

**Acceptance checks:**
- The five settings tests compile and pass unchanged and the four doubles implement the new methods
- The page loads repoFields and each repo's settings on the pooled thread, shows a per-repo error without breaking the other repos, and routes tracker edits to writeRepoSetting while model-tier edits keep writeSetting
- The sign-in row is read-only and shows the status and reason for signed-in and each failure state

### 1.10 E20261017315d510c:S003:T010 — Contract test that all three clients show the same rows

Add the shared JSON fixture of the config.catalog payload and the TypeScript and Kotlin tests that load it, asserting the row keys, labels, kinds and notes rendered by the terminal, VS Code and JetBrains clients equal repoFields, and that a row added to a test copy of the table appears in all three models.

**Acceptance checks:**
- Each client's rendered rows equal the repoFields in the shared fixture
- A row added to a test copy of the table appears in all three client models without a client change

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| REPO_TRACKER_FIELDS has a unique key per row and a kind of local, status or policy on every row, every local key is a GithubEntry field, and there is one policy row for each team rule in the real TeamPolicy type (team mode, signoff stages, claims enforced, claim units, administrators, forced task issues) | `t3` |
| the branchPattern validator accepts feature/{type}/{id}-{slug}, {id}, {id}-{slug}, release/v1.2 and a pattern of exactly 200 characters, and rejects each of these with invalid-value naming the rule that failed: {user}, {id (unmatched), id} (unmatched), {}, a literal brace that is not a placeholder, a space, a character such as ~ ^ : ? * [ or a backslash, the empty string, 201 characters, a leading slash, a trailing slash, two consecutive slashes, '..' and a '.lock' ending | `t3` |
| the branchPattern grammar is read from the single REPO_TRACKER_FIELDS row, and a test copy of the table with one more placeholder changes what the validator accepts without any change to a client | `t3` |
| buildSettingsCatalog still returns every existing field unchanged, adds repoFields, stays pure and never throws for an empty or garbage config | `t3` |
| validateRepoSetting accepts and rejects values per row: type enum, owner and repo names, ghPath and ghHost with a newline | `t3` |
| readRepoEntry refuses an unreadable file, invalid JSON, a non-object top level, default that is null or an array or a primitive, repos that is null, an array or a primitive, and an own entry that is null, an array or a primitive, naming the failing level, and accepts a missing file, default, repos and entry | `t2` |
| resolveGithubConfig keeps returning none for the inputs the loader rejects: a missing file, an unreadable file, invalid JSON and a file whose top level is not an object; every existing resolveGithubConfig test case passes without edits after the split into loadGithubConfigFile and resolveGithubConfigFromFile | `t1` |
| characterization of the lenient API: for a null own entry and for a null default, resolveGithubConfig and resolveGithubConfigFromFile give exactly the result or the same thrown TypeError that the code gives before the split (recorded from the pre-split behaviour), so the split adds neither a new throw nor a new swallow | `t1` |
| buildRepoSettings reports values from the repo's own entry only, the resolved target with its source, and the policy rows, including claimUnits built from a real TeamPolicy value, from a PolicyResult for none, team and ok:false | `t5` |
| the sign-in mapping turns every whoAmI outcome into a signin.state: ok to signed-in with the login, and missing-tool, missing-signin (including an empty login), unreachable and rejected each to their own state with the reason, and a thrown exception to rejected | `t5` |
| mergeRepoEntryKeys changes only the named keys, keeps the default entry, other repos and unknown keys, removes a key for null, and is a no-op for null on an unset key | `t2` |
| writeRepoEntryKeys queue: many concurrent calls for different keys of the same file all land (none is lost), run one at a time (an instrumented fs seam never sees two overlapping writes), and a failing call (injected write error) does not stop the queued calls after it | `t2` |
| writeRepoEntryKeys returns write-failed with the operating-system message and leaves the file and the temporary file as they were when the temporary write fails or the rename fails | `t2` |
| writeRepoEntryKeys verify step: with an injected hook that changes the file after the temp write, the verify detects a different size, mtime or hash, discards the temp file and merges again from the new content; after the bounded attempts it returns file-changed and writes nothing | `t2` |
| planTrackerConfig returns already only for a structurally valid file whose entry is complete (type github, owner, repo, pushTasks true, commitArtifacts true), needs-write with the owner and name from the origin remote when it is not, and failed with today's detail text when there is no origin remote | `t6` |
| planTrackerConfig returns failed with the strict reader's message, calls no daemon and writes nothing for: a null own entry while the default is complete, a null default, an own entry that is an array or a primitive, a non-object top level, default or repos, and invalid JSON; none of these throws | `t6` |
| runTrackerSetup with a configOutcome reports that outcome verbatim for the config step and neither reads nor writes github.json; without it the config step behaves as today and the existing setup tests pass unchanged | `t6` |
| rpc without opts behaves exactly as before for a normal reply, a connection error and a reply split across data events (the existing ipc-client tests pass unchanged) | `t4` |
| rpc with opts.timeoutMs rejects with a timeout error when a fake socket accepts the connection and never replies, and rejects with a closed error when the fake socket ends or closes before a reply; in both cases the socket is destroyed and the timer is cleared, and a normal reply inside the deadline resolves and clears the timer | `t4` |
| repo identity: repo.settings.get and repo.settings.set key the entry on the exact registered path string; a symlink path that is not itself registered returns repo-not-registered, and two registered paths (a symlink and its target) keep separate entries with different settings | `t5` |
| repo.settings.get reads the signed-in login only through s1's adapter: with a fake gh recording its commands, it runs the signed-in-user read once when the type is github, runs no other port method and changes no tracker state, and runs no gh command when the type is none | `t5` |
| repo.settings.get returns what repo.settings.set just wrote, and a write made outside the daemon is shown on the next get (ac13) | `t5` |
| repo.settings.set refuses a policy row, a status row, an unknown key, an invalid value (including an invalid branchPattern) and an unregistered repo with the right code, and writes nothing in each case | `t5` |
| two clients' repo.settings.set calls issued at the same time through the daemon socket both land their keys | `t5` |
| repo.trackerConfig.ensure writes type, owner, repo, pushTasks and commitArtifacts in one write, returns changed false when the entry is already complete, and refuses an unregistered repo and an invalid owner or name | `t5` |
| tracker setup through the terminal service: with a running test daemon the config step reports done with today's detail text and the file holds the entry; with the entry already complete in a valid file it reports already and makes no daemon call; with no daemon it reports failed saying the daemon owns the file, writes nothing, and the other steps still report | `t6` |
| tracker setup through the terminal service against a daemon that accepts the socket and never replies, and against one that closes the connection without a reply: the config step is reported failed within the deadline, the socket is released, and the other steps still report | `t6` |
| tracker setup through the terminal service with a malformed github.json (null own entry with a complete default, null default): the config step is failed with the strict reader's message and no daemon call is made | `t6` |
| makeServices always injects the daemon config seam: trackerSetup passes configOutcome into runTrackerSetup in every branch, and a source search test fails if code outside the daemon and the tests calls runTrackerSetup without it | `t6` |
| a file or directory that is not writable makes the write return write-failed with the operating-system message | `t2` |
| repo.settings.get and repo.settings.set on a file whose repos entry is null, whose default is null, whose top level is a primitive, or that holds invalid JSON, return github-json-unreadable, never throw and never report 'no tracker', and leave the original bytes untouched | `t5` |
| repo.settings.get makes one read of github.json: a test counts the reads and rewrites the file after the read, and the result still describes the version that was read | `t5` |
| a repo with no own target resolves to its git remote in the payload, and a default entry's owner and repo are never reported as the target (ac12) | `t5` |
| repo.settings.get leaves github.json and the authored policy file byte for byte unchanged | `t5` |
| JetBrains: parseCatalog keeps repoFields in SettingsCatalogDto, InsrcSettingsConfigurable loads repoFields and each registered repo's settings on its pooled thread and passes them to PerRepoSection, an edit of the ghHost row goes to writeRepoSetting and a refusal comes back as SaveResult.Rejected while model-tier edits still use writeSetting | `t9` |
| JetBrains: SettingsCatalogDto built without repoFields compiles and defaults to an empty list, and SettingsTreeModelTest, SettingsTableModelTest, ModelTiersModelTest, SettingsEditModelTest and SettingsViewTest pass unchanged | `t9` |
| JetBrains: DaemonGatewayService forwards readRepoSettings and writeRepoSetting to its delegate, and the four DaemonGateway test doubles compile and pass with the two new methods | `t9` |
| JetBrains: when one repo's settings come back Rejected or Unavailable, its tracker rows show the reason and the other repos and the model-tier rows still render | `t9` |
| JetBrains: the sign-in status row is read-only and shows the status and reason from the payload, for signed-in and for each failure state | `t9` |
| VS Code: createDaemonConfigGateway.catalog keeps repoFields in ConfigCatalogSnapshot (an empty list when the daemon omits it), renderRepoConfig receives them through its new dependency and renders the tracker section, and the gateway calls repo.settings.get and repo.settings.set | `t8` |
| VS Code: the FakeGateway classes in per-role-engine.test.ts, sync-engine.test.ts and truthful-sync.test.ts and the stub catalog in model-tier-picker.test.ts return repoFields, implement the new ConfigGateway methods where they implement the interface, and all four tests pass unchanged in what they assert | `t8` |
| VS Code: repo-config.test.ts is updated so every renderRepoConfig call and makeWriteDeps supply repoFields, repoSettings and writeRepoSetting; its model-tier assertions pass unchanged; new cases show that the selected repo renders a Tracker section with local rows editable and policy and status rows read-only, that an error result renders its message, that a tracker write reaches writeRepoSetting through the consent gate, and that a refusal from writeRepoSetting is reported while the models.byRepo route is untouched | `t8` |
| VS Code: activation.test.ts passes with the extension wiring, whose repo renderer still reads registeredRepos and rawConfig and whose write sink still goes through writeKeyPath, consent and status, now with the added dependencies injected | `t8` |
| VS Code: detail-renderers.test.ts is updated so the repo bootstrap posts selectRepo, repoWrite and repoTrackerWrite and the closed message set includes repoTrackerWrite, and a new test shows that editing the ghHost row in the rendered tracker section posts repoTrackerWrite with repoPath, key and value | `t8` |
| VS Code: the seam test accepts exactly config.catalog, config.show, config.write, repo.settings.get and repo.settings.set as daemon calls from gateway.ts and still rejects cloud and HTTP access | `t8` |
| VS Code: the webview host accepts the repoTrackerWrite message, createRepoConfigWriteHandler sends an edit of the ghHost row through the consent gate to writeRepoSetting, a returned error becomes a refusal with its message, and the models.byRepo route is unchanged | `t8` |
| VS Code: the sign-in status row is rendered read-only with the status and reason | `t8` |
| terminal client: makeServices exposes config.catalog, config.repoSettings and config.setRepoSetting, trackerSetup is awaited by its callers in command.ts and the TUI, and the Services fixtures in command, tui, services and team-service tests satisfy the interface | `t6`, `t7` |
| terminal client: the settings modal on the repos pane lists the rows from the same payload with the same labels and values as the VS Code model, offers an edit for local rows only (including ghHost), shows the sign-in status row and policy rows read-only, and shows the message of an ok:false result | `t7` |
| the row keys, labels, kinds and notes each client renders equal those in repoFields from config.catalog, for VS Code, JetBrains and the terminal client | `t10` |
| adding a row to REPO_TRACKER_FIELDS in a test copy appears in all three client models without any client change | `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 REPO_TRACKER_FIELDS, SettingsCatalogPayload and the single field definition (src/config/config-catalog.ts, src/config/settings-catalog.ts)`
- **[[c2]]** `prior-artifact` `LLD s3 client change inventory: DaemonGateway, ConfigGateway, Services and every dependent fixture`
- **[[c3]]** `code` `src/workflow/config/github.ts`
- **[[c4]]** `code` `src/workflow/tracker/setup.ts:163-200`
- **[[c5]]** `code` `src/cli/services/index.ts:79-83`
- **[[c6]]** `code` `vscode-plugin/src/extension.ts:399-412`
- **[[c7]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:82-112`
- **[[c8]]** `prior-artifact` `LLD s3 resolveGithubConfigFromFile and the unchanged behaviour of the lenient resolver`
- **[[c9]]** `prior-artifact` `LLD s3 github.json module: readRepoEntry, mergeRepoEntryKeys and the serialised writeRepoEntryKeys with verify-before-rename`
- **[[c10]]** `prior-artifact` `LLD s3 branchPattern grammar in the REPO_TRACKER_FIELDS row`
- **[[c11]]** `code` `src/shared/ipc-client.ts:46`
- **[[c12]]** `prior-artifact` `LLD s3 daemon methods repo.settings.get, repo.settings.set and repo.trackerConfig.ensure`
- **[[c13]]** `code` `src/cli/services/workflow.ts:334-336`
