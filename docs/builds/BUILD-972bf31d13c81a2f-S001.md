# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-08-06T12:52:36.988Z

## Scope

Auto-fall-back to the diff-based code review when graph grounding is unavailable or hollow: in src/mcp/code-review-step/handler.ts handleStart, on a proceed:true freshness block-poll TIMEOUT and on a fresh-but-empty grounding (grounding.symbols.length === 0), call the existing beginDiffOnlyReview (groundingMode:'degraded') instead of re-prompting confirm_wait or emitting a hollow full review; preserve the initial confirm_wait prompt and the proceed:false decline.

## Triage rationale

Standalone small enhancement: two inline control-flow guards in an existing MCP step handler; the diff-only review path already exists (beginDiffOnlyReview), so only the automatic trigger is wired.
