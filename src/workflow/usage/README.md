# Usage domain handoff (TU1 s1)

Import the internal-shared sc1/sc2 contracts from `./index.js`. `DefaultUsageReducer`
implements the approved `UsageReducer.validate/reduce` interface;
`DefaultUsageAttributionPolicy` implements `UsageAttributionPolicy.validate`.
The module performs no filesystem, provider, database or daemon operations.

Source records remain immutable objects. Central canonicalization defines equality
and digest identity, excluding only local sequence, recorded time and digest.
Every row, including replay, consumes the bounded accounting-group budget. Unknown
versions/kinds remain unsupported; missing counters remain unavailable. Reported
and estimated totals stay separate. Processed totals exclude the separate reasoning
breakdown. Supply explicit correction/reconciliation and ownership evidence; never
infer the winning record from timestamps or use capture IDs for effective grouping.

Every new result includes `effectiveOwners`. The type remains optional for existing
totals-only consumers, preserving the additive HLD amendment. New grouping consumers
must call `requireEffectiveOwners` and handle unresolved/pending states explicitly.
Incomplete closure cannot authorize a destination. Physical consumption is retained
once independently of unresolved assignment. No existing data is rewritten,
converted, backfilled or activated by this addition.

The source-capability survey in `__tests__/fixtures/source-capabilities.v1.json`
records inspected source blobs, local CLI versions and synthetic contract cases.
It does not qualify native leaf visibility, cache partitions or reasoning semantics
without evidence. Loading these schemas does not create an Avro container.

Later stories own IO and authority: s2 resolves roots and stores/query-indexes ledger
facts; s3 coordinates durable transfer facts; s4 supplies capture, trusted closures
and entry-point attribution. Those consumers must validate their own authority and
provide bounded groups plus matching binding/source/closure evidence. The current
module neither discovers roots nor installs capture hooks. Hierarchical delivery
board aggregation remains outside this story.

Validation on 2026-10-26: `npm run build` completed successfully, including tsc,
native process broker/watchdog helpers, model-definition checks and asset copying
(`/tmp/tu1-s1-t11-build.log`). The focused usage plus canonical identity suite
passed 38 tests (`/tmp/tu1-s1-t11-focused-tests.log`); isolated schema tests also
passed on Node 22.22.1 (`/tmp/tu1-s1-t11-node22-packaging.log`). The prior full
backend sweep failed outside usage: 51 of its 58 failed titles reproduced on the
baseline, while seven remain unverified; see
`/tmp/tu1-s1-full-suite-comparison.json`. This is not a full-suite green claim.

User-approved adjustment, 2026-10-27: v1 complete-leaf reconciliation cannot
replace an aggregate. A source capability declaration, observed-record closure
and arbitrary evidence event IDs do not prove invocation-specific native leaf
coverage. The persisted variant stays readable for compatibility, but reduction
returns `native-coverage-unverified:<eventId>` and conflict/unavailable quality,
with no selected contribution. It never silently switches the selected basis.
Use an explicit aggregate-fallback reconciliation (including a successor to a
rejected leaf reconciliation) to retain the aggregate exactly once. A later
contract extension must represent native coverage proof before leaf replacement
can be enabled. This restriction was chosen explicitly by the user after review;
it supersedes the earlier planned complete-leaf acceptance behavior for v1.
