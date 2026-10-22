<!-- insrc:artifact BUILD-d9f85b3cc8cc966b-s1 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T15:39:50.029Z  ·  **Updated:** 2026-10-11T17:10:42.910Z

**Commit:** bae37dfe

## Summary

Removed generate.ts (+test), componentDependencyDefinitionToIr / ComponentDefinitionError and uxDefinitionToIr, trimming their IR tests. Kept erDefinitionToIr, sequenceDefinitionToIr (+ error classes, crowsFootToken) and renderUxMockDocument because the VS Code plugin's parity tests still import them (the task deletes only once nothing imports them); each is documented as the plugin's parity reference. Full subsets: workflow 1725/0, docgen 111/0, mcp 437/0, plugin docs-review-panel 203/203.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-d9f85b3cc8cc966b-s1.json` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `docs/standalone/implement-approved-spec-77932eaa1a85819b-docs-standalone-E20261011d9f85b3c/S001/CR.md` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/assets/artifacts/companion/panzoom.js` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/assets/artifacts/schemas/adaptive-cards.schema.json` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/assets/artifacts/schemas/linkml-metamodel.schema.json` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/__tests__/companion-browser.live.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/__tests__/companion-context-finalize.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/completeness.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/component.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/context-sections.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/diagram-render.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/er-page.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/generate.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/removed-paths.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/render.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/sequence-component-page.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/ux-integration.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/ux-mock-render.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/ux-page.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/ux-render.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/__tests__/ux.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/completeness.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/component-schema.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/component.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/er-schema.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/er.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/generate.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/html-escape.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/mermaid-text.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/render.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/sequence-schema.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/sequence.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/types.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/ux-schema.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/artifacts/companion/ux.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/__tests__/diagram-conditional.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/dimensions/__tests__/diagram-handlers.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/dimensions/__tests__/diagram.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/dimensions/__tests__/ux.test.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/dimensions/diagram/handlers/component.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/dimensions/diagram/handlers/er.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/dimensions/diagram/handlers/sequence.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/code-review/dimensions/ux/index.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-11T17:10:42.910Z)
