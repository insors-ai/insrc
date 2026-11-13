<!-- insrc:artifact ISSUE-1c09e09cd985026b -->

# Plan builder runs out of attempts before it reports a wrong task count

## Reproduction

Run the broad docs analysis request against this repository (src/analyze/orchestrator/__tests__/docs-broad-live.test.ts with INSRC_LIVE_TESTS=1). Observed: the run ends with plan/plan-invariant-failed after 3 attempts. Run docs-broad-live-mwc5fz8p kept the same 15-task plan on every attempt; attempt 1 was refused for INV-7, attempt 2 for INV-11, attempt 3 for INV-13 (task count 15 outside the XL focused band 20-80), and no attempt was left to correct the count. Expected: a plan with a wrong task count is told about the count while the other errors are being fixed, so the plan can be accepted within the attempts allowed.

## Root cause

validatePlan returns only the first failing invariant, in invariant order, so INV-13 (task count against the scope band) is checked after INV-7 and INV-11 and is only reported once those are cleared. The retry loop in runPlanner then allows a fixed number of attempts, taken from cfg.shaper.structuredOutputRetries (3 by default), so the attempt on which the count is first reported is also the last. Separately, SCOPE_BAND gives XL a band of 40-80 tasks (20 when focused), which is hard to reach with the small docs template catalog: the model chose 15 tasks on every attempt.

## Fix intent

Make the plan builder report the task-count problem to the model in the same attempt as an earlier ordering error, instead of one invariant per attempt, so that one correction pass can fix both. Review whether the XL band and the attempt budget are right for a plan built from the docs catalog, and set them so that a valid docs plan can be reached within the attempts allowed.

## Citations

- **[[c1]]** `code` `src/analyze/planner/validate.ts:418` — "INV-13: scope policy adherence -- task count within the band."
- **[[c2]]** `code` `src/analyze/planner/validate.ts:61` — "SCOPE_BAND"
- **[[c3]]** `code` `src/analyze/planner/driver.ts:241` — "const maxAttempts = cfg.shaper.structuredOutputRetries;"
- **[[c4]]** `code` `src/analyze/planner/driver.ts:266` — "for (let attempt = 0; attempt < maxAttempts; attempt++) {"
- **[[c5]]** `step-output` `~/.insrc/analyze/docs-broad-live-mwc5fz8p/plan.attempts/03.feedback.json` — "task count 15 is outside the scope band for XL (20-80 focused)"
