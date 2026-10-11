<!-- insrc:artifact BUILD-d9f85b3cc8cc966b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-11T15:39:50.029Z  ·  **Updated:** 2026-10-11T15:49:07.959Z

**Commit:** 1a0b7703

## Summary

Added header.ts: resolveCompanionHeader resolves project name, work-item id (with plain-id fallback), source-doc link, injectable-clock date, user (git, OS, 'unknown') and a per-source-kind context line, without ever throwing. The CompanionHeader type was added to types.ts in t3.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/assets/artifacts/companion/panzoom.js` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/assets/artifacts/schemas/adaptive-cards.schema.json` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/assets/artifacts/schemas/linkml-metamodel.schema.json` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/__tests__/body-fields.test.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/__tests__/descriptions.test.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/__tests__/panzoom.test.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/__tests__/shell.test.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/component-schema.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/component.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/er-schema.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/er.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/sequence-schema.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/sequence.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/shell.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/types.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/ux-schema.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
- `src/workflow/artifacts/companion/ux.ts` — **insrc-build** (2026-10-11T15:49:07.959Z)
