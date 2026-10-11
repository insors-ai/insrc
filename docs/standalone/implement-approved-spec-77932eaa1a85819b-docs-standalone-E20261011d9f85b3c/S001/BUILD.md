<!-- insrc:artifact BUILD-d9f85b3cc8cc966b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T15:39:50.029Z  ·  **Updated:** 2026-10-11T15:39:50.029Z

**Commit:** 1b3e512a

## Summary

The four companion definitions gain an optional narrative and per-element descriptions (components also a path); the synthesizer property schemas, the vendored closed LinkML and Adaptive Cards subsets, and the content-gate rules are updated so described definitions validate cleanly and undescribed ones are unchanged.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/artifacts/schemas/adaptive-cards.schema.json` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/assets/artifacts/schemas/linkml-metamodel.schema.json` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/component-schema.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/component.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/er-schema.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/er.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/sequence-schema.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/sequence.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/ux-schema.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
- `src/workflow/artifacts/companion/ux.ts` — **insrc-build** (2026-10-11T15:39:50.029Z)
