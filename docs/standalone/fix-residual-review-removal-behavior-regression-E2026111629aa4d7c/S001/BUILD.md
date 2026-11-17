<!-- insrc:artifact BUILD-29aa4d7c79b9741c-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-16T16:01:01.310Z  ·  **Updated:** 2026-11-16T16:22:40.607Z

**Commit:** 35729b084

## Scope

Fix all four defects recorded in approved ISSUE-29aa4d7c79b9741c: conversion informational-review comparison, immediate code-family errors with no transport, workflow guidance without review requirements, and selective repair of mixed regression suites preserving non-review guards. Preserve historical data and existing endpoint schemas; run affected workflow/MCP suites and typecheck; report unrelated failures. No automated review or daemon restart.

## Summary

All four findings fixed in ae04a3bba, with follow-up test-isolation fix 35729b084 after the first daemon validation found two MCP process lsof failures absent in local runs. Reproduced those failures by launching tests from a parent with a temporary LMDB store open: native descriptors are inherited before application code starts. Test-only preload now closes inherited store descriptors before imports; actual child-opened stores still fail existing assertions. Added regression proving child isolation and parent store preservation; the open-store-parent reproduction now passes all four MCP process tests. Earlier local changed-file suite:117/117 passed, build with packaged attestation passed, typecheck passed. Broad workflow/MCP:2313 tests,2307 passes,5 failures,1 skip; stale TESTS fixture assertion subsequently corrected and passes. Four known unrelated failures remain (writer inventory, convert-preview async rejection, range-base unawaited assertions, tracker github argv). They are outside this issue; no checks waived. Human approval/team ownership/denial/integrity/task checks remain. No review endpoint called, CR fabricated, or installed daemon restarted.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-29aa4d7c79b9741c.json` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `.insrc/artifacts/ISSUE-29aa4d7c79b9741c.log.jsonl` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `docs/standalone/fix-residual-review-removal-behavior-regression-E2026111629aa4d7c/ISSUE.md` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/daemon/__tests__/workflow-rpc.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/daemon/steps/build-step/__tests__/trivial-change-e2e.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/daemon-stream-utf8.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/present-steering.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/repo-schema-guard.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/review-unavailable-clients.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/shared/review-stream.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/__tests__/artifact-kinds.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/__tests__/gate-approve.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/__tests__/gate-guarded-entry-points.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/__tests__/helpers/other-party-review.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/__tests__/helpers/valid-code-review.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/__tests__/spec-review-approve.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/artifact-core/__tests__/automated-writers-addresses.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/artifact-write-inventory.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/convert/__tests__/convert-verify.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/convert/__tests__/legacy-view.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/convert/__tests__/repair-backfill-issue.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/convert/__tests__/repair-kit.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/convert/__tests__/repair-settle.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/convert/legacy-view.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/delivery/__tests__/gate.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/delivery/__tests__/snapshot.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/team/__tests__/signoff-revise.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/team/__tests__/signoff.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/team/__tests__/team-gates-async.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/workflow/team/__tests__/team-gates-denial.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/fixtures/close-inherited-stores.mjs` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/helpers/mcp-e2e.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
- `src/mcp/__tests__/mcp-inherited-stores.test.ts` — **insrc-build** (2026-11-16T16:22:40.607Z)
