<!-- insrc:artifact LLD-315d510cb28100e2-s3 -->

# LLD: E20261017315d510c:S003

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `3738518e4be6...`

A developer sees and edits their own tracker settings for a repo (tracker type, target, the gh tool location, the host gh signs in to, and branch naming) in VS Code, JetBrains and the terminal client. Sign-in itself is shown as a live read-only status, because insrc stores no secrets: by the owner's recorded decision this is how 'edit sign-in' in the upstream criteria is met. The team's policy rules appear next to the settings as read-only values. All three clients render the same rows from one daemon definition, and the daemon is the only process that writes ~/.insrc/github.json, so a change made in one client shows in the others and writers cannot overwrite each other.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-315d510cb28100e2** § 2. Framework summary

**Rollout phase:** Phase B — settings and issue readiness
**Consumes:** `sc2` (TeamPolicy)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-S001 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.
- `s9`: Private implementation of s9: Keep tracker issues and status in step with the work without a manual step

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `buildSettingsCatalog`

```typescript
buildSettingsCatalog(rawConfig: Record<string, unknown>): SettingsCatalogPayload
```

**Parameters:**
- `rawConfig: Record<string, unknown>` — The parsed ~/.insrc/config.json, or {} when absent.

**Returns:** `SettingsCatalogPayload` — The existing payload plus one new static field, repoFields: the definitions of the repo-scoped rows (key, label, type, enum values, default, description, kind local | policy | status, group, note, and for branchPattern its grammar). Still pure and total.

**Postconditions:**
- The definitions come from the single REPO_TRACKER_FIELDS table, so config.catalog is where every client learns which repo-scoped rows exist (k6)
- Existing fields of the payload are unchanged, so a client that does not know repoFields keeps working

### 2.2 `repo.settings.get`

```typescript
repo.settings.get(params: { repo: string }): Promise<{ ok: true; payload: RepoSettingsPayload } | { ok: false; error: RepoSettingsError }>
```

**Parameters:**
- `repo: string` — The repo path exactly as registered with the daemon.

**Returns:** `{ ok: true; payload: RepoSettingsPayload } | { ok: false; error: RepoSettingsError }` — The repo's current value for each local row, the resolved tracker target with its source, the live sign-in status, and the policy rows with the policy value and source or the reason it could not be read; or a business error as data.

**Errors:**
- `repo-not-registered` when repo is not exactly a registered repo path
- `github-json-unreadable` when github.json exists but cannot be read or is not valid JSON, its top level is not an object, default or repos is present and not an object, or the repo's own entry is present and not an object; the reason names which; nothing is written

**Preconditions:**
- repo is a registered repo path

**Postconditions:**
- Reads github.json once per call with the strict reader and resolves the target from that same validated snapshot through resolveGithubConfigFromFile, so there is no second read
- Never writes github.json or the authored policy; the policy reader may persist its own sighting metadata as it does for any caller
- A policy that cannot be read yields policy rows with the reason, not a failure of the whole call
- The sign-in status calls only whoAmI on s1's adapter (sc1) and changes no tracker state

### 2.3 `repo.settings.set`

```typescript
repo.settings.set(params: { repo: string; key: string; value: string | boolean | null }): Promise<{ ok: true; payload: RepoSettingsPayload } | { ok: false; error: RepoSettingsError }>
```

**Parameters:**
- `repo: string` — The repo path exactly as registered.
- `key: string` — A key of a local row in REPO_TRACKER_FIELDS.
- `value: string | boolean | null` — The new value, checked against the row's type, enum and grammar; null removes the key from the repo's entry.

**Returns:** `{ ok: true; payload: RepoSettingsPayload } | { ok: false; error: RepoSettingsError }` — On success the payload re-read after the write; on failure a RepoSettingsError carrying a code and a message.

**Errors:**
- `unknown-key` when key is not a row of the table
- `read-only-key` when key is a policy or status row
- `invalid-value` when value fails the row's type, enum or grammar check, including the branchPattern grammar (placeholders {id}, {slug}, {type} only; letters, digits, slash, hyphen, underscore and dot otherwise; 1 to 200 characters; no leading or trailing slash, no consecutive slashes, no '..', no '.lock' ending)
- `repo-not-registered` when repo is not exactly a registered repo path
- `github-json-unreadable` when the existing file fails the structural validation; it is left untouched
- `file-changed` when a process outside the daemon changed the file on every one of the bounded write attempts
- `write-failed` when the temporary file or the rename failed (permission, missing directory, disk full); the message carries the operating-system error

**Preconditions:**
- repo is a registered repo path

**Postconditions:**
- Changes only that key of repos[repo]; the default entry, other repos and unknown keys of the file are preserved
- The change goes through writeRepoEntryKeys and is atomic (temp file in the same directory, then rename)
- The repo string is used as the key unchanged: it is the registered path that repo.add stored, which is also the key resolveGithubConfig uses, so no alias lookup or symlink resolution is added
- A repo with no entry gets one holding only the written key
- Business errors are returned as data, not thrown

### 2.4 `repo.trackerConfig.ensure`

```typescript
repo.trackerConfig.ensure(params: { repo: string; owner: string; name: string }): Promise<{ ok: true; changed: boolean } | { ok: false; error: RepoSettingsError }>
```

**Parameters:**
- `repo: string` — The repo path exactly as registered.
- `owner: string` — GitHub owner taken from the repo's origin remote by the caller.
- `name: string` — GitHub repository name taken from the origin remote by the caller.

**Returns:** `{ ok: true; changed: boolean } | { ok: false; error: RepoSettingsError }` — Whether the daemon wrote the entry (changed true) or found it already complete (changed false); or a business error as data.

**Errors:**
- `invalid-value` when owner or name is not a valid GitHub name
- `repo-not-registered` when repo is not exactly a registered repo path
- `github-json-unreadable` when the existing file fails the structural validation; it is left untouched
- `file-changed` when an outside process changed the file on every bounded attempt
- `write-failed` when the temporary file or the rename failed; the message carries the operating-system error

**Preconditions:**
- repo is a registered repo path

**Postconditions:**
- Applies exactly what the tracker setup config step writes today in one patch: type github, owner, repo, pushTasks true, commitArtifacts true, for repos[repo] only
- When the entry already has those values it writes nothing and returns changed false
- It is the only way the terminal client changes github.json

### 2.5 `writeRepoEntryKeys`

```typescript
writeRepoEntryKeys(repoPath: string, patch: Readonly<Record<string, string | boolean | null>>, configPath?: string): Promise<WriteResult>
```

**Parameters:**
- `repoPath: string` — Registered repo path whose entry in github.json is changed, used unchanged as the key.
- `patch: Readonly<Record<string, string | boolean | null>>` — Keys to set (null removes a key).
- `configPath: string` _(optional)_ — File to write; defaults to githubConfigPath().

**Returns:** `Promise<WriteResult>` — { ok: true, changed: boolean } or { ok: false, error: WriteError } where WriteError is { code: 'github-json-unreadable' | 'file-changed' | 'write-failed'; message: string }.

**Errors:**
- `github-json-unreadable` when structural validation of the file fails
- `file-changed` when the verify step found an outside change on every one of the bounded attempts
- `write-failed` when an operating-system error occurred while writing the temporary file or renaming it; no partial file is left

**Preconditions:**
- called only inside the daemon process

**Postconditions:**
- Calls are chained on one in-process promise queue, so two writes in the daemon never run at the same time and there is no lock file, no stale-lock handling and no file-locked error
- Per attempt: read and validate the file and record its size, mtime and content hash, merge the patch, write a temp file; then, immediately before the rename, re-read the file and require the same size, mtime and hash. If the check fails the temp file is removed and the attempt restarts from the fresh content, up to a fixed small number of attempts, after which the call returns file-changed
- Residual window: an edit by a process outside the daemon (an editor, a script) between the final check and the rename is not detected, because rename cannot be made conditional; this is the one stated limit
- Never throws for the three error codes; a thrown exception inside the queue is converted to write-failed so the queue is never left rejected

### 2.6 `readRepoEntry`

```typescript
readRepoEntry(repoPath: string, configPath?: string): ReadResult
```

**Parameters:**
- `repoPath: string` — Repo whose entry is selected from the file.
- `configPath: string` _(optional)_ — File to read; defaults to githubConfigPath().

**Returns:** `ReadResult` — { ok: true, file: GithubConfigFile, entry: GithubEntry | undefined } with the parsed and validated snapshot, or { ok: false, error: WriteError } with code github-json-unreadable naming the file and the failing level.

**Errors:**
- `github-json-unreadable` when the file exists but cannot be read, is not valid JSON, or fails the level-by-level object check

**Postconditions:**
- A missing file is not an error: it yields an empty snapshot
- Unlike loadGithubConfigFile it reports read and parse failures and null or primitive values instead of returning {}
- It is a pure read, so the terminal setup planner may call it without writing anything

### 2.7 `resolveGithubConfigFromFile`

