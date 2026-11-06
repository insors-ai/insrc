<!-- insrc:artifact BUILD-d4cf0037bc85680a-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-06T12:50:05.514Z  ·  **Updated:** 2026-11-06T13:07:24.815Z

**Commit:** 84fc3b9c4

## Scope

Implement approved ISSUE-d4cf0037bc85680a: central Codex nullable transport decoding and route activity review candidate/final responses through that shared handler. Preserve original host constraints and explicitly nullable values, required null rejection, schema/reply immutability and Claude behavior.

## Triage rationale

Small bugfix routed directly from approved ISSUE to build; existing provider boundaries only.

## Summary

Centralizes Codex transport null decoding and streamed response validation with original-schema enforcement and typed diagnostics. Validation-only Vibe path preserves prior semantics. Corrected patternProperties/additionalProperties precedence so explicitly permitted nested nulls survive; added joint-schema regression. All 38 affected provider/stream/decoder tests and typecheck pass; 79 broader initial provider regressions passed. Exact saved error:null assessment now validates locally without modifying its raw response or checkpoint.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-d4cf0037bc85680a.json` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `.insrc/artifacts/ISSUE-d4cf0037bc85680a.log.jsonl` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `docs/standalone/decode-nullable-codex-replies-through-shared-E20261106d4cf0037/ISSUE.md` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/__tests__/review-activity-stream.test.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/__tests__/structured-schema-nullable.test.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/review-activity-stream.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/structured-schema.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/__tests__/cli-vibe.test.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-06T13:07:24.815Z)
