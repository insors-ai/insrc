<!-- insrc:artifact EXT-b7a68147dcf72034-s10 -->

# Extend: one-tool-registry-git-gh-jira — Move the tracker and the terminal client onto the registry and remove the old paths

> **Extends Epic `one-tool-registry-git-gh-jira`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s10`

Extends Epic `one-tool-registry-git-gh-jira` by splitting Story s7: s10 moves the tracker modules and the terminal client onto the registry and removes the old paths, building on DEF/HLD-b7a68147dcf72034, the s7 LLD drafts and review rounds, and src/workflow/tracker/github.ts with its callers.

## Added Story

### s10: Move the tracker and the terminal client onto the registry and remove the old paths

**User value:** Every tracker, commit-and-push and terminal-client git or gh call follows the registry's approval, hook and result-check rules, and the old wrappers and seams are gone so no code can run git or gh around the registry.

**Acceptance criteria:**
- **ac1:** Given each caller of the functions in src/workflow/tracker/github.ts (questions, resolve-comment, bugfix/tracker, config/github, tracker-auto, github-adapter, setup, sync) and each of the five callers of commitAndPushArtifacts, when the change is complete, then it performs the operation by calling a registry tool through callTool and the executor, using the replacement table that maps every github.ts wrapper to a registry tool, and commit-and-push becomes a sequence of git tool calls that returns the same result and the same reasons as before.
- **ac2:** Given the terminal client's workflow service in src/cli/services/workflow.ts, when it runs git or gh, then it does so through the daemon's tools.call request with the caller set, and no longer spawns git or gh itself.
- **ac3:** Given a tracker push, sync, setup, question or comment-resolution run, when it runs after the change, then it creates and updates the same issues, sub-issues, milestones, comments and labels as before and records the same results.
- **ac4:** Given a moved call that needs approval under the effective approval mode and finds no client, or whose approval expires, when the call is denied, then the calling stage fails with the denial reported and does not continue.
- **ac5:** Given the old paths runGit, runGitAsync, runGh, commitAndPushArtifacts, the other github.ts wrappers, createGitRunner and the _setTrackerExecForTests seam, when the change is complete, then they no longer exist, the forbidden-spawn scan runs in failing mode in the build chain and finds nothing outside the exemptions (the daemon self-update and src/indexer/index.ts), and the 25 test files that used the seams run through the recorded executor.
- **ac6:** Given the migration record and the origin/main session source inventory baseline, when the change is complete, then both are regenerated, every site has an entry, and the full sweep passes with no new skipped tests.

## Building on

- `doc` docs/plans/tool-registry.md — s7 LLD: round 1 review and the user's decisions (2026-10-26)
- `code` src/workflow/tracker/github.ts — commitAndPushArtifacts
- `code` src/cli/services/workflow.ts — commitAndPushArtifacts
- `code` src/workflow/team/signoff.ts — commitAndPushArtifacts

## Next

Proposed HLD amendment `AMD-b7a68147dcf72034-12` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-b7a68147dcf72034-12`) and the updated Epic, then run `design.story` for the new Story `s10` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"b7a68147dcf72034","storyId":"s10"}
```
