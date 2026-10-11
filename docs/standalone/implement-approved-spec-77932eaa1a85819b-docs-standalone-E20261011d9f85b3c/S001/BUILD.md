<!-- insrc:artifact BUILD-d9f85b3cc8cc966b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T15:39:50.029Z  ·  **Updated:** 2026-10-11T16:19:19.702Z

**Commit:** 76d4f441

## Summary

The four companion renderers take a required header and render through the shared shell (no assembleShell); each finalize site resolves one header and threads it to every companion. Ref kinds/relPaths unchanged; missing runtime still skips the companion. Render-level and finalize suites rewritten; docgen untouched. Headless Chrome drew all four pages from a real finalize.

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

- `src/assets/artifacts/companion/panzoom.js` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/assets/artifacts/schemas/adaptive-cards.schema.json` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/assets/artifacts/schemas/linkml-metamodel.schema.json` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/__tests__/companion-context-finalize.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/context-sections.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/diagram-render.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/er-page.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/render.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/ux-integration.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/ux-mock-render.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/__tests__/ux-render.test.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/component-schema.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/component.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/er-schema.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/er.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/generate.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/mermaid-text.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/render.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/sequence-schema.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/sequence.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/types.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/ux-schema.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/artifacts/companion/ux.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-11T16:19:19.702Z)
