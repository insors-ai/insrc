<!-- insrc:artifact BUILD-c32aa60534232f36-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-29T13:24:51.323Z  ·  **Updated:** 2026-10-29T18:21:53.906Z

**Commit:** dc8c3797f

## Summary

S6 implementation tasks 1–14 are built: pinned canonical investigation routing/evidence/recovery/publication, scoped native/controller transport, truthful status/usage, concurrency-safe replay, gated adoption/rollback and independently approved deterministic evaluation. Final focused affected sweep: 198/199 initially, sole Node22 worker-fixture loader corrected and affected file passed4/4; production build passed. One formal independent legacy code-review round was attempted (run cr-1793296975633-jatc2k): chunk1 succeeded291295ms, chunk2 timed out300000ms, no CR or verdict written, and no review rerun. A subsequent reproduced native restart EEXIST edge case was fixed within t14 using per-invocation capability files/private environment selection; actual MCP stdio entry and both scripted CLI adapters passed focused regressions, rebuilt production and compiled stdio smoke passed. Completion needs explicit review override or separate user authorization for another review. Activation remains disabled/default legacy: installed Claude2.1.310/Codex0.164.0 lack independent installed-probe certification, production readiness/oracle reports are not approved, and AMD-8315a11f29fd2812-1 remains pending. No live comparison, default flip, push or automatic approval.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`
- ✓ `t12`
- ✓ `t13`
- ✗ `t14`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/shared/__tests__/review-investigation.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/shared/review-investigation.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-work.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-work.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-evidence.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-evidence.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-impact.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-service.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-descriptor.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-service.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/shared/review-runtime-paths.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-bridge.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/mcp/__tests__/review-investigation-bridge.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/mcp/review-investigation-bridge.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/__tests__/investigation-session.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/investigation-session.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/ollama.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/shared/review-investigation-catalog.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/shared/types.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/__tests__/claude-investigation-session.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/claude-investigation-session.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/bin/insrc-review-bridge.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/mcp/review-investigation-native.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/__tests__/codex-investigation-session.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/__tests__/native-investigation-fixtures.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/codex-investigation-session.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/native-investigation-session.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-repository.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-controller.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-gateway.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-repository.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/steps/code-review-step/handler.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/mcp/__tests__/schema-registry.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/mcp/review-budget-schema.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/shared/review-controller-budget-schema.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/shared/review-investigation-wire.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-status.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-status.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-crash-worker.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-fixtures.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-recovery.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `.insrc/artifacts/AMD-8315a11f29fd2812-1.json` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `.insrc/artifacts/AMD-8315a11f29fd2812-1.log.jsonl` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `docs/review-investigation.md` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-adoption.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-adoption.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/steps/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/fixtures/review-evaluation-baseline.v1.json` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/fixtures/review-evaluation-oracle.v1.json` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-evaluation.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-approval.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/review-investigation-evaluation.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/agent/providers/native-investigation-installation.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/__tests__/review-investigation-installation.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/installed-commit.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/threads/__tests__/helpers/method-class-worker-bootstrap.mjs` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/daemon/threads/__tests__/method-class.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
- `src/mcp/__tests__/review-investigation-native-restart.test.ts` — **insrc-build** (2026-10-29T18:28:44.517Z)
