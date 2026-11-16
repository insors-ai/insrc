<!-- insrc:artifact ISSUE-29aa4d7c79b9741c -->

# Fix residual review-removal behavior and regression coverage

## Reproduction

The detailed self-review of removal commits afd5d2e6a through 16a5f85d4 reproduced four defects. [c1]
1. Run conversion repeat/verification over a legacy blocked-review fixture: the recorded verdict/counts are preserved, but verification reports blocking:true before versus blocking:false after. [c2]
2. Call fetchCodeReviewGrounding and fetchCodeReviewFreshness with an injected connector that increments a counter and throws: each attempts one connection and rejects with 'Design review functionality is being rewritten.' Expected: zero connections and 'Code review functionality is being rewritten.' [c1]
3. Finalize a workflow with review:true: its review-skipped progress still directs the caller to insrc_review_step or an approval override, despite reviews being unavailable. [c1]
4. Run npx tsx --test --test-force-exit --test-concurrency=4 --test-timeout=15000 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts': 2263 passed, 34 failed, 1 skipped. Mixed team guard suites fail loading removed review-fix exports, and several tests still require dismantled behavior. Not all 34 failures are established removal regressions. [c2]

## Root cause

The removal changed current delivery review blocking to informational, but the legacy conversion projection and comparison still use the former gating semantics. The exported MCP client grounding/freshness helpers retain unary transport calls, then invoke shared response/error adapters using the default design-family rewrite error. Executable workflow progress retains its old instruction to seek an independent review. Test retirement updated selected suites without repairing all mixed fixtures/imports/assertions; removed exports prevent unrelated guard and tracker-denial cases from loading. [c1][c2] The analyzer's dependency graph was stale/incomplete and still named deleted review modules; current source, direct injected-dependency reproduction and test output provide the evidence rather than graph completeness. [c3] Conversion projection/comparison are grounded in [c5][c6], the exported client helpers in [c7], and executable workflow guidance in [c8]; filesystem-backed module profiles confirmed those paths.

## Fix intent

Correct all four residual defects within the approved review-removal behavior. Conversion must compare historical records consistently as informational while preserving verdicts, counts and stored data. Both exported code-review helpers must reject immediately with the exact code-family rewrite error and never invoke transport or review dependencies. Workflow progress and associated active guidance must communicate review unavailability and ordinary explicit human approval. Repair removal-related test imports, fixtures and obsolete expectations selectively; preserve non-review approval, team ownership, tracker-denial, integrity, upstream, build/task and historical-read checks. Add or retain meaningful regressions for each defect, run the affected workflow/MCP suites and production typecheck, and distinguish any remaining unrelated failures. Do not restore review execution, fabricate a CR, update/restart the installed daemon, or alter unrelated work. [c1][c4]

## Citations

- **[[c1]]** `step-output` `Detailed self-review and direct source/connector reproductions in this conversation, 2026-11-16`
- **[[c2]]** `doc` `/tmp/insrc-detailed-self-review-workflow.log`
- **[[c3]]** `analyze-bundle` `insrc_analyze_step self-review dependency context; repo index timestamp 2026-11-15T14:40:23.648Z; incomplete/stale result`
- **[[c4]]** `stakeholder` `User: fix all identified issue; four findings from the preceding detailed self-review`
- **[[c5]]** `code` `src/workflow/convert/legacy-view.ts:105`
- **[[c6]]** `code` `src/workflow/convert/verify.ts:54`
- **[[c7]]** `code` `src/mcp/daemon-stream.ts:338`
- **[[c8]]** `code` `src/daemon/workflow-rpc.ts:114`
