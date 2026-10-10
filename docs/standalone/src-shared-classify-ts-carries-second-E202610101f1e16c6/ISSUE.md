<!-- insrc:artifact ISSUE-1f1e16c61c017931 -->

# src/shared holds a second size scale and two class lists that nothing uses

## Reproduction

Search the sources for each name `src/shared/classify.ts` exports and for importers of its two sibling files. Observed on 2026-10-10: `ScopeSize` (seven steps, S to XXXXL), `SCOPE_META`, `SCOPE_ORDER`, `scopeLabel`, this file's `scopeDescription`, `ClassifyInput` and `ClassifyResult` are used nowhere outside the file; `src/shared/scope-classes.ts` and `src/shared/intent-classes.ts` are imported by nothing. One export of the file is in use: the type `ClassChoice`, imported by `src/shared/brainstorm-classes.ts` for the brainstorm workflow. The file's comment says that a size a model does not return in a recognisable form becomes M. Expected: the sources hold one size scale, the analyzer's five steps counted by code with no default, and no description of another.

## Root cause

The file is left from an earlier classifier that sized every kind of request on its own seven-step scale and fell back to M. The analyzer replaced it with a size counted by code, and the callers of the old classifier were removed, but the file, its scale and its two class lists were not. An earlier note said nothing imports the file; that was wrong for one type, `ClassChoice`.

## Fix intent

The sources no longer hold the unused size scale, its helper functions, the two unused types, or the two class lists nothing imports. The `ClassChoice` type the brainstorm workflow uses stays available to it. No behaviour changes: the build and every suite pass as before.

## Citations

- **[[c1]]** `code` `src/shared/classify.ts` — "export type ScopeSize = 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL' | 'XXXXL';"
- **[[c2]]** `code` `src/shared/brainstorm-classes.ts` — "import type { ClassChoice } from './classify.js';"
- **[[c3]]** `code` `src/shared/scope-classes.ts` — "import type { ClassChoice } from './classify.js';"
- **[[c4]]** `doc` `docs/plans/handover-2026-10-10.md` — "`src/shared/classify.ts` is an unused classifier type with its own size"
