<!-- insrc:artifact BUILD-00d80121c593053c-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-15T09:07:53.194Z  ·  **Updated:** 2026-10-15T09:31:33.572Z

**Commit:** 2c3b52fa

## Summary

Diffs in the chat's diff widget are coloured by syntax and open the file at the clicked line. highlight.js core plus a fixed language subset is bundled as its own generated module (webview-hljs.ts, 69 KB of a 250 KB budget) and loaded in the chat shell only; each side of a diff section is tokenised separately and the lines are built from text nodes and class-named spans, never assigned markup, with a plain-text fallback. Token colours reuse the chat's existing theme variables. A diff line or the header path posts open-code-ref through the links story's sink and host opener. One departure from the LLD wording, approved in the plan: the shared fake DOM gained a textOf helper instead of a children-joining textContent getter, because the getter change broke 11 unrelated UX-card tests. Live checks were run by the user in VS Code; scope in the evidence.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-00d80121c593053c-S001.json` — **insrc-build** (2026-10-15T09:31:33.572Z)
