<!-- insrc:artifact BUILD-639cd2159a87aedb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-27T15:48:50.509Z  ·  **Updated:** 2026-11-27T15:48:50.509Z

**Commit:** 24e76224e

## Summary

Epic impact: covers Story s1 -- s1 built and landed sc1/sc2 matching their HLD interfaceSketches exactly, leaving s2's own contract (sc3) as a pure placeholder refusal with no read-only buildArgv branch and no readOnly field. This Task adds the ReadOnlyCapability type (status, allowedTools, reason?, provenAgainst: { stableDescriptorHash, effectiveConfigFingerprint }) matching sc3's amended shape (per s2's own LLD section 4.1, not the HLD's stale field names), plus a module-level qualification cache keyed by stableDescriptorHash, empty at module load. No behavior wiring yet. Left out: the stableDescriptorHash computation itself and the cache-population wiring are t2/t3/t4's scope, not this Task's -- the test added here proves the cache's own empty-at-load and generic Map hit/miss mechanics using a stand-in key; the "excludes outputDir" hash semantics the Task's named test also describes will be proven against the real stableDescriptorHash function once t2 lands.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t1.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t2.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t3.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t4.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t5.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t6.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t7.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.json` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.log.jsonl` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` — **insrc-build** (2026-11-27T15:48:50.509Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-27T15:48:50.509Z)
