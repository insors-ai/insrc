<!-- insrc:artifact BUILD-0765b3a578e43eec-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-24T04:53:33.388Z  ·  **Updated:** 2026-11-26T08:40:42.401Z

**Commit:** 015898b0e

## Summary

The confirm_wait token-forgery fix adds t5's own 'security-review' kind to the daemon's SHARED step-state store (src/daemon/threads/step-state.ts) -- the same registry insrc_workflow_step's own state-store.ts already uses for identical opaque-continuation-token purposes; this is the idiomatic, established mechanism for this exact need, not a one-off. The durable degraded-disposition fix threads a `degraded` field through t4's own SecurityReviewReport/runSecurityReview contract (run-security-review.ts), the only place that owns the report object this Task needs to carry the flag on; t4 was independently re-validated passing (all 10 of its own acceptance checks hold) after this change. This turn also removed a duplicate local containment check in favor of actually calling run-security-review.ts's own exported assertTargetsContained. No sibling Task's own behavior changed; t2/t3/t4 were each independently re-validated passing after these commits.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✗ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/security-review/__tests__/run-security-review.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/run-security-review.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/__tests__/security-round-hooks.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/security-round-hooks.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/agent/providers/__tests__/capability-qualification.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/agent/providers/__tests__/cli-readonly-session.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/agent/providers/capability-qualification.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/agent/providers/ollama.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/__tests__/run-security-review-orchestrator.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/__tests__/handle-security-review-step.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/handle-security-review-step.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/steps/__tests__/security-review-step.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/steps/__tests__/step-host.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/steps/host.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/steps/security-review-step.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/threads/router.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/mcp/__tests__/mcp-process-e2e.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/mcp/__tests__/schema-registry.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/mcp/server.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/shared/step-context.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/content-identity.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/mcp/__tests__/tool-allowlist.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/threads/step-state.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/mcp/__tests__/fixtures/tool-surface.golden.json` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/mcp/__tests__/forward-step.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/daemon/threads/__tests__/step-state.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
- `src/workflow/security-review/__tests__/content-identity.test.ts` — **insrc-build** (2026-11-26T08:40:42.401Z)
