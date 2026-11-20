<!-- insrc:artifact LLD-45e12c3f47cefb2b-s1 -->

# LLD: STORY-45e12c3f47cefb2b-s1 — Migrate registered repos to the build-command defaults

## Summary

**Epic:** `migrate-registered-repos-build-command-defaults`
**HLD base run:** `wf-1795168001770-cfry34`
**HLD effective hash:** `45e12c3f47ce...`

Adds one daemon method, repo.buildDefaults.migrate, that the user runs once after updating the daemon. It walks the registered repos in order, calls the existing applyBuildDefaults for each, and returns every repo's outcome with counts per outcome, so repos registered before the add-time defaults get their project type's typical build commands. It never overwrites existing commands and a failure on one repo never stops the others. Nothing runs by itself, and no client button is added.

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

**Surface level:** public

### 2.1 `migrateBuildDefaults`

```typescript
migrateBuildDefaults(repos: readonly string[], deps?: { readonly configPath?: string; readonly writeKeys?: typeof writeRepoEntryKeys }): Promise<BuildMigrationReport>
```

**Parameters:**
- `repos: readonly string[]` — The registered repo paths, exactly as the registry holds them, in registry order.
- `deps: { configPath?: string; writeKeys?: typeof writeRepoEntryKeys }` _(optional)_ — The same test seams applyBuildDefaults takes, passed through to it.

**Returns:** `Promise<BuildMigrationReport>` — One entry per repo, in the order given, each holding that repo's BuildDefaultsOutcome, plus how many repos had each outcome.

**Errors:**
- `never throws` when applyBuildDefaults never throws and reports a failure as { applied: false, reason: 'write-failed', note }; this function runs the repos one at a time and records each result, so one repo's failure does not stop the rest.

**Preconditions:**
- repos holds registered repo paths; the caller (the RPC method) reads them from the registry.

**Postconditions:**
- Every repo whose own github.json entry set none of typecheckCommand, testCommand and resultFormat, and whose project type has typical commands, now has all three, written in one write.
- No entry that set any of the three keys was changed.
- A second call with the same repos changes nothing and reports already-set for the repos the first call set.

### 2.2 `repo.buildDefaults.migrate`

```typescript
'repo.buildDefaults.migrate': (params: unknown) => Promise<BuildMigrationReport | { ok: false; error: { code: 'registry-unreadable'; message: string } }>
```

**Parameters:**
- `params: unknown` _(optional)_ — None are read; the method acts on every registered repo.

**Returns:** `BuildMigrationReport | { ok: false; error: { code: 'registry-unreadable'; message: string } }` — The report, or a business error as data when the registry cannot be listed.

**Errors:**
- `registry-unreadable` when listRepos throws; returned as data, nothing is written.

**Preconditions:**
- The daemon is running and its registry is readable.

**Postconditions:**
- The result is the report of migrateBuildDefaults over the registered repos as listed by listRepos at the time of the call.
- Nothing is written under any repository; only ~/.insrc/github.json, through the daemon's own writer.

### 2.3 `applyBuildDefaults`

```typescript
applyBuildDefaults(repoPath: string, deps?: { readonly configPath?: string; readonly writeKeys?: typeof writeRepoEntryKeys }): Promise<BuildDefaultsOutcome>
```

**Parameters:**
- `repoPath: string` — The repo to apply the defaults to.
- `deps: { configPath?: string; writeKeys?: typeof writeRepoEntryKeys }` _(optional)_ — Test seams for the config path and the writer.

**Returns:** `Promise<BuildDefaultsOutcome>` — applied with the project type, or not applied with the reason.

**Errors:**
- `never throws` when Any failure is { applied: false, reason: 'write-failed', note }.

**Preconditions:**
- None beyond a path.

**Postconditions:**
- Unchanged by this Story: it is consumed as is, and still the only thing that decides whether to write.

## 3. Data model changes

### 3.1 `BuildMigrationReport` — new

{ readonly ok: true; readonly repos: readonly BuildMigrationEntry[]; readonly counts: { readonly applied: number; readonly 'already-set': number; readonly 'node-default': number; readonly 'no-typical-commands': number; readonly 'write-failed': number } }. Read-only result of one migration run; not stored anywhere. counts has a key for every outcome, 0 when none, so a client can print it without checking for missing keys. The sum of the counts equals repos.length.

**Call sites:**
- `src/daemon/repo-settings.ts:201-223`
- `src/daemon/handler-runtime.ts`

