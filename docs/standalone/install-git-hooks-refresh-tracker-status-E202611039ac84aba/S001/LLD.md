<!-- insrc:artifact LLD-9ac84abac177b399-s1 -->

# LLD: STORY-9ac84abac177b399-s1

## Summary

**Epic:** `install-git-hooks-refresh-tracker-status`
**HLD base run:** `wf-1793710750491-eyso0w`
**HLD effective hash:** `9ac84abac177...`

A registered repository can opt in to two git hooks, post-merge and post-rewrite, that ask the daemon to refresh the tracker status after git runs in a terminal or an IDE, so pull, merge and pull --rebase keep the Epics' issue status current. The hooks run in the background, never fail or slow git, do nothing when the daemon is down, and are written as marked blocks next to any hook already there, so uninstall removes only what this Story added. A terminal push still relies on the daemon's own push rule and the explicit refresh.

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

**Surface level:** internal-shared

### 2.1 `handleTrackerSync`

```typescript
handleTrackerSync(params: unknown): Promise<SyncResult | { error: string }>
```

**Parameters:**
- `params: { repoPath?: unknown; epicHash?: unknown }` — The repository, and now optionally one Epic: without epicHash every Epic of the repository is refreshed

**Returns:** `SyncResult | { error: string }` — For one Epic the existing SyncResult; for a repository-wide call the same shape summarising the refresh (status synced when every refreshed Epic synced, skipped or failed with the joined reasons otherwise)

**Errors:**
- `{ error: string }` when repoPath is missing, or not a registered repository

**Preconditions:**
- repoPath names a registered repository root

**Postconditions:**
- With epicHash the behaviour and result are exactly as today
- Without epicHash it calls refreshTrackerStatus(repoPath) once, and a second call for the same repository while one is running returns a skipped result instead of starting another

### 2.2 `refreshTrackerStatus`

```typescript
refreshTrackerStatus(repoPath: string, opts?: { epicHash?: string; deadline?: Deadline; port?: TrackerPort }): Promise<TrackerRefreshReport>
```

**Parameters:**
- `repoPath: string` — The repository to refresh
- `opts: { epicHash?: string; deadline?: Deadline; port?: TrackerPort }` _(optional)_ — Unchanged

**Returns:** `TrackerRefreshReport` — Consumed unchanged: results per Epic and warnings

**Postconditions:**
- Unchanged: it already refreshes every Epic when epicHash is omitted and skips a repository whose tracker setting is none

### 2.3 `rpc`

```typescript
rpc<T = unknown>(method: string, params?: unknown, connect?: () => Socket, opts?: { timeoutMs?: number; closeAware?: boolean }): Promise<T>
```

**Parameters:**
- `method: string` — The daemon method the hook entry calls
- `params: unknown` _(optional)_ — The repository path
- `connect: () => Socket` _(optional)_ — Unchanged
- `opts: { timeoutMs?: number; closeAware?: boolean }` _(optional)_ — The hook passes a short timeout

**Returns:** `Promise<T>` — Consumed unchanged

**Errors:**
- `Error` when daemon is not running, the timeout passes, or the daemon answers with an error; the hook entry swallows all three

**Postconditions:**
- Unchanged

## 3. Data model changes

### 3.1 `REPO_TRACKER_FIELDS (the gitHooks row)` — field-add

A boolean per-repository setting gitHooks, default false, in group Tracker, kind local, read and written only by the daemon through repo.settings.get and repo.settings.set like the other rows. It records whether the repository opted in; the install and uninstall methods set it true or false after their file work succeeds, so the Repos pane shows what is installed. Relationship: one setting per registered repository path (the exact registered path string, as for the other rows); no new entity or storage. Compatibility: an existing github.json without the key reads as false.

```
REPO_TRACKER_FIELDS gains { key: 'gitHooks', type: 'boolean', default: false, group: 'Tracker', kind: 'local' }
```

**Call sites:**
- `src/config/repo-fields.ts:71-90`
- `src/daemon/repo-settings.ts:1-20`
- `src/cli/panes/repo-settings-model.ts`

### 3.2 `Git hook block (post-merge, post-rewrite)` — new

