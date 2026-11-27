<!-- insrc:artifact BUILD-639cd2159a87aedb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-27T15:48:50.509Z  ·  **Updated:** 2026-11-27T16:39:53.038Z

**Commit:** 3af58216d

## Summary

Epic impact: covers Story s1 -- s1 built and landed sc1/sc2 matching their HLD interfaceSketches exactly. This Task replaces startTurn's mode:'read-only' placeholder throw with real dispatch: re-check the qualification cache fresh by stableDescriptorHash at dispatch time (never trusting readOnly's construction-time snapshot, matching the LLD's own edge-case wording that the cache is "always re-checked... at dispatch time"), dispatch via runTurn (s1's own real-dispatch path, reused unchanged -- buildArgv's read-only branch from t2 applies automatically since request.mode is 'read-only'), throw VibeReadOnlyUnavailableError with the cached reason before any process spawns when unavailable. The post-dispatch fingerprint check wraps runTurn's own injectable `rm` cleanup seam (reading export.json's fingerprint before the real cleanup deletes it) rather than modifying runTurn or any s1-owned type, since rm runs in runTurn's own finally AFTER resolveResult/rejectResult already settled -- the mismatch invalidates the cache for the NEXT call only, never the current call's own already-returned result. Left out: nothing from this Task's scope; t4's deferred trigger-on-miss (disclosed in t4's own build record) is NOT addressed here either -- it still requires a design decision about who proactively re-qualifies a cold descriptor, which this Task's own scope (dispatch-time recheck of an EXISTING cache entry) does not cover.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t1.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t2.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t3.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t4.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t5.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t6.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t7.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.json` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.log.jsonl` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` — **insrc-build** (2026-11-27T16:39:53.038Z)
- `src/shared/__tests__/vibe-adapter-readonly-dispatch.test.ts` — **insrc-build** (2026-11-27T16:39:53.038Z)
