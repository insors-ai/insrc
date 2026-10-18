<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:09:55.658Z

**Commit:** 71f2da1e

## Summary

state-store.ts: Entry gains meta (RunEntryMeta { owner?, upstream?: UpstreamRevision[] }, both exported); saveState(payload, meta?) stores it beside payload, createdAt and touchedAt; replaceState reads the previous entry's meta before saving (so a sweep cannot lose it) and passes it to the replacement; new listStates() returns live entries newest touch first (ties by createdAt), leaves out entries past the TTL without deleting them, and does not modify any touchedAt. state.ts: encodeState(payload, meta?) passes meta to saveState; reencodeState is unchanged and goes through replaceState, so it preserves meta. Token format and payload shape are unchanged. The new test shows meta stored by encodeState and returned by listStates, carried through reencodeState and replaceState (and the superseded token released), an entry saved without meta has meta undefined and no owner before and after replaceState, listStates orders a, c, b by touch with a fake clock, repeated listing changes no touchedAt, and a stale entry is not listed but is still loadable (not swept). The whole workflow-step suite (73 tests) passes; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:09:55.658Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:09:55.658Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:09:55.658Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:09:55.658Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:09:55.658Z)
