<!-- insrc:artifact PLAN-8315a11f29fd2812-s2 -->

# Plan: E202610208315a11f:S002

## Summary

**Epic:** `chunked-review-pipeline-every-review`
**LLD run:** `wf-1792398246645-7x3wlt`
**LLD effective hash:** `044189484c77...`

This Story gives the code review its material: every changed symbol in a dimension's grounding becomes one whole atom, related to the others by calls, a shared file and a shared directory, and a symbol held in another chunk is described by a short deterministic line. Two pure functions do the work; the code-review adapter then hands them to s1's prepare, so a review over the limit is divided along the lines of the code while a review under it sends exactly today's prompt. Chunk prompts, obligations and gather remain Story s3's.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** codeReviewMaterial: atoms and relations from a dimension's grounding | M | — | unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'each included summary is one atom with id entityId, label file#name, the file's directory as module, and text equal to the row's JSON'; unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a callee or caller name matching a changed symbol gives a calls relation; a same-named pair relates to both; no self-relation; an unmatched name gives none'; unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'same-file and same-module relations join atoms sharing a file or directory; a diff review gets same-module relations only'; unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a duplicate entityId throws an error naming it'; unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'the same grounding gives identical material and identical neighbour summaries every time' | [[c1]] [[c3]] |
| 2 | **`t2`** neighbourSummary: a deterministic line for a related atom held elsewhere | S | `t1` | unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a neighbour summary names kind, name, file, the first signature line within 200 characters, and the related changed names'; unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'the same grounding gives identical material and identical neighbour summaries every time' | [[c2]] |
| 3 | **`t3`** Point the code-review adapter at the material and the neighbour summary | M | `t1`, `t2` | unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'coverage material built from prepareCoverageGrounding keeps only eligible rows and carries their coverageEvidence'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'over the limit, symbols that call each other share a chunk before symbols that only share a file, and those before symbols that only share a directory'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a call relation cut between two chunks gives each chunk a neighbour summary of the other symbol'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every changed symbol is whole in exactly one chunk and every chunk fits the limit'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a summary larger than the limit on its own raises AtomTooLargeError naming its file#name'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'under the limit the plan is one chunk and the dimension prompt is unchanged'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every rendered chunk call, with array formatting, neighbours, context and envelope, measures within limitChars'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call'; integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'an atom whose singleton call with neighbour summaries exceeds the limit, but fits once its related atoms share the chunk, is packed and not reported as too large' | [[c1]] [[c2]] [[c3]] [[c4]] [[c6]] |
| 4 | **`t4`** Rebuild and update the installed daemon | S | `t3` | smoke: Installed daemon: runs the build containing the code-review material (recorded in the BUILD record) | [[c5]] |

### 1.1 E202610208315a11f:S002:T001 — codeReviewMaterial: atoms and relations from a dimension's grounding