### 3.2 `BuildMigrationEntry` — new

{ readonly repo: string; readonly outcome: BuildDefaultsOutcome } where repo is the path as the registry holds it. One per registered repo, in registry order.

**Call sites:**
- `src/daemon/repo-settings.ts:201-223`
- `src/db/repos.ts:226-235`

### 3.3 `BuildDefaultsOutcome` — invariant-change

The type is unchanged. Its meaning gains a second producer: it is now returned either from repo.add (as buildDefaults) or per repo from the migration. The reasons stay already-set, node-default, no-typical-commands and write-failed, so the clients and docs that read them are unaffected.

**Call sites:**
- `src/daemon/repo-settings.ts:201-223`
- `src/daemon/handler-runtime.ts`

## 4. Error paths

**Error cases**

- **The registry cannot be listed.** (recoverable)
  - Detection: listRepos(db) in the method's handler rejects (the registry store is unreadable).
  - Response: Return { ok: false, error: { code: 'registry-unreadable', message } } as data; no repo is touched and nothing is written.
  - User impact: The call reports why nothing was migrated; the daemon stays up.
- **~/.insrc/github.json exists but cannot be read or is malformed.** (recoverable)
  - Detection: readRepoEntry returns not-ok inside applyBuildDefaults for each repo.
  - Response: Every repo's entry reports { applied: false, reason: 'write-failed', note } carrying the read error, and the file is left exactly as it is.
  - User impact: The report shows write-failed for every repo with the file's error; counts.write-failed equals the number of repos. Fixing the file and running again migrates them.
- **The write for one repo is refused or throws (disk full, file changed by another process on every attempt, permission).** (recoverable)
  - Detection: writeKeys returns not-ok or rejects inside applyBuildDefaults, which catches both.
  - Response: That repo reports write-failed with the note; the loop continues with the next repo; no lone command is left because the three keys are one write.
  - User impact: The report names the repo that failed; the others are migrated. Running again retries only the repos that still have none of the keys.
- **The client disconnects or the daemon stops part-way through the loop.** (recoverable)
  - Detection: The socket closes or the process exits between two repos.
  - Response: Repos already written keep their commands (each write is atomic); the rest are untouched; no state records a half-run.
  - User impact: A second call migrates the remainder and reports already-set for the first ones.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| No repos are registered. | { ok: true, repos: [], counts: all zero }. |
| A registered repo's directory no longer exists on disk. | Its project type reads as unknown, so it reports no-typical-commands and nothing is written. |
| A Node repo, or a repo whose root holds markers of two types. | node-default for Node, no-typical-commands for the mixed or unknown root; no write for either. |
| A repo whose entry sets only one of typecheckCommand, typecheckCommand or resultFormat, including a lone command the gate would refuse. | already-set; the entry is not changed, so a bad stored value is left for the user to fix, not overwritten. |
| The method is called twice in a row, or two calls overlap, or repo.settings.set runs during a call. | Writes go through the daemon's single serialised writer; the second call reports already-set for repos the first set; a user's own set is never overwritten because applyBuildDefaults re-reads the entry before it writes. |
| A repo whose commands the user deliberately cleared with repo.settings.set null, then the method is run again. | It is treated as unset and gets the defaults again, because nothing records a clear; this is a property of running the method by hand and is stated in the docs. |

**Invariants to preserve**

