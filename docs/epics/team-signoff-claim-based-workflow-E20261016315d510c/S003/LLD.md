<!-- insrc:artifact LLD-315d510cb28100e2-s3 -->

# LLD: E20261017315d510c:S003

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `3738518e4be6...`

A developer sees and edits their own tracker settings for a repo (tracker type, target, the gh tool location and sign-in host, and branch naming) in VS Code, JetBrains and the terminal client, and sees the team's policy rules next to them as read-only values. All three clients render the same rows from one daemon definition and one read and write path over ~/.insrc/github.json, so a change made in one client shows in the others.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

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

**Returns:** `SettingsCatalogPayload` — The existing payload plus one new static field, repoFields: the definitions of the repo-scoped rows (key, label, type, enum values, default, description, kind 'local' | 'policy' | 'status', group). Still pure and total; it reads no file and no policy.

**Postconditions:**
- The definitions come from the single REPO_TRACKER_FIELDS table, so config.catalog is where every client learns which repo-scoped rows exist (k6)
- Existing fields of the payload are unchanged, so a client that does not know repoFields keeps working

### 2.2 `repo.settings.get`

```typescript
repo.settings.get(params: { repo: string }): Promise<RepoSettingsPayload>
```

**Parameters:**
- `repo: string` — Absolute path of a repo registered with the daemon.

**Returns:** `RepoSettingsPayload` — The repo's current value for each local row (absent means unset), the resolved tracker target with its source, the live sign-in status, and the policy rows with the policy value and source, or the reason the policy could not be read.

**Errors:**
- `repo-not-registered` when repo is not a registered repo
- `github-json-unreadable` when github.json exists but is not valid JSON or not an object; the payload is not returned and nothing is written

**Preconditions:**
- repo is a registered repo path

**Postconditions:**
- Reads github.json on every call, so it shows what any other client wrote (ac13)
- Never writes
- A policy that cannot be read yields policy rows with the reason, not a failure of the whole call

### 2.3 `repo.settings.set`

```typescript
repo.settings.set(params: { repo: string; key: string; value: string | boolean | null }): Promise<{ ok: true; payload: RepoSettingsPayload }>
```

**Parameters:**
- `repo: string` — Absolute path of a registered repo.
- `key: string` — A key of a 'local' row in REPO_TRACKER_FIELDS.
- `value: string | boolean | null` — The new value, checked against the row's type and enum; null removes the key from the repo's entry.

**Returns:** `{ ok: true; payload: RepoSettingsPayload }` — The payload re-read after the write, so the caller shows what is on disk.

**Errors:**
- `unknown-key` when key is not a row of the table
- `read-only-key` when key is a 'policy' or 'status' row
- `invalid-value` when value fails the row's type, enum or format check (for example an owner or repo name that is not a valid GitHub name)
- `repo-not-registered` when repo is not a registered repo
- `github-json-unreadable` when the existing file is invalid JSON or not an object; it is left untouched

**Preconditions:**
- repo is a registered repo path

**Postconditions:**
- Changes only that key of repos[repo]; the default entry, other repos and unknown keys of the file are preserved
- The write is atomic (temp file in the same directory, then rename) and serialized inside the daemon
- A repo with no entry gets one created holding only the written key

### 2.4 `resolveGithubConfig`

```typescript
resolveGithubConfig(repoPath: string, configPath?: string): ResolvedGithubConfig
```

**Parameters:**
- `repoPath: string` — Repo whose tracker target is resolved.
- `configPath: string` _(optional)_ — Config file; defaults to githubConfigPath().

**Returns:** `ResolvedGithubConfig` — Unchanged. repo.settings.get calls it to report the resolved target and its source (per-repo-config, default-config or git-remote).

**Errors:**
- `GithubConfigError` when github is enabled for the repo but no owner/repo could be resolved; repo.settings.get reports it in the payload

**Postconditions:**
- Unchanged behaviour; the new GithubEntry fields are optional and ignored by it and by resolveStrictTrackerTarget

### 2.5 `PolicyReader`

