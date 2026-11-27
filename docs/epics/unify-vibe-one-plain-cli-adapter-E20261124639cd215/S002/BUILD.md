<!-- insrc:artifact BUILD-639cd2159a87aedb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-27T15:48:50.509Z  ·  **Updated:** 2026-11-27T16:46:56.919Z

**Commit:** 195638509

## Summary

Epic impact: covers Story s1 -- s1 built and landed sc1/sc2 matching their HLD interfaceSketches exactly. This Task replaces readOnlySessionOnce's vibe-branch 'unreachable' throw (the s1 placeholder) with: call startTurn(mode:'read-only'), await its result carrying the deadline already computed by runReadOnlySession's own retry loop, parse the JSON answer, and validate against the caller's schema (validateAgainstSchema, the same contract codexReply already uses for codex's path). A VibeReadOnlyUnavailableError is never caught or reshaped -- it propagates through runReadOnlySession's existing retry loop untouched, surfacing its reason directly to the caller.

Found and fixed a real correctness bug while testing this Task end-to-end: the qualification probe (t3) always dispatches with outputMode:'streaming', but readOnlySessionOnce uses outputMode:'json' -- and since `--output <mode>` was part of the hashed stable-descriptor argv, the descriptor computed at qualification time could NEVER match the one computed at a real json-mode dispatch. This meant the whole read-only feature could never actually work end to end for ANY real caller, only for a hypothetical caller using streaming mode. Fixed at the root: renamed argvExcludingOutputDir to argvExcludingTurnLocalFlags and it now also strips `--output <mode>` -- output mode shapes how a caller reads the response, never which tools a launch profile authorizes, so it belongs out of the descriptor for the same reason outputDir already was. Re-ran the full affected test surface after the fix: vibe-adapter*.test.ts (53 pass, 2 pre-existing skips), cli-provider-vibe-adapter.test.ts + cli-readonly-session.test.ts + this Task's new file (58 pass). Left out: nothing from this Task's own scope; t4's deferred trigger-on-miss (disclosed in t4's build record) means a cold descriptor still reports 'unavailable' rather than proactively qualifying -- this Task's own tests pre-populate the cache directly (as t3's qualification suite would, once something triggers it) rather than exercising that still-open gap.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t1.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t2.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t3.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t4.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t5.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t6.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t7.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.json` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.log.jsonl` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/shared/__tests__/vibe-adapter-readonly-dispatch.test.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/agent/providers/__tests__/cli-provider-readonly-vibe.test.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-27T16:46:56.919Z)
