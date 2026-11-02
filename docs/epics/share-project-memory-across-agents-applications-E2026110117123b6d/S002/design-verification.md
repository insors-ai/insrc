# S2 design verification

- Scope: owns sc3; consumes unchanged sc1/sc2. No S2 implementation, Lance schema, semantic pipeline, IPC process or IDE UI change is included.
- Existing source integration and public types were located through insrc_analyze_step, then read directly. The graph's missing data-model fields and incomplete caller edges are explicitly treated as limitations. The broad test lookup returned unrelated JetBrains results; the package manifest/test source is the framework fallback.
- Generated definitions are in the LLD JSON. The engine authored both companion references and their diagrams. Every modeled entity/attribute and sequence participant/message has a description.
- Visual inspection used isolated local headless Chrome after CUA reported no available browser. Sequence preview: nine participants and 24 messages, including accepted only after frontier directory sync, future receipt proof before terminal bookkeeping and retirement before unlink. ER preview: six entities and lifecycle-aware ownership/reference relationships; bootstrap may have no child segments/checkpoints, while ready requires an active segment/current checkpoint.
- Presentation repair: generated companion HTML emitted embedded font-face CSS outside a style element. The author enclosed that CSS without changing definitions, SVG content or companion references. Regeneration requires the same presentation verification until the independent renderer issue is corrected. The generated Markdown's display date was aligned to its authoritative epicCreatedAt metadata; identity/hash/path are unchanged.
- Both generated HTML files contain inline SVG and embedded fonts with no external scripts. Source/metadata and diagram relationships were checked; generated styling is a presentation correction, not a memory-module software change.
- API/durability design uses Node 22 filesystem documentation and Linux fsync/rename specifications. These support primitive semantics only: S2 crash, resource and latency qualification remains future build evidence, not claimed as complete here.
- Required qualification covers macOS/APFS and Linux/ext4 under Node >=22.22.1 <23. SIGKILL/fault injection does not establish hardware power-loss guarantees.
- Planning/build and LLD approval remain separate user gates after independent design review.

## Build refinements to the private S2 protocol

The public sc1/sc2/sc3 signatures remain unchanged. The following private details make the approved durability boundaries concrete; actual S3 receipt storage remains unimplemented.

| Area | Implemented refinement and reason |
| --- | --- |
| Canonical root | The private S1 ownership guard supplies its canonical directory capability. The factory passes that path directly and queue I/O rejects any other path, rather than resolving the caller's alias again after locking. An actual symlink-retarget test verifies no writes reach an unowned target. Public sc1/sc2 signatures are unchanged. |
| Receipt continuation | Optional private `ReceiptVerifier.confirmRetirement(reference)` is required before recycling. It returns only a boolean matching operation/generation and identity/content/scope/epoch digests against durable terminal receipts. This owner-only confirmation permits crash recovery after unlink without retaining a second receipt store or reconstructing scoped payload from a deleted file. Public status lookup still supplies and validates the complete requested scope. A verifier lacking this capability can acknowledge terminal work but cannot recycle or reopen a receipt-barrier queue. |
| Intent metadata | Retiring checkpoint entries keep bounded operation/generation/digest references and omit obsolete retry scheduling metadata. Both ordinary and retiring entries fit the existing 2048-byte reservation; only one segment retires at a time. |
| Retained sequence | Recycling removes a fully resolved prefix. A pending hole or reader pin defers removal; later terminal segments remain until that prefix is eligible. This preserves contiguous retained sequence without a second sequence-gap ledger. |
| Full active segment | A durable intent may temporarily contain one sealed retiring segment and no writable active segment. After verified unlink and directory sync free the retained-byte quota, recovery creates/syncs the empty successor and publishes final removal. Startup completes this transition before readiness; the serialized lane prevents a completed operation from observing it. Normal ready state still has exactly one active segment. This avoids requiring extra header space in an already full queue. |
| Small control publication | Recovery reports and the write-once receipt barrier stage through the unaccepted `checkpoint.next` candidate, then rename and directory sync. They never overwrite `checkpoint.json`; a crash during report/barrier writing cannot publish a partial control record. |
| Logical admission quota | Immutable pass-through policy output reuses its already validated snapshot. Node charges are logical units (16 bytes plus encoded/key bytes), with the separately enforced node/call/depth caps; these counters do not claim to measure V8 RSS. |
| Code organization | Private receipt validation, index metadata and retirement helpers live in `packages/project-memory/src/queue/receipts.ts`, `packages/project-memory/src/queue/index-record.ts` and `packages/project-memory/src/queue/retirement.ts`. They add no backend/store import or runtime dependency. |

