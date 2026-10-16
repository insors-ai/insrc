<!-- insrc:artifact BUILD-e48e33ae6af03720-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T17:39:07.303Z  ·  **Updated:** 2026-10-16T18:35:07.556Z

**Commit:** 687395c8

## Scope

Both codex paths of CliProvider (structured completion src/agent/providers/cli-provider.ts:274-278 and review session :386-390) send codex the strict form of the caller's schema, produced by the existing processSchemaForOpenAIStrict (src/agent/providers/structured-output.ts:266) on a copy, so the caller's schema object is unchanged. A test shows a schema without additionalProperties reaches codex's --output-schema file in strict form in both paths and the caller's schema is not modified. Implements ISSUE-e48e33ae6af03720.

## Triage rationale

bugfix/small: one file, reuses the existing strict-schema helper, one test.

## Summary

Both codex paths of CliProvider now write processSchemaForOpenAIStrict(structuredClone(schema)) to --output-schema (dd771653). src/agent/providers/__tests__/cli-codex-strict-schema.test.ts drives a fake codex that records the schema file: 2/2 pass, and three falsifying mutations (each path unstrict, the copy removed) each fail it. Full sweep: 2 failures, both reproducing at HEAD without this change (sqlite-driver temporalTrend 'integer overflow', review-decision /private/var realpath). Live: with the daemon on dd771653, codex accepted the judge schema (no HTTP 400).

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TESTS-c2ba6fa62a148ed1-s1.json` — **insrc-build** (2026-10-16T18:35:07.556Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/TESTS.md` — **insrc-build** (2026-10-16T18:35:07.556Z)
