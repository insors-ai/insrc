# Resource study method

Run explicitly on supported Node 22, outside the regression glob:

```sh
/opt/homebrew/opt/node@22/bin/node --import tsx \
  packages/project-memory/src/__tests__/fixtures/store-resource-study.ts \
  /absolute/path/to/resource-report.json
```

The script creates and removes its own independently owned temporary store/queue;
there are no model calls or runtime configuration edits. Progress is appended to
`<report>.progress.jsonl`. A failure writes `complete:false` and exits unsuccessfully.
Only a complete report with all assertions passing closes the study gate.

Corpus creation uses real admitted frames, production guarded commits and durable
queue ACKs. Batches add up to 1,000 current records plus complete source/revision/
evidence relationships. Measurements start with exactly 0, 1,000 and 10,000 current
records; five new-record commit samples add five records at each stage. Filling the
next corpus accounts for those additions. No native bulk seeding bypasses guards.
Records use distinct synthetic keys, short repeated fixture text and two-dimensional
deterministic vectors. They stress storage cardinality, not semantic normalization,
deduplication, ANN ranking, production text distributions or a real embedding model.
The later phase adds 1,000 material corrections with immutable predecessor history
and 1,000 exact memory tombstones. Physical version cleanup is not run.

For each corpus, five connection-cold opens are timed around store open only; the
SDK/process remains warm. Five complete current calls include snapshot acquisition
and final checks/reader cleanup. Five commit samples include store commit and queue
ACK, explicitly an end-to-end upper bound on isolated store commit latency. Reported
p50/p95 use nearest rank with n=5, so p95 is the largest sample. This is a reproducible
workstation observation, not a production SLO or statistical tail guarantee.

The 10k complete read exceeds the private 4,096-current bound and must report
CONTEXT_OVERFLOW; it never returns truncated context. Deadline refusals, if observed,
are reported distinctly from successful read latency. The study exercises 16 held
leases and explicit rejection of a 17th, the exact 64MiB logical reservation edge
and one-byte overflow/refund, a canonical oversized-row refusal before native
mutation, and generated-row reservations: 4,096 supplied effects reject while
4,093 source effects plus three generated rows fit one 4,096-row atomic publication.

Native payload-byte projections count receipt/control/domain storage separately;
physical logical/allocated disk sizes include retained versions and queue metadata.
Process memory is sampled every 25ms; OS maxRSS is also reported. RSS includes native
allocations, code, stacks and V8. RSS minus heapTotal is explicitly only a native-and-
other estimate; it is not isolated allocator accounting and sampling may miss short
peaks. Metadata accounting opens extra test-only native readers. Other workstation
processes can affect observations. The standalone dependency footprint/native and
license hashes are recorded separately in t14-package.json.
Native binary fingerprinting also reads the installed binding into a temporary
Buffer, and the oversized-input test owns a large caller string. Overall high-water
marks include those harness allocations. Per-corpus memory snapshots precede final
fingerprinting; neither quantity is presented as isolated native allocator RSS.

No successful 64MiB native write, power-loss durability, physical cleanup, migration,
semantic worker or public recall performance is inferred from these measurements.
