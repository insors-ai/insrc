<!-- insrc:artifact BUILD-d4cf0037bc85680a-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-06T12:50:05.514Z  ·  **Updated:** 2026-11-06T13:55:37.866Z

**Commit:** 4c14d752e

## Scope

Implement approved ISSUE-d4cf0037bc85680a: central Codex nullable transport decoding and route activity review candidate/final responses through that shared handler. Preserve original host constraints and explicitly nullable values, required null rejection, schema/reply immutability and Claude behavior.

## Triage rationale

Existing approved small issue; review findings corrected within the same acceptance contract.

## Summary

Centralized Codex optional-null decoding and streamed validation with deferred branch guards, impossible-discriminator pruning, local equivalent-branch merging and lazy distinct collection products. All 48 focused tests pass, including 1,000-item discriminated, equivalent and genuinely ambiguous arrays; original schema constraints and provider isolation remain enforced.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-d4cf0037bc85680a.json` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `.insrc/artifacts/ISSUE-d4cf0037bc85680a.log.jsonl` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `docs/standalone/decode-nullable-codex-replies-through-shared-E20261106d4cf0037/ISSUE.md` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/__tests__/review-activity-stream.test.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/__tests__/structured-schema-nullable.test.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/review-activity-stream.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/structured-schema.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/__tests__/cli-vibe.test.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-06T13:55:37.866Z)