```typescript
resolveGithubConfigFromFile(file: GithubConfigFile, repoPath: string): ResolvedGithubConfig
```

**Parameters:**
- `file: GithubConfigFile` — An already loaded github.json snapshot; the daemon passes one that has passed the strict structural validation.
- `repoPath: string` — Repo whose tracker target is resolved.

**Returns:** `ResolvedGithubConfig` — The result resolveGithubConfig computes today, over the given snapshot instead of a fresh read.

**Errors:**
- `GithubConfigError` when github is enabled for the repo but no owner/repo could be resolved

**Preconditions:**
- the daemon methods call it only with a snapshot that passed readRepoEntry, so no entry is null there

**Postconditions:**
- resolveGithubConfig is split into loadGithubConfigFile plus a call to this function; the selection and resolution logic is moved, not changed, so resolveGithubConfig gives the same result for every input as before, including the inputs the loader rejects and the structurally malformed nested entries (its existing tests pass without edits) (k4)

### 2.8 `resolveGithubConfig`

```typescript
resolveGithubConfig(repoPath: string, configPath?: string): ResolvedGithubConfig
```

**Parameters:**
- `repoPath: string` — Repo whose tracker target is resolved.
- `configPath: string` _(optional)_ — Config file; defaults to githubConfigPath().

**Returns:** `ResolvedGithubConfig` — Unchanged result: loadGithubConfigFile followed by resolveGithubConfigFromFile.

**Errors:**
- `GithubConfigError` when github is enabled for the repo but no owner/repo could be resolved

**Postconditions:**
- Same signature and the same behaviour for every input as today: the loader returns an empty file for a missing, unreadable, invalid or non-object file so the result is none, and a structurally malformed nested entry is handled exactly as it is today; the new GithubEntry fields are optional and ignored by it and by resolveStrictTrackerTarget

### 2.9 `planTrackerConfig`

```typescript
planTrackerConfig(repoPath: string): TrackerConfigPlan
```

**Parameters:**
- `repoPath: string` — Repo being set up.

**Returns:** `TrackerConfigPlan` — { status: 'already', detail } | { status: 'needs-write', owner, name } | { status: 'failed', detail }. Pure: it reads the file and the origin remote and writes nothing.

**Postconditions:**
- It first calls readRepoEntry; any structural failure (unreadable file, invalid JSON, a null or non-object top level, default, repos or own entry) returns failed with the strict reader's message, so a malformed file is never reported as already and nothing is dereferenced while null
- Only a structurally valid file reaches the completeness test (the own entry, else the default, has type github, owner, repo, pushTasks true and commitArtifacts true), which is the test the setup uses today
- With no origin remote it returns failed with today's detail text

### 2.10 `runTrackerSetup`

```typescript
runTrackerSetup(repoPath: string, opts?: TrackerSetupOptions): TrackerSetupReport
```

**Parameters:**
- `repoPath: string` — Repo being set up.
- `opts: TrackerSetupOptions` _(optional)_ — includeProject as today, plus an optional config seam: configOutcome, a precomputed result for the config step ({ status: 'done' | 'already' | 'failed', detail }).

**Returns:** `TrackerSetupReport` — The same synchronous report as today. When opts.configOutcome is given the config step reports it verbatim and does not touch the file.

**Postconditions:**
- Without configOutcome the config step behaves as today (in-process, for tests and callers inside one process), so the existing setup tests that exercise it pass unchanged
- With configOutcome it does not read or write github.json; the other steps (gh auth, scopes, labels, issue types, project views) are unchanged

### 2.11 `trackerSetup`

```typescript
trackerSetup(repoPath: string, opts?: TrackerSetupOptions): Promise<TrackerSetupReport>
```

**Parameters:**
- `repoPath: string` — Repo being set up.
- `opts: TrackerSetupOptions` _(optional)_ — includeProject as today.

**Returns:** `Promise<TrackerSetupReport>` — The terminal service wrapper in src/cli/services/workflow.ts, now asynchronous: it calls planTrackerConfig, awaits repo.trackerConfig.ensure through rpc with a 15-second deadline when a write is needed, then runs runTrackerSetup with the outcome as configOutcome.

**Errors:**
- `config step failed` when planTrackerConfig failed, or the daemon is not reachable, did not answer within the deadline, closed the connection before answering, or returned an error; the step is reported failed with that reason (for the daemon cases, a message that the daemon owns ~/.insrc/github.json and must be running)

**Postconditions:**
- The terminal client never writes github.json itself; the detail text of the done and already outcomes is the same as today's
- A silent or prematurely closing daemon cannot stop the other setup steps from running
- Its callers in src/cli/command.ts and the TUI (through Services) await it, and the Services fixtures and tests that call it are updated

### 2.12 `rpc`

```typescript
rpc<T = unknown>(method: string, params?: unknown, connect?: () => Socket, opts?: { timeoutMs?: number }): Promise<T>
```

**Parameters:**
- `method: string` — Daemon IPC method name.
- `params: unknown` _(optional)_ — Method parameters.
- `connect: () => Socket` _(optional)_ — Socket factory, default the daemon socket; unchanged.
- `opts: { timeoutMs?: number }` _(optional)_ — New and opt-in. When timeoutMs is set the request is bounded.

**Returns:** `Promise<T>` — The reply as today. With opts.timeoutMs set it also rejects when the deadline passes and when the socket ends or closes before a reply.

**Errors:**
- `Error timeout` when no reply within timeoutMs
- `Error closed` when the socket ended or closed before a reply arrived

**Postconditions:**
- The socket is destroyed on every outcome, including the new rejections, and the deadline timer is cleared when the request settles
- Without opts the function behaves exactly as today, so the VS Code extension, createIpcClient and every existing terminal caller are unchanged

### 2.13 `createGithubTracker`

```typescript
createGithubTracker(owner: string, repo: string): TrackerPort
```

**Parameters:**
- `owner: string` — Resolved owner.
- `repo: string` — Resolved repo.

**Returns:** `TrackerPort` — The s1 adapter (sc1); repo.settings.get calls its whoAmI once to fill the sign-in status.

**Errors:**
- `PortResult ok:false` when whoAmI fails with kind missing-tool, missing-signin (including an empty login), unreachable or rejected

**Preconditions:**
- the resolved tracker type is github

**Postconditions:**
- Consumed unchanged from s1; only whoAmI is called, so no tracker state changes; every PortResult outcome maps to a signin.state with the failure reason, so the mapping is exhaustive
- No gh command runs when the resolved type is none

### 2.14 `PolicyReader`

```typescript
PolicyReader(repo: string): PolicyResult<TeamPolicy | 'none'>
```

**Parameters:**
- `repo: string` — Repo whose policy is read.

**Returns:** `PolicyResult<TeamPolicy | 'none'>` — The sc2 reader, consumed unchanged; repo.settings.get maps its value to the read-only policy rows.

**Errors:**
- `PolicyResult ok:false` when the policy could not be read; the reason is shown in the policy rows

**Postconditions:**
- The reader is called as every other caller calls it; it may persist its own sighting metadata, which is not a write to github.json or to the authored policy

### 2.15 `DaemonGateway.readRepoSettings`

```typescript
readRepoSettings(repoPath: String): RepoSettingsResult
```

**Parameters:**
- `repoPath: String` — Registered repo path.

**Returns:** `RepoSettingsResult` — A sealed result: Loaded(payload), Rejected(reason) for a business error, or Unavailable(reason) for a transport fault.

**Errors:**
- `Unavailable` when the daemon is unreachable or answers with a transport error
- `Rejected` when repo.settings.get returned { ok: false, error }

**Postconditions:**
- parseCatalog is extended to keep repoFields in SettingsCatalogDto, read through the existing settingsCatalog()
- SettingsCatalogDto.repoFields has a default of emptyList(), so the existing positional callers in SettingsTreeModelTest, SettingsTableModelTest, ModelTiersModelTest, SettingsEditModelTest and SettingsViewTest compile unchanged
- DaemonGatewayService forwards readRepoSettings and the four DaemonGateway test doubles implement it

### 2.16 `DaemonGateway.writeRepoSetting`

```typescript
writeRepoSetting(repoPath: String, key: String, value: Any?): SaveResult
```

**Parameters:**
- `repoPath: String` — Registered repo path.
- `key: String` — A local row key.
- `value: Any?` — String, Boolean or null to clear.

**Returns:** `SaveResult` — The existing sealed SaveResult: Saved, Rejected(reason) when repo.settings.set returns { ok: false, error }, or Unavailable(reason) for a transport fault; it calls repo.settings.set, not config.write.

**Errors:**
- `SaveResult.Rejected` when the daemon returns any RepoSettingsError code

**Postconditions:**
- PerRepoSection routes tracker-row edits to this method and keeps routing model-tier edits to writeSetting and clearSetting
- DaemonGatewayService forwards writeRepoSetting and the four DaemonGateway test doubles implement it

### 2.17 `InsrcSettingsConfigurable`

```typescript
InsrcSettingsConfigurable.createComponent(): JComponent
```