A text block written into the files post-merge and post-rewrite of the directory git rev-parse --git-path hooks names, delimited by a start and an end marker line that name insrc. The block runs the hook entry in the background with the repository root and the hook name, discards its output, and the file's last line exits 0 so git never sees a failure. When the hook file already exists without the marker its content is kept and the block is appended after it, adding a shebang line only if the file is new; when it exists with the marker the block is replaced in place (idempotent install). Uninstall removes the block between the markers and deletes the file only when nothing else remains. The file mode is kept or made executable. The file is a contract with other hook managers: husky and similar tools that regenerate their files can drop the block, which status reports as not installed.

**Call sites:**
- `src/daemon/tools/git-isolation.ts:20-24`

### 3.3 `Hook entry (src/bin, compiled into out/bin)` — new

A small non-interactive program started by the hook block with the repository root. It builds one rpc call to the daemon's tracker.sync with the repository path and no epicHash, with a short timeout, and exits 0 whatever happens: daemon not running, timeout, an error answer or an unregistered repository are all swallowed. It imports only the rpc client and the paths module so it starts fast. It is listed beside the other bins in package.json and its compiled path is what the block records, resolved at install time from the installed daemon's output directory.

**Call sites:**
- `src/bin/insrc-daemon-control.ts:1-24`
- `src/shared/ipc-client.ts:30-60`
- `package.json:10-13`

### 3.4 `Daemon install, uninstall and status methods (repo.gitHooks.*)` — new

Three daemon methods that take a registered repository path, are classed and audited like the other repository-modifying methods, and are the only code that writes hook files: install resolves the hooks directory, writes the two blocks, then sets the gitHooks setting true; uninstall removes the blocks, then sets it false; status reports per hook whether our block is present, whether another hook content is present, and the resolved hooks directory. They return data, never throw, and refuse a repository that is not registered. Relationship: they write into a registered repository's git directory, a path outside the repository working tree but inside the repository.

**Call sites:**
- `src/daemon/handler-runtime.ts:476-480`
- `src/daemon/threads/method-class.ts:258`
- `src/daemon/repo-call-audit.ts:157`
- `src/daemon/__tests__/handler-runtime.test.ts:73-80`

### 3.5 `tracker.sync (epicHash now optional)` — invariant-change

tracker.sync required an epicHash. It now accepts a call without one and refreshes every Epic of the repository, the same way the git_pull and git_push rules already do. A call with an epicHash is unchanged. The registrations of the method (handler table, method class, repo-call audit) are unchanged because the method name and the repoPath parameter are unchanged.

**Call sites:**
- `src/daemon/tracker-setup-handlers.ts:16-22`
- `src/daemon/handler-runtime.ts:476-480`
- `src/daemon/repo-call-audit.ts:157`

## 4. Error paths

**Error cases**

- **The daemon is not running or does not answer when a hook fires** (recoverable)
  - Detection: The hook entry's rpc call rejects with a message starting 'daemon is not running' or at its timeout
  - Response: The entry swallows the error and exits 0; nothing is written and the refresh is simply missed
  - User impact: git is unaffected; the Epics' status is refreshed by the next daemon-run pull or push or by an explicit refresh
- **A hook file already exists and cannot be read or written (permissions, read-only file system)** (recoverable)
  - Detection: The install reads the existing file before writing and the write throws an error code such as EACCES or EROFS
  - Response: That hook is reported as not installed with the reason; the other hook is still attempted; the setting is set true only when at least one hook is installed and records which
  - User impact: A partial install is visible in status; no existing hook file is left half written because each file is written through a temporary file and a rename
- **The installed hook block has been dropped by another tool that regenerates its hook files (husky)** (recoverable)
  - Detection: status reads each hook file and looks for the marker lines
  - Response: Status reports the hook as not installed while the setting says opted in; install repairs it
  - User impact: The refresh silently stops for that hook until install is run again
- **The repository path is not registered, or is not a git repository** (recoverable)
  - Detection: The methods check the registry before any file work and run git rev-parse --git-path hooks, which fails outside a repository
  - Response: Return data with a refusal reason and write nothing
  - User impact: The caller sees why
- **A foreign hook file has content that already ends the script early (exit 0 or exec) so an appended block would never run** (recoverable)
  - Detection: Not detectable in general; the installer reads the file and checks only for a leading shebang and for the marker
  - Response: The block is appended and status reports the hook as present; the limitation is stated in the documentation and the install result flags a file whose last non-empty line is an exit or exec
  - User impact: The refresh may not run for that hook; the user can reorder the file
