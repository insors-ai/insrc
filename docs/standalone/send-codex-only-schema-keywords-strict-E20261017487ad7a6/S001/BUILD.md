<!-- insrc:artifact BUILD-487ad7a67474d321-s1 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-17T18:32:41.579Z  ·  **Updated:** 2026-10-17T20:01:34.883Z

**Commit:** acb85bfc

## Scope

ISSUE-487ad7a67474d321: send codex only the schema keywords OpenAI strict mode accepts. The codex paths in CliProvider send codexSchemaJson(schema) (processSchemaForOpenAIStrict); strict mode refuses keywords such as uniqueItems (analyzer bundle schema meta.emptyLayers), so codex fails 400 invalid_json_schema. Fix: the copy sent to codex leaves out (or rewrites) every keyword strict mode refuses, with the refused set established by probing codex rather than assumed; the caller's schema is unchanged, and the codex reply is still validated against the caller's full schema so no constraint is lost.

## Triage rationale

bugfix/small: one conversion function in the codex provider path plus a reply validation against the full schema.

## Summary

The codex copy of a schema (codexStrictSchema, structured-output.ts) keeps only the keywords codex was probed to accept and no format but date-time. A schema is refused before codex is called when it holds a format the reply check cannot enforce, or when the final strict copy holds a local $ref that no longer resolves; both scans read schema maps by value. Both codex paths in CliProvider send the copy and check the reply against the caller's full schema with validateCodexReply (ajv draft 2020-12 + ajv-formats). Shared processSchemaForOpenAIStrict and validateAgainstSchema are unchanged. Probe script, raw results and the live check are in S001/codex-strict-probe.md. Eight tests; each rule has a mutation that fails them.

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/send-codex-only-schema-keywords-strict-E20261017487ad7a6/S001/codex-strict-probe.md` — **insrc-build** (2026-10-17T20:01:34.883Z)
- `package-lock.json` — **insrc-build** (2026-10-17T20:01:34.883Z)
- `package.json` — **insrc-build** (2026-10-17T20:01:34.883Z)
- `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` — **insrc-build** (2026-10-17T20:01:34.883Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-17T20:01:34.883Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-10-17T20:01:34.883Z)