**Returns:** `JComponent` — Existing settings page. Inside its executeOnPooledThread block it additionally calls gateway.readRepoSettings(repo.path) for each registered repo and keeps the results with catalog.repoFields; renderBody then builds PerRepoSection with the model, the repoFields and the per-repo settings results, on the EDT as today.

**Errors:**
- `RepoSettingsResult.Rejected or Unavailable` when a repo's settings could not be loaded; the section shows that reason for that repo and the model-tier rows still render

**Postconditions:**
- No socket round trip runs on the EDT; PerRepoSection refreshes a repo's settings with readRepoSettings on a pooled thread after a successful write
- The PerRepoSection constructor gains the repoFields and the per-repo settings results as parameters

### 2.18 `ConfigGateway.catalog`

```typescript
catalog(): Promise<ConfigCatalogSnapshot>
```

**Returns:** `Promise<ConfigCatalogSnapshot>` — The existing snapshot, whose type in vscode-plugin/src/config/types.ts gains repoFields: readonly RepoFieldDef[]; createDaemonConfigGateway.catalog() fills it from the config.catalog payload.

**Errors:**
- `rejection` when the daemon is unreachable

**Postconditions:**
- Existing consumers that read only values are unaffected
- Every fixture that builds a ConfigCatalogSnapshot or implements ConfigGateway is updated: the FakeGateway classes in per-role-engine.test.ts, sync-engine.test.ts and truthful-sync.test.ts, and the stub catalog in vscode-plugin/src/models/__tests__/model-tier-picker.test.ts (typed through SetModelTierDeps.catalog in vscode-plugin/src/models/model-tier-picker.ts), each returning repoFields: []
- RepoConfigRendererDeps gains repoFields() and repoSettings(repoPath) and RepoConfigWriteDeps gains writeRepoSetting, and extension.ts injects them; vscode-plugin/src/panels/__tests__/repo-config.test.ts is updated so every renderRepoConfig call and makeWriteDeps supply them, with tracker routing and refusal assertions added and the model-tier assertions kept
- vscode-plugin/src/workspace/__tests__/activation.test.ts, which reads extension.ts as text, keeps its repo-renderer and write-sink patterns matching, or is updated in the same change

### 2.19 `ConfigGateway.repoSettings`

```typescript
repoSettings(repoPath: string): Promise<{ ok: true; payload: RepoSettingsPayload } | { ok: false; error: RepoSettingsError }>
```

**Parameters:**
- `repoPath: string` — Registered repo path.

**Returns:** `Promise<{ ok: true; payload: RepoSettingsPayload } | { ok: false; error: RepoSettingsError }>` — Calls repo.settings.get through the shared IpcClient; new method on the VS Code ConfigGateway and createDaemonConfigGateway.

**Errors:**
- `rejection` when the socket rejects; renderRepoConfig degrades the panel as it does for registeredRepos

**Postconditions:**
- renderRepoConfig renders a Tracker section from repoFields and this payload, with policy and status rows read-only, and shows the error message when ok is false
- The seam test vscode-plugin/src/config/__tests__/seam.test.ts allowed set becomes config.catalog, config.show, config.write, repo.settings.get and repo.settings.set

### 2.20 `ConfigGateway.writeRepoSetting`

```typescript
writeRepoSetting(repoPath: string, key: string, value: string | boolean | null): Promise<ConfigWriteResult>
```

**Parameters:**
- `repoPath: string` — Registered repo path.
- `key: string` — A local row key.
- `value: string | boolean | null` — New value or null to clear.

**Returns:** `Promise<ConfigWriteResult>` — Calls repo.settings.set; a returned error becomes a reason-carrying refusal with the error message.

**Errors:**
- `ConfigWriteResult ok:false` when the daemon returns { ok: false, error }

**Postconditions:**
- The webview message repoTrackerWrite is added to webview-host.ts and RepoConfigWrite, and createRepoConfigWriteHandler sends it through the consent gate to this method; the existing models.byRepo route is unchanged
- vscode-plugin/src/panels/__tests__/detail-renderers.test.ts is updated: the repo bootstrap now posts selectRepo, repoWrite and repoTrackerWrite, and the closed message set gains repoTrackerWrite, with a test that the tracker section emits that message

### 2.21 `Services.config`

```typescript
Services['config']: { show; write; reload; catalog(): Promise<SettingsCatalogPayload>; repoSettings(repo: string): Promise<RepoSettingsResultUnion>; setRepoSetting(repo: string, key: string, value: string | boolean | null): Promise<RepoSettingsResultUnion> }
```

**Returns:** `Services['config']` — The terminal client's service facade gains three members backed by getCatalog (config.catalog), getRepoSettings (repo.settings.get) and setRepoSetting (repo.settings.set) in src/cli/services/config.ts.

**Errors:**
- `Error` when the daemon is unreachable

**Postconditions:**
- The Services interface and makeServices wire the new members, and the Services fixtures in command.test.ts, tui.test.ts, services.test.ts and team-service.test.ts gain them
- ReposPane.tsx gains a settings modal for the selected repo that lists the rows from catalog repoFields and repoSettings, edits local rows, shows policy and status rows read-only, and shows the error message of an ok:false result

## 3. Data model changes

### 3.1 `REPO_TRACKER_FIELDS` — new