## Queue cost study

Measured on Apple M3 Pro, Node 22.23.2, APFS/macOS. Full data and runtime-source fingerprints are in `docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/evidence/performance/queue-cost.json`. Development host background workloads were not isolated. These measurements approve no production default or latency SLO.

| Profile | Result | p50 ms | p95 ms | Fresh-process recovery ms |
| --- | --- | ---: | ---: | ---: |
| empty 1024 bytes | accepted; 20 samples | 18.77 | 21.71 | 17.62 |
| empty 65536 bytes | accepted; 20 samples | 21.02 | 23.80 | 21.16 |
| empty 1048576 bytes | accepted; 20 samples | 42.67 | 44.86 | 50.30 |
| backlog-1k | accepted; 20 samples | 29.80 | 34.00 | 179.21 |
| metadata-cap | rejected at 16,351-frame metadata cap | 0.07 | 0.09 | 1107.47 |
| 16MiB-safety | accepted in 348.76 ms; one-byte excess rejected | — | — | 408.96 |

Durability steps remain enabled. Backlog fixtures are constructed by a private measurement helper and fully validated by production recovery; fixture construction is not reported as ingestion latency. Recovery starts a new Node process with the OS file cache warm. Physical segment/control bytes, active/durable counters and RSS/heap snapshots are recorded; snapshots are lower bounds on peaks. Semantic commit is unimplemented, and these results do not qualify Lance atomicity or hardware power-loss durability.

## Review maintenance refactor

Queue structural record/required/optional-key validation is centralized in private queue/shape.ts; codecs, checkpoint parsing and external receipts retain their respective error policies. Recovery now names its ordered phases: checkpoint loading/retirement, inventory validation, read-only scanning, durable tail repair, orphan cleanup, and synced frontier publication. The durable format, public API and interaction/ownership relationships are unchanged. Existing failure/crash tests verify those phases through the real IO boundary.

## Operational limits and downstream handoff

The measured single-segment metadata-cap fixture retains 16,351 frames before checkpoint reservation rejects another admission with BACKPRESSURE. This is a reservation limit for the recorded layout, not a universal event capacity: more segments, larger records, pending-byte limits and configured limits can constrain it earlier. The 16 MiB command profile is a safety-edge experiment, not a recommended production default. The queue's 32 MiB checkpoint cap and per-frame/per-segment reservations remain hard safety bounds. Reported recovery uses a fresh process with a warm OS cache; RSS/heap snapshots are lower bounds, not a peak-memory guarantee.

| Owner | Required handoff before production qualification |
| --- | --- |
| S3 — Lance store and authoritative receipts | Implement and qualify durable terminal receipts, generation/revision matching and confirmRetirement before permitting recycling. Prove store commit precedes terminal queue bookkeeping, receipt lookup remains scope/epoch qualified after unlink/restart, and unavailable or mismatched proof fails closed. Queue-only acceptance timings establish no Lance atomicity or semantic-commit latency; measure these with real store commits. |
| S4 — normalization/context-builder worker | Consume replay serially with bounded model/input ownership, honor ingress and durable BACKPRESSURE, and release reader pins on drain. Measure service time, backlog growth and semantic-commit latency with actual normalization/retrieval/commit work; the queue-only 1k/metadata-cap studies cannot establish worker throughput or a production queue budget. Keep CLI/Ollama calls serial and preserve exact identity/scope/epoch across retries. |
| S9 — retention, purge, migration and corpus evaluation | Plan retention against physical control/segment bytes and metadata reservations, not event count alone. Recycle only receipt-verified terminal prefixes after reader pins release; account separately for Lance versions, tombstones and receipts. Qualify purge/migration/restart behavior, full-capacity progress and corpus fidelity on actual retained stores before selecting production defaults or SLOs; process SIGKILL evidence does not establish hardware power-loss durability. |

These are follow-up obligations, not implemented S2 capabilities or new defaults. The benchmark evidence closes only the S2 queue measurement obligation.
