<!-- insrc:artifact EXT-b7a68147dcf72034-s9 -->

# Extend: one-tool-registry-git-gh-jira — Move the workflow library's and the daemon's direct git and gh calls onto the registry

> **Extends Epic `one-tool-registry-git-gh-jira`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s9`

Extends Epic `one-tool-registry-git-gh-jira` by splitting Story s7: s9 moves the workflow library's and the daemon's direct git and gh calls onto the registry, building on DEF/HLD-b7a68147dcf72034 (s7's cutover boundary), the LLD drafts and two daemon review rounds of s7, and the git, gh and tracker code in src/workflow, src/daemon and src/understanding.

## Added Story

### s9: Move the workflow library's and the daemon's direct git and gh calls onto the registry

**User value:** The build runners, the gates, the team policy code, the identity lookup and the design corpus reader follow the same approval, hook and result-check rules as agents, and no site in them can run git or gh around the registry.

**Acceptance criteria:**
- **ac1:** Given each place in the workflow library, the daemon, the analyze path, the understanding identity lookup and the design corpus reader that runs git or gh itself today, or calls a git or gh tool's execute directly, and is listed in the Story's replacement table, when the change is complete, then it performs the operation by calling a registry tool through callTool and the executor, with the caller, the abort signal and the approval mode set by the site.
- **ac2:** Given a workflow stage that builds, gates, converts, hands over or signs off through a moved site, when it runs after the change, then it produces the same artifacts, commits and records as before.
- **ac3:** Given the team policy refresh and its total deadline of 10 seconds, when the deadline passes or the refresh's signal is aborted, then the refresh stops at its first aborted call, starts no call after it, and the lock-lifetime reasoning that depends on the 10 second deadline still holds.
- **ac4:** Given the identity lookup and the design corpus reader, when they run through the registry, then their multi-host and multi-account semantics, their public options, their validation results and their error codes are unchanged, except the recorded identity behaviour on gh versions without `gh auth status --json`.
- **ac5:** Given a moved site whose call needs approval under the effective approval mode and finds no client, or whose approval expires, when the call is denied, then the calling stage fails with the denial reported and does not continue.
- **ac6:** Given the list of sites taken from a complete search of the source, including direct calls of a tool's execute, when the change is complete, then every site has an entry in the replacement table, a test that runs through the registry with a recorded executor, and an entry in the migration record.

## Building on

- `doc` docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md — Story s7: Move every direct git and gh call onto the registry and remove the old paths
- `doc` docs/plans/tool-registry.md — s7 LLD: round 1 review and the user's decisions (2026-10-26)
- `code` src/workflow/team/git.ts — export function runGit(cwd: string, args: readonly string[], timeoutMs
- `code` src/workflow/code-review/grounding.ts — await gitDiffTool.execute({ cwd: repoPath, ...input }, toolDeps)
- `code` src/understanding/identity.ts — run(['gh', 'auth', 'status', '--json', 'hosts']

## Next

Proposed HLD amendment `AMD-b7a68147dcf72034-11` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-b7a68147dcf72034-11`) and the updated Epic, then run `design.story` for the new Story `s9` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"b7a68147dcf72034","storyId":"s9"}
```
