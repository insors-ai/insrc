<!-- insrc:artifact BUILD-1716f77ba9ba017b-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-05T09:32:49.002Z  ·  **Updated:** 2026-10-05T10:59:13.107Z

**Commit:** 1739ed1

## Summary

Build of review routing to the other party (ISSUE-1716f77b), tasks t1-t12. t12 evidence, 2026-10-05. DONE: a real daemon review of a controller-authored DEF was timed. Subject: a copy of DEF-9b72686c1746af2b (17.5 KB, authored with model label 'client'), reviewed through the new workflow.review handler from the working tree with the review role's provider (cli-claude:opus), probes reading this repo; the real artifact was not modified. Result: done frame after 777 s (12 min 57 s), verdict block, 0 HIGH / 11 MED / 10 LOW, 1 fix applied, reviewedBy daemon stamped on the review. First pass 399 s over 19 premises; the applied fix triggered the re-review, 378 s over 21 premises. The provisional 10 minute wait limit does NOT fit: it would have aborted this review. The limit for a non-design artifact was raised to 30 minutes (commit 1739ed1); the 11 minute limit for an HLD or LLD is unchanged. NOT DONE, and why: running insrc_review_step and insrc_code_review_step end to end on real controller-authored work, and approving one such artifact with no override, need the new code in the installed daemon and in the MCP server of the session; that requires a push to origin/main and a daemon update and restart, which wait for the user's go-ahead. The daemon's code review of this Story (installed daemon, codeReview.run, 179 s, full grounding, 74 changed files) returned warn: 0 HIGH / 1 MED / 6 LOW. Test results run by the controller under Node 22: workflow + MCP + daemon + CLI-service suites 2146 pass, 0 fail, 14 skipped; full repository sweep 4584 pass, 2 fail (both SqliteDriver via pool, a data-driver test this build does not touch), 115 skipped. t9 file list: 29 test files call an approval function; 22 migrated onto the shared helper, 3 tests rewritten to the new rule in t10, 6 not applicable (see the t10 summary in git history, commit 84777b7 and 325e431).

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
- ✗ `t12`

## Changes

- `.insrc/artifacts/PLAN-1716f77ba9ba017b-S001.json` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/daemon/__tests__/code-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/daemon/__tests__/workflow-review-rpc.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/daemon/__tests__/workflow-rpc.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/daemon/code-review-rpc.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/daemon/workflow-review-rpc.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/daemon/workflow-rpc.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/__tests__/review-rule-text.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/__tests__/review-stream.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/build-step/__tests__/build-start.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/build-step/__tests__/build-step.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/build-step/__tests__/standalone-implement.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/build-step/phases/implement.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/build-step/phases/validate.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/code-review-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/code-review-step/__tests__/routing.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/code-review-step/__tests__/ux-handler.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/code-review-step/handler.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/code-review-step/types.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/daemon-stream.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/__tests__/review-step-findings.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/__tests__/review-step-routing.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/__tests__/review-step.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/handler.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/phases/findings.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/phases/start.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/review-step/types.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/amendments-e2e.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/define-extend-e2e.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/design-epic-e2e.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/design-story-e2e.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/handler.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/plan-e2e.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/questions-gate-e2e.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/tracker-e2e.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/__tests__/tracker-tasks-coarse.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/mcp/workflow-step/phases/synthesize.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/adjacent-scope-gate.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/approve-build-completion.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/approve-build-record-completion.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/approve-codereview-gate.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/approve-workflow-target.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/author-stamp.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/bugfix-orchestration.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/chain.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/companion-validation-gate.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/er-companion-finalize.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/gates.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/helpers/other-party-review.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/other-party-review-gate.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/other-party-review-helper.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/plan-gate.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/__tests__/scope-extend.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/code-review/__tests__/runner.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/code-review/author.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/code-review/runner.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/gates.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/review/__tests__/party.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/review/__tests__/same-party-refusal.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/review/index.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/review/party.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/runners/build/__tests__/build-record.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/runners/build/__tests__/completion-record.test.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/runners/build/standalone-record.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `src/workflow/types.ts` — **insrc-build** (2026-10-05T10:59:13.107Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-05T10:59:13.107Z)
