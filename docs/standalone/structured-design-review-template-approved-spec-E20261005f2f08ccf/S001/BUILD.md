<!-- insrc:artifact BUILD-f2f08ccf89f8ab25-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-05T07:36:55.038Z  ·  **Updated:** 2026-10-05T07:56:26.234Z

**Commit:** 8977da0

## Triage rationale

Triage sized this a feature (LLD, plan, build). The plan-driven build route cannot address a standalone feature that has no DEF or ISSUE artifact, so the build ran through the standalone route and followed the approved plan's seven tasks.

## Summary

Built the structured design review template in seven plan tasks (commits 71bdb44, 457ebdd, 94a1794, 4745ea0, 342d516, 14357f2). An HLD or LLD is now reviewed in one read-only reviewer session against a fixed checklist chosen by what the design answers (design-issue: 5 items, at most 8 premises; design-spec: 8 items, at most 16), under one deadline of 4, 6 or 8 minutes by complexity and never more than 10. Findings are identified as holds, does-not-hold or could-not-verify; only does-not-hold blocks approval. The controller review tool has the same template through a new findings phase. DEF, ISSUE and PLAN reviews are untouched: their extraction prompt is pinned byte for byte. CLI probe (t3), live on 2026-10-05: claude and codex each read a file, called insrc analyze, could not write, and returned a schema-checked answer in ONE run (14 s and 42 s), so neither needs a two-run fallback. Timing (t7), live through the non-controller reviewer: the ISSUE design LLD-1716f77b took 153 s against a 4 minute limit and examined 8 premises (verdict block, 3 do not hold, 0 unverified); the SPEC design LLD-f2f08ccf took 166 s against a 6 minute limit and examined 12 premises (verdict block, 2 do not hold, 0 unverified). The defaults fit; no default was changed. The earlier reviewer needed 5 to 27 minutes and 16 to 48 premises on the same kind of document. Tests: 85 new tests; every production change was reverted in turn and caught (87 of 87). Suites run: workflow 1414, MCP 286, CLI 167, agent 82, config 137, VS Code config 42; no failures. Known and not changed: the TUI findings view (listPendingReviewFindings) lists blocking findings only, so a could-not-verify finding appears in the rendered review but not in that view. The second SPEC-design finding (the design document does not name the settings files) is a gap in the design text; the code declares the five settings in the config catalog and the VS Code manifest.

## Tasks validated

- ✗ `S001`

## Changes

- `.insrc/artifacts/CR-f2f08ccf89f8ab25-S001.json` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `.insrc/artifacts/ISSUE-b2e05b043846451c.json` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `.insrc/artifacts/LLD-1716f77ba9ba017b-S001.json` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `docs/standalone/standalone-feature-has-no-definition-artifact-E20261005b2e05b04/ISSUE.md` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `docs/standalone/structured-design-review-template-approved-spec-E20261005f2f08ccf/S001/CR.md` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `docs/standalone/two-sets-eyes-review-rule-only-E202610041716f77b/S001/LLD.md` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/agent/providers/__tests__/cli-review-session.live.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/agent/providers/__tests__/cli-review-session.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/__tests__/schema-registry.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/review-step/__tests__/review-step-findings.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/review-step/handler.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/review-step/phases/claims.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/review-step/phases/findings.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/review-step/phases/start.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/review-step/phases/verdicts.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/review-step/types.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/mcp/server.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/__tests__/outcome.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/__tests__/template-review.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/__tests__/template.test.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/apply.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/index.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/report.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/review.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/run-artifact.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/template-review.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/template.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/types.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `src/workflow/review/verdict.ts` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `vscode-plugin/assets/steering-block.md` — **insrc-build** (2026-10-05T07:56:26.234Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-05T07:56:26.234Z)
