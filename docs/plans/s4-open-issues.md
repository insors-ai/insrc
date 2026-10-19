# S4 open issues

Logged 2026-10-18 after S4 (epic `team-signoff-claim-based-workflow`, `315d510cb28100e2`) was BUILD-approved with a recorded override. Every item stays **open** until its status line says otherwise.

| # | Status | Issue | Owner / next step |
| :--- | :--- | :--- | :--- |
| S4-1 | resolved 2026-10-19 (standalone story 72b1bee074ba2dab/S001, AMD-11 approved) | Amendment `AMD-315d510cb28100e2-11` (`resolveIssueId(ref)` on the tracker port) is pending. Until it is agreed, an issue adopted by its label after a timed-out create is not linked under its parent. | s1 to agree; then link adopted Story and Task issues in `ensureUnitIssueDetailed`. |
| S4-2 | resolved by decision 2026-10-19 (team-workflow.md "Revision rule decision") | Identical content writes keep their revision (`writeArtifact`); the approved contract says every content write mints prior + 1. Accepted deviation (a): the BUILD-record byte-identity test depends on it. | Revisit with s8 (revision) when signoff binds to the revision. |
| S4-3 | resolved by decision 2026-10-19 (team-workflow.md "Revision rule decision") | The provenance writer is meta-only; the plan classified it as content. Accepted deviation (b): provenance round-trip tests and the review-decision "changes no state" rule depend on it. | Revisit with s8. |
| S4-4 | open | No per-Task body comment: the plan review comment goes on the Story issue (`planComment` mark) because the legacy code has no per-Task comment and the LLD does not say what it contains. | Decide the content with the owner, or amend the LLD. |
| S4-5 | open | Task t9 gate: a second draft write reads the team policy through local git (`policyReader`), which the build gate reads as "runs a command". The LLD specifies the policy read first. | Decide: cache the policy read, or amend the acceptance check. |
| S4-6 | resolved by decision 2026-10-19 (team-workflow.md "Revision rule decision") | Gates for t3, t4 and t5 failed on deviations (a) and (b) and the unavoidable edits to `build-record.test.ts` and `test-record.test.ts` (first-write meta gained `revision: 1`). | Closes with S4-2 and S4-3. |
| S4-7 | open | Last S4 code review is `block` from a diff-only review (the code index never refreshed for five files under `runners/build`); it predates the merge cleanup and full pagination. | Re-run the code review once the index is fresh. |
| S4-8 | open | The full test sweep times out in one run, and the TUI poll-interval test failed once under load. | Run the sweep in batches in CI; look at the flake. |