- **Two refreshes for the same repository overlap (a hook fires while a daemon git_pull rule or another hook is refreshing)** (recoverable)
  - Detection: The repository-wide tracker.sync keeps a per-repository in-flight marker
  - Response: A call that finds one running returns a skipped result at once and starts nothing
  - User impact: One refresh runs at a time; a burst of hooks costs one

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository with core.hooksPath set to a directory such as husky's generated one | The block is written into the file in that directory, found through git rev-parse --git-path hooks; status shows that directory |
| A linked worktree of a registered repository | Hooks are shared with the main repository through the common hooks directory; installing from either records one set of blocks, and a hook that fires in the worktree reports the worktree root, which is not a registered root and so is ignored by the daemon call |
| Install run twice | The second run replaces the block in place and changes nothing else; the result says already installed |
| Uninstall when no block is present | Nothing is written and the setting is set false; the result says nothing to remove |
| A hook file that holds only our block, then uninstall | The file is deleted, so the repository returns to its state before install |
| git pull in a registered repository with the tracker setting none | The hook calls the daemon, which finds nothing to refresh and returns a skipped result; no gh call is made |

**Invariants to preserve**

- A failure or an absent daemon never changes the outcome of a git command: a post-merge or post-rewrite hook only ever exits 0, and the existing git tool rules report their refresh failure as hookFailures while the tool stays a success. [[c1]]
- tracker.sync with an epicHash keeps its behaviour, and its three registry entries (handler, method class, repo-call audit) keep their names and the repoPath parameter. [[c2]]
- The daemon stays the only writer of ~/.insrc/github.json and every repository-modifying method names a registered repository; the hook files are written only by daemon methods that check the registry first. [[c4]]
- The daemon's own read-only git calls keep core.hooksPath=/dev/null, so an installed hook never runs for them. [[c5]]
- The hook entry reaches the daemon only through the shared rpc client and treats its 'daemon is not running' error as an ordinary outcome. [[c3]]

## 5. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), tests in __tests__ directories beside the code, as in src/daemon/__tests__ and src/workflow/code-review/task-review/__tests__`

**Test levels**

- **unit** — Prove the hook block text, its install and removal on files of every starting shape, and the hook entry's never-fail behaviour
  - Subjects: `the hook block is written into an absent, an empty, a husky-style and a user-written hook file and an existing hook's content is kept byte for byte`, `install is idempotent and uninstall removes only the marked block and deletes a file that held nothing else`, `a hook file that cannot be written leaves the other hook installed and the failing one reported with its reason`, `the hook entry exits 0 when the daemon is not running, times out, answers an error or names an unregistered repository`
  - Fixtures: `a temporary git repository with and without core.hooksPath`, `a fake daemon socket for the hook entry`
- **integration** — Prove real git runs the hooks, never fails because of them, and the daemon methods and the repo-wide refresh behave
  - Subjects: `a real git pull and a real git pull --rebase in a temporary repository run the installed post-merge and post-rewrite hooks and git exits 0 even when the hook entry is missing or the daemon is down`, `repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed`, `tracker.sync without an epicHash refreshes every Epic once, a second call while one runs is skipped, and a call with an epicHash is unchanged`
  - Fixtures: `two temporary git repositories (origin and clone)`, `a registered repository in a temporary daemon home`, `a stand-in tracker port`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `the hook block is written into an absent, an empty, a husky-style and a user-written hook file and an existing hook's content is kept byte for byte`, `install is idempotent and uninstall removes only the marked block and deletes a file that held nothing else` |
| `ac2` | `the hook entry exits 0 when the daemon is not running, times out, answers an error or names an unregistered repository`, `a real git pull and a real git pull --rebase in a temporary repository run the installed post-merge and post-rewrite hooks and git exits 0 even when the hook entry is missing or the daemon is down` |
| `ac3` | `repo.gitHooks.install, uninstall and status refuse an unregistered repository, write only through the daemon, and keep the gitHooks setting equal to what is installed`, `a hook file that cannot be written leaves the other hook installed and the failing one reported with its reason` |
| `ac4` | `tracker.sync without an epicHash refreshes every Epic once, a second call while one runs is skipped, and a call with an epicHash is unchanged` |

