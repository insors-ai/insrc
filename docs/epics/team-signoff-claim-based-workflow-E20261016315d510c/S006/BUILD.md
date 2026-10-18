<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:06:54.425Z

**Commit:** dd063c03

## Summary

src/workflow/team/gate.ts now declares ParkOfferProvider and registerParkOfferProvider (shaped like registerCompletionHook; none registered means offerPark is false). A new heldByOther helper builds the held-by-other outcome in both teamGate and claim: it asks the provider with (repo, unit, actor), only on that outcome, and a throwing provider is logged and counts as false. describeOutcome appends "; you have unfinished work here, run 'team park <epicHash> [storyId]' to hand it over" only when offerPark is true. A repo with no policy returns before any provider call or tracker call, as before. The new park-offer.test.ts test shows: no provider gives false; the provider is asked with (repo, story id, actor) and its true/false decides, on teamGate and on claim; a throwing provider gives false; allowed outcomes never ask the provider (call count 0); a no-policy repo makes zero tracker loads and zero provider calls; and the text contains the park command only for offerPark true. The existing team suite (77 tests) and the gate refusal output test pass; tsc is clean.

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:06:54.425Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:06:54.425Z)