The one definition table of the repo-scoped rows, in src/config next to CONFIG_CATALOG. Each row: key, label, type (string | boolean | enum), enumValues, default, description, group Tracker, optional note, optional grammar, and kind: local (editable, stored in github.json), status (derived, read-only: sign-in status and the resolved target with its source) or policy (read-only, from sc2). Local rows: type (github | none), owner, repo, ghPath, ghHost (default github.com), branchPattern; ghPath, ghHost and branchPattern carry the note 'saved; not used yet'. The branchPattern row carries its grammar, which is the single definition that the validator and, later, s6 read: the only placeholders are {id}, {slug} and {type}; any other brace token, an unmatched brace or a literal brace is rejected and there is no escaping; every other character is a letter, digit, slash, hyphen, underscore or dot; the pattern is 1 to 200 characters, does not start or end with a slash, has no two consecutive slashes, no '..' and does not end with '.lock'. s6 may extend the grammar only by changing this row. Policy rows, one per team rule in TeamPolicy: teamMode, signoffStages, claimsEnforced, claimUnits, administrators, forceTaskIssues. Accepted interpretation (owner decision, 2026-10-17, recorded in docs/plans/team-workflow.md): 'edit sign-in' (ac10, ac11) is met by a read-only sign-in status row plus the editable ghHost row.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/settings-catalog.ts`
- `src/workflow/team/types.ts`

### 3.2 `SettingsCatalogPayload` — field-add

Adds repoFields: readonly RepoFieldDef[]. Additive.

```
+ readonly repoFields: readonly RepoFieldDef[];
```

**Call sites:**
- `src/config/settings-catalog.ts`
- `src/daemon/index.ts:1479`

### 3.3 `RepoSettingsPayload` — new

{ repo: string; values: Record<string, string | boolean>; resolved: { type: 'github' | 'none'; owner?: string; repo?: string; source: 'per-repo-config' | 'default-config' | 'git-remote'; error?: string }; signin: { state: 'signed-in' | 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected' | 'disabled'; login?: string; reason?: string }; policy: { ok: true; mode: 'none' } | { ok: true; mode: 'team'; values: Record<string, unknown>; source: { ref: string; fetchedAt: string } } | { ok: false; reason: string } }. values holds only keys the repo's own entry sets; policy.values has one entry per policy row.

**Call sites:**
- `src/daemon/index.ts`

### 3.4 `RepoSettingsError and WriteError` — new

WriteError is { code: 'github-json-unreadable' | 'file-changed' | 'write-failed'; message: string }. RepoSettingsError is { code: WriteError['code'] | 'unknown-key' | 'read-only-key' | 'invalid-value' | 'repo-not-registered'; message: string } returned as { ok: false, error }. JetBrains maps ok:false to SaveResult.Rejected(message) (or RepoSettingsResult.Rejected) and a transport fault to Unavailable; VS Code maps it to ConfigWriteResult { ok: false, reason: message }; the terminal client shows the message; the tracker setup config step reports a failed step with the message as detail.

**Call sites:**
- `src/daemon/index.ts`
- `src/workflow/tracker/setup.ts:163-200`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `vscode-plugin/src/config/gateway.ts`
- `src/cli/services/config.ts`

### 3.5 `GithubEntry` — field-add

Adds optional ghPath, ghHost and branchPattern (strings), ignored by the resolvers (k4). Nothing reads them yet: the gh runner reading ghPath and ghHost is an s1 follow-up and branchPattern is consumed by s6.

```
+ readonly ghPath?: string; + readonly ghHost?: string; + readonly branchPattern?: string;
```

**Call sites:**
- `src/workflow/config/github.ts`

### 3.6 `github.json module and tracker setup seam` — new

readRepoEntry, resolveGithubConfigFromFile and the in-process serialised writeRepoEntryKeys (with verify-before-rename) in the github config module, the writer used only by the daemon methods; TrackerSetupOptions gains configOutcome and setup.ts exports planTrackerConfig, which validates through readRepoEntry first; src/cli/services/workflow.ts trackerSetup becomes asynchronous and obtains the config outcome from the daemon through a bounded rpc. src/workflow/team/sighting-store.ts is not changed.

**Call sites:**
- `src/workflow/tracker/setup.ts:70-73`
- `src/workflow/tracker/setup.ts:107`
- `src/workflow/tracker/setup.ts:163-200`
- `src/workflow/config/github.ts`
- `src/cli/services/workflow.ts:334-336`
- `src/cli/services/index.ts`
- `src/cli/command.ts`
- `src/cli/__tests__/tui.test.ts`
- `src/workflow/tracker/__tests__/setup.test.ts`

### 3.7 `IPC request options` — field-add

The shared rpc gains an optional fourth parameter { timeoutMs } that is opt-in: with it the request rejects on the deadline and on the socket ending or closing before a reply and the socket is always destroyed; without it nothing changes. src/cli/client.ts keeps re-exporting rpc unchanged.

```
+ opts?: { timeoutMs?: number }
```

**Call sites:**
- `src/shared/ipc-client.ts:46`
- `src/cli/client.ts:1-7`
- `src/cli/services/workflow.ts:334-336`

### 3.8 `DaemonGateway` — field-add

The JetBrains DaemonGateway interface gains readRepoSettings and writeRepoSetting, implemented in DaemonGatewayImpl, forwarded in DaemonGatewayService and added to the four test doubles.

```
+ fun readRepoSettings(repoPath: String): RepoSettingsResult; + fun writeRepoSetting(repoPath: String, key: String, value: Any?): SaveResult
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingLifecycleTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingCleanupIntegrationTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/onboarding/OnboardingWiringTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/lifecycle/DaemonLifecycleServiceTest.kt`

### 3.9 `SettingsCatalogDto` — field-add

JetBrains DTO gains repoFields with a default of emptyList(), filled by parseCatalog; a RepoSettingsDto and a sealed RepoSettingsResult mirror the payload. PerRepoSection's constructor gains repoFields and the per-repo results from InsrcSettingsConfigurable's pooled-thread load.

```
+ val repoFields: List<RepoFieldDto> = emptyList()
```

**Call sites:**
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:82-112`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/SettingsTreeModelTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/SettingsTableModelTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/ModelTiersModelTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/SettingsEditModelTest.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/SettingsViewTest.kt`

### 3.10 `ConfigCatalogSnapshot` — field-add

VS Code snapshot type gains repoFields: readonly RepoFieldDef[]; createDaemonConfigGateway.catalog() maps the payload's repoFields into it (an empty list when an older daemon omits it). RepoConfigRendererDeps gains repoFields() and repoSettings(repoPath); RepoConfigWriteDeps gains writeRepoSetting; the three FakeGateway test classes, the model-tier-picker test stub, the repo-config test fixtures, the activation wiring test and the seam test are updated.

```
+ readonly repoFields: readonly RepoFieldDef[];
```

**Call sites:**
- `vscode-plugin/src/config/types.ts`
- `vscode-plugin/src/config/gateway.ts`
- `vscode-plugin/src/panels/types.ts`
- `vscode-plugin/src/panels/repo-config.ts`
- `vscode-plugin/src/extension.ts:399-412`
- `vscode-plugin/src/models/model-tier-picker.ts:63`
- `vscode-plugin/src/models/__tests__/model-tier-picker.test.ts:61-63`
- `vscode-plugin/src/panels/__tests__/repo-config.test.ts:11`
- `vscode-plugin/src/workspace/__tests__/activation.test.ts:95-99`
- `vscode-plugin/src/config/__tests__/seam.test.ts:31-37`
- `vscode-plugin/src/config/__tests__/per-role-engine.test.ts`
- `vscode-plugin/src/config/__tests__/sync-engine.test.ts`
- `vscode-plugin/src/config/__tests__/truthful-sync.test.ts`

### 3.11 `RepoConfigWrite` — field-add

VS Code write union gains the tracker variant; the webview host validates the new message type and the handler routes it to ConfigGateway.writeRepoSetting. The closed-message-set test is updated with it.

```
+ | { kind: 'tracker'; repoPath: string; key: string; value: string | boolean | null }
```

**Call sites:**
- `vscode-plugin/src/panels/types.ts`
- `vscode-plugin/src/panels/webview-host.ts`
- `vscode-plugin/src/panels/repo-config.ts`
- `vscode-plugin/src/config/gateway.ts`
- `vscode-plugin/src/extension.ts:399-412`
- `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts:115-123`

### 3.12 `Services` — field-add

The terminal Services.config object gains catalog, repoSettings and setRepoSetting, wired in makeServices; Services.workflow.trackerSetup becomes asynchronous; the ReposPane Modal union gains settings. The existing tracker modal that runs setup awaits the asynchronous call.

```
+ catalog(): Promise<SettingsCatalogPayload>; + repoSettings(repo: string): Promise<RepoSettingsResultUnion>; + setRepoSetting(repo: string, key: string, value: string | boolean | null): Promise<RepoSettingsResultUnion>; ~ trackerSetup(...): Promise<TrackerSetupReport>
```

**Call sites:**
- `src/cli/services/index.ts:79-83`
- `src/cli/services/index.ts:136-140`
- `src/cli/services/config.ts`
- `src/cli/services/workflow.ts:334-336`
- `src/cli/panes/ReposPane.tsx`
- `src/cli/command.ts`
- `src/cli/__tests__/command.test.ts`
- `src/cli/__tests__/tui.test.ts`
- `src/cli/__tests__/services.test.ts`
- `src/cli/__tests__/team-service.test.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | repo.settings.get calls PolicyReader(repo) once and maps TeamPolicy to read-only rows, one per team rule, with source.ref and source.fetchedAt shown as where the value came from. No policy key can be written: repo.settings.set refuses any key whose kind is not local. TeamPolicy is not changed and nothing is cached by this story. |
| `sc1` | consumes | repo.settings.get consumes the tracker port (sc1, owned by s1) through s1's GitHub adapter: it calls createGithubTracker and then TrackerPort.whoAmI once, and maps the PortResult to the read-only sign-in status. It reads only the signed-in login and never changes tracker state, and it adds no port method. This is a dependency of s3 on s1's adapter that the HLD boundary for s3 (which lists sc2 only) does not state; the LLD records it here. |

## 5. Error paths

**Error cases**

- **github.json is unreadable: it cannot be read, is not valid JSON, has a top level that is not an object, has default or repos present and not an object, or has the repo's own entry present and null, an array or a primitive** (recoverable)
  - Detection: readRepoEntry reads the file and parses it with JSON.parse without swallowing errors (unlike loadGithubConfigFile), then checks each level in order with a plain-object test: the top level, then default when present, then repos when present, then the selected entry when present; the first failing level or the read or parse error is named in the reason.
  - Response: repo.settings.get, repo.settings.set and repo.trackerConfig.ensure return { ok: false, error: { code: 'github-json-unreadable', message } } naming the file and the failing level; the writer writes nothing and leaves the file byte for byte unchanged. Because repo.settings.get resolves from the snapshot it just validated, the TypeError resolveEntry would throw for a null entry cannot be reached.
  - User impact: The client shows the error and where to fix the file by hand; no setting is lost, and a malformed file is never shown as 'no tracker'.
- **Tracker setup in the terminal meets a structurally malformed github.json (a null own entry while the default is complete, a null default, a non-object top level, default or repos, or invalid JSON)** (recoverable)
  - Detection: planTrackerConfig calls the strict readRepoEntry before anything else. The lenient loader and the selection file.repos?.[repo] ?? file.default are not used for the decision, so a null own entry cannot fall through to a complete default and a null default is never dereferenced.
  - Response: planTrackerConfig returns failed with the strict reader's message naming the failing level; trackerSetup passes that as a failed configOutcome, never calls the daemon for the config step and writes nothing; the remaining setup steps still run.
  - User impact: Setup reports the config step failed with the exact problem in the file instead of reporting it already configured.
- **A branchPattern value breaks the grammar: a brace token other than {id}, {slug} or {type}, an unmatched or literal brace, a character outside letters, digits, slash, hyphen, underscore and dot, a length outside 1 to 200, a leading or trailing slash, two consecutive slashes, '..', or a '.lock' ending** (recoverable)
  - Detection: repo.settings.set validates the value against the grammar defined on the branchPattern row of REPO_TRACKER_FIELDS before any file access: it scans for brace tokens and compares each with the three allowed placeholders, then checks the remaining characters and the structural rules.
  - Response: Returns invalid-value naming the rule that failed; nothing is written.
  - User impact: The client shows which rule the pattern broke and keeps the old value.