- applyBuildDefaults never overwrites an entry that sets any of the three keys, writes them in one write, and never throws; the migration adds no second place that decides whether to write. [[c1]]
- repo.add is unchanged: it stays the only automatic caller of applyBuildDefaults and its reply keeps carrying buildDefaults. [[c2]]
- The registry is walked with the daemon's listRepos in src/db/repos.ts, not the CLI service's function of the same name. [[c1]]
- The new method writes only ~/.insrc/github.json through the daemon's writer and nothing under any user repository, so its repo-call audit entry is daemon-store, as repo.add's is. [[c4]]
- repo.settings.get and the build phase still write nothing and resolve a repo's commands as before; the migration adds no write to a read path. [[c5]]
- Every existing method keeps its row in the handler tables, the thread routing table, the repo-call audit and the recorded method list; only the new method is added to each. [[c4]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (convention of src/daemon/__tests__), with temporary repositories and the injectable writer and registeredRepos of the repo settings handlers`

**Test levels**

- **unit** — Prove migrateBuildDefaults and the repo.buildDefaults.migrate handler over temporary repositories and a temporary github.json, without a daemon
  - Subjects: `src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults writes the typecheck and test commands and resultFormat exit-code together for each Python, Go, Rust and JVM repo with none of them, and writes nothing for a Node repo, an unknown repo, a repo whose directory is gone and an entry that sets any one of the three keys`, `src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults run twice changes nothing the second time and reports already-set for the repos the first run set, and a user's own value set between the runs is kept`, `src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults keeps going when one repo's write is refused or throws, reports write-failed with its note for that repo only, and reports write-failed for every repo, leaving the file as it was, when github.json is malformed`, `src/daemon/__tests__/repo-settings.test.ts: the repo.buildDefaults.migrate handler returns ok, one entry per registered repo in registry order and counts with a key for every outcome that add up to the number of repos, returns zero counts for no repos, and returns registry-unreadable as data when the registry cannot be listed, writing nothing`
  - Fixtures: `Temporary repositories holding only a marker file (pyproject.toml, go.mod, Cargo.toml, pom.xml, package.json, two markers, or none)`, `A temporary github.json and the injectable writeKeys and configPath of the repo settings handlers`, `The existing fixture of repo-settings.test.ts with its registeredRepos override`
- **integration** — Prove the method is registered everywhere a daemon method must be, and documented
  - Subjects: `src/daemon/__tests__/handler-runtime.test.ts: the handler tables hold repo.buildDefaults.migrate beside the recorded methods and repo.buildDefaults.migrate answers through the runtime`, `src/daemon/__tests__/build-commands-doc.test.ts: the Build commands section of docs/daemon.md names repo.buildDefaults.migrate, its report fields and its outcome counts, and says a cleared command is applied again when it is run`
  - Fixtures: `The existing handler-runtime harness with a temporary graph store and github.json`, `docs/daemon.md`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults writes the typecheck and test commands and resultFormat exit-code together for each Python, Go, Rust and JVM repo with none of them, and writes nothing for a Node repo, an unknown repo, a repo whose directory is gone and an entry that sets any one of the three keys` |
| `ac2` | `src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults run twice changes nothing the second time and reports already-set for the repos the first run set, and a user's own value set between the runs is kept` |
| `ac3` | `src/daemon/__tests__/repo-settings.test.ts: migrateBuildDefaults keeps going when one repo's write is refused or throws, reports write-failed with its note for that repo only, and reports write-failed for every repo, leaving the file as it was, when github.json is malformed` |
| `ac4` | `src/daemon/__tests__/repo-settings.test.ts: the repo.buildDefaults.migrate handler returns ok, one entry per registered repo in registry order and counts with a key for every outcome that add up to the number of repos, returns zero counts for no repos, and returns registry-unreadable as data when the registry cannot be listed, writing nothing`, `src/daemon/__tests__/handler-runtime.test.ts: the handler tables hold repo.buildDefaults.migrate beside the recorded methods and repo.buildDefaults.migrate answers through the runtime` |
| `ac5` | `src/daemon/__tests__/build-commands-doc.test.ts: the Build commands section of docs/daemon.md names repo.buildDefaults.migrate, its report fields and its outcome counts, and says a cleared command is applied again when it is run` |

## 6. Migration

**State before:** Today applyBuildDefaults (src/daemon/repo-settings.ts:201-223) is called only from the repo.add handler in buildHandlerRuntime (src/daemon/handler-runtime.ts) and from tests, so a repo registered before it has none of typecheckCommand, testCommand and resultFormat in its own entry of ~/.insrc/github.json. Registered repos are listed by listRepos in src/db/repos.ts:226-235. No method walks every registered repo to apply the defaults, so each old repo needs the 'Use suggested build commands' action by hand.

**State after:** A daemon method, repo.buildDefaults.migrate, walks the registered repos in order and calls applyBuildDefaults for each, returning one outcome per repo and counts per outcome. After the user runs it once, every old Python, Go, Rust and JVM repo that had none of the three keys has them; repos that set any key, Node repos and unknown repos are unchanged. The method is in the handler tables, the thread routing table, the repo-call audit and the recorded method list, and in docs/daemon.md. repo.add, repo.settings.get and the build phase behave as before.

**Zero downtime:** yes — **Data rewrite:** yes

**Steps**

1. The user updates the daemon so it carries repo.buildDefaults.migrate (and the add-time defaults); the method does nothing until called. — ↩ rollbackable
2. The user calls repo.buildDefaults.migrate once; for each registered repo with none of the three keys and a type with typical commands, the daemon writes the three keys in one write to that repo's entry of ~/.insrc/github.json and reports applied; every other repo is left as it is and reports why. — ↩ rollbackable _(needs: `the daemon is updated`)_
3. The user reads the report; a repo that shows write-failed is retried by calling the method again after the cause is fixed, and a wrong default is edited or cleared with repo.settings.set, in the Repo Configuration page, or by the 'Use suggested build commands' action. — ↩ rollbackable

**Backward compat:** No existing method, payload or client changes: repo.add keeps its reply, repo.settings.get and repo.settings.set keep theirs, and the build phase reads the commands as before. The new method is purely additive, so a client that does not know it is unaffected, and an older daemon answers 'unknown method' for it. The data written is the same three keys the add-time defaults and the 'Use suggested' action already write, so github.json gains no new shape. A rollback is clearing the three keys of a repo with repo.settings.set null, which the daemon already supports; note that running the method again applies the defaults again to a repo whose keys were cleared.

## 7. Alternatives considered

### 7.1 a1: One on-demand daemon method — **CHOSEN**

A single daemon method, run by the user after updating, applies the defaults to every registered repo and returns each repo's outcome.

Add one daemon RPC method (repo.buildDefaults.migrate) with no required params. It lists the registered repos (listRepos in src/db/repos.ts), calls the existing applyBuildDefaults(repoPath) for each one in turn, and returns { repos: [{ repo, outcome }] } using the existing BuildDefaultsOutcome, plus counts per outcome. Because applyBuildDefaults already refuses to overwrite, writes the three keys in one write and never throws, the method inherits those rules and is idempotent: a second run reports already-set. The method is added to the handler tables, the thread routing table, the repo-call audit (a daemon-store entry: it writes ~/.insrc/github.json, not files of a repo) and the recorded method list, and documented in docs/daemon.md. Nothing runs by itself.

### 7.2 a2: Run automatically at every daemon start

At startup the daemon applies the defaults to every registered repo that has none, with no method and no manual step.

In the daemon's startup, after the registry is available (where src/daemon/index.ts already hands the registered repos to the tracker refresh hooks), loop over the registered repos and call applyBuildDefaults for each, logging each outcome through the daemon logger. There is no IPC method, so no registry entries for a method, and the user does nothing beyond updating the daemon.

**Rejected because:** Re-applies defaults after a deliberate clear and gives the user no report; it also takes the timing out of the user's hands.

### 7.3 a3: On-demand method plus a once-only run at start

The a1 method, and the daemon also runs it once automatically at start, remembering that it did with a marker.

Do a1, and at daemon start call the same function once, then write a small marker in the daemon's state directory (a file or key) recording the migration as done so later starts skip it. The method stays for a manual or repeated run.

**Rejected because:** Adds persistent state and a second entry point for behaviour the user said they would run themselves.

### 7.4 a4: Apply lazily the first time a repo's settings are read

repo.settings.get, or the build phase, applies the defaults the first time it finds a repo with none.

Make the read of a repo's build settings (repo.settings.get, or the build step's profile resolution) call applyBuildDefaults when the repo has none of the three keys, so every repo migrates the first time anyone looks at it. There is no migration method and no loop.