## 6. Migration

**State before:** The tracker status refresh runs only through the two post-success rules after git_pull and git_push run through the daemon's tools; tracker.sync refuses a call without an epicHash, so nothing outside those rules can ask for a repository-wide refresh, and no hook files are written by insrc (see the analyze bundles on the refresh rules, the tracker.sync handler and the isolation of the daemon's own git calls).

**State after:** tracker.sync accepts a repository-wide call. A boolean gitHooks setting exists per repository. Three daemon methods install, remove and report two marked hook blocks (post-merge, post-rewrite) in the directory git names for hooks, and a small compiled hook entry asks the daemon to refresh and always exits 0. Repositories that never opt in are untouched.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Make epicHash optional on tracker.sync's handler with a per-repository in-flight guard, leaving the call with an epicHash unchanged — ↩ rollbackable
2. Add the gitHooks boolean row to the repository tracker fields, default false, so an existing configuration file reads as not opted in — ↩ rollbackable
3. Add the hook entry under src/bin and list it beside the other bins so the build compiles it into out/bin — ↩ rollbackable
4. Add the install, uninstall and status daemon methods with their handler, method class and repository-call audit entries, and extend the recorded handler key-set test — ↩ rollbackable
5. Expose install and uninstall from the Repos pane and document the feature, its limits (no terminal push, hook managers that regenerate files) and the explicit refresh in docs/plans/team-workflow.md — ↩ rollbackable

**Backward compat:** Every existing caller of tracker.sync passes an epicHash and gets the same behaviour. A configuration file with no gitHooks key reads as false, so nothing changes for a repository that does not opt in. The new daemon methods and the bin entry are additions. Hooks installed in a repository stay until uninstall; if a later version changes the block, install replaces it in place between the markers.

## 7. Alternatives considered

### 7.1 a1: Pull-side hooks (post-merge, post-rewrite) with marked blocks and a repo-wide daemon refresh — **CHOSEN**

Install two small hook scripts that run a non-interactive hook entry in the background, which asks the daemon to refresh every Epic of the repository.

A per-repository opt-in setting turns the hooks on. The installer resolves the hooks directory with git rev-parse --git-path hooks, so it honours core.hooksPath and linked worktrees, and writes post-merge and post-rewrite. Each file carries a start and end marker around a block that runs the compiled hook entry in the background and always exits 0. A hook file that already exists without our marker is not replaced: our marked block is appended after it, and uninstall removes only the marked block (deleting the file when nothing else remains). A new small entry under src/bin reads the repository root, asks the daemon for a repo-wide refresh over the existing rpc client with a short timeout, and swallows every error including daemon not running. The daemon gains a repo-wide refresh by making epicHash optional on tracker.sync, which refreshTrackerStatus already supports. The hook entry skips its call when the daemon itself is running the git command, so a daemon git_pull does not refresh twice. Terminal pushes are not covered, because git has no post-push hook; the explicit refresh and the daemon's git_push rule remain for those.

### 7.2 a2: Add a reference-transaction hook to cover push as well

As a1, plus a reference-transaction hook that fires when remote-tracking refs update, with the hook entry coalescing the burst into one refresh.

Everything in a1, and a third hook, reference-transaction (git 2.28 and later), that acts only on the committed state and only for refs under refs/remotes, which git updates after a successful push as well as after fetch and pull. A single command fires it several times, so the hook entry coalesces calls: it records a timestamp in a small file under the git directory and starts one delayed refresh, ignoring calls that arrive while one is pending. post-merge and post-rewrite can then be dropped or kept as a fallback for git older than 2.28.

**Rejected because:** Closes the coverage gap but at a large cost in moving parts and extra refreshes; a sound later extension if the push gap proves to matter.

### 7.3 a3: Daemon-side watch of the git directory, no hook files

The daemon's file watcher notices remote-tracking ref and HEAD log changes in opted-in repositories and refreshes after a quiet period.

No files are written into any repository. For each opted-in registered repository the daemon watches the git directory's refs/remotes tree, packed-refs and the HEAD reflog, and runs the existing repo-wide refresh after a debounce. The opt-in is the same per-repository setting. It works with husky, IDEs and linked worktrees without touching hook configuration, and covers push, fetch and pull.

