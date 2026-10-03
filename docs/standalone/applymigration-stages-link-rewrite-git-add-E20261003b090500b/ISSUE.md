<!-- insrc:artifact ISSUE-b090500bbace86b1 -->

# Commit the link rewrites that fall outside every moved work item's chunk

## Reproduction

Observed while converging this repository's artifact-docs tree.

1. Run the docs-tree migration on a repo where converging one work item's folders moves a file that ANOTHER work item's document links to. This is the normal convergence shape, because the document most likely to link to a moved artifact is a sibling that is itself staying put.
2. Let applyMigration finish successfully.
3. OBSERVED: the run reports success and its per-work-item commits all land, but `git status` shows rewritten files still STAGED and uncommitted. Four files were left in that state here and had to be committed by hand.
   EXPECTED: a successful run leaves a clean working tree — every change it made, including every link rewrite, is committed.

The content of those rewrites was correct; only their lifecycle was wrong. The failure is silent: nothing errors, and a caller that does not inspect `git status` afterwards will not notice.

## Root cause

Staging is per FILE, committing is per WORK ITEM, and a rewritten file need not belong to any work item being committed.

applyMigration writes each rewrite and immediately stages it with `git add`. It then builds its commit groups from `plan.moves`, keyed on `mv.groupHash`. A file that was rewritten but is not itself moving contributes no move, therefore no groupHash, therefore no group — so no chunk commit ever includes it, and it stays in the index indefinitely.

The comment directly above the grouping records the assumption that fails: 'Commit per-epic chunks (reviewable), all staged already by git mv/add.' That is true of STAGING and false of COMMITTING. It held while the rewrite pass only ever scanned files that were themselves moving; once the scan widened to unmoved files — which convergence requires, since the document holding the stale link is typically the one staying put — the assumption silently stopped being true.

The effect is not a partial-state hazard in the usual sense: the pinned pre-run commit still reverts the whole run on failure. It is a successful run that leaves work uncommitted.

## Fix intent

A successful run must leave no staged change behind: every link rewrite it performs ends up committed, including a rewrite in a file that no chunk owns.

Two constraints to respect rather than design around. First, the existing all-or-nothing rollback: the run pins a pre-run commit so a mid-run failure reverts everything, and any additional commit must fall inside that window rather than beside it, so a failure cannot leave rewrites behind as the only surviving change. Second, the per-work-item chunking exists to keep the history reviewable, so the fix should not collapse the run into one commit to make the problem go away.

The stale comment asserting that staging implies committing should go with the behaviour it describes, so it cannot outlive the fix. Also worth asserting in a test: after a successful apply, the working tree is clean — which is the property that was never checked and is why this went unnoticed.

## Citations

- **[[c1]]** `code` `src/workflow/migrate-docs-tree.ts:678` — "// Commit per-epic chunks (reviewable), all staged already by git mv/add."
- **[[c2]]** `code` `src/workflow/migrate-docs-tree.ts` — "git(repoPath, 'add', abs);"
- **[[c3]]** `code` `src/workflow/migrate-docs-tree.ts:649` — "Pin the pre-run commit so a failure mid-way through the per-epic chunk commits rolls the WHOLE run back (not just to the last committed chunk)."
- **[[c4]]** `code` `src/workflow/migrate-docs-tree.ts:613` — "post-move validation, then commit per-epic chunks."
- **[[c5]]** `prior-artifact` `Four files left staged after this repo's convergence run, committed by hand in e8b2b36 and in the follow-up ledger commit`
