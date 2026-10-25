<!-- insrc:artifact EXT-b7a68147dcf72034-s8 -->

# Extend: one-tool-registry-git-gh-jira — Reach the rest of git through named, typed tools

> **Extends Epic `one-tool-registry-git-gh-jira`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s8`

Extends Epic `one-tool-registry-git-gh-jira` (b7a68147dcf72034): adds Story s4b for the long tail of git operations, building on DEF/HLD-b7a68147dcf72034 (s4's git family boundary) and the git tools in src/daemon/tools/builtins/git. Story s4 keeps the 22 existing tools and the read tools s7 needs.

## Added Story

### s8: Reach the rest of git through named, typed tools

**User value:** Every git command a person or a program can run unattended is reachable through the registry with a declared result shape and the right approval class, so nothing falls back to a raw shell.

**Acceptance criteria:**
- **ac1:** Given a git command that can run without a person, a GUI, a mail server or a server role, when the registry's git tools are listed, then the command is reachable through a named tool with an operation-selecting input, and a case in the coverage table runs it through the executor against a temporary repository and checks its result and effect.
- **ac2:** Given a git command that reads from standard input (apply, am, mktree, mktag, fast-import and similar), when its tool is called with the content as an input, then the content reaches the command without a raw shell, and a failure to deliver it is reported as the tool's failure.
- **ac3:** Given a tool of this family is called, when it returns, then its result follows the declared shape, and a result that does not fit, or whose output was cut, is a failure.
- **ac4:** Given an operation of this family can destroy work or overwrite a file (clean, restore of the worktree, rm with force, prune, deleting a ref, removing notes, overwriting an archive or patch), when the registry is read, then that operation is marked destructive so the approval story applies.
- **ac5:** Given the git commands covered by Stories s4 and s4b together, when the coverage table is read, then every command of the recorded git command list is covered or excluded with a reason that a reviewer can check, and the only exclusions are those the user accepted.

## Building on

- `doc` docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md — Given an operation that git supports ... the operation is reachable through a named tool for its family, with no raw passthrough
- `doc` docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S004/LLD.md
- `code` src/daemon/tools/builtins/git/index.ts
- `code` src/daemon/tools/shell-helper.ts

## Next

Proposed HLD amendment `AMD-b7a68147dcf72034-8` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-b7a68147dcf72034-8`) and the updated Epic, then run `design.story` for the new Story `s8` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"b7a68147dcf72034","storyId":"s8"}
```
