<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T12:33:07.673Z

**Commit:** 7589466b

## Summary

isModelCallFailure now recognises a failed call by its type or by the provider's own wording at the start of the message ('Model call failed: ' or a CLI wording); Ollama and socket texts quoted inside a message no longer count, and every consumer family still reports a real Ollama outage as the model being unavailable.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T12:33:07.673Z)
