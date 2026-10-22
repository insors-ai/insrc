<!-- insrc:artifact CR-8b5693528b025a55-s1 -->

# Code review: 8b5693528b025a55:S001

⛔ **BLOCK** — HIGH 3 · MED 3 · LOW 7 · model `claude:opus`

**Changed files:** 12

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | scripts/daemon-ctl.sh:108 | When the fetch fails after origin was repointed, sync_repo puts origin back to its previous URL (lines 108-117). maintenance.ts:124-132 does the same in the CLI update. The approved LLD says the opposite: origin keeps the new URL so a later run retries. The behaviour came from code-review round 1 and is arguably safer, but the LLD error case was never amended to match, so the code and its approved contract now disagree. Either amend the LLD's fetch-failure error case or note the change in the BUILD record. |

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/cli/services/maintenance.ts:47 | The new optional property `readonly repoUrl?: string;` in UpdateOptions has no explicit `\| undefined`. Under exactOptionalPropertyTypes the documented rule asks for `repoUrl?: string \| undefined`. The older fields in the same interface (skipSync, skipInstall, skipBuild, branch) leave it out too, so this copies the local style, but it still breaks the documented rule. The new UpdateSource interface in src/shared/update-source.ts:17-18 does it correctly. |
| LOW | src/cli/services/maintenance.ts:49 | The new optional property `readonly source?: UpdateSource;` in UpdateOptions has no explicit `\| undefined`, which the documented rule asks for under exactOptionalPropertyTypes. |
| LOW | src/daemon/update-runner.ts:77 | The new optional dependency `readSource?: () => UpdateSource;` in UpdateRunnerDeps has no explicit `\| undefined`. It copies the existing fields of UpdateRunnerDeps, which also leave it out, but the documented rule asks for `readSource?: (() => UpdateSource) \| undefined`. |

## coverage — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | src/shared/update-source.ts:1 | checkUpdateSource has no tests reaching it, and its only caller, update (maintenance.ts), has none either. Nothing in the edges shows that a directly passed repo URL or branch (opts.branch) goes through the same URL/branch checks as config values, which is the round-1 fix 'direct values get the same checks'. |
| HIGH | src/shared/update-source.ts:1 | updateSourceArgs has no callers and no tests reaching it. It builds the --repo-url / --branch arguments. The update-runner test title says launchUpdate passes these flags only for the keys that are set, but the graph has no edge from launchUpdate to updateSourceArgs, so the function itself is not shown to be exercised. |
| HIGH | src/daemon/update-runner.ts:1 | makeUpdateHandlers (the 'daemon.update' / 'daemon.updateOutcome' IPC handlers) has no tests reaching it. The IPC entry point that carries the new update source through to launchUpdate is not exercised. |
| MED | src/cli/services/maintenance.ts:1 | update has no testsReaching edge, so its coverage is unverified rather than shown to be missing. The run helper in maintenance-source.test.ts is typed on Parameters<typeof update>[0], and that file's passing title ('the CLI update applies the configured repo URL and branch … opts.branch wins over the config') suggests update is called there, but the graph records no call edge from run to update. |
| MED | src/shared/update-source.ts:1 | readUpdateSource (and checkUrl / checkBranch, which it calls) has no testsReaching edge, so its coverage is unverified rather than shown to be missing. update-source.test.ts names readUpdateSource in its passing title, but the graph has no edge from that test file to the function. |
| LOW | scripts/daemon-ctl.sh:1 | daemon-ctl.sh has no testsReaching edge, which is expected for a shell script run as a subprocess. Its coverage is unverified by the graph. The passing daemon-ctl-source.test.ts title says it covers the --repo-url / --branch switch, the fast-forward, and the refusal of a dirty tree and of local-only commits. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/cli/services/maintenance.ts:104 | The new sync logic is written twice. The origin repoint, the explicit-refspec fetch, the origin restore after a failed fetch, the two branch-switch guards and `checkout -B` are each hand-copied from the shell script's `sync_repo` (the comment says it 'Mirrors daemon-ctl.sh sync_repo'). The two copies have already drifted: the TS dirty check uses `git status --porcelain`, which counts untracked files, while the shell uses `git diff --quiet` / `diff --cached --quiet`, which does not. So the TUI update and `daemon.update` refuse different trees. Every later fix (round 1 and round 2 each touched both copies) has to land twice, which is how the copies drift. Consider having `update()` call `daemon-ctl.sh` with `updateSourceArgs`, as `launchUpdate` does, or share one implementation. |
| LOW | src/cli/services/maintenance.ts:137 | Origin is restored only when the fetch fails. If the fetch from a newly set repoUrl succeeds but a later guard refuses the update, `update()` returns ok:false with origin still pointing at the new URL. The guards that can refuse are: HEAD has commits no remote branch has (L141), a local branch has commits its remote does not (L146), HEAD diverged (L157), or checkout / ff-merge failed. The shell copy behaves the same way after its fetch. The next run then starts from the new origin even though the update was rejected. This is harmless if the user means to keep that URL, but it does not match the guarantee the fetch-failure path gives: 'a URL that cannot be fetched from must not stay as origin'. Restoring origin on any failure after the repoint would be consistent. |
| LOW | src/cli/services/maintenance.ts:98 | Values passed in directly and values read from the config are handled differently. `readUpdateSource` trims values and treats an empty string as 'not set'. `opts.repoUrl ?? source.repoUrl` / `opts.branch ?? source.branch` instead pass an empty or whitespace-padded string straight to `checkUpdateSource`, which does not trim. So `branch: ''` from a caller hides the configured branch and then fails the update with 'not a branch name the update accepts'. With the config, an empty value just falls back to the current branch. |

