<!-- insrc:artifact BUILD-e48e33ae6af03720-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-16T17:39:07.303Z  ·  **Updated:** 2026-10-17T06:01:57.191Z

**Commit:** f141774d

## Scope

Both codex paths of CliProvider (structured completion src/agent/providers/cli-provider.ts:274-278 and review session :386-390) send codex the strict form of the caller's schema, produced by the existing processSchemaForOpenAIStrict (src/agent/providers/structured-output.ts:266) on a copy, so the caller's schema object is unchanged. A test shows a schema without additionalProperties reaches codex's --output-schema file in strict form in both paths and the caller's schema is not modified. Implements ISSUE-e48e33ae6af03720.

## Triage rationale

bugfix/small: one file, reuses the existing strict-schema helper, one test.

## Summary

This Story's own change is dd771653 only: both codex paths of CliProvider write codexSchemaJson(schema) = processSchemaForOpenAIStrict(structuredClone(schema)) to --output-schema; test src/agent/providers/__tests__/cli-codex-strict-schema.test.ts (fake codex records the schema file; three falsifying mutations each fail it). Its recorded range (from ca2c1c2e) also contains three later, separately tracked bugfixes that I sequenced after it before this gate passed: ISSUE-ae2d83c6 (687395c8, judge prompts), ISSUE-91640def (08c023de, dcc39996, trivial gate test pick), each with its own ISSUE, gate, code review and approved BUILD, plus their record commits and two --no-ff merges of upstream docs. Those are not this Story's scope. Live: with the daemon on dd771653+, codex accepted the judge schema (no HTTP 400) and every gate since has run on codex.

## Tasks validated

- ✗ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-91640defac1b5816-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/BUILD-ae2d83c6ab06c595-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/CR-91640defac1b5816-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/CR-ae2d83c6ab06c595-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/ISSUE-91640defac1b5816.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/ISSUE-ae2d83c6ab06c595.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/ISSUE-e48e33ae6af03720.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/TESTS-91640defac1b5816-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/TESTS-ae2d83c6ab06c595-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/artifacts/TESTS-c2ba6fa62a148ed1-s1.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/build-start/91640defac1b5816-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `.insrc/build-start/ae2d83c6ab06c595-S001.json` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/TESTS.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/let-build-gate-s-judge-read-E20261016ae2d83c6/ISSUE.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/let-build-gate-s-judge-read-E20261016ae2d83c6/S001/BUILD.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/let-build-gate-s-judge-read-E20261016ae2d83c6/S001/CR.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/let-build-gate-s-judge-read-E20261016ae2d83c6/S001/TESTS.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/run-trivial-build-s-tests-from-E2026101691640def/ISSUE.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/run-trivial-build-s-tests-from-E2026101691640def/S001/BUILD.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/run-trivial-build-s-tests-from-E2026101691640def/S001/CR.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/run-trivial-build-s-tests-from-E2026101691640def/S001/TESTS.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `docs/standalone/send-codex-structured-output-schemas-openai-E20261016e48e33ae/ISSUE.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/daemon/steps/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/daemon/steps/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/daemon/steps/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/daemon/steps/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/daemon/steps/build-step/render.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/daemon/steps/build-step/validation-checks.ts` — **insrc-build** (2026-10-17T06:01:57.191Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-10-17T06:01:57.191Z)
