<!-- insrc:artifact BUILD-f1bf0fb3085c629c-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-08T06:58:00.566Z  ·  **Updated:** 2026-10-08T07:16:08.064Z

**Commit:** 8ff6e576

## Summary

Added src/mcp/build-step/validation-checks.ts (leading-prefix test-file resolution, per-route check plans, runValidationChecks over the process-group runner with --test-force-exit); a review fix keeps deleted test files out of a trivial build's plan.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

## Changes

- `.insrc/artifacts/ISSUE-e2bcadd9b0f63f99.json` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `.insrc/artifacts/LLD-b9d5c5c40df5a574-s1.json` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S001/LLD.md` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `docs/standalone/bug-four-defects-left-code-review-E20261007e2bcadd9/ISSUE.md` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `package-lock.json` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/agent/providers/__tests__/cli-subprocess.live.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/agent/providers/__tests__/cli-subprocess.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/build-step/__tests__/render.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/build-step/__tests__/validation-checks.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/build-step/render.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/build-step/validation-checks.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/code-review-step/__tests__/routing.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/code-review-step/handler.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/review-step/__tests__/review-step-routing.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/review-step/phases/start.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/prompts/build/validate-task.md` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/shared/process-group.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/workflow/review/__tests__/template.test.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
- `src/workflow/review/template.ts` — **insrc-build** (2026-10-08T07:16:08.064Z)
