<!-- insrc:artifact BUILD-1716f77ba9ba017b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-05T09:32:49.002Z  ·  **Updated:** 2026-10-05T10:35:57.961Z

**Commit:** 84777b7

## Summary

t10: approveArtifactByJsonPath requires an other-party review (design review for DEF/HLD/LLD, code review for BUILD) and refuses a same-party review, with the existing override; ISSUE/SPEC/PLAN need none. approveWorkflowTarget relies on that refusal for the BUILD no-review rule. t9 file list (search: 29 test files calling approveArtifactByJsonPath/approveWorkflowTarget; a wider search also finds 2 amendment-approval files, amendments/effective-and-staleness and amendments/store, which approve amendments, not artifacts: not applicable). MIGRATED 22: mcp/workflow-step/__tests__ amendments-e2e, define-extend-e2e, design-epic-e2e, design-story-e2e, plan-e2e, questions-gate-e2e, tracker-e2e, tracker-tasks-coarse; workflow/__tests__ adjacent-scope-gate, approve-build-completion, approve-build-record-completion, approve-codereview-gate, approve-workflow-target, chain, companion-validation-gate, er-companion-finalize, gates, plan-gate, scope-extend; mcp/build-step/__tests__ build-start, build-step; workflow/runners/build/__tests__ build-record. REWRITTEN TO THE NEW RULE in t10: workflow/__tests__ bugfix-orchestration (1 test), approve-build-completion (1 test), approve-build-record-completion (1 test). NOT APPLICABLE 6: workflow/__tests__ plan-artifact, review-gate, spec-resolver, spec-review-approve; workflow/review/__tests__ outcome; workflow/runners/build/__tests__ admit-build.

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

## Changes

- `.insrc/artifacts/PLAN-1716f77ba9ba017b-S001.json` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/daemon/__tests__/code-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/daemon/__tests__/workflow-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/daemon/__tests__/workflow-rpc.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/daemon/workflow-review-rpc.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/build-step/__tests__/standalone-implement.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/code-review-step/__tests__/routing.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/code-review-step/__tests__/ux-handler.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/code-review-step/handler.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/code-review-step/types.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/__tests__/review-step-findings.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/__tests__/review-step-routing.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/__tests__/review-step.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/handler.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/phases/findings.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/phases/start.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/review-step/types.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/amendments-e2e.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/define-extend-e2e.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/design-epic-e2e.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/design-story-e2e.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/plan-e2e.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/questions-gate-e2e.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/tracker-e2e.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/__tests__/tracker-tasks-coarse.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/mcp/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/adjacent-scope-gate.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/approve-build-completion.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/approve-build-record-completion.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/approve-codereview-gate.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/approve-workflow-target.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/author-stamp.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/bugfix-orchestration.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/chain.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/companion-validation-gate.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/er-companion-finalize.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/gates.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/helpers/other-party-review.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/other-party-review-gate.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/other-party-review-helper.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/plan-gate.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/code-review/__tests__/runner.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/code-review/author.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/review/__tests__/party.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/review/__tests__/same-party-refusal.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/review/index.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/review/party.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-05T10:35:57.961Z)
