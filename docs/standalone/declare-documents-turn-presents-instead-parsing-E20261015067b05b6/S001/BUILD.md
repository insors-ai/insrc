<!-- insrc:artifact BUILD-067b05b6892cb212-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-15T11:32:13.593Z  ·  **Updated:** 2026-10-16T05:54:07.541Z

**Commit:** 8e965f38

## Summary

Removed the output-parsing path: presentedPathOf, toolResult on the presented turn, the chat host's tool-result feed, the end-of-turn opening and the start-list state are gone; a turn opens only what it declares through declared(). The presenter, chat host and their tests were rewritten to the declared contract. The Claude live check was run by the user after installing the rebuilt plugin; the Codex chat live check is deferred (the insrc MCP server is not registered in Codex).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-067b05b6892cb212-s1.json` — **insrc-build** (2026-10-16T05:54:07.541Z)
- `docs/standalone/declare-documents-turn-presents-instead-parsing-E20261015067b05b6/S001/PLAN.md` — **insrc-build** (2026-10-16T05:54:07.541Z)
