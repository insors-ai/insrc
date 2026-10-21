<!-- insrc:artifact ISSUE-b97752e9c7cee6fe -->

# Scope a Story's code review to what the Story changed, never a blind working-tree diff

## Reproduction

1. Leave any uncommitted change in the repository that has nothing to do with the Story under review (2026-10-21: six ontology files, docs/mocks/ontology-*.html, docs/mocks/ontology-source/* and docs/ontology-builder-prd.{html,md}, edited outside the session).
2. Run the daemon's code review of a Story whose own work is committed (codeReview.run for Epic c2ba6fa6 Story s1, whose commits carry its Insrc-Story trailer).

Observed: the review's subject records changeSetAttribution 'working-tree' with 6 changed files, all of them the unrelated ontology files; the review judges those files and records block with two HIGH coverage findings located at docs/mocks/ontology-source/render.mjs:1. None of the Story's own files are reviewed.
Expected: the review judges exactly what the Story changed (its trailer-scoped commits from its range base, plus any uncommitted edits to those same files), and an unrelated uncommitted change is left out of the review and reported as excluded.

## Root cause

The change set is chosen working-tree first. changedFiles collects the whole working-tree diff (unstaged and staged) and, as soon as it is non-empty, returns it as the Story's change set with attribution 'working-tree' (src/workflow/runners/build/changed-files.ts:142-156); the Story's own committed range, scoped by its Insrc-Story trailer (storyChangeSet), is consulted only when the working tree is clean (src/workflow/runners/build/changed-files.ts:158-162). Nothing ties a working-tree file to the Story: any uncommitted change, by anyone, becomes the Story's change. The code-review subject takes that set as is (src/workflow/code-review/subject.ts:179-180; its header still states that at review time the build's changes are the working-tree diff, src/workflow/code-review/subject.ts:28), and the diff-only grounding repeats the same working-tree-first order in its own sequence (src/workflow/code-review/grounding.ts:282-285). The same derivation also feeds the BUILD completion record and the build validate phase, so their change sets can absorb unrelated work the same way.

## Fix intent

Make the Story's own change set the authority for its scope. The review, the diff-only grounding and the build records derive the Story's files from the commits that carry its Insrc-Story trailer (from its range base); an uncommitted change counts as the Story's only when it is attributable to the Story (it touches a file the Story's own change set already contains), and every other uncommitted change is excluded from the review and reported as excluded on the record, never judged. A Story with no attributable change has nothing to review, rather than inheriting someone else's edits.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/changed-files.ts:142-162` — "const kept = keep(working); if (kept.length > 0) { opts?.onAttribution?.({ attribution: 'working-tree', ... }); ... // Committed-range fallback: only when the working tree yielded nothing"
- **[[c2]]** `code` `src/workflow/code-review/subject.ts:28` — "the uncommitted working-tree diff (HEAD vs worktree, plus staged), so that is the "Story's build changed" set"
- **[[c3]]** `code` `src/workflow/code-review/grounding.ts:282-285` — "const working = ... await deps.workingTreeDiff(repoPath); if (working.files.length > 0) { attribution = 'working-tree'; return working; }"
- **[[c4]]** `code` `src/workflow/code-review/subject.ts:179-180` — "await deps.changedFiles(repoPath) : await deps.changedFiles(repoPath, attempt.opts)"
- **[[c5]]** `prior-artifact` `.insrc/artifacts/CR-c2ba6fa62a148ed1-s1.json` — "changeSetAttribution 'working-tree', 6 changed files; coverage HIGH at docs/mocks/ontology-source/render.mjs:1"
- **[[c6]]** `stakeholder` `Subho Ghosh, 2026-10-21` — "the real issue is how the reviewer decides the scope of the review, unrelated changes should be excluded from the scope, a blind git diff will always cause issues"
