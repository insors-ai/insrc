<!-- insrc:artifact ISSUE-51a31651908c5c71 -->

# Supply selected reviewed-version code blocks to reviewers

## Reproduction

Start a multi-task review with selected source changes. attributionPrompt sends commit/path/segment descriptors without code. taskReviewPrompt also removes loaded before/after blobs. Submitted segments may contain before-only or paired before/after ranges, contrary to the agreed reviewed-version-only scope. Reviewer must fetch even the selected code before it can attribute or assess it.

## Root cause

The packet contract in src/workflow/code-review/task-review/contracts.ts accepts both before and after ranges. src/workflow/code-review/task-review/packet.ts loads both versions and validates both selections. src/workflow/code-review/task-review/assessment.ts serializes only change descriptors, while src/workflow/code-review/task-review/policy.ts strips the loaded source blobs from task input. Consequently neither prompt embeds selected reviewed-version code.

## Fix intent

Restore the agreed contract for new submissions: only reviewed-version selected blocks, with actual selected code content delivered consistently to attribution and assessment. Resolve and verify content against pinned Git sources, include explicit file/line identity, and fetch old code only when needed. Represent deletions explicitly without inventing after content or supplying removed blocks. Keep commit pointers, strict scope and attribution coverage checks; preserve immutable historical attempts. Add focused regressions covering additions, modifications, deletions, source fidelity, both reviewer routes and recovery. This does not weaken coverage validation or automatically start a costly live review.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/contracts.ts`
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts`
- **[[c3]]** `code` `src/workflow/code-review/task-review/assessment.ts`
- **[[c4]]** `code` `src/workflow/code-review/task-review/policy.ts`
- **[[c5]]** `stakeholder` `User instruction: fix code content along with before/after packet drift.`
