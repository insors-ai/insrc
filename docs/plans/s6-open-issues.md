# S6 open issues

Logged 2026-10-18 while building S6 (epic `team-signoff-claim-based-workflow`, `315d510cb28100e2`). Every item stays **open** until its status line says otherwise.

| # | Status | Issue | Owner / next step |
| :--- | :--- | :--- | :--- |
| S6-1 | open | `runIsForUnit` ("does a stored run change this unit?") exists twice: in `src/daemon/steps/workflow-step/park-offer.ts` (the offer provider) and in `src/workflow/team/handoff.ts` (`parkPlan`'s run selection). The build gate judged moving the provider's copy out of scope for task t6, so the two are kept in step by hand. | After S6's BUILD is approved, keep one copy in `handoff.ts` and import it from `park-offer.ts`; the `park-offer.test.ts` and `handoff-park-plan.test.ts` cases already pin the behaviour. |