**Rejected because:** A read that writes breaks the contract of repo.settings.get and can change a build's commands mid-phase; ranked above a2 and a3 only for its small size.

## 8. References

- **[[c1]]** `analyze-bundle` `symbol.locate: applyBuildDefaults and the registry listing function` — "applyBuildDefaults at src/daemon/repo-settings.ts:201-223; listRepos at src/db/repos.ts:226-235 and a second listRepos at src/cli/services/repo.ts:31-33"
- **[[c2]]** `analyze-bundle` `usage.example: callers of applyBuildDefaults` — "callers: buildHandlerRuntime in src/daemon/handler-runtime.ts and three test files; none walks every registered repo"
- **[[c3]]** `analyze-bundle` `search.text: where the daemon already walks every registered repo` — "the daemon walks the registry in src/daemon/handler-runtime.ts, src/daemon/index.ts and src/daemon/search-guard.ts"
- **[[c4]]** `analyze-bundle` `search.text: the registries that pin every daemon RPC method` — "handler tables, method-class.ts routing rows, RPC_AUDIT in repo-call-audit.ts and ADDED_RPC in handler-runtime.test.ts"
- **[[c5]]** `analyze-bundle` `test.locate: tests the migration would extend` — "repo-settings.test.ts, handler-runtime.test.ts and build-commands-doc.test.ts; the repo-call-* tests already fail"

