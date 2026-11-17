# Review framework rebuild — raw brainstorm input

Captured verbatim (lightly structured) from the user's kickoff message on
2026-11-17. The current review framework (both design review and code review)
has been nuked because it was not written properly. This note is the raw input
for three brainstorming sessions to rebuild it, run before any triage/define.

## 1. Context — what is submitted for review

1. Base `ReviewContext` class — to be later used for code-review also.
   1. **Scope section** — tells the reviewer the exact scope of the review.
      1. Description of the current scope of the review.
      2. Define/HLD/LLD/Plan/Task(s)
         - This section includes different levels of information based on the
           type of artifact being reviewed.
         - Example:
           - HLD review → DEF section is populated only.
           - Code review → DEF, HLD, LLD, PLAN, Task(s) are all populated.
         - All pointers to JSONs — already there.
      3. Pointers to generated JSONs — not full text.
      4. **Analysis**
         - List of code/artifact references — `file:[section]`.
      5. **Comments** — verbatim comments, if any.
2. Context should be minimal with the right pointers; any detail required can
   be retrieved by the review agent.
3. Grounding/detailed analysis should be done independently by the reviewer,
   not fed in.

## 2. Process

1. Reviews can be of 2 types:
   1. Initial Review
   2. Correction and Re-review
2. Steering
   1. Review/update the existing design-review steering.
   2. Focus on independent grounding/analysis.
3. Recovery and restart
   1. Checkpointing to ensure recovery/restart can be done with minimal
      rework.
   2. The checkpointing should be generic such that it can be extended to
      handle code-reviews also.
4. Review output format
   1. Check the current structure.
      1. Feedback needs to be categorized properly:
         - correctness
         - functional
         - security
         - quality
         - etc.
   2. `docgen` should have a "review to MD" method.
   3. Currently reviews are only visible to the agent.
      1. After each review, the output should be presented to the user.
      2. The current process allows for 3 round review cycles — this should
         remain, but the intermediate review feedback should be presented; no
         response is required from the user until the cycle limit is reached.

## 3. Extending the review framework

- See [`security-quality-review-prd.html`](security-quality-review-prd.html)
  for the target extension (evidence-grounded security and quality review).

## Process note

Three brainstorming sessions are being run against this input, one per
section above, each converging to its own spec before triage:

1. Context — the `ReviewContext` data model.
2. Process — review types, steering, checkpointing/recovery, output format
   and presentation.
3. Extending the framework to meet `security-quality-review-prd.html`.
