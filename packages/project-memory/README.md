# @insrc/project-memory

Independent Node 22 ESM project-memory module. S2 provides durable, policy-bound
submission and scoped operation status through the embedded API. Eligible events
are accepted only after their journal data and acceptance checkpoint are synced.
Lance storage, semantic processing, recall and the IPC executable remain later
stories. `context`, `search` and `inspect` currently reject `NOT_READY`.

The public import performs no I/O or native loading. Supply host policy, models,
logging, explicit limits and a dedicated directory. No daemon, index store or
backend source is required. The only runtime dependency is `fs-ext` 2.1.1.

Use the public entry in an ESM host:

```ts
import { MemoryFactory } from '@insrc/project-memory';

const memory = await MemoryFactory.open({
  dataDirectory: '/absolute/private/project-memory',
  models, // Host-owned complete/embed port and embedding metadata; unused in S2
  policy, // bind(projectId, sessionId?) and admit(binding, event)
  logger, // write(level, event, fields)
  limits: {
    maxEventBytes: 64 * 1024,
    segmentBytes: 4 * 1024 * 1024,
    maxPendingBytes: 64 * 1024 * 1024,
    modelTimeoutMs: 60_000,
  },
});
await memory.ready();
const receipt = await memory.submit({
  version: 1,
  scope: { projectId: 'project-id' },
  source: {
    producerId: 'host-agent', eventId: 'stable-source-event-id',
    sessionId: 'source-session', turnId: 'source-turn', sourceVersion: '1',
  },
  kind: 'capture',
  payload: { text: 'Project context to process later' },
});
const status = await memory.operation({
  scope: { projectId: 'project-id' }, operationId: receipt.operationId,
});
// receipt/status are accepted, not semantically committed memory.
const result = await memory.drain(5_000);
await memory.close();
```

The limits above are host-supplied examples, not defaults. No project, model,
credentials or data path is selected automatically. Keep this directory separate
from index/other stores and from overlapping cleanup roots.

`policy.bind` must authorize the requested project/session and return its
absolute root and stable scope epoch. `policy.admit` must validate eligibility
and the producer/event namespace before persistence; it may redact payload but
cannot change command identity, scope, kind or revision. Policy receives an
immutable snapshot; return a new JSON command when redacting. There is no permissive
fallback. All policy and append work shares invocation FIFO order. The module
never logs event payloads or calls a model during S2 ingestion.

Use stable project/producer/event IDs for retries. The same admitted command and
epoch return the same operation without another event. Changed content, source
metadata or epoch under the same identity produces `REVISION_CONFLICT`. Policy
runs again on retries. A lost reply or uncertain write can still leave a durable
event: retain the identity, reopen after a durability failure and query/retry it.

`Scope.sessionId`, branch and environment are visibility qualifiers; every
qualifier on a stored event must also match the status request. Omitting one
cannot broaden access. A project-global event can be queried from an authorized
narrower context. `SourceIdentity.sessionId` is provenance and does not grant
visibility. Hidden and unknown operations produce the same `INVALID_REQUEST`.

## Files and limits

A new directory contains `layout.json`, the persistent `.owner.lock`, and a
separate `queue/` subtree. It contains versioned format metadata, numbered framed
JSONL segments, current/prior checkpoints and bounded recovery diagnostics.
Lance files are not created in S2. Caller input is copied before policy waits;
only bounded plain JSON is accepted, without accessors, cycles, malformed Unicode
or ambiguous envelope fields.

The host must supply `maxEventBytes <= segmentBytes <= maxPendingBytes`, with
`maxEventBytes <= 16 MiB` and `maxPendingBytes >= 512`. The segment size is a
rotation target: frame/header overhead counts toward retained bytes, and one
valid frame can exceed the target in a dedicated segment. Pending work is never
evicted to make space. Exact retries are checked before disk-budget refusal.
Separate call, JSON node/depth, logical ingress and checkpoint-metadata quotas
may return `BACKPRESSURE` before the disk-byte limit. Logical ingress charges do
not measure V8 RSS.

`maxPendingBytes` covers retained physical segment bytes and append reservations.
Control files have their own bounds: checkpoints are capped at 32 MiB, with at
most four checkpoint-sized control files plus small markers/reports. Total
queue-directory size can therefore exceed the segment budget. Recovery streams
bounded frames, promotes valid complete unacknowledged suffixes, and repairs
only a qualified incomplete unaccepted tail. Accepted-prefix corruption,
complete bad lines and missing accepted files stop startup and preserve evidence.

S2 has no semantic worker or authoritative receipt store: accepted events stay
pending and consume quota. Future store-backed processing can acknowledge and
recycle only verified terminal work. Recycling removes an unpinned resolved
prefix under a durable intent and receipt-capability barrier. Queue-only hosts
cannot reopen a recycled directory without authoritative receipt support. This
is not a second permanent receipt ledger or a claim of physical memory purge.

## Ownership and lifecycle

The qualified runtime is Node >=22.22.1 and <23 on local APFS/macOS or ext4/Linux,
subject to current-source qualification. Other runtimes, remote/shared
filesystems and unrecognized layouts are refused. All processes/copies must
cooperate with ownership; external renames/deletion of a live directory are
unsupported. Queue paths come from the guard's canonical owned directory;
retargeting the input alias cannot redirect its writer. Do not delete the lock file to clear contention. Process death
releases kernel ownership; a stopped live process retains it.

Native ownership uses nonwaiting `flockSync(fd, 'exnb')`. The asynchronous
fs-ext callback path is avoided because worker-isolate qualification exposed a
native callback crash. Building the addon requires Python, make, a C++ compiler,
Node 22 headers and C++17. On macOS run `CXXFLAGS=-std=c++17 npm ci` or rebuild
fs-ext with that flag under Node 22; the compiler default was insufficient on the
qualification machine.

`open()` finishes queue recovery before returning; `ready()` confirms operational
queue readiness. `drain()` stops new requests and waits for active calls/readers
up to a monotonic deadline. Durable backlog is not active work and remains on
disk after close. A policy that never settles or an internal replay reader that
never releases can keep drain incomplete and delay close. Ownership remains held
until resources are verified quiescent. Close is idempotent; cleanup failure
retains ownership where release cannot be verified. Supplied models, policy and
logger remain host-owned. Neither public entry installs process signal handlers.
The separate `./node` entry exposes the explicit Node host.

## Development checks

Build with `npm run build`; run package checks with `npm test` from this source
package. Packed-consumer checks install a real tarball/dependencies in a temporary
directory, requiring registry access and the native toolchain. They do not publish
the package. Consumers exit naturally, and crash tests kill actual Node writers
then reopen/query/retry their observed accepted set. Native qualification targets
both macOS/APFS and Linux/ext4; a local macOS pass is not Linux evidence.

From a source checkout, `node benchmarks/queue-cost.mjs --output report.json`
after the build records durability-enabled acceptance, fresh-process recovery,
physical queue/control bytes and RSS/heap snapshots. The full corpus includes
1 KiB/64 KiB/1 MiB commands, a 16 MiB safety edge, 1k backlog and metadata-cap
profiles. Backlog fixtures are built privately and validated by production
recovery; their build time is not ingestion latency. OS cache remains warm for
fresh-process recovery. Measurements establish no production defaults or SLOs;
process-death/fault tests do not qualify hardware power loss or S3 Lance atomicity.
