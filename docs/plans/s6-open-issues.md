# S6 open issues

Logged 2026-10-18 while building S6 (epic `team-signoff-claim-based-workflow`, `315d510cb28100e2`). Every item stays **open** until its status line says otherwise.

| # | Status | Issue | Owner / next step |
| :--- | :--- | :--- | :--- |
| S6-1 | resolved 2026-10-19 | `runIsForUnit` ("does a stored run change this unit?") exists twice: in `src/daemon/steps/workflow-step/park-offer.ts` (the offer provider) and in `src/workflow/team/handoff.ts` (`parkPlan`'s run selection). The build gate judged moving the provider's copy out of scope for task t6, so the two are kept in step by hand. | After S6's BUILD is approved, keep one copy in `handoff.ts` and import it from `park-offer.ts`; the `park-offer.test.ts` and `handoff-park-plan.test.ts` cases already pin the behaviour. |

## S6-2: handoff test world duplicated

`src/workflow/team/__tests__/helpers/handoff-world.ts` (added by t10 for `handoff-phases.test.ts`) holds the two-clone world that
`handoff-resume.test.ts` (t9) still defines inline. t10's scope excluded editing t9's test, so the duplication stays; a later
clean-up should make `handoff-resume.test.ts` import the helper.

**Status: resolved 2026-10-19.** `handoff-resume.test.ts` now imports the helper.