```typescript
PolicyReader(repo: string): PolicyResult<TeamPolicy | 'none'>
```

**Parameters:**
- `repo: string` — Repo whose policy is read.

**Returns:** `PolicyResult<TeamPolicy | 'none'>` — The sc2 reader, consumed unchanged; repo.settings.get maps its value to the read-only policy rows.

**Errors:**
- `PolicyResult ok:false` when the policy could not be read; the reason is shown in the policy rows

**Postconditions:**
- Never refreshes or fetches on behalf of a settings view beyond what the reader does itself

## 3. Data model changes

### 3.1 `REPO_TRACKER_FIELDS` — new

The one definition table of the repo-scoped rows, in src/config next to CONFIG_CATALOG. Each row: key, label, type ('string' | 'boolean' | 'enum'), enumValues, default, description, group 'Tracker', and kind: 'local' (editable, stored in github.json), 'status' (derived, read-only: sign-in status of gh and the resolved target with its source) or 'policy' (read-only, from sc2). Local rows: type (github | none), owner, repo, ghPath (tool location of the gh program), ghHost (the GitHub host gh is signed in to, for GitHub Enterprise; default github.com), branchPattern (branch naming, with {id} {slug} {type} placeholders). Policy rows: teamMode, signoffStages, claimsEnforced, administrators, forceTaskIssues.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/config/settings-catalog.ts`

### 3.2 `SettingsCatalogPayload` — field-add

Adds repoFields: readonly RepoFieldDef[], the rows of REPO_TRACKER_FIELDS without values. Additive: clients that ignore it are unaffected.

```
+ readonly repoFields: readonly RepoFieldDef[];
```

**Call sites:**
- `src/config/settings-catalog.ts`
- `src/daemon/index.ts:1479`

### 3.3 `RepoSettingsPayload` — new

{ repo: string; values: Record<string, string | boolean>; resolved: { type: 'github' | 'none'; owner?: string; repo?: string; source: 'per-repo-config' | 'default-config' | 'git-remote'; error?: string }; signin: { state: 'signed-in' | 'missing-tool' | 'missing-signin' | 'unreachable' | 'unknown'; login?: string }; policy: { ok: true; mode: 'none' } | { ok: true; mode: 'team'; values: Record<string, unknown>; source: { ref: string; fetchedAt: string } } | { ok: false; reason: string } }. 'values' holds only keys the repo's own entry sets; the resolved block is what resolveGithubConfig reports (ac12).

**Call sites:**
- `src/daemon/index.ts`

### 3.4 `GithubEntry` — field-add

Adds optional ghPath, ghHost and branchPattern (strings). resolveGithubConfig, loadGithubConfigFile and resolveStrictTrackerTarget ignore them, so a repo without them resolves exactly as today (k4). The tool location and host are read by the gh runner only in a later story; this story stores and shows them.

```
+ readonly ghPath?: string; + readonly ghHost?: string; + readonly branchPattern?: string;
```

**Call sites:**
- `src/workflow/config/github.ts`

### 3.5 `github.json writer` — new

One writer module (readRepoEntry and writeRepoEntryKey) that parses the file, merges one key into repos[repo], and replaces the file atomically; used by repo.settings.set and by the config step of tracker setup so the file has a single writer path.

**Call sites:**
- `src/workflow/tracker/setup.ts:163-200`
- `src/workflow/config/github.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | repo.settings.get calls PolicyReader(repo) once and maps TeamPolicy to read-only rows: teamMode, signoffStages, claimsEnforced, administrators, forceTaskIssues, with source.ref and source.fetchedAt shown as where the value came from. No policy key can be written: repo.settings.set refuses any key whose kind is not 'local'. TeamPolicy is not changed and nothing is cached by this story. |

## 5. Error paths

**Error cases**

