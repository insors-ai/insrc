<!-- insrc:artifact BUILD-639cd2159a87aedb-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-11-26T10:45:17.862Z  ·  **Updated:** 2026-11-26T16:10:29.292Z

**Commit:** fd6fb328a

## Summary

Four rounds of external code review against the completed build (t1-t7) found and fixed 8 real production bugs in src/shared/vibe-adapter.ts and its call sites, none of which this Story's own plan had scoped as Tasks: (1) explicit Vibe chat launched the wrong binary name with the new plain-CLI argv; (2) an exit/close race could finalize on partial stdout and drop a trailing unterminated journal line; (3) removing the old dispatchState retry guard let an edit session replay an already-possibly-mutated turn; (4) history bridging dropped reasoning events and tool-result pairings; (5) cancellation/deadline handling had multiple gaps (checked only post-spawn, not during drain, not during output extraction); (6) extraction-phase parsing failures were wrongly treated as non-retryable; (7) complete()/completeStructuredVibe() inherited the installed CLI's own accept-edits-by-default config instead of explicitly denying tool execution, letting an ordinary completion silently mutate files before an unsafe retry; (8) runVibeTurn could crash the host with an unhandled rejection on an ordinary, fully-handled CLI failure, and the fix for that then risked masking a genuine callback failure as success. All 8 are fixed with regression tests (commits 87b6555ea, bbf649c9c, 5543338ad, fd6fb328a), live-verified against the real installed vibe 3.1.4 binary where behavior was uncertain. The transport contract test was itself strengthened during review round 2 (finding 5): it now scans every production .ts file under src/ and vscode-plugin/src/ rather than 4 hardcoded files, which renamed its second case's title (reflected in the test mapping below). t7's own disclosed gap stands, narrowed by round 2: the full relevant sweep is not 100% green, but every remaining failure is pre-existing/unrelated (Kotlin/native/chat-theme suites) -- the cli-adapter.test.ts gap this packet originally disclosed here is now closed. One documentation-only item remains open and is NOT a code defect: the approved LLD's ac4 wording ("two attempts", a typed error) still doesn't match the intentionally-preserved, pre-existing three-attempt/generic-Error structured-retry behavior -- disclosed for the user's decision at approval (accept-with-note, or a follow-up LLD amendment), not something this build or its review-response rounds could fix off-ledger.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/shared/__tests__/vibe-adapter.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/__tests__/vibe-adapter-live.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/__tests__/vibe-adapter-turn.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter-vibe-import.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `vscode-plugin/src/chat/__tests__/vibe-session-process.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `vscode-plugin/src/chat/cli-adapter.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `vscode-plugin/src/chat/vibe-session-process.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/__tests__/cli-provider-vibe-import.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/__tests__/structured-retry-vibe-adapter-refusal.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/structured-output.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/__tests__/cli-provider-vibe-adapter.live.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/__tests__/vibe-adapter-output-modes.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/__tests__/fixtures/vibe-selection-smoke.mjs` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/__tests__/vibe-session.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/vibe-session.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/__tests__/cli-vibe.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/agent/providers/__tests__/structured-retry-vibe-refusal.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/daemon/tools/__tests__/helpers/review-shell-worker.mjs` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `vscode-plugin/src/__tests__/packaging.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `src/shared/__tests__/no-vibe-session-transport.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
- `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — **insrc-build** (2026-11-26T16:10:29.292Z)
