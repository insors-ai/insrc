<!-- insrc:artifact ISSUE-2fa83c3a877bde0f -->

# A diff-grounded code review reviews unrelated uncommitted files instead of the Story's commits

## Reproduction

1. Build a Story and commit all of its work (on 2026-10-05: Story 1716f77ba9ba017b/S001, 76 changed files across its commits). 2. Leave an unrelated file uncommitted (that day CLAUDE.md and AGENTS.md, re-stamped by a daemon restart). 3. Run a code review that falls back to diff grounding (the index was still processing, so the review ran in the degraded mode). Observed: the review's changed set was only CLAUDE.md and AGENTS.md; none of the Story's source was reviewed, and its one MED finding said the grounding did not cover the Story. A warn verdict was recorded and the BUILD record was approved on it. After those two files were committed, the same review covered 76 files and returned 6 MED and 19 LOW findings. Expected: a diff-grounded review covers the Story's committed range, whether or not other files are uncommitted.

## Root cause

assembleDiffCodeReviewGrounding reads the working-tree diff first and returns it whenever it holds any file. Only when the working tree is clean does it review the Story's committed range (range base to HEAD), and with no base, the last commit. Any uncommitted file, related to the Story or not, therefore replaces the Story's commits as the subject of the review. The ledger exclusion globs do not help here, because files such as CLAUDE.md and AGENTS.md are not ledger files. The same function serves both reviewers: the controller's diff path in insrc_code_review_step and the daemon's degraded mode in codeReview.run.

## Fix intent

A diff-grounded review of a Story must cover the Story's committed range when one is known, with uncommitted changes added to that set rather than replacing it. When what is reviewed is only uncommitted files outside the Story's range, the review should say so plainly instead of recording a verdict that reads as a review of the Story. Cover it with a test that commits a Story's work, leaves an unrelated file uncommitted, and asserts the Story's committed files are in the reviewed set.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/grounding.ts` — "if (working.files.length > 0) return working;"
- **[[c2]]** `code` `src/mcp/code-review-step/handler.ts` — "const diff = await deps.assembleDiffGrounding(repo, undefined, {"
- **[[c3]]** `code` `src/daemon/code-review-rpc.ts` — "diff = await (deps.assembleDiffGrounding ?? assembleDiffCodeReviewGrounding)(repoPath, undefined, {"
- **[[c4]]** `prior-artifact` `CR-1716f77ba9ba017b-S001`
