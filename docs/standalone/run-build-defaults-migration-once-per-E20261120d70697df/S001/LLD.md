<!-- insrc:artifact LLD-d70697dff9f56b4a-s1 -->

# LLD: STORY-d70697dff9f56b4a-s1 — Revise the LLD for Story d70697dff9f56b4a/s1 (schemaVersion boot migration). The settings file is now ~/.insrc/repo-config.json (path function repoConfigPath in src/workflow/config/repo-config.ts, env INSRC_REPO_CONFIG, store src/workflow/config/repo-config-store.ts, type RepoConfigFile, error code repo-config-unreadable); github.json no longer exists after Story 8ff6d364012cff02/s1 (approved, merged, pushed). Retarget every github.json / githubConfigPath / github-store / GithubConfigFile / INSRC_GITHUB_CONFIG / github-json-unreadable reference to the new names; rename GITHUB_SCHEMA_VERSION to REPO_CONFIG_SCHEMA_VERSION. Keep the design otherwise: schemaVersion integer at the root, absent/null/below current applies pending steps (step 1 migrateBuildDefaults), stamp after clean run, fire-and-forget boot pass after registry load, repo.buildDefaults.migrate unchanged. The boot move moveLegacyRepoConfig runs before the registry loads, so the file is already repo-config.json when the pass runs.

## Summary

**Epic:** `run-build-defaults-migration-once-per`
**HLD base run:** `wf-1795201895877-mprbnt`
**HLD effective hash:** `fce7d54edacd...`

Adds an integer schemaVersion at the root of ~/.insrc/repo-config.json and a boot pass that compares it with the version this daemon expects. When it is absent, null or lower, the daemon runs the pending migration steps in order (step 1 is the existing migrateBuildDefaults over the registered repos) and stamps the new version once they ran clean. Later boots find the version current and do nothing, so an install that skips any number of commits still applies every pending step once, because the stored version decides, not commit ids. The pass is best-effort and non-blocking; repo.buildDefaults.migrate stays as the manual re-run and does not touch the version.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `runSchemaMigrations`

```typescript
runSchemaMigrations(deps: SchemaMigrationDeps): Promise<SchemaMigrationResult>
```

**Parameters:**
- `deps: SchemaMigrationDeps` — { registeredRepos: () => Promise<readonly string[]>; configPath?: string; steps?: readonly SchemaMigrationStep[]; currentVersion?: number; writeKeys?: typeof writeRepoEntryKeys; writeVersion?: typeof writeSchemaVersion }: the registry listing (as the repo settings handlers take it) and test seams for the file path, the step list, the expected version and the two writers

**Returns:** `Promise<SchemaMigrationResult>` — What the pass did: the stored version it found, the version it stamped (if any) and a status.

**Errors:**
- `never throws` when Every failure (unreadable repo-config.json, invalid schemaVersion, unlistable registry, a step that throws, a stamp that cannot be written) is a status in the result and is logged; the promise always resolves.

