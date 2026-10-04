<!-- insrc:artifact ISSUE-1716f77ba9ba017b -->

# Route every review to the party that did not author the work

## Reproduction

Observed on 2026-10-04 while designing the fix for ISSUE-5f7a7cb95b643ae5. The controller (the Claude Code session) wrote the LLD turn by turn through insrc_workflow_step, as the steering requires. The steering then told the same controller to review it with insrc_review_step. To avoid a literal self-review the controller handed the review to a subagent it spawned itself; five review rounds ran that way. Author and reviewer were the same party each time, and the daemon reviewed nothing. The same happens for code: the controller writes the code through insrc_build_step and then judges it through insrc_code_review_step.

Expected: every review, of documents and of code, is done by the party that did not author the work. Work the controller authored is reviewed by the daemon; work the daemon authored is reviewed by the controller. It is acceptable for both parties to run the same model (claude or codex on both sides); what matters is that the reviewing party is not the authoring party.

Actual: the steering, the tool descriptions and the approval gate all assume the daemon is the author. They send every review to the controller and accept the controller's review as the independent one, even when the controller wrote the work.

## Root cause

The rule was written when the daemon authored artifacts (the daemon-driven workflow run) and was never updated when authoring moved to the controller.

1. The steering text states the rule in one direction only. It says a daemon self-review runs the same model that authored the artifact, so insrc_review_step moves the review into the controller. It does not say what to do when the controller is the author, and the same steering makes insrc_workflow_step (controller-authored) the only supported way to run a workflow.

2. The review tools' own descriptions and code comments repeat the same assumption: the daemon is the author, so the controller reviews.

3. Nothing records which party authored an artifact or a build. The review stamp records only who reviewed (the controller's reviews are labelled `client`). The approval gate checks that a review exists and whether its verdict blocks; it cannot tell a same-party review from an other-party one, so it accepts either.

4. Daemon-side reviewers already exist for both kinds of work (a daemon artifact review that resolves the review role through the role router, and a daemon code-review run), but nothing in the steering or the tools routes controller-authored work to them. The daemon workflow run's own finalize review is off by default for the stated reason that it would be a self-review, which is correct only when the daemon is the author.

## Fix intent

Make the rule symmetric and enforced for every review, documents and code alike: the reviewer is always the party that did not author the work.

- Record which party authored each reviewable piece of work, so the question can be answered from the record rather than assumed.
- Route controller-authored work to a daemon-side review, and daemon-authored work to the controller-side review, for design artifacts and for post-build code review.
- Make the approval gate treat a review by the authoring party as not satisfying the independent-review requirement, with the same explicit-override escape the gate already has.
- Rewrite the steering text, the workflow guides and the review tools' descriptions to state the rule in both directions, and say plainly that the same model on both sides is acceptable.
- Keep existing artifacts approvable: work with no recorded author must not become unapprovable.

How authorship is recorded, how the daemon review is invoked from the controller's flow, and what the gate does with older artifacts are design decisions for the next stage.

## Citations

- **[[c1]]** `code` `src/prompts/steering-block.md` — "A daemon self-review runs the SAME model that authored the artifact"
- **[[c2]]** `code` `src/mcp/server.ts` — "'A daemon self-review runs the SAME provider that authored the artifact — ' +"
- **[[c3]]** `code` `src/daemon/workflow-rpc.ts` — "a daemon-side review here would run the SAME provider that authored the"
- **[[c4]]** `code` `src/mcp/code-review-step/handler.ts` — ": { runId, modelLabel: 'client' },"
- **[[c5]]** `code` `src/workflow/gates.ts` — "if (review !== undefined && effectiveReviewVerdict(review, artifact.meta.reviewResolutions) === 'block') {"
- **[[c6]]** `code` `src/cli/services/workflow.ts` — "export async function reviewArtifact(repoPath: string, artifactPath: string): Promise<ReviewArtifactResult> {"
- **[[c7]]** `code` `src/daemon/code-review-rpc.ts` — "const resolved = await resolveCodeReviewSubject(repoPath, params.epicHash, params.storyId);"
- **[[c8]]** `stakeholder` `user, 2026-10-04` — "the review has to be done by the other party, if using claude or codex as both parties, so be it."
- **[[c9]]** `stakeholder` `user, 2026-10-04` — "and this goes for all review, docs/code"