- **github.json is changed by another process while repo.settings.get is working** (recoverable)
  - Detection: There is no second read: the strict reader reads once, validates, and the target is resolved from that same in-memory snapshot.
  - Response: The call returns the values and resolved target of the version it read; a later change is picked up by the next get.
  - User impact: A client may show a value a moment old; never a half-updated mixture.
- **Two clients write at about the same time through the daemon (for example VS Code and JetBrains, or a settings edit and a tracker setup)** (recoverable)
  - Detection: All writes reach writeRepoEntryKeys inside the one daemon process, which chains each call on a single in-process promise queue, so a second call starts only after the first has finished or failed.
  - Response: The writes apply one after the other; each reads the file at its start and merges into the latest content, so both edits survive. There is no lock file, no wait limit and no file-locked error. A failure of one write does not stall the queue.
  - User impact: Both edits are kept; the second client sees the first client's value afterwards.
- **A process outside the daemon (an editor, a script, a leftover older terminal build) changes github.json while a write is in progress** (recoverable)
  - Detection: The verify step: immediately before the rename the writer re-reads the file and compares size, mtime and content hash with those it recorded when it read.
  - Response: The attempt restarts from the new content; after the fixed number of attempts the write is refused with file-changed and nothing is written. An edit that lands between the final check and the rename cannot be detected, because rename cannot be made conditional; this is the one stated limit and it concerns only processes that are not the daemon.
  - User impact: An outside edit can still be lost in a very small window; the design does not claim to prevent it.
- **The daemon is not running or not reachable when the terminal client runs tracker setup** (recoverable)
  - Detection: trackerSetup awaits repo.trackerConfig.ensure through rpc with timeoutMs 15000; connecting to a missing socket rejects through rpc's existing error handling.
  - Response: The config step is reported failed with a detail that says the daemon owns ~/.insrc/github.json and must be running, and the remaining setup steps still run and report as they do today. Nothing is written by the terminal process.
  - User impact: The developer is told to start the daemon and run setup again; labels and other steps are not blocked.
- **The daemon accepts the socket but never replies, or closes the connection without replying** (recoverable)
  - Detection: With opts.timeoutMs set, rpc starts a deadline timer when the request is sent and listens for the socket's end and close events; the timer firing, or end or close arriving before a reply has been parsed, rejects the promise.
  - Response: rpc destroys the socket and clears the timer on every outcome; trackerSetup catches the rejection and reports the config step failed with a timed-out or connection-closed message that says the daemon owns the file; the other setup steps still run. Calls made without opts.timeoutMs behave exactly as before.
  - User impact: Setup finishes within the deadline and says why the config step failed; it never hangs.
- **A caller runs runTrackerSetup without the config seam outside a test (a mistake that would reintroduce a second writer)** (terminal)
  - Detection: A test builds the real terminal services with makeServices and asserts that its trackerSetup passes configOutcome into runTrackerSetup in every branch (already, needs-write succeeded, needs-write failed, plan failed, daemon unreachable, timed out), and a search test fails if production code outside the daemon and the tests calls runTrackerSetup without it.
  - Response: The build fails the test; the in-process default stays reachable only from tests and in-process callers.
  - User impact: No second writer of github.json ships.
- **A filesystem failure while writing the temporary file or renaming it (permission denied, missing directory, read-only disk, disk full)** (recoverable)
  - Detection: writeRepoEntryKeys wraps the temporary write and the rename in one try block and catches the operating-system error code (EACCES, EPERM, ENOENT, ENOSPC, EROFS, EXDEV).
  - Response: The temporary file is removed, the target file is left as it was, and the call returns write-failed with the operating-system message; the queue continues.
  - User impact: The client shows the operating-system reason and nothing is changed.
- **A client sends a write for a policy or status row** (terminal)
  - Detection: repo.settings.set looks the key up in REPO_TRACKER_FIELDS and checks kind is local.
  - Response: Returns read-only-key and writes nothing.
  - User impact: The row is shown read-only in every client, so this only happens from a hand-made call (k5).
- **A value does not match its row (an enum outside its values, an owner or repo that is not a valid GitHub name, a ghPath or ghHost that contains a newline)** (recoverable)
  - Detection: repo.settings.set and repo.trackerConfig.ensure validate the value against the row's type, enumValues and format before any file access.
  - Response: Returns invalid-value with the reason; nothing is written.
  - User impact: The client shows the reason next to the field and keeps the old value.
- **The repo is not registered with the daemon, or the path given is an alias (for example a symlink or a path with a trailing slash) that is not the registered string** (recoverable)
  - Detection: The daemon methods compare the given path with the registered repo paths as repo.add stored them (resolve(path), no symlink resolution) before reading or writing.
  - Response: Returns repo-not-registered; no file is read or written. A symlink and its target that were both registered by the user are two repos with two entries, exactly as the registry and resolveGithubConfig already treat them; this story adds no alias lookup, merge or migration.
  - User impact: The client picker only lists registered repos by their registered path, so the error appears only after a repo is removed while the settings are open.
- **The policy cannot be read (offline, no default branch known, malformed policy file)** (recoverable)
  - Detection: PolicyReader returns ok:false and repo.settings.get checks the result.
  - Response: The payload carries policy: { ok: false, reason }; the local rows are still returned.
  - User impact: The policy section shows the reason instead of values; editing the local rows is unaffected.
- **The sign-in status check fails: gh missing, not signed in (including an empty login), timed out, or rejected for another reason** (recoverable)
  - Detection: repo.settings.get calls whoAmI on the s1 adapter (sc1) and switches on the PortResult: ok gives signed-in with the login; ok:false maps its kind one to one onto signin.state and copies the reason; an exception thrown by the adapter is caught and reported as rejected with the message.
  - Response: signin.state and signin.reason are set and the call still succeeds; it uses the adapter's 10-second timeout and is not retried.
  - User impact: The sign-in row says exactly what is wrong without blocking the settings view. The row is a status only, by the owner's recorded decision of 2026-10-17.
- **github is enabled for the repo but no target can be resolved** (recoverable)
  - Detection: resolveGithubConfigFromFile throws GithubConfigError, caught in repo.settings.get after the structural validation passes.
  - Response: resolved.error carries the message and resolved.type is none; the call succeeds and no sign-in check runs (signin.state disabled).
  - User impact: The target row shows why there is no target and which fields to set.
- **An older client calls config.catalog and does not know repoFields, or a newer client talks to an older daemon that omits repoFields** (recoverable)
  - Detection: The field is additive; the new VS Code gateway maps a missing repoFields to an empty list and the Kotlin DTO field defaults to an empty list.
  - Response: No change for existing fields; the tracker section is simply empty or absent.
  - User impact: The tracker section appears only when both the client and the daemon are updated.
- **A repo's settings cannot be loaded in the JetBrains settings page** (recoverable)
  - Detection: InsrcSettingsConfigurable calls readRepoSettings per registered repo on its pooled thread and receives Rejected or Unavailable for that repo.
  - Response: The page still renders; PerRepoSection shows that reason in place of the tracker rows of that repo and keeps the model-tier rows working.
  - User impact: One repo's tracker section shows why it is empty; the rest of the page is unaffected.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no entry in github.json and no default entry | values is empty, resolved.type is none with source default-config, signin.state is disabled, and the editable rows show their defaults as unset. |
| A repo with no own target and a default entry of type github | resolved shows owner and repo from the repo's git remote with source git-remote; the default entry's own owner and repo are never shown as the target (ac12). |
| A value of null for a key that is not set | The write succeeds as a no-op, the file is not rewritten, and the payload is returned. |
| Setting the type to none for a repo | The own entry gets type none; the target rows show it as disabled; owner and repo already in the entry are kept. |
| github.json has keys this story does not know in a repo entry (epicLabel, pushTasks) | They are preserved unchanged by every write and are not shown as rows. |
| A branchPattern of feature/{type}/{id}-{slug}, of {id}, or of release/v1.2 | Accepted and stored as written. |
| A branchPattern of {user}, of {id (unmatched), of id} (unmatched), of {} or containing a space, a tilde, a colon or a backslash | Rejected with invalid-value; nothing is written. |
| The policy file exists but teamMode is false | The policy rows show the values with the source; there is no special case beyond showing teamMode false. |
| The repo has no policy (PolicyReader returns none) | The payload carries policy { ok: true, mode: 'none' } and every client shows the policy rows as 'no team policy' with no values. |
| Tracker setup finds the entry already complete in a structurally valid file | planTrackerConfig returns already, the terminal service makes no daemon call for the config step, and the step reports already with today's detail text. |
| Tracker setup needs the entry written | One repo.trackerConfig.ensure call sets type, owner, repo, pushTasks and commitArtifacts in one write; the step reports done with today's detail text. |
| The github.json file does not exist yet when setup or the first setting runs | readRepoEntry treats a missing file as empty; planTrackerConfig returns needs-write; writeRepoEntryKeys creates the file with {repos: {<repo>: {...}}}; the verify step treats a still-missing file as unchanged. |
| A developer sets ghHost to a GitHub Enterprise host | The value is stored and shown in every client with the note 'saved; not used yet'; the sign-in status still comes from the default gh configuration until the s1 follow-up makes the runner read ghHost. |
| rpc is called by the VS Code extension or an existing terminal caller without opts | No deadline and no early-close rejection are added; behaviour and tests are as before. |
| A lenient caller (tracker-auto, the bugfix deps, questions.ts) resolves the target of a repo whose github.json is invalid JSON, unreadable, missing or not an object | Unchanged: resolveGithubConfig still returns none for these loader-rejected inputs; a structurally malformed nested entry is handled exactly as it is today, with no new throw and no new swallow. |

