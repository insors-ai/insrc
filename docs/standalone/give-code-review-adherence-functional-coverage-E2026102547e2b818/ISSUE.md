<!-- insrc:artifact ISSUE-47e2b81827433589 -->

# Give the code-review adherence and functional-coverage judges the source, not only symbol summaries

## Reproduction

Run the daemon code review (insrc_code_review_step, phase start) on a built Story whose LLD makes many behavioral claims, for example Story s4 of epic b7a68147dcf72034 (git tool registry). Observed: the adherence dimension returns HIGH 'unimplemented expectation' findings located at 'file:1' whose message says 'the supplied evidence shows no implementation of' a behavior that is in the code and covered by passing tests (round 1: git_push refspec safeguards and git_amend upstream-read timeout; round 2: three git_push refspec findings and a whole-Story 'state after the change' finding). Expected: a finding is raised only for a clause the changed code does not implement, and is located at code. Fixing the one real gap between rounds did not change the verdict, because the other findings repeat for the same reason.

## Root cause

The adherence judge's prompt contains the approved LLD and PLAN bodies and the Story's changed symbols as structured summaries, and nothing else (src/workflow/code-review/dimensions/adherence.ts:98-113). It has no changed source and no instruction or means to read files. Its judging rule then says 'A clause or task that requires code and that no note shows implemented is an unimplemented-expectation finding' (src/workflow/code-review/dimensions/adherence.ts:153), and the functional-coverage dimension has the same rule for a requirement that 'no note shows' (src/workflow/code-review/dimensions/functional-coverage.ts:148). A clause that the summaries do not visibly prove therefore becomes an unimplemented-expectation finding; with no code to point at, the judge locates it at the file's first line. Both dimensions send their material through the same model adapter (src/workflow/review-pipeline/code-review.ts). The build gate had the same fault, a codex judge told it could read files while its session reads only by commands in a read-only sandbox, and was fixed in ISSUE-ae2d83c6 for the build gate only.

## Fix intent

A code-review judge no longer reports an implemented, tested behavior as unimplemented because the evidence it was given was thin. The adherence and functional-coverage judges get a way to check a clause against the changed code itself (the changed source for the clause's file, or permission to read with read-only commands as the build gate now allows), and a clause that still cannot be proven from what the judge saw is reported as could not be verified at low severity, not as a HIGH unimplemented expectation. A clause that the changed code really leaves out is still a finding at its code. Tests cover both cases for both dimensions, and a re-review of Story s4 of epic b7a68147dcf72034 no longer raises its four round 2 HIGH findings.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/dimensions/adherence.ts:98-113` — "The Story's changed symbols (structured summaries — the code under review)"
- **[[c2]]** `code` `src/workflow/code-review/dimensions/adherence.ts:153` — "A clause or task that requires code and that no note shows implemented is an unimplemented-expectation finding."
- **[[c3]]** `code` `src/workflow/code-review/dimensions/functional-coverage.ts:148`
- **[[c4]]** `code` `src/workflow/review-pipeline/code-review.ts`
- **[[c5]]** `prior-artifact` `ISSUE-ae2d83c6ab06c595` — "a codex judge that follows the prompt reads nothing"
- **[[c6]]** `doc` `docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S004/CR.md`
