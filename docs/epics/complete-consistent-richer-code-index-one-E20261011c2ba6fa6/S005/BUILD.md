<!-- insrc:artifact BUILD-c2ba6fa62a148ed1-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-13T11:53:21.419Z  ·  **Updated:** 2026-10-13T11:53:21.419Z

**Commit:** e3612253

## Summary

The local Ollama provider now raises every transport failure (from the call and from inside a stream's iteration) as ModelCallFailedError with the client's error as its cause, and the structured retry helper keeps that type when its last attempt was a failed call.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-13T11:53:21.419Z)
