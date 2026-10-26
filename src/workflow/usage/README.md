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
