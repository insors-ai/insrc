<!-- insrc:artifact BUILD-9874475f902756f6-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-24T14:17:55.971Z  ·  **Updated:** 2026-10-24T16:02:01.433Z

**Commit:** ecc2ad904

## Summary

runPlanner sends the per-catalog wire schema and decodes the reply before INV-5. Null-removal rule (user decision A, 2026-10-24, in the amended PLAN): only the nulls the wire form forced are removed, at structural positions (closed objects and array items of the embedded branch), before slots are decoded. Slot JSON contents and whole-params slots reach INV-5 exactly as the model wrote them; the t6 prompt tells the model to omit absent keys inside slot JSON. Invalid slot JSON fails through PlanBuilderSchemaUnrecoverable with nothing half-decoded.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/analyze/explore/__tests__/params-schema.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/explore/params-schema.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/context/__tests__/decompose-params.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/context/__tests__/pipeline-outcome.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/context/decomposer.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/prompts/analyze/decompose.system.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/planner/__tests__/wire-schema.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/planner/wire-schema.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/planner/__tests__/wire-decode.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/planner/driver.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `.insrc/artifacts/PLAN-9874475f902756f6-S001.json` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/PLAN.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/planner/__tests__/driver-unit.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/planner/__tests__/wire-messages.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/planner/render-catalog.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/prompts/analyze/planner.system.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `.insrc/artifacts/ISSUE-7d346e0dcbafc70e.json` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/evidence/t7-live-codex.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `docs/standalone/let-codex-leave-optional-schema-fields-E202610247d346e0d/ISSUE.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `docs/standalone/let-codex-leave-optional-schema-fields-E202610247d346e0d/evidence/refused-open-object-schemas.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `src/analyze/__tests__/codex-plan-schemas.live.test.ts` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/evidence/t8-full-sweep.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/evidence/t8-rollout-smoke.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `.insrc/artifacts/CR-9874475f902756f6-S001.json` — **insrc-build** (2026-10-24T16:02:01.433Z)
- `docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610249874475f/S001/CR.md` — **insrc-build** (2026-10-24T16:02:01.433Z)
