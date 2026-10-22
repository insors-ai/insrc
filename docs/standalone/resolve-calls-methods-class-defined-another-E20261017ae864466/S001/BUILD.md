<!-- insrc:artifact BUILD-ae864466e7f1f4ea-s1 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-17T16:44:37.038Z  ·  **Updated:** 2026-10-17T18:23:24.116Z

**Commit:** 0e30e7e7

## Scope

ISSUE-ae864466e7f1f4ea: a method of an exported TypeScript/JavaScript class is visible, through the existing import-scoped rule, to the files that import that class's file; a private method (TypeScript private modifier or a #name) stays invisible. x.method() resolves when exactly one such method is visible through the caller's imports, and is recorded ambiguous with its candidates when several are. Only the TypeScript/JavaScript parser changes (src/indexer/parser/typescript.ts extractMethod/extractClass); the resolver is unchanged.

## Triage rationale

bugfix (small): the TypeScript parser writes method entities without isExported and resolveCall's cross-file step requires it; marking a method visible when its class is exported and the method is not private makes the existing import-scoped rule and its ambiguity handling apply.

## Summary

extractClass passes the class's export status to extractMethod, which marks a method exported unless it is private (an accessibility_modifier 'private' or a private_property_identifier name). The resolver is unchanged: its import-scoped cross-file rule now resolves x.method() to a method of an exported class in an imported file, and records a name two imported classes share as ambiguous with both candidates. New end-to-end test src/indexer/__tests__/method-calls-cross-file.test.ts (real parser, per-file resolver and cross-file pass over a temporary store) covers the resolved call, private / #name / non-exported-class methods, and the ambiguous case; four mutations each fail it.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/LLD-0f0e4f45f698aeb6-s1.json` — **insrc-build** (2026-10-17T18:23:24.116Z)
