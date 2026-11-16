<!-- insrc:artifact ISSUE-d9826c0d098a0a09 -->

# Enforce session-scoped review selection and safe shared-checkout Git operations

## Reproduction

Use two coding sessions in the same repository checkout. Session A edits a test for its story; session B commits that file with B's own changes, attributing the mixed commit to B. Session B subsequently resets the shared branch while A is still building. Observed in this incident: commit bc57cea4c included A's cold-qualification test; the reflog then records resets from 0e456a0eb back to 0fff13fa0, removing completed task11 and task12 commits from branch reachability. Rescue branch rescue/review-preparation-470a1f61-20261115 preserves 0e456a0eb. Expected: A's submitted review scope remains only its explicitly selected changed blocks, while either session's Git operations preserve the other's edits and commits. This incident demonstrates workspace interference; review-scope leakage itself has not been demonstrated. [c3] [c4]

## Root cause

There are two distinct gaps. The review packet contract identifies a story/task and explicit commit/path/segment selections; prepareReviewPacket verifies ancestry, parent relationships and changed-hunk bounds, but these checks do not establish current chat-session authorship. Correct session-local selection therefore depends on the submitter. Separately, controllers share the same working tree, index and branch; the observed cross-session commit inclusion and branch resets show that Git mutation coordination did not protect concurrent session work. Whole-commit story attribution cannot distinguish separately owned blocks in a mixed commit. The exact controller entry points requiring enforcement remain to be investigated; do not misdiagnose this incident as proof that the daemon broadened a submitted packet. [c1] [c2] [c3]

## Fix intent

DEFERRED: pick up only after current review-preparation correction ISSUE-470a1f61b26b12c6 is complete. Address two separate acceptance areas: (1) all review submission/selection paths preserve exactly the submitter's explicit changed blocks, treating commits only as immutable source pointers; unrelated content from mixed commits or branch history must never be silently added, and ambiguous selection must be reported; (2) concurrent sessions sharing a checkout stage and commit only their own changes, and cannot reset or rewrite shared branch history in a way that removes another session's work. Preserve other sessions' edits and pinned reviewed evidence. Include mixed-commit, same-file disjoint-block and concurrent Git-operation regressions. Shared checkouts remain supported; separate worktrees/branches are not mandatory. Investigate and design the enforcement when this issue is picked up; do not implement or auto-approve now. [c3]

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/packet.ts:127` — "prepareReviewPacket validates explicit source pointers and selected changed hunks."
- **[[c2]]** `code` `src/workflow/code-review/task-review/contracts.ts:30` — "The submitted packet names a story/task, pinned revision, reviewSet commits/files/segments and tests."
- **[[c3]]** `stakeholder` `Current conversation: defer review isolation and concurrent-editing issue until current work completes` — "Review isolation: enforce the submitted change set without broadening it to whole commits or branch history. Concurrent editing: sessions must stage only their own changes and avoid resetting or rewri"
- **[[c4]]** `step-output` `Git inspection in this session: git show --stat bc57cea4c and git reflog -10 --date=iso` — "bc57cea4c included review-runtime-store.test.ts; shared HEAD reset from 0e456a0eb to 0fff13fa0 at 2026-11-15 00:19:04 +0530."
