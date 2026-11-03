<!-- insrc:artifact BUILD-6d0a66b136a135dd-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-29T14:49:17.098Z  ·  **Updated:** 2026-10-29T14:53:47.778Z

**Commit:** 36a0a9974

## Scope

Two daemon-threading tests fail under full-sweep load because they guess at timing instead of checking the property they name. (1) src/daemon/threads/__tests__/s3-acceptance.test.ts ac1 asserts session B answered within 2000 ms while A spins 4 s; the Story's LLD (86197ac6 S003 ac1) says A spins 5 s and B is answered BEFORE A's ends. Under load B's first request (which starts a new worker) took 2-3.9 s, still before A ended. Fix: spin 5 s and assert B's reply arrives before A's. (2) src/daemon/threads/__tests__/router-session.test.ts "one session's three requests reach its worker in arrival order" waits a fixed 30 ms then expects the first request started; under load the log was still empty. Fix: wait for the event (the existing `until` helper) before each positive check, keeping the fixed waits only before the "has not started" checks. Test-only; no production change; s4 ac5's 100 ms p99 bound is the acceptance criterion itself and stays.

## Triage rationale

Test-only, mechanical: two assertions in two test files change from fixed-delay guesses to waiting on the event they check, using the existing `until` helper and the LLD's own ac1 wording (B answered before A's spin ends). No production code, no contract, no design choice. Grounded by reading both files directly (a plain lookup; no relationships involved).

## Summary

ac1 now checks its LLD row: A spins 5 s and B is answered before A's spin ends (no fixed bound, since B's first request also starts its worker). The router arrival-order test waits for each start with until() and keeps fixed waits only before the "has not started" checks. Both files pass 26/26 alone and 3/3 runs under 10 busy-loop processes; s4 ac5's 100 ms p99 bound is unchanged.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/threads/__tests__/router-session.test.ts` — **insrc-build** (2026-10-29T14:53:47.778Z)
- `src/daemon/threads/__tests__/s3-acceptance.test.ts` — **insrc-build** (2026-10-29T14:53:47.778Z)