Add codeReviewMaterial(grounding) in src/workflow/review-pipeline/adapters/code-review-material.ts: one whole atom per ChangedSymbolSummary in grounding order (id entityId, label file#name, file, module = the file's directory or '.', text = the row's JSON); 'calls' relations by name either direction (a name matching several rows relates to each, no self-relation, an unmatched name gives none); 'same-file' and 'same-module' relations; obligations empty and context absent. A duplicate entityId throws, naming it and both labels. Pure and deterministic.

**Acceptance checks:**
- Every row of the grounding is exactly one atom with the specified id, label, file, module and text.
- Calls, same-file and same-module relations follow the contract, including same-named rows, self-calls, unmatched names and diff-review rows.
- A duplicate entityId raises an error naming it; the same grounding always gives identical material.

### 1.2 E202610208315a11f:S002:T002 — neighbourSummary: a deterministic line for a related atom held elsewhere

Add neighbourSummary(atom, material) beside codeReviewMaterial: '<kind> <name> in <file>: <first signature line, at most 200 characters>; calls: <related changed callee names>; called by: <related changed caller names>', with no model call; the same atom always gives the same line.

**Acceptance checks:**
- The line names kind, name, file, the first signature line cut at 200 characters, and only the related changed names.
- The same atom and material give the same line every time.

### 1.3 E202610208315a11f:S002:T003 — Point the code-review adapter at the material and the neighbour summary

In src/workflow/review-pipeline/code-review.ts, each dimension adapter's material() returns codeReviewMaterial of the dimension's prepared grounding read from the snapshot (coverage: prepareCoverageGrounding's output; the others: the grounding itself) and its neighbourSummary member uses t2's writer. Under the limit the single-chunk path and today's prompts are unchanged. Integration tests drive s1's prepare with a small limit and a chunk-call fixture rendering a chunk's rows in the prompt's array form: grouping order, neighbour summaries on both sides of a cut relation, whole atoms, every rendered chunk call within the limit, and an oversized atom named (judged neighbour-free).

**Acceptance checks:**
- Over the limit, symbols that call each other share a chunk before those only sharing a file, and those before those only sharing a directory.
- A call relation cut between chunks gives each side a neighbour summary of the other.
- Every symbol is whole in exactly one chunk, every rendered chunk call fits, and a symbol too large alone is named before any provider call.
- Under the limit the plan is one chunk and the dimension prompt is today's.
- A row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call.
- An atom whose singleton call with neighbour summaries exceeds the limit, but fits once its related atoms share the chunk, is packed and not reported as too large.
- Coverage material is built from prepareCoverageGrounding: only eligible rows, each carrying its coverageEvidence.

### 1.4 E202610208315a11f:S002:T004 — Rebuild and update the installed daemon

Update the installed daemon (maintenance.update, then restart) so reviews use the code-review material; no stored record, grounding or config changes.

**Acceptance checks:**
- The installed daemon runs the build that contains t1-t3.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'each included summary is one atom with id entityId, label file#name, the file's directory as module, and text equal to the row's JSON' | `t1` |
| src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a callee or caller name matching a changed symbol gives a calls relation; a same-named pair relates to both; no self-relation; an unmatched name gives none' | `t1` |
| src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'same-file and same-module relations join atoms sharing a file or directory; a diff review gets same-module relations only' | `t1` |
| src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'coverage material built from prepareCoverageGrounding keeps only eligible rows and carries their coverageEvidence' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a duplicate entityId throws an error naming it' | `t1` |
| src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'the same grounding gives identical material and identical neighbour summaries every time' | `t1`, `t2` |
| src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a neighbour summary names kind, name, file, the first signature line within 200 characters, and the related changed names' | `t2` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'over the limit, symbols that call each other share a chunk before symbols that only share a file, and those before symbols that only share a directory' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a call relation cut between two chunks gives each chunk a neighbour summary of the other symbol' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every changed symbol is whole in exactly one chunk and every chunk fits the limit' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a summary larger than the limit on its own raises AtomTooLargeError naming its file#name' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'under the limit the plan is one chunk and the dimension prompt is unchanged' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every rendered chunk call, with array formatting, neighbours, context and envelope, measures within limitChars' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call' | `t3` |
| src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'an atom whose singleton call with neighbour summaries exceeds the limit, but fits once its related atoms share the chunk, is packed and not reported as too large' | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails ReviewAdapter.material (code review)` — "built by codeReviewMaterial(grounding: CodeReviewGrounding): ReviewMaterial"
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails ReviewAdapter.neighbourSummary (code review)` — "neighbourSummary(atom: ReviewAtom, material: ReviewMaterial): string"
- **[[c3]]** `prior-artifact` `LLD s2 errorPaths` — "One changed symbol's summary alone exceeds the chunk limit; Two atoms would share an id"
- **[[c4]]** `prior-artifact` `LLD s2 migration step 2` — "Point the code-review adapter's material() and neighbour-summary slot at them"
- **[[c5]]** `prior-artifact` `LLD s2 migration step 3` — "Rebuild and update the installed daemon."
- **[[c6]]** `prior-artifact` `LLD s2 testStrategy` — "The material through s1's prepare with a small limit"