## 9. Open questions

- cd1 partial: migrateBuildDefaults and repo.buildDefaults.migrate are new symbols this Story adds, declared as new rather than taken from an existing symbol or an HLD contract; their names need the user's confirmation.
- dm2 partial: the one invariant-change (BuildDefaultsOutcome gains a second producer) does not cite an s1 bundle by id; the producer it names is in the usage.example bundle (c2).
- ep3 partial: the invariants cite c1 to c5, assumed to be the ids of the five s1 bundles in order and given below as citations.
- ts1 partial: the Story has no acceptance criteria, so ac1 to ac5 were written by this LLD and need the user's confirmation as the acceptance criteria.
- alt2 partial: alternatives were scored against six constraints k1 to k6 derived from the Story text and the user's statements, since no Story, Epic or HLD constraints exist.
- sbdry4 note: the edge case that says a user's own repo.settings.set during a call is never overwritten is too strong. applyBuildDefaults reads the entry and then writes, as separate steps, so a set landing between the two can be overwritten; the window is the same as at repo.add and the build must document it rather than claim it away.

## Resolved questions

- `q5e21cf20` — cd1 partial: migrateBuildDefaults and repo.buildDefaults.migrate are new symbols this Story adds, declared as new rather than taken from an existing symbol or an HLD contract; their names need the user's confirmation.
  - **resolved**: Define both as new symbols — User asked to resolve the open questions (2026-11-20): migrateBuildDefaults and repo.buildDefaults.migrate have no existing equivalents and are new symbols. _(2026-11-20T11:24:03.259Z)_
- `q74389aa5` — dm2 partial: the one invariant-change (BuildDefaultsOutcome gains a second producer) does not cite an s1 bundle by id; the producer it names is in the usage.example bundle (c2).
  - **resolved**: Source is c2 — User asked to resolve the open questions (2026-11-20): the second producer of BuildDefaultsOutcome that the invariant-change names is the repo.add handler listed in the usage.example bundle, c2. _(2026-11-20T11:25:02.716Z)_
- `qa3035316` — ep3 partial: the invariants cite c1 to c5, assumed to be the ids of the five s1 bundles in order and given below as citations.
  - **resolved**: Verify existing IDs — Verified 2026-11-20: c1-c5 in the LLD are the five s1 analyze bundles in order (symbol.locate, usage.example, search.text walk, search.text registries, test.locate), and the invariants cite the intended bundles. _(2026-11-20T11:25:51.260Z)_
- `q59c82aa2` — ts1 partial: the Story has no acceptance criteria, so ac1 to ac5 were written by this LLD and need the user's confirmation as the acceptance criteria.
  - **resolved**: Confirm ac1-ac5 — The user asked on 2026-11-20 to go ahead after the five LLD-authored criteria were presented; ac1-ac5 stand as written as the Story's acceptance criteria (no amendment was requested). _(2026-11-20T11:26:23.488Z)_

## Citations

- **[[c1]]** `analyze-bundle` `symbol.locate: applyBuildDefaults and the registry listing function` — "applyBuildDefaults at src/daemon/repo-settings.ts:201-223; listRepos at src/db/repos.ts:226-235 and a second listRepos at src/cli/services/repo.ts:31-33"
- **[[c2]]** `analyze-bundle` `usage.example: callers of applyBuildDefaults` — "callers: buildHandlerRuntime in src/daemon/handler-runtime.ts and three test files; none walks every registered repo"
- **[[c3]]** `analyze-bundle` `search.text: where the daemon already walks every registered repo` — "the daemon walks the registry in src/daemon/handler-runtime.ts, src/daemon/index.ts and src/daemon/search-guard.ts"
- **[[c4]]** `analyze-bundle` `search.text: the registries that pin every daemon RPC method` — "handler tables, method-class.ts routing rows, RPC_AUDIT in repo-call-audit.ts and ADDED_RPC in handler-runtime.test.ts"
- **[[c5]]** `analyze-bundle` `test.locate: tests the migration would extend` — "repo-settings.test.ts, handler-runtime.test.ts and build-commands-doc.test.ts; the repo-call-* tests already fail"