**Preconditions:**
- The registry is loaded (called from the daemon's boot after it).

**Postconditions:**
- A stored schemaVersion equal to or above the expected version runs nothing and writes nothing.
- A stored schemaVersion that is absent, null or below the expected version runs, in ascending order, each step numbered above it, and stops at the first step that does not run clean.
- The stamp written is the highest version whose steps (and all before it) ran clean, so a finished step is never run again and a failed one is retried at the next boot.
- An invalid stored value (not an integer, or negative) or an unreadable repo-config.json runs nothing and is neither overwritten nor treated as 0.
- The stamp keeps default, repos and every other root key of repo-config.json.

### 2.2 `readSchemaVersion`

```typescript
readSchemaVersion(configPath?: string): { readonly ok: true; readonly version: number | null } | { readonly ok: false; readonly reason: string }
```

**Parameters:**
- `configPath: string` _(optional)_ — The repo-config.json path; the default is repoConfigPath()

**Returns:** `{ ok: true; version: number | null } | { ok: false; reason: string }` — The root schemaVersion, null when the file or the key is absent or null, or not-ok with the reason when the file is unreadable (the strict reader's repo-config-unreadable) or the value is present but not a non-negative integer.

**Errors:**
- `schema-version-invalid` when The root value is present and is neither null nor a non-negative integer; returned as data, never thrown.

**Postconditions:**
- Reads only; the file is never created or changed by a read.

### 2.3 `writeSchemaVersion`

```typescript
writeSchemaVersion(version: number, configPath?: string, seams?: StoreSeams): Promise<WriteResult>
```

**Parameters:**
- `version: number` — The schema version to store at the root
- `configPath: string` _(optional)_ — The repo-config.json path
- `seams: StoreSeams` _(optional)_ — The writer's file-operation seams, as for writeRepoEntryKeys

**Returns:** `Promise<WriteResult>` — ok with changed true when the value was written, ok with changed false when it already held that version, or the store's error (repo-config-unreadable | file-changed | write-failed).

**Errors:**
- `repo-config-unreadable | file-changed | write-failed` when Returned as data like writeRepoEntryKeys; the promise never rejects.

**Postconditions:**
- Runs on the same single queue and the same read-merge-write-verify loop (temp file, fingerprint check, atomic rename) as writeRepoEntryKeys.
- Creates the file when it is absent; keeps default, repos and unknown root keys; never lowers a stored version.

### 2.4 `migrateBuildDefaults`

```typescript
migrateBuildDefaults(repos: readonly string[], deps?: { readonly configPath?: string; readonly writeKeys?: typeof writeRepoEntryKeys }): Promise<BuildMigrationReport>
```

**Parameters:**
- `repos: readonly string[]` — The registered repo paths
- `deps: { configPath?: string; writeKeys?: typeof writeRepoEntryKeys }` _(optional)_ — Test seams

**Returns:** `Promise<BuildMigrationReport>` — One entry per repo and counts per outcome.

**Errors:**
- `never throws` when Failures are per-repo write-failed outcomes.

**Postconditions:**
- Unchanged by this Story: it is step 1 of the schema migrations as is, and the on-demand method that wraps it neither reads nor writes the version.

## 3. Data model changes

### 3.1 `RepoConfigFile.schemaVersion` — field-add

An optional integer at the root of ~/.insrc/repo-config.json beside default and repos. Absent or null means 0 (no migration applied). Written only by the daemon, only through writeSchemaVersion, after the pending steps ran clean; never lowered. The strict reader already accepts extra root keys and every repo write keeps them, so existing readers and the settings clients are unaffected. RepoConfigFile gains the optional readonly schemaVersion field.

**Call sites:**
- `src/workflow/config/repo-config-store.ts:78-100`
- `src/workflow/config/repo-config-store.ts:136-152`
- `src/workflow/config/repo-config.ts:82-86`

### 3.2 `REPO_CONFIG_SCHEMA_VERSION` — new

The schema version this daemon expects, a constant of 1 (step 1: apply the build defaults). A later migration adds a numbered step and raises the constant.

**Call sites:**
- `src/daemon/repo-settings.ts:241-275`

### 3.3 `SchemaMigrationStep` — new

{ readonly version: number; readonly run: (ctx: { readonly repos: readonly string[] }) => Promise<{ readonly clean: boolean; readonly counts?: BuildMigrationReport['counts'] }> }. One numbered step in a static ascending list; the only entry is version 1, whose run is migrateBuildDefaults over ctx.repos and whose clean is counts['write-failed'] === 0.

**Call sites:**
- `src/daemon/repo-settings.ts:241-275`

### 3.4 `SchemaMigrationResult` — new

{ readonly status: 'applied' | 'up-to-date' | 'newer-schema' | 'not-clean' | 'registry-unreadable' | 'file-unreadable' | 'schema-version-invalid' | 'failed'; readonly from: number | null; readonly to?: number; readonly note?: string }. What the boot pass did; logged, not persisted.

**Call sites:**
- `src/daemon/index.ts:400-418`

### 3.5 `repo.buildDefaults.migrate` — invariant-change

Behaviour unchanged. The same migration function now also runs once at boot as step 1 of the schema migrations, while this method stays the manual, repeatable run and never reads or writes schemaVersion.

**Call sites:**
- `src/daemon/repo-settings.ts:340-356`

## 4. Error paths

**Error cases**

- **repo-config.json cannot be read or is malformed (invalid JSON, a non-object top level, a non-object default or repos).** (recoverable)
  - Detection: readSchemaVersion goes through the strict reader (readRepoEntry), which returns repo-config-unreadable naming the level.
  - Response: runSchemaMigrations runs nothing, writes nothing, logs a warning and returns file-unreadable; the file is not overwritten.
  - User impact: The defaults are not applied at this boot (and the build gate cannot read settings anyway); once the file is fixed the next boot applies them.
- **The root schemaVersion is present but is not a non-negative integer (a string, a fraction, a negative number, an object).** (recoverable)
  - Detection: readSchemaVersion checks Number.isInteger(value) && value >= 0 for any value that is neither absent nor null.
  - Response: Nothing runs and nothing is written; the result is schema-version-invalid with the found value; it is not treated as 0, which would re-run the migration.
  - User impact: No automatic migration until the value is corrected or removed; repo.buildDefaults.migrate still works.
- **The registry cannot be listed when the pending steps need it.** (recoverable)
  - Detection: deps.registeredRepos() rejects; the runner catches it.
  - Response: No step runs, nothing is stamped, the result is registry-unreadable and is logged; the next boot tries again.
  - User impact: None at this boot; the defaults arrive at a later boot.
- **A step throws, or at least one repo reports write-failed.** (recoverable)
  - Detection: the runner's try/catch around step.run(); for a returned report, counts['write-failed'] > 0 makes clean false.
  - Response: The runner stops at that step, stamps only the highest earlier clean version (none when it was the first), logs the note and returns not-clean or failed; the step is retried at the next boot, and repos that already hold commands report already-set, so a repeat is harmless.
  - User impact: Repos that failed keep no defaults until a later boot or a manual run.
- **The steps ran clean but the stamp cannot be written (repo-config.json changed under the writer on every attempt, disk full, permission).** (recoverable)
  - Detection: writeSchemaVersion returns { ok: false, error } with file-changed or write-failed.
  - Response: Logged as a warning; the result is failed; the version stays unstamped so the steps run again at the next boot, which is safe because repos with commands report already-set.
  - User impact: The migration may re-run at each boot until the stamp can be written; a command the user cleared in between could be applied once more.
- **The boot pass itself fails unexpectedly (a bug).** (recoverable)
  - Detection: the call site in src/daemon/index.ts uses void runSchemaMigrations(...).then(log).catch(log), like step 5b.
  - Response: Logged; boot continues; the server still listens and 'ready' is logged.
  - User impact: None on startup.
- **The first boot after the rename update: github.json has not been moved yet when the pass runs, or the move failed (both-exist, no hard links).** (recoverable)
  - Detection: moveLegacyRepoConfig runs earlier in the boot, before the database opens, and reports moved, both-exist or failed; the pass then reads repo-config.json, which is absent or the one in place.
  - Response: The pass never reads github.json. A failed move leaves repo-config.json absent, so the pass sees version null and runs step 1 over the registry, creating repo-config.json with the stamp and the repos' commands; the old github.json is then ignored.
  - User impact: A user whose move failed (a volume without hard links) must rename by hand and would then find the stamped file in the way (both-exist); the move note tells them which file to keep.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An existing install whose repo-config.json has no schemaVersion, updated after skipping many commits. | The version is absent, so step 1 runs once at that boot and 1 is stamped; no commit id is read. |
| schemaVersion is null. | Treated as 0 exactly like absent: step 1 runs and 1 is stamped. |
| schemaVersion is 0. | Below the expected 1, so step 1 runs. |
| schemaVersion equals the daemon's expected version. | up-to-date: nothing is run and nothing is written. |
| schemaVersion is higher than the daemon expects (written by a newer daemon, then rolled back). | newer-schema: nothing is run, nothing is written and the value is never lowered. |
| repo-config.json does not exist (a fresh install). | Version null: step 1 runs over the registered repos (none or few), the file is created with schemaVersion 1; repos added later get their defaults at repo.add. |
| A user clears a command after the stamp was written. | No later boot re-applies it, because the version is current; only a manual repo.buildDefaults.migrate does. |
| The user calls repo.buildDefaults.migrate by hand. | It runs as before and neither reads nor writes schemaVersion, so it cannot cause or suppress the boot run. |
| A repo setting is written (repo.settings.set or repo.add) after the stamp. | The repo write keeps the root schemaVersion, because the merge rebuilds the file from the parsed root. |
| Two daemons boot at nearly the same time. | Both may run step 1; it is idempotent (never overwrites an entry that sets a key) and the stamp is a verified atomic write, so the result is the same. The window is documented, not locked. |
| INSRC_REPO_CONFIG points at a path outside ~/.insrc (tests, custom installs). | The pass reads and stamps that file; the boot move is skipped for it, and the pass behaves as for the default path. |

**Invariants to preserve**

- The boot pass never delays or fails daemon startup: it is fire-and-forget after registry load and never rejects, like the steering refresh. [[c2]]
- migrateBuildDefaults and applyBuildDefaults are consumed unchanged: never overwrite an entry that sets any of the three keys, never throw, failures are per-repo outcomes. [[c1]]
- The strict reader accepts root keys beyond default and repos, and every repo write keeps them, so adding schemaVersion changes nothing for existing readers or for repo.settings.*. [[c3]]
- The daemon is the only writer of repo-config.json, and every write goes through the one in-process queue with the read-merge-write-verify loop and atomic rename. [[c3]]
- No new RPC method is added, so the handler tables, routing table, audit and ADDED_RPC list are unchanged; repo.buildDefaults.migrate keeps its behaviour. [[c4]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict (the repo's runner, as in src/daemon/__tests__/repo-settings.test.ts)`

**Test levels**

- **unit** — Prove the version read, the stamp write and the runner's decisions over temporary files and fake steps.
  - Subjects: `schema-migrations.test.ts: readSchemaVersion returns null for an absent file, an absent key and a null value, the integer for a valid one, and ok:false for an unreadable file or a value that is not a non-negative integer, without changing the file`, `schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data`, `schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects`, `schema-migrations.test.ts: the version-1 step runs migrateBuildDefaults over the listed repos and is clean only when no repo reports write-failed`
  - Fixtures: `temporary directory for repo-config.json`, `fake steps list and expected version`, `temporary registered repos with a Python marker (as in repo-settings.test.ts)`
- **integration** — Prove the real runner and the real migration together against a temporary repo-config.json, that a repo write keeps the version, and that the docs match.
  - Subjects: `schema-migrations.test.ts: two successive runs over a temporary Python repo with no commands and no schemaVersion (the first writes the three keys and stamps 1, the second runs nothing), with no commit id read anywhere`, `schema-migrations.test.ts: a command cleared after the stamp is not re-applied by the second run, while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged`, `schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion`, `schema-migrations.test.ts: a source check that src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited`, `build-commands-doc.test.ts: docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code`
  - Fixtures: `temporary repo-config.json via INSRC_REPO_CONFIG`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `schema-migrations.test.ts: two successive runs over a temporary Python repo with no commands and no schemaVersion (the first writes the three keys and stamps 1, the second runs nothing), with no commit id read anywhere`, `schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects` |
| `ac2` | `schema-migrations.test.ts: runSchemaMigrations runs the pending steps in ascending order and stamps the highest clean version for a version that is absent, null or below the expected one, runs nothing for an equal or higher one, stops at the first step that throws or reports write-failed and stamps only the earlier clean version, runs nothing on an unreadable file or an invalid version, reports registry-unreadable when the registry cannot be listed, and never rejects` |
| `ac3` | `schema-migrations.test.ts: a source check that src/daemon/index.ts calls runSchemaMigrations as a fire-and-forget pass after the registry loads, with a catch, and not awaited` |
| `ac4` | `schema-migrations.test.ts: writeSchemaVersion creates the file when absent, keeps default, repos and unknown root keys, reports changed false when the version is already stored, never lowers a stored version, and returns write-failed or file-changed as data`, `schema-migrations.test.ts: a repo write through writeRepoEntryKeys after the stamp keeps the root schemaVersion`, `schema-migrations.test.ts: a command cleared after the stamp is not re-applied by the second run, while the manual repo.buildDefaults.migrate handler still re-applies it and leaves schemaVersion unchanged` |
| `ac5` | `build-commands-doc.test.ts: docs/daemon.md describes the schemaVersion at the root of repo-config.json and the boot migration in line with the code` |

## 6. Migration

**State before:** The build-defaults migration exists only as the on-demand repo.buildDefaults.migrate method (src/daemon/repo-settings.ts:247-275 and 340-356); nothing runs it by itself, so after a daemon update the user must call it. The daemon's boot has a non-blocking pass over registered repos (steering refresh, src/daemon/index.ts:400-418) that runs at every boot, and nothing records which one-time migrations have run. ~/.insrc/repo-config.json (moved from github.json at the first boot by moveLegacyRepoConfig, src/daemon/index.ts:141-150) is { default?, repos? }; its strict reader accepts other root keys and every repo write keeps them (src/workflow/config/repo-config-store.ts:78-135), but nothing stores a schema version.

**State after:** ~/.insrc/repo-config.json may carry an integer schemaVersion at its root. At boot, after the registry loads, a non-blocking pass compares it with the version this daemon expects (1); when it is absent, null or lower, it runs the pending steps in order (step 1: migrateBuildDefaults over the registered repos) and, when they ran clean, stamps the version. Later boots find it current and do nothing; an install that skips commits still applies every pending step once. repo.buildDefaults.migrate is unchanged and does not touch the version.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add a root-level store function that stamps schemaVersion through the existing serialised read-merge-write-verify loop, creating the file when absent, keeping default, repos and unknown root keys and never lowering a stored value; add a strict reader for the value that returns null for absent or null and reports an invalid value as data. — ↩ rollbackable
2. Add the expected-version constant (1), the numbered step list holding the build-defaults step, and the runner that applies the pending steps in ascending order, stops at the first one that is not clean and stamps the highest clean version. — ↩ rollbackable
3. Call the runner from the daemon's boot after the registry loads, as a fire-and-forget pass with a catch, in the style of the steering refresh, logging the result. — ↩ rollbackable
4. Document the root schemaVersion, the boot migration and the comparison rule in docs/daemon.md, including that a manual repo.buildDefaults.migrate does not touch the version and a deliberate clear is not re-applied at boot once the version is stamped. — ↩ rollbackable
5. At the first boot of the updated daemon the stored version is absent, step 1 runs once over every registered repo and 1 is stamped; removing or lowering schemaVersion by hand makes the pending steps run once more at the next boot. — ↩ rollbackable

**Backward compat:** No public API changes: no RPC method is added or changed, repo.buildDefaults.migrate keeps its behaviour and reply, and repo-config.json keeps its shape apart from one optional extra root key that the strict reader already accepts and every repo write already preserves, so the terminal, the IDE plugins and the build gate are unaffected. An older daemon ignores the key and keeps it on its own repo writes; a daemon rolled back after the stamp simply no longer runs the pass. Repos that already hold commands report already-set, so the first boot after the update does not change them.

## 7. Alternatives considered

### 7.1 a1: schemaVersion at the root of repo-config.json, stamped after a clean run — **CHOSEN**

One integer at the root of ~/.insrc/repo-config.json; at boot, when it is absent, null or below the daemon's current version, run the pending migration and stamp the current version only if no repo reported write-failed.

Add a root key schemaVersion (an integer) to repo-config.json, next to default and repos, and a constant REPO_CONFIG_SCHEMA_VERSION for the version this daemon expects (1: the build-defaults migration). A small boot pass, run after the registry loads in the style of step 5b (fire-and-forget, never rejects), reads the root value through the strict reader: absent or null counts as 0; an integer below the current version means the migrations numbered above it are pending; equal or above means nothing to do. For the pending ones it runs migrateBuildDefaults over the registered repos and, when counts['write-failed'] is 0, stamps the current version at the root through a new store function that reuses the existing queue and read-merge-write-verify loop (temp file, fingerprint check, atomic rename) and keeps default, repos and unknown keys. A run with a write-failed repo is not stamped and is tried again at the next boot. No new file and no new RPC method; repo.buildDefaults.migrate is unchanged and does not touch the version.

### 7.2 a2: The same version rule, stamped after the first run whatever the outcome

As a1, but the version is stamped after the first attempt, so each step runs strictly once and a failure is only logged.

Same root schemaVersion, constant and boot pass as a1, but the current version is stamped as soon as the migration has finished, with a failed repo only logged; the user re-runs repo.buildDefaults.migrate by hand for any repo that reported write-failed.

**Rejected because:** Strictly once, but a transient failure silently defeats running automatically (k4 partial).

### 7.3 a3: schemaVersion in a separate small file

Keep the version in its own file under ~/.insrc instead of the root of repo-config.json.

A new PATHS entry for a small JSON file holding { schemaVersion }, read and written with a plain atomic replace, with the same boot pass and the same compare-and-apply rule as a1.

**Rejected because:** Works, but is larger than needed and departs from the instruction to put the version in the JSON root (k2 and k6 partial).

## 8. References

- **[[c1]]** `code` `src/daemon/repo-settings.ts:247-275` — "s1 bundle 1: migrateBuildDefaults, the repo.buildDefaults.migrate handler (also lines 340-356)"
- **[[c2]]** `code` `src/daemon/index.ts:400-418` — "s1 bundle 3: the daemon's boot order and the boot steering refresh (also lines 141-150 and 389)"
- **[[c3]]** `code` `src/workflow/config/repo-config-store.ts:78-135` — "s1 bundle 2: the shape, reader and writer of repo-config.json (also lines 33-57 and 217-238)"
- **[[c4]]** `code` `src/daemon/threads/method-class.ts` — "s1 bundle 4: the registries a new RPC method must join (also src/daemon/repo-call-audit.ts line 112)"
- **[[c5]]** `code` `src/daemon/__tests__/repo-settings.test.ts` — "s1 bundle 5: the tests the new store function and boot pass would extend"

## 9. Open questions

- Confirm the constraints k1-k6 this LLD authored from your statements (once only; decided by the root schemaVersion in repo-config.json, with absent, null or below the current version applying the pending steps, never by commit ids; never blocks or fails startup; a failure is not silently lost; the daemon is the only writer and keeps the rest of repo-config.json; stay small and keep the on-demand method). They are the scoring basis for the alternatives.
- Confirm the acceptance criteria ac1-ac5 this LLD authored, since the Story carries none: ac1 a stored schemaVersion that is absent, null or below the daemon's version makes the boot apply the pending steps once and stamp the version, with no commit ids involved; ac2 a current or higher version runs nothing, and a failed step is not stamped and is retried at the next boot; ac3 the pass never delays or fails startup; ac4 the stamp keeps the rest of repo-config.json, and a command cleared after the stamp is not re-applied at boot while the manual method still can; ac5 the behaviour is documented in docs/daemon.md.
- Confirm the new symbol names and constant (runSchemaMigrations, readSchemaVersion, writeSchemaVersion, REPO_CONFIG_SCHEMA_VERSION = 1, SchemaMigrationStep, SchemaMigrationResult). They do not exist yet, so no analyzer bundle can cite them.
- Confirm the citation mapping: c1 is the migrateBuildDefaults/handler bundle, c2 the startup-order bundle, c3 the repo-config.json store bundle, c4 the method-registries bundle, c5 the tests bundle (invariant sources use these).

## Resolved questions

- `qd1a25ef3` — Confirm the constraints k1-k6 this LLD authored from your statements (once only; decided by the root schemaVersion in repo-config.json, with absent, null or below the current version applying the pending steps, never by commit ids; never blocks or fails startup; a failure is not silently lost; the daemon is the only writer and keeps the rest of repo-config.json; stay small and keep the on-demand method). They are the scoring basis for the alternatives.
  - **resolved**: Confirm k1–k6 unchanged — User approved the LLD in chat, which listed this as its open confirmation. _(2026-11-20T19:17:42.404Z)_

## Citations

- **[[c1]]** `code` `src/daemon/repo-settings.ts:247-275` — "s1 bundle 1: migrateBuildDefaults, the repo.buildDefaults.migrate handler (also lines 340-356)"
- **[[c2]]** `code` `src/daemon/index.ts:400-418` — "s1 bundle 3: the daemon's boot order and the boot steering refresh (also lines 141-150 and 389)"
- **[[c3]]** `code` `src/workflow/config/repo-config-store.ts:78-135` — "s1 bundle 2: the shape, reader and writer of repo-config.json (also lines 33-57 and 217-238)"
- **[[c4]]** `code` `src/daemon/threads/method-class.ts` — "s1 bundle 4: the registries a new RPC method must join (also src/daemon/repo-call-audit.ts line 112)"
- **[[c5]]** `code` `src/daemon/__tests__/repo-settings.test.ts` — "s1 bundle 5: the tests the new store function and boot pass would extend"