**Invariants to preserve**

- A repo without the policy file and without the new fields behaves exactly as it does today: the resolvers ignore ghPath, ghHost and branchPattern, and resolveGithubConfig keeps its results for every input after being split into load plus resolveGithubConfigFromFile. [[c1]]
- The tracker setup report keeps its steps, statuses and detail texts for the done and already outcomes of the config step, and its other steps are unchanged. [[c4]]
- rpc keeps its current behaviour for every caller that does not pass the new option. [[c15]]
- The team sighting store and its lock are not changed by this story. [[c5]]
- Policy is read only from the remote default branch and cannot be changed through a settings client; only local rows are writable. [[c8]]
- A repo is identified by the exact registered path string; settings are keyed the way the registry and resolveGithubConfig already key them. [[c3]]
- The sign-in status reads the signed-in login through s1's adapter and never changes tracker state. [[c9]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (the daemon, the terminal client and the VS Code plugin); JUnit 5 for the JetBrains plugin`

**Test levels**

- **unit** — Prove the pure rules: the field table and its branchPattern grammar, the catalog's new static field, value validation, the strict reader, the split of resolveGithubConfig with characterization of its current behaviour, the payload builder, the sign-in mapping, the error union, the in-process write queue, the verify-before-rename decision, the setup planning function and the opt-in request deadline.
  - Subjects: `REPO_TRACKER_FIELDS has a unique key per row and a kind of local, status or policy on every row, every local key is a GithubEntry field, and there is one policy row for each team rule in the real TeamPolicy type (team mode, signoff stages, claims enforced, claim units, administrators, forced task issues)`, `the branchPattern validator accepts feature/{type}/{id}-{slug}, {id}, {id}-{slug}, release/v1.2 and a pattern of exactly 200 characters, and rejects each of these with invalid-value naming the rule that failed: {user}, {id (unmatched), id} (unmatched), {}, a literal brace that is not a placeholder, a space, a character such as ~ ^ : ? * [ or a backslash, the empty string, 201 characters, a leading slash, a trailing slash, two consecutive slashes, '..' and a '.lock' ending`, `the branchPattern grammar is read from the single REPO_TRACKER_FIELDS row, and a test copy of the table with one more placeholder changes what the validator accepts without any change to a client`, `buildSettingsCatalog still returns every existing field unchanged, adds repoFields, stays pure and never throws for an empty or garbage config`, `validateRepoSetting accepts and rejects values per row: type enum, owner and repo names, ghPath and ghHost with a newline`, `readRepoEntry refuses an unreadable file, invalid JSON, a non-object top level, default that is null or an array or a primitive, repos that is null, an array or a primitive, and an own entry that is null, an array or a primitive, naming the failing level, and accepts a missing file, default, repos and entry`, `resolveGithubConfig keeps returning none for the inputs the loader rejects: a missing file, an unreadable file, invalid JSON and a file whose top level is not an object; every existing resolveGithubConfig test case passes without edits after the split into loadGithubConfigFile and resolveGithubConfigFromFile`, `characterization of the lenient API: for a null own entry and for a null default, resolveGithubConfig and resolveGithubConfigFromFile give exactly the result or the same thrown TypeError that the code gives before the split (recorded from the pre-split behaviour), so the split adds neither a new throw nor a new swallow`, `buildRepoSettings reports values from the repo's own entry only, the resolved target with its source, and the policy rows, including claimUnits built from a real TeamPolicy value, from a PolicyResult for none, team and ok:false`, `the sign-in mapping turns every whoAmI outcome into a signin.state: ok to signed-in with the login, and missing-tool, missing-signin (including an empty login), unreachable and rejected each to their own state with the reason, and a thrown exception to rejected`, `mergeRepoEntryKeys changes only the named keys, keeps the default entry, other repos and unknown keys, removes a key for null, and is a no-op for null on an unset key`, `writeRepoEntryKeys queue: many concurrent calls for different keys of the same file all land (none is lost), run one at a time (an instrumented fs seam never sees two overlapping writes), and a failing call (injected write error) does not stop the queued calls after it`, `writeRepoEntryKeys returns write-failed with the operating-system message and leaves the file and the temporary file as they were when the temporary write fails or the rename fails`, `writeRepoEntryKeys verify step: with an injected hook that changes the file after the temp write, the verify detects a different size, mtime or hash, discards the temp file and merges again from the new content; after the bounded attempts it returns file-changed and writes nothing`, `planTrackerConfig returns already only for a structurally valid file whose entry is complete (type github, owner, repo, pushTasks true, commitArtifacts true), needs-write with the owner and name from the origin remote when it is not, and failed with today's detail text when there is no origin remote`, `planTrackerConfig returns failed with the strict reader's message, calls no daemon and writes nothing for: a null own entry while the default is complete, a null default, an own entry that is an array or a primitive, a non-object top level, default or repos, and invalid JSON; none of these throws`, `runTrackerSetup with a configOutcome reports that outcome verbatim for the config step and neither reads nor writes github.json; without it the config step behaves as today and the existing setup tests pass unchanged`, `rpc without opts behaves exactly as before for a normal reply, a connection error and a reply split across data events (the existing ipc-client tests pass unchanged)`, `rpc with opts.timeoutMs rejects with a timeout error when a fake socket accepts the connection and never replies, and rejects with a closed error when the fake socket ends or closes before a reply; in both cases the socket is destroyed and the timer is cleared, and a normal reply inside the deadline resolves and clears the timer`, `repo identity: repo.settings.get and repo.settings.set key the entry on the exact registered path string; a symlink path that is not itself registered returns repo-not-registered, and two registered paths (a symlink and its target) keep separate entries with different settings`
  - Fixtures: `temp github.json files written per test with INSRC_GITHUB_CONFIG pointing at them, including files with a null own entry, a null default and non-object levels`, `fake PolicyResult values for none, team (a real TeamPolicy object) and failure`, `fake TrackerPort whoAmI results for each failure kind`, `injectable fs seams for the temporary write and the rename and an overlap counter`, `a hook between the temp write and the verify step`, `a scratch git repo with and without an origin remote`, `a fake socket that can stay silent, end early or reply, driven through rpc's connect parameter, and fake timers`, `a temp directory holding a real directory and a symlink to it`
