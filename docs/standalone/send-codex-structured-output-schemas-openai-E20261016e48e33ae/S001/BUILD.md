<!-- insrc:artifact BUILD-e48e33ae6af03720-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T17:39:07.303Z

**Commit:** ca2c1c2e

## Scope

Both codex paths of CliProvider (structured completion src/agent/providers/cli-provider.ts:274-278 and review session :386-390) send codex the strict form of the caller's schema, produced by the existing processSchemaForOpenAIStrict (src/agent/providers/structured-output.ts:266) on a copy, so the caller's schema object is unchanged. A test shows a schema without additionalProperties reaches codex's --output-schema file in strict form in both paths and the caller's schema is not modified. Implements ISSUE-e48e33ae6af03720.

## Triage rationale

bugfix/small: one file, reuses the existing strict-schema helper, one test.