**Rejected because:** Attractive on safety, but it is not the hook installer the Story asks for and adds a platform-dependent watcher; worth recording as the alternative if hook clobbering proves a problem.

### 7.4 a4: Point core.hooksPath at an insrc-managed directory that chains to the previous one

Set core.hooksPath to a directory insrc owns, whose hooks run the refresh and then call the hooks of the previous path.

The installer records the repository's current hooks path, sets core.hooksPath to an insrc directory holding wrapper hooks, and each wrapper runs the previous hook first (or after) and then the background refresh. Uninstall restores the recorded value.

**Rejected because:** Violates the central no-clobber requirement and is the largest of the hook designs.

## 8. References

- **[[c1]]** `code` `src/workflow/tracker/refresh-hooks.ts:45-62` — "const report = await (deps.refresh"
- **[[c2]]** `code` `src/daemon/tracker-setup-handlers.ts:16-22` — "tracker.sync: `epicHash` is required"
- **[[c3]]** `code` `src/shared/ipc-client.ts:30-60` — "daemon is not running"
- **[[c4]]** `code` `src/daemon/repo-settings.ts:1-20` — "The daemon is the only writer of `~/.insrc/github.json`"
- **[[c5]]** `code` `src/daemon/tools/git-isolation.ts:20-24` — "core.hooksPath=/dev/null"

## 9. Open questions

- Is the terminal-push gap acceptable? Recommendation: yes for this Story: git has no post-push hook, the daemon's own git_push rule and the explicit refresh still cover pushes, and the reference-transaction hook of alternative a2 stays available as a later Story if the gap matters.
- Should this Story expose install and uninstall in the Repos pane, or only as daemon methods? Recommendation: the daemon methods and the gitHooks setting row (which the Repos pane already shows and edits) are the contract; a dedicated install button is a small follow-up in the pane model and is left to the plan only if the setting row cannot trigger install, and the plan states which.

## Resolved questions

- `qdc7d2052` — Is the terminal-push gap acceptable? Recommendation: yes for this Story: git has no post-push hook, the daemon's own git_push rule and the explicit refresh still cover pushes, and the reference-transaction hook of alternative a2 stays available as a later Story if the gap matters.
  - **resolved**: Accept the gap: a terminal push triggers no automatic refresh. The daemon's own git_push rule and the explicit refresh still cover pushes; the reference-transaction hook (alternative a2) is a later Story if the gap matters. — User accepted the recommendation. _(2026-11-03T13:21:16.277Z)_
- `qdb62da24` — Should this Story expose install and uninstall in the Repos pane, or only as daemon methods? Recommendation: the daemon methods and the gitHooks setting row (which the Repos pane already shows and edits) are the contract; a dedicated install button is a small follow-up in the pane model and is left to the plan only if the setting row cannot trigger install, and the plan states which.
  - **resolved**: The daemon methods and the gitHooks setting row are the contract; no dedicated Repos pane button in this Story. The plan states how the setting row relates to install (the setting records intent set by install and uninstall). Plan requirements from the self-review (SELF-REVIEW.md): resolve the hooks directory through the typed git_rev_parse gitPath input, never a spawn (F1); add gitHooks to GithubEntry and check the github.json reader accepts it (F2); give the three methods handler, method-class and repository-call-audit entries and extend the handler-runtime key-set test (F4); have status compare the recorded hook entry path with the current one (F5). — User accepted the recommendation; self-review findings F1, F2, F4 and F5 carried as plan requirements. _(2026-11-03T13:21:32.496Z)_

## Citations

- **[[c1]]** `code` `src/workflow/tracker/refresh-hooks.ts:45-62` — "const report = await (deps.refresh"
- **[[c2]]** `code` `src/daemon/tracker-setup-handlers.ts:16-22` — "tracker.sync: `epicHash` is required"
- **[[c3]]** `code` `src/shared/ipc-client.ts:30-60` — "daemon is not running"
- **[[c4]]** `code` `src/daemon/repo-settings.ts:1-20` — "The daemon is the only writer of `~/.insrc/github.json`"
- **[[c5]]** `code` `src/daemon/tools/git-isolation.ts:20-24` — "core.hooksPath=/dev/null"
