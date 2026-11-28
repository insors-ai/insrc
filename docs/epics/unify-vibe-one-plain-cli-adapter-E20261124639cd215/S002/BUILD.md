<!-- insrc:artifact BUILD-639cd2159a87aedb-s2 -->

# Build (plan-driven) — Story s2

**Standalone:** no  ·  **Created:** 2026-11-27T15:48:50.509Z  ·  **Updated:** 2026-11-27T17:07:57.666Z

**Commit:** 5ab9b4709

## Summary

Epic impact: covers Story s1 -- s1 built and landed sc1/sc2 matching their HLD interfaceSketches exactly. This Task is non-code: it files the HLD amendment proposal for sc3's provenAgainst field rename as a tracked artifact. A first attempt (via s6's own round-2 design.story round) used the wrong amendment type (sharedContract.rename, which renames a shared CONTRACT's own display name, not a field inside its interfaceSketch) and was silently dropped by the orchestrator's dry-run against the applier (caught in a try/catch that logs a warning and continues past a bad proposal rather than failing the LLD) -- confirmed by direct listing of .insrc/artifacts/AMD-* showing nothing was ever written, despite the step having been accepted into the LLD body. Direct re-read of src/workflow/amendments/types.ts and applier.ts identified the correct type: sharedContract.fieldRemove (contractId 'sc3', fieldName 'provenAgainst', breaking: true, migrationCue naming the replacement shape and citing s2's LLD section 4.1). Re-ran s6's design.story a third round with this corrected amendment, synthesized, and the user approved it. Directly verified afterward: .insrc/artifacts/AMD-639cd2159a87aedb-1.json now exists on disk, containing the correctly-typed sharedContract.fieldRemove amendment with its rationale citing both s2's LLD section 4.1 and s6's own reconciliation work -- this is the tracked artifact the Task's acceptance checks require. Committed and pushed (commit 5ab9b4709, carrying the Insrc-Story trailer). Left out: the amendment itself is not yet separately approved/rejected (it is 'draft'/pending in its own lifecycle) -- the Task's acceptance checks require it be FILED as a tracked artifact, not that its own approval decision be made; that is a separate governance act outside this Task's scope.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`
- ✓ `t5`
- ✓ `t6`
- ✗ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t1.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t2.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t3.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t4.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t5.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t6.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASK-639cd2159a87aedb-s2-t7.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/TASKS-639cd2159a87aedb-s2.log.jsonl` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/shared/vibe-adapter.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/shared/__tests__/vibe-adapter-readonly-dispatch.test.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/agent/providers/__tests__/cli-provider-readonly-vibe.test.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `src/agent/providers/cli-provider.ts` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/AMD-639cd2159a87aedb-1.json` — **insrc-build** (2026-11-27T17:07:57.666Z)
- `.insrc/artifacts/AMD-639cd2159a87aedb-1.log.jsonl` — **insrc-build** (2026-11-27T17:07:57.666Z)
