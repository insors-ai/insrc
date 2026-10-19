<!-- insrc:artifact BUILD-dabf8d30dfdb988d-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-19T04:26:54.745Z

**Commit:** 67188756

## Scope

Remove two duplications left by s6: S6-1 keep one runIsForUnit in src/workflow/team/handoff.ts and import it from src/daemon/steps/workflow-step/park-offer.ts; S6-2 make src/workflow/team/__tests__/handoff-resume.test.ts import its two-clone world from helpers/handoff-world.ts instead of defining it inline. No behaviour change.

## Triage rationale

Two mechanical de-duplications with no behaviour change and no new contract.
