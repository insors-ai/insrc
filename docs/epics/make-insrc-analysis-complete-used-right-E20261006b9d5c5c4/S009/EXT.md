<!-- insrc:artifact EXT-b9d5c5c40df5a574-s9 -->

# Extend: make-insrc-analysis-complete-used-right — A request's size decides how deep and detailed its plan is, and a plan is checked to be executable

> **Extends Epic `make-insrc-analysis-complete-used-right`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s9`

Extends Epic `make-insrc-analysis-complete-used-right` (b9d5c5c40df5a574): building on its stories on sizing a request from what it touches (s2), handling by size (s3) and a broad analysis completing to a final report (s7), and on the code in src/analyze/planner (scope-band.ts, recursive.ts, validate.ts, render-catalog.ts), src/analyze/measure.ts and src/analyze/executor.

## Added Story

### s9: A request's size decides how deep and detailed its plan is, and a plan is checked to be executable

**User value:** Someone asking a broad question about a large codebase gets a plan that is wide and shallow and that the analyzer can finish, while someone asking about a small area gets a plan that goes deep, so a broad analysis reaches its final report in a reasonable time instead of spending the run inside deeper and deeper child plans.

**Acceptance criteria:**
- **ac1:** Given A request that measures XL or L, when the analyzer plans it, then the plan is breadth-first: many shallow, inexpensive tasks across the areas, and no area is explored by a child plan that is itself a large plan.
- **ac2:** Given A request that measures M or S, when the analyzer plans it, then the plan is depth-first: fewer areas, each examined in detail, and child plans are allowed where they add depth.
- **ac3:** Given A plan whose child plans, taken together, would exceed what the request's size allows, when the plan is validated, then it is refused with a reason that names the total and the limit, so that the planner can correct it, in the same way a wrong task count is refused today.
- **ac4:** Given A plan accepted for a broad request, when the analyzer executes it, then the executor works within a budget set by the request's size and the run says when a budget was reached, instead of running on with no bound.
- **ac5:** Given The broad docs request on this repository, which measured XL, when it is run end to end, then it reaches a final report within a stated time and says in its record how deep the plan went and how many tasks ran.

## Building on

- `code` src/analyze/planner/scope-band.ts
- `code` src/analyze/planner/recursive.ts
- `code` src/analyze/planner/validate.ts
- `code` src/analyze/measure.ts
- `step-output` insrc_analyze_step capability.reuse-check over src/analyze/planner: partial-match

## Next

Proposed HLD amendment `AMD-b9d5c5c40df5a574-2` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-b9d5c5c40df5a574-2`) and the updated Epic, then run `design.story` for the new Story `s9` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"b9d5c5c40df5a574","storyId":"s9"}
```
