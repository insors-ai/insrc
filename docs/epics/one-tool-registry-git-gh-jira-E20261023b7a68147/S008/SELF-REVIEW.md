# Controller self-review: LLD-b7a68147dcf72034-s8

Reviewer: the controller session (the daemon review engine is unavailable). Author of the LLD: the same session, so this is a self-review and approval needs an override.

## Checked against the code
- 40 git tool definitions are registered (definitions.ts): holds.
- 118 coverage rows are `assigned` and 39 are `excluded` in coverage.ts: holds.
- The gh op-table exports `field`, `fieldSchema` and `FieldSpec`, which the git builder reuses; the gh files stay unchanged (a2): holds.
- `runShellBytes` already reports stdin errors and cut output: holds (shell-helper.ts).
- The five multi-op tools already have an `op` enum, so `extendGitTool` is additive: holds.

## Not verified
- The exact per-command split between families is a design choice; it is settled when the plan is written.
- The destructive class for each op is a rule, not yet a table; the plan must list it.

## Open questions for the user
1. Keep for-each-repo, hook and filter-branch excluded (raw command passthrough).
2. Merge strategy drivers, quiltimport, request-pull, subtree: exclude, or offer?
3. Extend the five existing tools with new ops (recommended), or add new tools.

Verdict: pass, with the three decisions above needed before planning.
