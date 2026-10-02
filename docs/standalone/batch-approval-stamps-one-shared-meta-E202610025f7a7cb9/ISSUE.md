<!-- insrc:artifact ISSUE-5f7a7cb95b643ae5 -->

# Sibling Stories approved together share one range base, so a later build reports its siblings' commits as its own changes

## Reproduction

An epic with two Stories whose plans are approved in a single batch, then built one after the other.

Steps:
1. Approve both plans at once: `insrc_workflow_approve({ epicHash })`. This sweeps every pending artifact under the epic, so `PLAN-<epic>-s1` and `PLAN-<epic>-s2` are both stamped with the SAME `meta.rangeBase` — HEAD at that moment, call it C0.
2. Build s1. Its work lands as commit C1.
3. Build s2 and read the BUILD record it produces.

OBSERVED: s2's `## Changes` lists s1's files alongside its own. Its base resolves to C0, so the derived range C0..HEAD spans both Stories' commits.

EXPECTED: s2's change set contains only the files s2 changed.

The same shape occurs without using batch approval at all — any two plans approved in one sitting and built sequentially share a base, because the base is read at approval time and both approvals saw the same HEAD.

Not reproduced end-to-end: this is read off the approval and resolution paths rather than observed in a built record, because reproducing it requires two full Story builds. The mechanism is short enough to confirm by reading — the stamp is unconditional per artifact, the batch path approves N artifacts in one loop, and the resolver prefers the stamped value — but it has NOT been run. The s2 audit graded this `partial` for exactly that reason; the design stage should run it before committing to a branch.

## Root cause

`meta.rangeBase` is defined as "HEAD at approval time". That definition carries an unstated assumption: that each artifact is approved at a moment that distinguishes it from its siblings. Batch approval breaks the assumption by design — it approves every pending artifact under an epic in one sweep, so N plans receive one identical base.

The base then outlives the moment it described. When s2 is finally built, its stamped base still points at the commit that was HEAD before ANY of the epic's Stories were built, so the range it describes is "everything since the epic's plans were approved" rather than "what this Story changed".

This produces exactly the failure the design set out to avoid. The resolver deliberately refuses to fall back to `HEAD^` or to git's empty-tree object, on the stated grounds that a populated wrong answer is worse than an honest absence. A shared base is that same populated wrong answer arriving through the front door instead: the range is valid, resolvable, and describes the wrong Story.

The recently-landed write-once narrowing does NOT address this. Write-once prevents a RE-approval from moving an existing base forward onto the Story's own work; it has nothing to say about a first stamp that was already shared with siblings. The two defects are independent, and fixing the first is what makes this one worth filing separately rather than folding in.

Why no test covers it: the existing tests approve a single artifact in a one-commit repository, where sharing cannot be observed. Exposing this needs two artifacts under one epic, approved together, with a commit landing between the two builds.

## Fix intent

Make each Story's change set describe only that Story, even when its plan was approved in the same sweep as its siblings'.

The decision this turns on — and the reason it is filed rather than patched — is WHEN a Story's range base should be determined:

- Keep it at approval time, and find another way to distinguish siblings so that one sweep does not collapse them onto a single base.
- Move it to build time, where the Story being built is unambiguous.

The second option reverses a rationale that is currently recorded in the code: the base is read at approval precisely so that it cannot depend on whether anyone later remembered to commit the artifact. That rationale is sound on its own terms, so this is a decision to be revisited explicitly, not quietly inverted — whichever branch is chosen, the comment stating the old reasoning must be updated, or the next reader will find the code explaining the opposite choice.

Two constraints the correction must preserve, both already established and deliberate:
- An unresolvable base must still yield an EMPTY change set, never a substituted range.
- A re-approval must still not move an existing base forward.

Out of scope: how the change set is derived once a base is known. That path is settled and working; only the base's provenance is in question here.

## Citations

- **[[c1]]** `code` `src/workflow/gates.ts:605` — "const rangeBase = priorBase !== undefined && priorBase.length > 0"
- **[[c2]]** `code` `src/workflow/gates.ts:532` — "function stampsRangeBase(meta: ApprovableArtifactMeta): boolean {"
- **[[c3]]** `code` `src/workflow/gates.ts:781` — "const pending = pendingArtifactJsonPaths(req.repoPath, req.epicHash);"
- **[[c4]]** `code` `src/workflow/runners/build/range-base.ts:30` — "A populated wrong answer is worse than an honest absence: `HEAD^` would silently describe "the last commit" as "what this Story changed". This resolver never substitutes a different range, and it neve"
- **[[c5]]** `prior-artifact` `commit 6c7d221 — fix(workflow): S001 code-review finding CR-3 — make the rangeBase stamp write-once` — "NOT fixed, and out of scope for a bugfix: batch approval (`insrc_workflow_approve({ epicHash })`) stamps every sibling plan with one shared base, so a later-built Story's change set absorbs its siblin"
- **[[c6]]** `prior-artifact` `ISSUE-93081bff91ae5108 / S001 — approved LLD, the Story that introduced meta.rangeBase at commit 35aec0e` — "the base is read HERE, at approval, so it cannot depend on whether anyone later remembered to commit the artifact"
