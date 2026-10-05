<!-- insrc:artifact BUILD-1716f77ba9ba017b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-05T09:32:49.002Z  ·  **Updated:** 2026-10-05T10:39:49.669Z

**Commit:** 5731a55

## Summary

t11: the steering source (review, code-review and build guides, tool table) and the descriptions of insrc_review_step, insrc_code_review_step and insrc_workflow_approve state the rule in both directions: the party that did not author the work reviews it, the tools route it, the same model on both sides is fine, a failed daemon review is not replaced by a controller review, and approval requires the review. The plugin copy of the steering source is identical to the source.

## Tasks validated

- ✗ `t1`
- ✗ `t2`
- ✗ `t3`
- ✗ `t4`
- ✗ `t5`
- ✗ `t6`
- ✗ `t7`
- ✗ `t8`
- ✗ `t9`
- ✗ `t10`
- ✗ `t11`

## Changes

- `.insrc/artifacts/PLAN-1716f77ba9ba017b-S001.json` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/daemon/__tests__/code-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/daemon/__tests__/workflow-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/daemon/__tests__/workflow-rpc.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/daemon/workflow-review-rpc.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/__tests__/review-rule-text.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/build-step/__tests__/standalone-implement.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/code-review-step/__tests__/routing.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/code-review-step/__tests__/ux-handler.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/code-review-step/handler.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/code-review-step/types.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/__tests__/review-step-findings.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/__tests__/review-step-routing.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/__tests__/review-step.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/handler.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/phases/findings.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/phases/start.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/review-step/types.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/amendments-e2e.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/define-extend-e2e.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/design-epic-e2e.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/design-story-e2e.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/plan-e2e.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/questions-gate-e2e.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/tracker-e2e.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/__tests__/tracker-tasks-coarse.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/mcp/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/adjacent-scope-gate.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/approve-build-completion.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/approve-build-record-completion.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/approve-codereview-gate.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/approve-workflow-target.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/author-stamp.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/bugfix-orchestration.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/chain.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/companion-validation-gate.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/er-companion-finalize.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/gates.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/helpers/other-party-review.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/other-party-review-gate.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/other-party-review-helper.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/plan-gate.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/code-review/__tests__/runner.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/code-review/author.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/review/__tests__/party.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/review/__tests__/same-party-refusal.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/review/index.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/review/party.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-05T10:39:49.669Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-05T10:39:49.669Z)
