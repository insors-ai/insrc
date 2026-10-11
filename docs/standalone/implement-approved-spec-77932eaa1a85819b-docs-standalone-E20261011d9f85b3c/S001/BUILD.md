<!-- insrc:artifact BUILD-d9f85b3cc8cc966b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T15:39:50.029Z  ·  **Updated:** 2026-10-11T16:05:55.645Z

**Commit:** 04b8d49f

## Summary

Added uxDefinitionToPage: the existing card emitter renders the HTML visual with depth-first stable numbered markers on key elements and actions, built in the same walk as the key-elements table; Submit and OpenUrl stay distinct; the card CSS is split from the standalone page chrome. Headless Chrome render matches the approved mock.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/artifacts/companion/panzoom.js` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/assets/artifacts/schemas/adaptive-cards.schema.json` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/assets/artifacts/schemas/linkml-metamodel.schema.json` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/er-page.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/component-schema.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/component.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/er-schema.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/er.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/mermaid-text.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/sequence-schema.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/sequence.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/types.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/ux-schema.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
- `src/workflow/artifacts/companion/ux.ts` — **insrc-build** (2026-10-11T16:05:55.645Z)
