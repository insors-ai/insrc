# Self-review of LLD-9ac84abac177b399-s1

Reviewer: the controller (the session that authored the LLD). Reason: the design review tool (`insrc_review_step`) is still a stub ("PENDING REVIEW RE-IMPLEMENTATION"). This is not an independent review; approval needs the user's override reason naming this file.

Reviewed on 2026-11-03 against the code at HEAD. Nothing was executed; every item is a reading of the files named.

## Findings

### F1 (MED): the installer must not spawn git; the build runs the forbidden-spawn scan in failing mode

The LLD says the installer resolves the hooks directory with `git rev-parse --git-path hooks`. `package.json` runs `node scripts/forbidden-spawn-scan.mjs --fail` in the build, and the tool-registry epic moved every git and gh call to the typed tools. The plan must therefore resolve the directory through the typed tool: `git_rev_parse` has a `gitPath` input that maps to `--git-path` (`src/daemon/tools/builtins/git/rev-parse.ts:29,41-42`). Writing the hook files themselves is plain file work and is not a spawn. The hook block is a shell script that starts node; that is file content written by the installer, not a process the daemon starts.

### F2 (MED): the new setting must also be accepted by the github.json reader and writer types

Booleans are valid rows (`validateRepoSetting` accepts `type: 'boolean'`, `src/config/repo-fields.ts:173`) and the store accepts boolean patches (`EntryPatch`, `src/workflow/config/github-store.ts:44`). But the existing rows of `REPO_TRACKER_FIELDS` are strings and enums, and `GithubEntry` (`src/workflow/config/github.ts`) lists its keys. The LLD says only that a missing key reads as false. The plan must add `gitHooks` to `GithubEntry` and check the file reader does not reject an unknown key, with a test that a file written with the key reads back.

### F3 (LOW): the a1 approach text and the contract disagree about double refreshes

The chosen alternative's text says the hook entry skips its call when the daemon runs the git command. The contract replaces that with a per-repository in-flight guard in `tracker.sync` (there is no such guard today: no match in `src/workflow/tracker/sync.ts`). The guard is the design; sequential duplicates (a daemon `git_pull` rule, then the hook) are possible and harmless because the refresh is idempotent. The audit recorded this as partial.

### F4 (LOW): the install and uninstall methods have no signatures in the contract

They appear only as a new entity in `dataModel`, not in `api`, because the contract may name only existing symbols. The plan must give the three methods their handler names and registry entries (handler table, method class, repository-call audit) and extend the recorded key-set test in `src/daemon/__tests__/handler-runtime.test.ts`; that test fails whenever a method is added without its list entry.

### F5 (LOW): the hook entry's compiled path is recorded at install time

If the daemon is moved or reinstalled to another directory, existing blocks point at a path that no longer exists. The block runs in the background and exits 0, so git is unaffected and the refresh silently stops; `status` cannot see it. Install repairs it, and the plan should have `status` compare the recorded path with the current one.

## Checked and found sound

- `refreshTrackerStatus(repoPath)` with no `epicHash` already refreshes every Epic and skips a repository whose tracker setting is none (`src/workflow/tracker/sync.ts:138-156`); `tracker.sync` is the only thing that forces an `epicHash` (`src/daemon/tracker-setup-handlers.ts:16-22`).
- `tracker.sync` is registered once in each of the handler table, method class and repository-call audit; keeping the name and the `repoPath` parameter leaves those entries valid.
- The rpc client imports only a stream helper, `node:net`, types and the paths module (`src/shared/ipc-client.ts:1-4`), so the hook entry starts light, and the client already throws "daemon is not running" as an ordinary error.
- Hooks are not run for the daemon's isolated reads (`core.hooksPath=/dev/null`, `src/daemon/tools/git-isolation.ts:23`), so only mutating daemon git calls can trigger an installed hook, and the in-flight guard bounds that.

## Verdict

warn: no HIGH findings; two MED findings (F1, F2) with stated resolutions that the plan must carry. Not independent of the author.
