<!-- insrc:artifact BUILD-639cd2159a87aedb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-27T15:48:50.509Z  ·  **Updated:** 2026-11-27T16:21:47.095Z

**Commit:** 2cfa20ce5

## Summary

Epic impact: covers Story s1 -- s1 built and landed sc1/sc2 matching their HLD interfaceSketches exactly, leaving s2's own contract (sc3) as a placeholder. This Task adds the readOnly field to VibeExecutionAdapter, populated by createVibeAdapter synchronously from the qualification cache's current entry for this adapter's own stable descriptor.

Scope correction, now with CONCRETE regression proof (not just a hypothesis): I first implemented the Task's acceptance check literally -- createVibeAdapter calling qualifyReadOnlyCapability (fire-and-forget) on every cache miss. I then ran s1's OWN existing, already-approved test file (src/shared/__tests__/vibe-adapter-turn.test.ts) against that code and it FAILED: "a request whose signal is already aborted before dispatch spawns nothing and rejects with a real AbortError (review finding 5)" asserts spawnCalls.length===0 for an already-aborted DEFAULT-mode turn -- under the literal self-trigger, that assertion saw 1 instead of 0, because createVibeAdapter runs on EVERY turn's construction (dispatchVibeTurn, cli-provider.ts calls it per turn, not once per provider lifetime) and self-triggering a qualification probe on a cold descriptor calls deps.spawn regardless of whether THIS particular turn is read-only, default, or even already aborted before dispatch. This is a real, reproduced regression against s1's own contract, not a test-isolation nicety. I reverted to: createVibeAdapter's readOnly is a pure, side-effect-free synchronous cache read; triggering a fresh qualification run on a miss is deferred to startTurn's own read-only dispatch path (t5, not yet built), which only runs when a caller actually requests mode:'read-only' -- this is also where the LLD's own edge-case table already says the cache is "always re-checked... at dispatch time (startTurn)". Re-ran vibe-adapter-turn.test.ts after reverting: all 19 tests pass, confirming the regression is gone. The full vibe-adapter*.test.ts suite also passes clean (47 pass, 2 pre-existing skips, 0 fail). Check 2's literal mechanism (trigger AT construction) is not satisfied, but its intent (a cache miss eventually gets qualified, without blocking) is -- just at dispatch time instead, which is both correct per the LLD and the only option that doesn't break s1's existing, approved tests.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t1.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t2.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t3.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t4.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t5.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t6.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t7.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.json` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.log.jsonl` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` — **insrc-build** (2026-11-27T16:21:47.095Z)
- `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` — **insrc-build** (2026-11-27T16:21:47.095Z)
