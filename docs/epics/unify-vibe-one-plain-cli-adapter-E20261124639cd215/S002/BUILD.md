<!-- insrc:artifact BUILD-639cd2159a87aedb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-27T15:48:50.509Z  ·  **Updated:** 2026-11-27T15:54:19.794Z

**Commit:** d8e838eea

## Summary

Epic impact: covers Story s1 -- s1 built and landed sc1/sc2 matching their HLD interfaceSketches exactly, leaving s2's own contract (sc3) as a placeholder. This Task adds buildArgv's mode:'read-only' branch (emits exactly the two connector_insrc_* --enabled-tools flags, never an approval flag regardless of request.approval) and stableDescriptorHash (resolved binary content identity via path+size+mtime, buildArgv's own argv with --output-dir excluded, the adapter's pinned env subset, and cwd). Added a test-only export, _buildArgvForTests, so tests can observe buildArgv's real output directly (buildArgv itself stays unexported in production, consistent with the module's existing test-seam pattern such as _readOnlyQualificationCacheForTests). Left out: resolving the binary via a full content hash (read+hash the whole binary) rather than path+size+mtime -- the lighter stat-based identity avoids re-hashing a potentially large binary on every read-only dispatch while still changing on any install/upgrade; this is a design judgment call disclosed here, not hidden.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t1.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t2.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t3.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t4.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t5.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t6.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t7.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.json` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.log.jsonl` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-27T15:54:19.794Z)
- `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` — **insrc-build** (2026-11-27T15:54:19.794Z)
