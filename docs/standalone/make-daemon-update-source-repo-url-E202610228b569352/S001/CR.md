<!-- insrc:artifact CR-8b5693528b025a55-S001 -->

# Code review: 8b5693528b025a55:S001

⛔ **BLOCK** — HIGH 7 · MED 1 · LOW 3 · model `claude:opus`

**Changed files:** 12

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 7 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/cli/services/maintenance.ts:83 | `update` was changed (it now reads and checks the update source, repoints origin, restores origin when the fetch fails, fetches with an explicit refspec, and switches branch with a guard for local-only commits), but the graph shows no test reaching it. Caveat: the passing title in src/cli/__tests__/maintenance-source.test.ts ('the CLI update applies the configured repo URL and branch the same way…') suggests its `run` helper calls `update`. The graph has no callee edge for that helper, so this is not confirmed by the grounding. The paths with no test named for them are the origin restore on a failed fetch and the refusal of an invalid direct value. |
| HIGH | src/shared/update-source.ts:48 | `readUpdateSource` is new, and the graph shows no test reaching it. Caveat: the passing title in src/shared/__tests__/update-source.test.ts names readUpdateSource, but the graph has no edge from the test file or its helpers (`withConfig`, `cfg`) to it, so the grounding cannot confirm the coverage. |
| HIGH | src/shared/update-source.ts:78 | `checkUpdateSource` is new, and the graph shows no test reaching it. It runs the same checks on the repoUrl and branch values handed directly to the CLI update, and no test title in the record names it or that path. |
| HIGH | src/shared/update-source.ts:70 | `updateSourceArgs` is new, and the graph shows no test reaching it. It turns the source into the --repo-url and --branch arguments. Its behaviour is described by the passing update-runner.test.ts title ('launchUpdate passes --repo-url and --branch only for the keys that are set'), but no graph edge from a test reaches it, so the grounding does not confirm it. |
| HIGH | src/shared/update-source.ts:33 | `checkUrl` is new and validates the URL that becomes a git argument. The graph shows no test reaching it, and its only callers (readUpdateSource, checkUpdateSource) are not reached either. |
| HIGH | src/shared/update-source.ts:40 | `checkBranch` is new and validates the branch that becomes a git argument. The graph shows no test reaching it, and its only callers (readUpdateSource, checkUpdateSource) are not reached either. |
| HIGH | scripts/daemon-ctl.sh:83 | The changes to daemon-ctl.sh (--repo-url and --branch parsing, and the repoint, restore and branch switch in sync_repo) show no test reaching them in the graph. Caveat: src/daemon/__tests__/daemon-ctl-source.test.ts runs the script through a subprocess, which a call graph cannot see, and its title passes. Still, nothing in the grounding confirms the path that restores origin when the fetch fails. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/cli/services/maintenance.ts:135 | The branch-switch path (and its mirror in scripts/daemon-ctl.sh sync_repo) runs `git checkout -B <branch> origin/<branch>` after checking only that HEAD is contained in some remote branch. `-B` force-resets an existing local `<branch>`, so commits that exist only on that local target branch (for example from an earlier switch to it) are silently discarded. The guard says 'never discard commits that exist only here', but it protects only the current HEAD. Also check `git branch -r --contains refs/heads/<branch>` when the local branch exists, or refuse when it is not an ancestor of origin/<branch>. |
| LOW | src/cli/services/maintenance.ts:124 | When the fetch fails, the origin restore runs through `capture`, and its exit code is ignored. The code then logs 'origin restored to …' even if `git remote set-url` failed, which can leave origin pointing at the unfetchable URL while the log says it was restored. In daemon-ctl.sh the same restore runs under `set -e`, so a failure there exits with git's code before `die … 4`, and the 'fetch failed' message is lost. Check the restore's result and report it. |
| LOW | scripts/daemon-ctl.sh:126 | Under `set -euo pipefail`, a failing `git checkout --quiet -B` on the branch-switch path exits with git's raw code. Its output goes only to LOG_FILE and there is no `die` message, so the caller (runDetachedUpdate) records a failure with an empty stderr tail. The TS mirror reports 'git checkout <branch> failed'. Wrap it in `\|\| die "git checkout $branch failed" 4` for parity. |
| LOW | src/cli/services/maintenance.ts:91 | update() now has two nested try/catch blocks for source resolution plus the repoint, restore and switch branches inline, on top of the existing fast-forward logic. Moving the source resolution (readUpdateSource + checkUpdateSource + override merge) into a small helper would keep this routine readable. This is a matter of taste, not a risk. |

