<!-- insrc:artifact BUILD-639cd2159a87aedb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-27T15:48:50.509Z  ·  **Updated:** 2026-11-27T16:09:25.450Z

**Commit:** a22553737

## Summary

Epic impact: covers Story s1 -- s1 built and landed sc1/sc2 matching their HLD interfaceSketches exactly, leaving s2's own contract (sc3) as a placeholder. This Task adds the live qualification suite: dispatchQualificationProbe (a standalone probe dispatcher, deliberately separate from s1's runTurn since it must read export.json before tempDir is removed and needs none of runTurn's cancellation/deadline/process-group machinery), structural catalog evidence from a single probe's own export.json (config.enabled_tools -- live-confirmed field, --enabled-tools disables everything else by construction so this one field proves both required-tool presence and bypass absence), the bounded-retry allow-side completion check, and effectiveConfigFingerprintFrom. qualifyReadOnlyCapability coalesces concurrent calls per stable descriptor via an in-flight-promise map. Live-verified against the real installed vibe 3.1.4 binary: the insrc MCP connector is requested correctly (config.enabled_tools lists it) but is not actually reachable in this environment -- the suite correctly resolves 'unavailable' naming that exact reason, the explicit accepted terminal outcome this design anticipates (review r3 finding 4), not a defect. Left out: a separate real-write probe for the no-mutation proof (ac4) -- per the LLD's own design, structural catalog evidence alone proves it without ever risking an actual mutation, so no disposable write path was built.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t1.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t2.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t3.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t4.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t5.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t6.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t7.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.json` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.log.jsonl` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` — **insrc-build** (2026-11-27T16:09:25.450Z)
- `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` — **insrc-build** (2026-11-27T16:09:25.450Z)
