# Self-review of `LLD-f32c3abf4a55494b-s1`

Date: 2026-11-02. Reviewer: the controller that wrote the design (the design-review tool is unavailable), so the approval needs an override reason. Method: each claim about code checked against the tree.

## Checked against the tree

- `finalizeDefineExtend` exists in `src/workflow/orchestrator.ts` (async, line 1267) and is the one place that calls `appendStoryToDefine` (line ~1349), after the Epic and HLD are required approved and the Epic anchor is resolved; the first side effect is that call, so a gate placed right before it writes nothing when it refuses.
- `appendStoryToDefine` (`src/workflow/gates.ts:210`) is synchronous and has no other production caller; the write inventory lists it as a content site.
- `teamGate` answers `allowed` with no tracker call outside team mode; `revise` on an unassigned stage is allowed, which is why `assertHeld` is applied after it (as `assertMayAuthor` does).
- The gate's first-author exception already maps `authoring === 'define'` to the Define artifact, so the helper passes `'define'` for the extend and an existing Define does not take the exception.
- `handleResolveComment` parses the artifact id into kind, Epic hash and Story id before any write; the gate can run there, once, before the first record.

## Findings

- **MED-1 (decision for the user).** `resolveComment` is called from the review pane, whose user may be a reviewer and not the holder. Applying `revise` to every comment, as the Story says, refuses a non-holder reviewer while the stage is in signoff. The design follows the Story text; the alternative (let a non-holder record comments, gate only the holder's own edits) is listed as an open question.
- **MED-2 (decision for the user).** An extend of a Define that is not in signoff is gated as `author`, which takes the claim on an unassigned Epic (as `design.epic` does). The alternative is `revise` for every extend. The Story text says `revise`; `author` outside signoff is the existing rule of `authorActionOf`.
- **LOW-1.** The Story has no acceptance criteria; `ac1` to `ac5` were derived from its text and need confirming at plan time.
- **LOW-2.** The inventory test covers only writers the inventory lists; a new writer file that is not listed is not caught (the existing inventory test already checks that every writer file is listed, which this relies on).
- **LOW-3.** The extend path throws `TeamGateRefusedError` out of the define run, as `assertMayAuthor` does at the other entries; the plugin shows it as the run's error.
- **LOW-4.** The head-ahead-of-log defect of raw design-run writes is out of this Story (a separate bugfix).

## Verdict

warn. No HIGH finding. MED-1 and MED-2 are the two open questions of the LLD; both have a default that follows the Story text.

---

# Build self-review of `BUILD-f32c3abf4a55494b-s1`

Date: 2026-11-02. Reviewer: the controller that wrote the code (the code-review tool is unavailable), so this is a self-review and the approval needs an override reason. Scope: the commits of this Story (trailer `Insrc-Story: f32c3abf4a55494b/s1`, t1 to t5 and two follow-ups), read against the approved LLD and PLAN.

## What was checked

- Each acceptance check of t1 to t5 against the code, by the build gate (all five passed, t1 and t2 on a second round) and again by reading the diff.
- Order of effects: in `finalizeDefineExtend` the gate sits after every validation and before `appendStoryToDefine`, the amendment and the cache write; in `handleResolveComment` it sits after the artifact is read and before the first record.
- A repo with no team policy: `teamGate` answers allowed with no tracker call, tested for the helper, the extend and the recorder.
- A full sweep once, compared by test name with the tree before the Story (outcome in `docs/plans/team-workflow.md`): no new failure.

## Findings

- **MED-1 (decide).** `finalizeByWorkflow` now rethrows a `TeamGateRefusedError` and a `ToolDenied` instead of turning every thrown error into a retryable schema failure. It is the only place that changes behaviour for every workflow, though no other finalizer throws these two. Callers (the synthesize phase and the daemon driver) already handle the same errors from `assertMayAuthor`, but there is no test that drives a refusal through the MCP synthesize phase end to end.
- **MED-2 (by decision).** `resolveComment` is holder-only while a stage is in signoff, so a non-holder reviewer using the review pane is refused. Outside signoff a comment on an unassigned stage takes the claim, which a reader of the pane would not expect from "add a comment". Both follow the Story text and the user's decisions; they are tested, not designed away.
- **LOW-1.** The duplicate-id guard in the extend path cannot fire today (`nextStoryId` mints an unused id) and has no runtime test; the build judge accepted it by code inspection.
- **LOW-2.** `checkWriteGates` accepts any use of the names `assertMayAuthor` or `assertMayReviseDraft` in the named file or function (the recorder reaches the check through its test seam), so a comment that mentions the name would satisfy it. It catches a missing or stale gate, not a bypassed one.
- **LOW-3.** The recorder's gate runs for any caller of `workflow.resolveComment`; other callers of `recordResolution` (design runs) are not gated, by design (alternative a2 was rejected for that reason).
- **LOW-4.** The gate seam of `ResolveCommentDeps` (`gate`) is used by one test; the other tests go through the team gate's own seams.
- **Process.** A first sweep chunk of src/workflow showed one test (`git-calls.test.ts`) failing only under load; it passes alone. Another session's files were not touched.

## Verdict

warn. No HIGH finding. MED-1 is the one change outside the three writers; MED-2 is a decision already taken.