- **integration** — Prove the daemon methods end to end against a real temp github.json and each client's host wiring, rendering, write path and error mapping against the same payload, including the terminal setup path through the daemon and the use of s1's adapter for the sign-in status.
  - Subjects: `repo.settings.get reads the signed-in login only through s1's adapter: with a fake gh recording its commands, it runs the signed-in-user read once when the type is github, runs no other port method and changes no tracker state, and runs no gh command when the type is none`, `repo.settings.get returns what repo.settings.set just wrote, and a write made outside the daemon is shown on the next get (ac13)`, `repo.settings.set refuses a policy row, a status row, an unknown key, an invalid value (including an invalid branchPattern) and an unregistered repo with the right code, and writes nothing in each case`, `two clients' repo.settings.set calls issued at the same time through the daemon socket both land their keys`, `repo.trackerConfig.ensure writes type, owner, repo, pushTasks and commitArtifacts in one write, returns changed false when the entry is already complete, and refuses an unregistered repo and an invalid owner or name`, `tracker setup through the terminal service: with a running test daemon the config step reports done with today's detail text and the file holds the entry; with the entry already complete in a valid file it reports already and makes no daemon call; with no daemon it reports failed saying the daemon owns the file, writes nothing, and the other steps still report`, `tracker setup through the terminal service against a daemon that accepts the socket and never replies, and against one that closes the connection without a reply: the config step is reported failed within the deadline, the socket is released, and the other steps still report`, `tracker setup through the terminal service with a malformed github.json (null own entry with a complete default, null default): the config step is failed with the strict reader's message and no daemon call is made`, `makeServices always injects the daemon config seam: trackerSetup passes configOutcome into runTrackerSetup in every branch, and a source search test fails if code outside the daemon and the tests calls runTrackerSetup without it`, `a file or directory that is not writable makes the write return write-failed with the operating-system message`, `repo.settings.get and repo.settings.set on a file whose repos entry is null, whose default is null, whose top level is a primitive, or that holds invalid JSON, return github-json-unreadable, never throw and never report 'no tracker', and leave the original bytes untouched`, `repo.settings.get makes one read of github.json: a test counts the reads and rewrites the file after the read, and the result still describes the version that was read`, `a repo with no own target resolves to its git remote in the payload, and a default entry's owner and repo are never reported as the target (ac12)`, `repo.settings.get leaves github.json and the authored policy file byte for byte unchanged`, `JetBrains: parseCatalog keeps repoFields in SettingsCatalogDto, InsrcSettingsConfigurable loads repoFields and each registered repo's settings on its pooled thread and passes them to PerRepoSection, an edit of the ghHost row goes to writeRepoSetting and a refusal comes back as SaveResult.Rejected while model-tier edits still use writeSetting`, `JetBrains: SettingsCatalogDto built without repoFields compiles and defaults to an empty list, and SettingsTreeModelTest, SettingsTableModelTest, ModelTiersModelTest, SettingsEditModelTest and SettingsViewTest pass unchanged`, `JetBrains: DaemonGatewayService forwards readRepoSettings and writeRepoSetting to its delegate, and the four DaemonGateway test doubles compile and pass with the two new methods`, `JetBrains: when one repo's settings come back Rejected or Unavailable, its tracker rows show the reason and the other repos and the model-tier rows still render`, `JetBrains: the sign-in status row is read-only and shows the status and reason from the payload, for signed-in and for each failure state`, `VS Code: createDaemonConfigGateway.catalog keeps repoFields in ConfigCatalogSnapshot (an empty list when the daemon omits it), renderRepoConfig receives them through its new dependency and renders the tracker section, and the gateway calls repo.settings.get and repo.settings.set`, `VS Code: the FakeGateway classes in per-role-engine.test.ts, sync-engine.test.ts and truthful-sync.test.ts and the stub catalog in model-tier-picker.test.ts return repoFields, implement the new ConfigGateway methods where they implement the interface, and all four tests pass unchanged in what they assert`, `VS Code: repo-config.test.ts is updated so every renderRepoConfig call and makeWriteDeps supply repoFields, repoSettings and writeRepoSetting; its model-tier assertions pass unchanged; new cases show that the selected repo renders a Tracker section with local rows editable and policy and status rows read-only, that an error result renders its message, that a tracker write reaches writeRepoSetting through the consent gate, and that a refusal from writeRepoSetting is reported while the models.byRepo route is untouched`, `VS Code: activation.test.ts passes with the extension wiring, whose repo renderer still reads registeredRepos and rawConfig and whose write sink still goes through writeKeyPath, consent and status, now with the added dependencies injected`, `VS Code: detail-renderers.test.ts is updated so the repo bootstrap posts selectRepo, repoWrite and repoTrackerWrite and the closed message set includes repoTrackerWrite, and a new test shows that editing the ghHost row in the rendered tracker section posts repoTrackerWrite with repoPath, key and value`, `VS Code: the seam test accepts exactly config.catalog, config.show, config.write, repo.settings.get and repo.settings.set as daemon calls from gateway.ts and still rejects cloud and HTTP access`, `VS Code: the webview host accepts the repoTrackerWrite message, createRepoConfigWriteHandler sends an edit of the ghHost row through the consent gate to writeRepoSetting, a returned error becomes a refusal with its message, and the models.byRepo route is unchanged`, `VS Code: the sign-in status row is rendered read-only with the status and reason`, `terminal client: makeServices exposes config.catalog, config.repoSettings and config.setRepoSetting, trackerSetup is awaited by its callers in command.ts and the TUI, and the Services fixtures in command, tui, services and team-service tests satisfy the interface`, `terminal client: the settings modal on the repos pane lists the rows from the same payload with the same labels and values as the VS Code model, offers an edit for local rows only (including ghHost), shows the sign-in status row and policy rows read-only, and shows the message of an ok:false result`
  - Fixtures: `a fake daemon IPC server answering config.catalog, repo.settings.get, repo.settings.set and repo.trackerConfig.ensure for the client tests, with modes that stay silent or close early`, `a real daemon handler registry over a temp github.json for the integration cases`, `a read counter and a rewrite hook around the strict reader`, `a scratch git repo with an origin remote`, `fake gh through _setTrackerExecForTests`
- **contract** — Pin that the three clients show the same rows from one definition, so they cannot drift.
  - Subjects: `the row keys, labels, kinds and notes each client renders equal those in repoFields from config.catalog, for VS Code, JetBrains and the terminal client`, `adding a row to REPO_TRACKER_FIELDS in a test copy appears in all three client models without any client change`
  - Fixtures: `a shared JSON fixture of the config.catalog payload that the TypeScript client tests and the Kotlin test both load`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac10` | `JetBrains: parseCatalog keeps repoFields in SettingsCatalogDto, InsrcSettingsConfigurable loads repoFields and each registered repo's settings on its pooled thread and passes them to PerRepoSection, an edit of the ghHost row goes to writeRepoSetting and a refusal comes back as SaveResult.Rejected while model-tier edits still use writeSetting`, `JetBrains: DaemonGatewayService forwards readRepoSettings and writeRepoSetting to its delegate, and the four DaemonGateway test doubles compile and pass with the two new methods`, `JetBrains: the sign-in status row is read-only and shows the status and reason from the payload, for signed-in and for each failure state`, `VS Code: createDaemonConfigGateway.catalog keeps repoFields in ConfigCatalogSnapshot (an empty list when the daemon omits it), renderRepoConfig receives them through its new dependency and renders the tracker section, and the gateway calls repo.settings.get and repo.settings.set`, `VS Code: repo-config.test.ts is updated so every renderRepoConfig call and makeWriteDeps supply repoFields, repoSettings and writeRepoSetting; its model-tier assertions pass unchanged; new cases show that the selected repo renders a Tracker section with local rows editable and policy and status rows read-only, that an error result renders its message, that a tracker write reaches writeRepoSetting through the consent gate, and that a refusal from writeRepoSetting is reported while the models.byRepo route is untouched`, `VS Code: detail-renderers.test.ts is updated so the repo bootstrap posts selectRepo, repoWrite and repoTrackerWrite and the closed message set includes repoTrackerWrite, and a new test shows that editing the ghHost row in the rendered tracker section posts repoTrackerWrite with repoPath, key and value`, `VS Code: the seam test accepts exactly config.catalog, config.show, config.write, repo.settings.get and repo.settings.set as daemon calls from gateway.ts and still rejects cloud and HTTP access`, `VS Code: the webview host accepts the repoTrackerWrite message, createRepoConfigWriteHandler sends an edit of the ghHost row through the consent gate to writeRepoSetting, a returned error becomes a refusal with its message, and the models.byRepo route is unchanged`, `VS Code: the sign-in status row is rendered read-only with the status and reason`, `REPO_TRACKER_FIELDS has a unique key per row and a kind of local, status or policy on every row, every local key is a GithubEntry field, and there is one policy row for each team rule in the real TeamPolicy type (team mode, signoff stages, claims enforced, claim units, administrators, forced task issues)`, `the branchPattern validator accepts feature/{type}/{id}-{slug}, {id}, {id}-{slug}, release/v1.2 and a pattern of exactly 200 characters, and rejects each of these with invalid-value naming the rule that failed: {user}, {id (unmatched), id} (unmatched), {}, a literal brace that is not a placeholder, a space, a character such as ~ ^ : ? * [ or a backslash, the empty string, 201 characters, a leading slash, a trailing slash, two consecutive slashes, '..' and a '.lock' ending`, `the sign-in mapping turns every whoAmI outcome into a signin.state: ok to signed-in with the login, and missing-tool, missing-signin (including an empty login), unreachable and rejected each to their own state with the reason, and a thrown exception to rejected`, `repo.settings.get reads the signed-in login only through s1's adapter: with a fake gh recording its commands, it runs the signed-in-user read once when the type is github, runs no other port method and changes no tracker state, and runs no gh command when the type is none` |
| `ac11` | `terminal client: makeServices exposes config.catalog, config.repoSettings and config.setRepoSetting, trackerSetup is awaited by its callers in command.ts and the TUI, and the Services fixtures in command, tui, services and team-service tests satisfy the interface`, `terminal client: the settings modal on the repos pane lists the rows from the same payload with the same labels and values as the VS Code model, offers an edit for local rows only (including ghHost), shows the sign-in status row and policy rows read-only, and shows the message of an ok:false result`, `the row keys, labels, kinds and notes each client renders equal those in repoFields from config.catalog, for VS Code, JetBrains and the terminal client` |
| `ac12` | `a repo with no own target resolves to its git remote in the payload, and a default entry's owner and repo are never reported as the target (ac12)`, `buildRepoSettings reports values from the repo's own entry only, the resolved target with its source, and the policy rows, including claimUnits built from a real TeamPolicy value, from a PolicyResult for none, team and ok:false`, `resolveGithubConfig keeps returning none for the inputs the loader rejects: a missing file, an unreadable file, invalid JSON and a file whose top level is not an object; every existing resolveGithubConfig test case passes without edits after the split into loadGithubConfigFile and resolveGithubConfigFromFile`, `characterization of the lenient API: for a null own entry and for a null default, resolveGithubConfig and resolveGithubConfigFromFile give exactly the result or the same thrown TypeError that the code gives before the split (recorded from the pre-split behaviour), so the split adds neither a new throw nor a new swallow` |
| `ac13` | `repo.settings.get returns what repo.settings.set just wrote, and a write made outside the daemon is shown on the next get (ac13)`, `two clients' repo.settings.set calls issued at the same time through the daemon socket both land their keys`, `writeRepoEntryKeys queue: many concurrent calls for different keys of the same file all land (none is lost), run one at a time (an instrumented fs seam never sees two overlapping writes), and a failing call (injected write error) does not stop the queued calls after it`, `writeRepoEntryKeys verify step: with an injected hook that changes the file after the temp write, the verify detects a different size, mtime or hash, discards the temp file and merges again from the new content; after the bounded attempts it returns file-changed and writes nothing`, `repo identity: repo.settings.get and repo.settings.set key the entry on the exact registered path string; a symlink path that is not itself registered returns repo-not-registered, and two registered paths (a symlink and its target) keep separate entries with different settings`, `tracker setup through the terminal service: with a running test daemon the config step reports done with today's detail text and the file holds the entry; with the entry already complete in a valid file it reports already and makes no daemon call; with no daemon it reports failed saying the daemon owns the file, writes nothing, and the other steps still report`, `tracker setup through the terminal service against a daemon that accepts the socket and never replies, and against one that closes the connection without a reply: the config step is reported failed within the deadline, the socket is released, and the other steps still report`, `tracker setup through the terminal service with a malformed github.json (null own entry with a complete default, null default): the config step is failed with the strict reader's message and no daemon call is made`, `makeServices always injects the daemon config seam: trackerSetup passes configOutcome into runTrackerSetup in every branch, and a source search test fails if code outside the daemon and the tests calls runTrackerSetup without it` |
| `ac14` | `repo.settings.set refuses a policy row, a status row, an unknown key, an invalid value (including an invalid branchPattern) and an unregistered repo with the right code, and writes nothing in each case`, `buildRepoSettings reports values from the repo's own entry only, the resolved target with its source, and the policy rows, including claimUnits built from a real TeamPolicy value, from a PolicyResult for none, team and ok:false`, `repo.settings.get leaves github.json and the authored policy file byte for byte unchanged`, `VS Code: the webview host accepts the repoTrackerWrite message, createRepoConfigWriteHandler sends an edit of the ghHost row through the consent gate to writeRepoSetting, a returned error becomes a refusal with its message, and the models.byRepo route is unchanged` |