- **github.json exists but is not valid JSON or its top level is not an object** (recoverable)
  - Detection: The read path in the github.json writer parses the file with JSON.parse and checks the result is a non-array object; a parse error or a wrong shape is caught there.
  - Response: repo.settings.get and repo.settings.set return github-json-unreadable naming the file and the parse error; set writes nothing and leaves the file untouched. The lenient resolver keeps its own behaviour (treats the file as empty).
  - User impact: The client shows the error and an offer to fix the file by hand; no setting is lost or overwritten.
- **Two clients write at nearly the same time** (recoverable)
  - Detection: All writes pass through one in-daemon queue, so two repo.settings.set calls never interleave; a write by a process other than the daemon (the terminal setup step before it is moved onto the writer) is detected by comparing the file's mtime and size read at the start of the merge with those just before the rename.
  - Response: The queued writes apply one after the other, each merging into the latest file. If the file changed between read and rename, the merge is redone once from the new content; if it changes again the call returns file-changed and writes nothing.
  - User impact: Both edits survive, or the second client is asked to retry; neither silently overwrites the other.
- **A client sends a write for a policy or status row** (terminal)
  - Detection: repo.settings.set looks the key up in REPO_TRACKER_FIELDS and checks kind === 'local'.
  - Response: Returns read-only-key and writes nothing.
  - User impact: The row is shown read-only in every client, so this only happens from a hand-made call; the value cannot be changed locally (k5).
- **A value does not match its row (an enum outside its values, an owner or repo that is not a valid GitHub name, a branch pattern with an unknown placeholder, a ghPath that contains a newline)** (recoverable)
  - Detection: repo.settings.set validates the value against the row's type, enumValues and format before any file access.
  - Response: Returns invalid-value with the reason; nothing is written.
  - User impact: The client shows the reason next to the field and keeps the old value.
- **The repo is not registered with the daemon** (recoverable)
  - Detection: Both methods look the path up in the repo registry before reading or writing.
  - Response: Returns repo-not-registered; no file is read or written.
  - User impact: The client's repo picker only lists registered repos, so this appears only after a repo is removed while the settings are open.
- **The policy cannot be read (offline, no default branch known, malformed policy file)** (recoverable)
  - Detection: PolicyReader returns ok:false and repo.settings.get checks the result.
  - Response: The payload carries policy: { ok: false, reason }; the local rows are still returned.
  - User impact: The policy section shows the reason instead of values; editing the local rows is unaffected.
- **gh is not installed or not signed in when the sign-in status is computed** (recoverable)
  - Detection: The status row uses the s1 classified runner and reads GhCommandError.kind (missing-tool, missing-signin, unreachable).
  - Response: signin.state is set to that kind with no login; the call does not fail and uses the 10-second timeout.
  - User impact: The sign-in row says what is missing and how to fix it (gh auth login), without blocking the settings view.
- **github is enabled for the repo but no target can be resolved (type github, no owner/repo, git remote not parseable)** (recoverable)
  - Detection: resolveGithubConfig throws GithubConfigError, caught in repo.settings.get.
  - Response: resolved.error carries the message and resolved.type is 'none'; the call succeeds.
  - User impact: The target row shows why there is no target and which fields to set.
- **An older client calls config.catalog and does not know repoFields** (recoverable)
  - Detection: The field is additive; the client simply does not read it.
  - Response: No change in what the client receives for existing fields.
  - User impact: The older client shows no tracker section until it is updated; nothing else changes.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no entry in github.json and no default entry | values is empty, resolved.type is 'none' with source 'default-config', and the editable rows show their defaults as unset. |
| A repo with no own target and a default entry of type github | resolved shows owner and repo from the repo's git remote with source 'git-remote'; the default entry's own owner and repo are never shown as the target (ac12). |
| A value of null for a key that is not set | The write succeeds as a no-op, the file is not rewritten, and the payload is returned. |
| Setting the type to none for a repo | The own entry gets type none; resolveGithubConfig then reports none and the target rows show it as disabled; owner and repo values already in the entry are kept. |
| A repo path given with a trailing slash or as a symlink | The path is normalised to the registered form before the lookup and before it is used as the key in repos, so one repo has one entry. |
| github.json has keys this story does not know in a repo entry (epicLabel, pushTasks) | They are preserved unchanged by every write and are not shown as rows. |
| The policy file exists but teamMode is false | The policy rows show the values with the source; there is no special case beyond showing teamMode false. |
| The sign-in status is requested for a repo with type none | No gh command is run and the status row says the tracker is disabled. |

