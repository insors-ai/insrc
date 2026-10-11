<!-- insrc:artifact BUILD-d9f85b3cc8cc966b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T15:39:50.029Z  ·  **Updated:** 2026-10-11T15:47:04.734Z

**Commit:** 521e35c2

## Summary

Added shell.ts: CompanionPageContent / DescriptionBlock / DescriptionCell types and renderCompanionPage(header, page, runtime) producing Header, Narrative, a pan/zoom View panel and escaped Description tables, plus loadCompanionRuntime, which inlines panzoom.js (and Mermaid for Mermaid visuals) and raises DiagramGenerationError on a missing asset. Adds the CompanionHeader type.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/artifacts/companion/panzoom.js` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/assets/artifacts/schemas/adaptive-cards.schema.json` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/assets/artifacts/schemas/linkml-metamodel.schema.json` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/component-schema.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/component.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/er-schema.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/er.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/sequence-schema.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/sequence.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/types.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/ux-schema.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
- `src/workflow/artifacts/companion/ux.ts` — **insrc-build** (2026-10-11T15:47:04.734Z)
