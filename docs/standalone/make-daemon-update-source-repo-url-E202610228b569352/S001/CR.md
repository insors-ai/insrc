<!-- insrc:artifact CR-8b5693528b025a55-S001 -->

# Code review: 8b5693528b025a55:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 4 · model `claude:opus`

**Changed files:** 12

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/cli/services/maintenance.ts:93 | `update` has no testsReaching edge in the graph, but that is a gap in the graph and not in the tests: maintenance-source.test.ts calls `update` through a dynamic import inside its `run` helper, and that file is passing in the test record. That test covers the configured branch switch, opts.branch winning over the config, the no-config no-op, the unchanged-URL skip, a dirty tree refused before origin is touched, fork fast-forward and the refusal to drop local-only commits. One new branch has no test: when readUpdateSource throws, the CLI should return `invalid daemonUpdate config: …`, and no test checks that. The equivalent path in launchUpdate is tested. The set-url and checkout failure returns are also untested. |
| LOW | src/config/__tests__/config-catalog-contract.test.ts:1 | The two new CONFIG_CATALOG rows (`daemonUpdate.repoUrl`, `daemonUpdate.branch`) are checked by config-catalog-contract.test.ts, and this Story changed that file. The build gate's test record does not list the file, so whether it passes is unverified. The test exists; its result is not confirmed. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/cli/services/maintenance.ts:114 | `git remote set-url origin <repoUrl>` runs before the fetch, and nothing puts it back if that fetch then fails. The same happens in daemon-ctl.sh:100. Example: a repoUrl that passes checkUrl but points at a repository that is unreachable or does not exist. Origin is rewritten to it permanently. Removing or clearing `daemonUpdate.repoUrl` afterwards does not fix it, because an absent or empty key means "keep origin as it is". So every later update keeps fetching from the bad URL until someone runs `git remote set-url` by hand. Fix: record the previous origin and restore it when the fetch fails, or fetch from the URL directly before rewriting origin. |
| LOW | src/cli/services/maintenance.ts:105 | update() re-implements the sync logic of daemon-ctl.sh (sync_repo: lockfile reset, dirty check, origin rewrite, fetch with an explicit refspec, branch-switch guard, fast-forward). This Story added the repo-URL and branch-switch logic to both copies. The two have already drifted: the TS side treats untracked files as dirty (`git status --porcelain`), while the shell side checks only tracked changes (`git diff --quiet` / `diff --cached --quiet`). So the same checkout can be refused by the TUI update and accepted by `daemon-ctl.sh update`. |
| LOW | src/cli/services/maintenance.ts:95 | `opts.branch` and `opts.repoUrl` take priority over the config values but skip checkUrl / checkBranch, which update-source.ts says exist because these values become git arguments. No production caller passes them today, so this is a latent gap only. Validating them through the same checks would keep the guarantee in one place. |