**Invariants to preserve**

- A repo without the policy file and without the new fields behaves exactly as it does today: the resolvers ignore ghPath, ghHost and branchPattern. [[c1]]
- Policy is read only from the remote default branch and cannot be changed through a settings client; only 'local' rows are writable. [[c8]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (the daemon, the terminal client and the VS Code plugin); JUnit 5 for the JetBrains plugin`

**Test levels**

- **unit** — Prove the pure rules: the field table, the catalog's new static field, value validation, the payload builder, and the merge that writes one key.
  - Subjects: `REPO_TRACKER_FIELDS has a unique key per row and a kind of local, status or policy on every row, and every local key is a GithubEntry field`, `buildSettingsCatalog still returns every existing field unchanged, adds repoFields, stays pure and never throws for an empty or garbage config`, `validateRepoSetting accepts and rejects values per row: type enum, owner and repo names, branchPattern placeholders, ghPath with a newline`, `buildRepoSettings reports values from the repo's own entry only, the resolved target with its source (per-repo-config, default-config, git-remote), and the policy rows from a PolicyResult for none, team and ok:false`, `mergeRepoEntryKey changes only the named key, keeps the default entry, other repos and unknown keys, removes a key for null, and is a no-op for null on an unset key`
  - Fixtures: `temp github.json files written per test with INSRC_GITHUB_CONFIG pointing at them`, `fake PolicyResult values for none, team and failure`
- **integration** — Prove the daemon methods end to end against a real temp github.json, the writer under concurrency, and each client's rendering and write path against the same payload.
  - Subjects: `repo.settings.get returns what repo.settings.set just wrote, and a write made outside the daemon is shown on the next get (ac13)`, `repo.settings.set refuses a policy row, a status row, an unknown key, an invalid value and an unregistered repo, and writes nothing in each case`, `two repo.settings.set calls issued together both land, and a write that changes the file between read and rename is merged again or returns file-changed`, `an unreadable github.json makes get and set return github-json-unreadable and leave the file byte for byte unchanged`, `a repo with no own target resolves to its git remote in the payload, and a default entry's owner and repo are never reported as the target (ac12)`, `sign-in status maps GhCommandError kinds to the payload and runs no gh command when the tracker type is none`, `terminal client: the settings view built from the same payload lists the same rows with the same labels and values as the VS Code panel model and offers an edit for local rows only`, `VS Code panel model: tracker section renders the rows from repoFields and sends repo.settings.set for an edit, with policy rows shown read-only`, `JetBrains PerRepoSection model: tracker rows built from repoFields, edits sent through repo.settings.set, policy rows not editable`
  - Fixtures: `a fake daemon IPC server answering config.catalog, repo.settings.get and repo.settings.set for the client tests`, `a scratch git repo with an origin remote`, `fake gh through _setTrackerExecForTests`
- **contract** — Pin that the three clients show the same rows from one definition, so they cannot drift.
  - Subjects: `the row keys, labels and kinds each client renders equal the keys, labels and kinds in repoFields from config.catalog, for VS Code, JetBrains and the terminal client`, `adding a row to REPO_TRACKER_FIELDS in a test copy appears in all three client models without any client change`
  - Fixtures: `a shared JSON fixture of the config.catalog payload that the TypeScript client tests and the Kotlin test both load`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac10` | `VS Code panel model: tracker section renders the rows from repoFields and sends repo.settings.set for an edit, with policy rows shown read-only`, `JetBrains PerRepoSection model: tracker rows built from repoFields, edits sent through repo.settings.set, policy rows not editable`, `REPO_TRACKER_FIELDS has a unique key per row and a kind of local, status or policy on every row, and every local key is a GithubEntry field` |
| `ac11` | `terminal client: the settings view built from the same payload lists the same rows with the same labels and values as the VS Code panel model and offers an edit for local rows only`, `the row keys, labels and kinds each client renders equal the keys, labels and kinds in repoFields from config.catalog, for VS Code, JetBrains and the terminal client` |
| `ac12` | `a repo with no own target resolves to its git remote in the payload, and a default entry's owner and repo are never reported as the target (ac12)`, `buildRepoSettings reports values from the repo's own entry only, the resolved target with its source (per-repo-config, default-config, git-remote), and the policy rows from a PolicyResult for none, team and ok:false` |
| `ac13` | `repo.settings.get returns what repo.settings.set just wrote, and a write made outside the daemon is shown on the next get (ac13)`, `two repo.settings.set calls issued together both land, and a write that changes the file between read and rename is merged again or returns file-changed` |
| `ac14` | `repo.settings.set refuses a policy row, a status row, an unknown key, an invalid value and an unregistered repo, and writes nothing in each case`, `buildRepoSettings reports values from the repo's own entry only, the resolved target with its source (per-repo-config, default-config, git-remote), and the policy rows from a PolicyResult for none, team and ok:false`, `VS Code panel model: tracker section renders the rows from repoFields and sends repo.settings.set for an edit, with policy rows shown read-only` |

## 7. Alternatives considered

### 7.1 a1: Repo settings payload and write over their own IPC pair, one field table — **CHOSEN**

A single field table in src/config describes the repo-scoped rows; two new daemon methods read the payload (editable local values plus read-only policy values) and write one field to github.json; all three clients render from the payload.

Add one definition site, a REPO_TRACKER_FIELDS table next to CONFIG_CATALOG: each row has a key, type, enum values, default, description and a kind of 'local' (editable) or 'policy' (read-only). Add a pure buildRepoSettings(repoPath, fileContent, policyResult) that returns the rows with the repo's current value, the resolved source of the target (own entry, default entry or git remote) and, for policy rows, the policy value with its source. Add two daemon IPC methods: repo.settings.get(repo) returns that payload, and repo.settings.set(repo, key, value) validates the key and value against the table, refuses a policy key, and writes only that repo's entry in github.json through a single atomic writer (read, merge, write to temp, rename) that also keeps the default entry untouched. VS Code, JetBrains and the terminal client render rows from the payload, so a field added to the table appears in all three. The new fields (tool location, sign-in note, branch naming) are added to GithubEntry as optional, so resolveGithubConfig and s1's strict resolver ignore them.

### 7.2 a2: Generalise config.catalog and config.write with a store selector

Keep one catalog and one write method, and add a 'store' dimension so the same calls can address github.json per-repo entries as well as config.json.

Extend ConfigOption with an optional scope of 'repo' and a store of 'github.json', add a repoPath parameter to config.catalog and config.write, and branch inside buildSettingsCatalog and the write handler on the store. Repo-scoped rows live in CONFIG_CATALOG beside the daemon-wide rows. Policy rows are added to the same payload with a read-only flag.

**Rejected because:** Closest to k6 but widens a global write path and breaks the catalog's purity and totality (partial on ac14, sc2 and k4).

### 7.3 a3: Each client owns its tracker form and talks to github.json through a thin read and write

Add only a raw read and a raw write of a repo entry to the daemon, and let each client define its own fields and validation.

Add repo.githubEntry.get and repo.githubEntry.set that move the entry JSON as is, with the daemon checking only that it is an object. VS Code, JetBrains and the terminal client each hard-code the tracker fields, their labels and their validation.

**Rejected because:** Violates the one-definition rule (k6) and leaves validation to three clients.

## 8. References

- **[[c1]]** `analyze-bundle` `Settings catalog definition and serving: src/config/config-catalog.ts, src/config/settings-catalog.ts, src/daemon/index.ts:1479, src/daemon/index.ts:1518`
- **[[c2]]** `analyze-bundle` `Per-repo settings in the clients today: vscode-plugin/src/panels/repo-config.ts, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt, src/cli/services/config.ts, src/cli/panes/ReposPane.tsx`
- **[[c3]]** `code` `src/workflow/config/github.ts`
- **[[c4]]** `code` `src/workflow/tracker/setup.ts:163-200`
- **[[c5]]** `code` `src/workflow/team/policy-reader.ts`
- **[[c6]]** `prior-artifact` `HLD-315d510cb28100e2`
- **[[c7]]** `prior-artifact` `LLD-315d510cb28100e2-S002`
- **[[c8]]** `doc` `docs/plans/team-workflow.md`

## 9. Open questions

- [sg1 / ambiguous] The story says developers can edit 'tool locations and sign-in', but insrc stores no secrets and sign-in stays with the tracker's CLI. This LLD makes sign-in a read-only status row plus an editable ghHost (the host gh is signed in to). Is that what 'edit sign-in' should mean, or should it be something else?
- [sg2 / missed] ghPath, ghHost and branchPattern are stored and shown by this story, but no story makes the gh runner or branch creation read them. Which story consumes them, so a developer who sets them sees an effect? (Candidate: an s1 follow-up for ghPath/ghHost and the handoff story s6 for branchPattern.)
- [sg3 / partial] repo.settings.get and repo.settings.set are new IPC method names with no precedent in the analysis; confirm the names before they are mirrored in the VS Code and JetBrains clients.
- [sg4 / ambiguous] The config step of tracker setup (src/workflow/tracker/setup.ts) writes github.json directly today. This LLD moves it onto the shared writer so the file has one write path; confirm that touching the setup step is acceptable here rather than a separate change.

## Resolved questions

- `sg1` — [sg1 / ambiguous] The story says developers can edit 'tool locations and sign-in', but insrc stores no secrets and sign-in stays with the tracker's CLI. This LLD makes sign-in a read-only status row plus an editable ghHost (the host gh is signed in to). Is that what 'edit sign-in' should mean, or should it be something else?
  - **resolved**: Sign-in is a read-only status row computed live from gh (signed in as X, not signed in, gh not found, timed out); the only editable part is ghHost, the host gh signs in to (default github.com). No secret is stored. — Owner chose option A on 2026-10-17: satisfies 'see sign-in' with live truth and gives GitHub Enterprise users something to edit, inside the no-secrets rule. _(2026-10-17T12:39:59.765Z)_
- `sg2` — [sg2 / missed] ghPath, ghHost and branchPattern are stored and shown by this story, but no story makes the gh runner or branch creation read them. Which story consumes them, so a developer who sets them sees an effect? (Candidate: an s1 follow-up for ghPath/ghHost and the handoff story s6 for branchPattern.)
  - **resolved**: Split ownership: s1 follow-up + s6 — Owner chose option A on 2026-10-17: s3 stores and shows ghPath, ghHost and branchPattern only; the gh runner reading ghPath and ghHost is an s1 follow-up and branchPattern is consumed by s6 (handoff). The three rows carry a note 'saved; not used yet' until then. _(2026-10-17T12:40:42.103Z)_

## Citations

- **[[c1]]** `analyze-bundle` `Settings catalog definition and serving: src/config/config-catalog.ts, src/config/settings-catalog.ts, src/daemon/index.ts:1479, src/daemon/index.ts:1518`
- **[[c2]]** `analyze-bundle` `Per-repo settings in the clients today: vscode-plugin/src/panels/repo-config.ts, jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/PerRepoSection.kt, src/cli/services/config.ts, src/cli/panes/ReposPane.tsx`
- **[[c3]]** `code` `src/workflow/config/github.ts`
- **[[c4]]** `code` `src/workflow/tracker/setup.ts:163-200`
- **[[c5]]** `code` `src/workflow/team/policy-reader.ts`
- **[[c6]]** `prior-artifact` `HLD-315d510cb28100e2`
- **[[c7]]** `prior-artifact` `LLD-315d510cb28100e2-S002`
- **[[c8]]** `doc` `docs/plans/team-workflow.md`
