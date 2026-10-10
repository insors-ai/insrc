<!-- insrc:artifact BUILD-008e146ad1475ef9-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-10T14:08:41.695Z  ·  **Updated:** 2026-10-10T14:08:41.695Z

**Commit:** 169e973a

## Summary

Reaching one live data source and listing it are now given one bounded wait in measureConnection: the caller's limit, else the new setting analyzer.dataSourceListingTimeoutMs (120000 ms by default, read fresh for each source by a reader that never throws). A source that does not answer gives a measure that is not determined with the reason that the listing timed out; a cancelled request ends the wait at once, the remaining connections of a pool are not asked, and a signal already aborted reads nothing. The driver's call is abandoned, not stopped; its late rejection is caught and logged at debug level. The three exported measuring functions take the new optional MeasureOptions; no caller passes it yet. Eight falsifying mutations were each caught (one by the test run exceeding its time).

## Tasks validated

- ✓ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-008e146ad1475ef9-S001.json` — **insrc-build** (2026-10-10T14:08:41.695Z)
- `src/analyze/__tests__/measure-pass.test.ts` — **insrc-build** (2026-10-10T14:08:41.695Z)
- `src/analyze/measure.ts` — **insrc-build** (2026-10-10T14:08:41.695Z)
- `src/config/__tests__/config-catalog-contract.test.ts` — **insrc-build** (2026-10-10T14:08:41.695Z)
- `src/config/__tests__/data-source-listing-timeout.test.ts` — **insrc-build** (2026-10-10T14:08:41.695Z)
- `src/config/analyze.ts` — **insrc-build** (2026-10-10T14:08:41.695Z)
- `src/config/config-catalog.ts` — **insrc-build** (2026-10-10T14:08:41.695Z)
