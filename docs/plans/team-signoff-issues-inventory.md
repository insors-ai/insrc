# Team signoff epic: issue and gap inventory

Epic `team-signoff-claim-based-workflow` (`315d510cb28100e2`). Written 2026-10-19 after S6's BUILD was approved (s1 to s6 built, s7 to s9 not started). It gathers the per-story logs ([`s4-open-issues.md`](s4-open-issues.md), [`s5-open-issues.md`](s5-open-issues.md), [`s6-open-issues.md`](s6-open-issues.md)), the design notes in [`team-workflow.md`](team-workflow.md) and the loose ends from the builds. The status column is the one to update as items close. Order of work: complex first.

## A. Open issues from the story logs

| # | Status | Complexity | Issue | Next step |
| :--- | :--- | :--- | :--- | :--- |
| S4-2 | resolved by decision 2026-10-19 (team-workflow.md "Revision rule decision") | high | Identical content writes keep their revision (`writeArtifact`); the contract says every content write mints prior + 1. Accepted deviation: the BUILD-record byte-identity test depends on it. | Decide the rule with s8 (signoff binds to the revision), then change the writer and the tests that depend on it. |
| S4-3 | resolved by decision 2026-10-19 (team-workflow.md "Revision rule decision") | high | The provenance writer is meta-only; the plan classified it as content. Accepted deviation: provenance round-trip tests and the "review decision changes no state" rule depend on it. | Same decision as S4-2. |
| S4-6 | resolved by decision 2026-10-19 (team-workflow.md "Revision rule decision") | high | The t3, t4 and t5 gate failures came from S4-2, S4-3 and the first-write meta gaining `revision: 1` in two test files. | Closes with S4-2 and S4-3. |
| S4-1 | resolved 2026-10-19 (standalone story 72b1bee074ba2dab/S001, AMD-11 approved) | high | Amendment `AMD-315d510cb28100e2-11` (`resolveIssueId(ref)` on the tracker port) is pending. An issue adopted by its label after a timed-out create is not linked under its parent. Shared with s5. | Agree the amendment (s1), then link adopted Story and Task issues in `ensureUnitIssueDetailed`. |
| S4-5 | open | medium | A second draft write reads the team policy through local git; the build gate reads that as "runs a command". The LLD says the policy read comes first. | Cache the policy read, or amend the acceptance check. |
| S4-4 | open | medium | No per-Task body comment: the plan review comment goes on the Story issue. | Decide the content with the owner, or amend the LLD. |
| S4-7 | open | medium | The last S4 code review is `block` from a diff-only review (stale code index). | Re-run the code review once the index is fresh. |
| S5-1 | open | medium | `claim` and `teamGate` in `src/workflow/team/gate.ts` repeat the holder comparison, the add-only assign, failure handling and the contention check. | Extract one shared assignment helper. |
| S4-8 | open | low | The full test sweep times out in one run; the TUI poll-interval test is flaky. | Batch the sweep; look at the flake. |
| S6-1 | resolved 2026-10-19 | low | `runIsForUnit` exists in `park-offer.ts` and `handoff.ts`. | Keep one copy in `handoff.ts`, import it. |
| S6-2 | resolved 2026-10-19 | low | The two-clone test world is in `helpers/handoff-world.ts` and still inline in `handoff-resume.test.ts`. | Make that test import the helper. |

## B. Known limitation, accepted

- **Claim race (s5).** GitHub has no "assign only if unassigned", so two people can both claim inside a window of a few seconds. insrc detects it afterwards and reports the claim as contested; an administrator releases it. Prevention is not possible on GitHub.

## C. Design gaps with no story yet

- Offline rule for the policy file (last fetched policy; refuse if none).
- Migration: existing artifacts have `approvedAt` but no signoff (grandfather, or one-time signoff).
- Epic-stage issue creation has no earlier approval to hook onto.
- A "my items" view in the TUI and VS Code.
- Jira: approval exists only in JSM; other projects need a workflow transition.
- Rendering `signoffs[]` and the completion event into artifact meta, and gating `gates.ts` on them (s7, s8).
- `LLD-38436e90625a83a2-S001` (the `insrc_tracker` tool): reviewed, unbuilt, approval status conflicting.

## D. Approvals made over a `block`

DEF (12 MED, checked by hand); s3, s4, s5 and s6 LLDs (s5 and s6 findings became binding build requirements, all built); s4, s5 and s6 BUILDs (coverage HIGHs from missing test edges for new files, a tooling gap; s6 also 8 LOW on `| undefined`).

## E. Loose ends

- Unrelated test failures seen in the s6 sweep: `template-review` "SPEC template and the Epic limit" (timing flake), `SqliteDriver` and `temporalTrend` in `src/daemon`. Not checked against the baseline.
- `db`, `analyze` and `indexer` suites exceed 280 s; no result in the s6 sweep.
- The IDE repo must mirror `repo-fields-catalog.json` (the `branchPattern` row changed in s6).
- s7 (signoff), s8 (revision) and s9 (tracker status sync) not started; `S009/EXT.md` exists from the define step.
- ac28 is read at stage level: after a lost machine the half-run stage restarts from step one; step progress travels only in a park-time checkpoint.