## 7. Alternatives considered

### 7.1 a1: Daemon as the only writer of github.json, serialised in process, validated planning and a bounded setup request — **CHOSEN**

A single field table in src/config describes the repo-scoped rows and is exposed through config.catalog; the daemon alone writes github.json through one in-process queue; the terminal tracker setup validates the file structure before planning, asks the daemon with a bounded request, and never writes the file itself; all three clients render from the payload.

Add one definition site, a REPO_TRACKER_FIELDS table next to CONFIG_CATALOG, with rows of kind local, status and policy; buildSettingsCatalog exposes it as a static repoFields field, and the branchPattern row carries the grammar that the validator and s6 share. Add daemon methods repo.settings.get(repo), repo.settings.set(repo, key, value) and repo.trackerConfig.ensure(repo, owner, name). The github.json module has a strict reader and writeRepoEntryKeys. Because only the daemon process writes the file, writes are serialised by an in-process queue (no lock file, no reclaim, no file-locked error); inside a write the daemon reads, validates, merges, writes a temp file, verifies size, mtime and content hash again and renames, retrying a bounded number of times for edits by outside processes. repo.settings.get validates once and resolves from the same snapshot through resolveGithubConfigFromFile. Repo identity is the exact registered path string. Sign-in is a live read-only status from whoAmI on s1's adapter (sc1), read only and never changing tracker state; the editable part is ghHost (owner-approved reading). Terminal setup: the pure planTrackerConfig first runs the strict readRepoEntry on the file and turns any validation failure (unreadable file, a null or non-object own entry even when a default is complete, a null default, non-object levels) into a failed outcome carrying the strict reader's message; only a structurally valid file reaches the completeness test, so a malformed file is never reported as already and nothing can dereference null. When a write is needed the terminal service awaits repo.trackerConfig.ensure through the shared rpc with a bounded request: rpc gains an opt-in fourth parameter { timeoutMs } that rejects on the deadline and on the socket ending or closing before a reply and always destroys the socket; calls without it behave exactly as today, so the VS Code extension and other callers are unchanged. A timeout or early close makes the config step failed with a message that the daemon owns the file and must be running, and the remaining setup steps still run. runTrackerSetup takes an optional configOutcome seam, trackerSetup is asynchronous, and a test proves the terminal service always injects the seam. sighting-store.ts is not touched. Host wiring is as in the previous revision: JetBrains forwards, doubles and the DTO default with its five tests; VS Code snapshot, renderer and handler dependencies, webview message, seam test and the FakeGateway, model-tier-picker, detail-renderers, repo-config and activation tests; the terminal client Services members, async trackerSetup and settings modal.

### 7.2 a2: Generalise config.catalog and config.write with a store selector

Keep one catalog and one write method and add a store dimension so the same calls address github.json per-repo entries as well as config.json.

Extend ConfigOption with an optional scope of repo and a store of github.json, add a repoPath parameter to config.catalog and config.write, and branch inside buildSettingsCatalog and the write handler on the store. Repo rows live in CONFIG_CATALOG beside the daemon-wide rows. Policy rows are added to the same payload with a read-only flag.

**Rejected because:** Closest to literal k6 but widens a global write path and breaks the purity and totality of the catalog (partial on ac12-ac14, sc2 and k4).

### 7.3 a3: Each client owns its tracker form and talks to github.json through a thin read and write

Add only a raw read and write of a repo entry to the daemon and let each client define its own fields and validation.

Add repo.githubEntry.get and repo.githubEntry.set that move the entry JSON as is, with the daemon checking only that it is an object. VS Code, JetBrains and the terminal client each hard-code the tracker fields, labels and validation.

**Rejected because:** Violates the one-definition rule (k6) and leaves validation to three clients.

## 8. References

- **[[c1]]** `analyze-bundle` `Settings catalog definition and serving: src/config/config-catalog.ts, src/config/settings-catalog.ts, src/daemon/index.ts:1479, src/daemon/index.ts:1518`
- **[[c2]]** `analyze-bundle` `Client change sites and host wiring: jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGatewayService.kt, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurable.kt:82-112, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt, vscode-plugin/src/config/gateway.ts, vscode-plugin/src/config/types.ts, vscode-plugin/src/panels/types.ts, vscode-plugin/src/extension.ts:399-412, vscode-plugin/src/config/__tests__/seam.test.ts:31-37, src/cli/services/index.ts:79-83, src/cli/services/config.ts, src/cli/panes/ReposPane.tsx`
- **[[c3]]** `code` `src/workflow/config/github.ts`
- **[[c4]]** `code` `src/workflow/tracker/setup.ts:163-200`
- **[[c5]]** `code` `src/workflow/team/sighting-store.ts:196-295`
- **[[c6]]** `prior-artifact` `HLD-315d510cb28100e2`
- **[[c7]]** `prior-artifact` `LLD-315d510cb28100e2-S002`
- **[[c8]]** `doc` `docs/plans/team-workflow.md`
- **[[c9]]** `code` `src/workflow/tracker/github-adapter.ts`
- **[[c10]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/DEF.md`
- **[[c11]]** `code` `src/workflow/team/types.ts`
- **[[c12]]** `code` `src/db/repos.ts`
- **[[c13]]** `code` `src/cli/services/workflow.ts:334-336`
- **[[c14]]** `code` `vscode-plugin/src/panels/__tests__/repo-config.test.ts:11`
- **[[c15]]** `code` `src/shared/ipc-client.ts:46`
- **[[c16]]** `code` `src/workflow/config/__tests__/github.test.ts`
- **[[c17]]** `code` `src/workflow/tracker/port.ts`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-17T14:58:25.224Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| error-paths | MED | The 15-second daemon request deadline means the entire tracker setup finishes within that deadline. | The design says 'Setup finishes within the deadline'. However, runTrackerSetup subsequently executes auth, scopes, labels, issue types and optional project operations synchronously. ensureLabels contains 'for (const label of SETUP_LABELS)', and each migrated label command can consume its own 10-second timeout. The existing test explicitly verifies that setup continues after a label timeout. Bounding the preceding config RPC cannot bound the entire report-producing operation. [files: src/workflow/tracker/setup.ts, src/workflow/tracker/github.ts, src/workflow/tracker/__tests__/setup.test.ts, src/cli/panes/ReposPane.tsx, src/cli/command.ts] | State that the deadline bounds only the config RPC. Scope timeout assertions to that phase and separately assert that remaining setup steps execute; do not promise a 15-second total setup duration. |

#### Could not verify (does not block)

_None._
