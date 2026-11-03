# S3 completion evidence map

This map describes S3 only. Final sweep/platform evidence and the independent
code-review result must be added before BUILD approval; those are not inferred
from task validation or earlier source snapshots.

| S3 criterion | Evidence |
| --- | --- |
| ac1: one atomic publication of effects, immutable receipt and root generation | store-writer tests; t6 evidence; real owner/queue/store SIGKILL tests at accepted/native/reply/ACK/recycle boundaries; APFS/ext4 t10 and refreshed pre-wiring t13 evidence |
| ac1: stale generation/revision and exact retry safety | store-plan and writer guards; real retained/recycled proof tests; public factory accepted/terminal retry tests; no additional effects/version on exact replay |
| ac1: uncertain native settlement fences writes and retains ownership | writer timeout/rejection/unknown-outcome cases; StoreOwnedWork two-participant drain and forked failed cleanup tests |
| ac2: scoped source/revision/authority and deletion protection | strict discriminated codecs and admitted UTF-8 source hash/span/time derivation; immutable lineage and explicit lifecycle transition matrix; exact and broad tombstone guards |
| ac2: old pending events cannot resurrect forgotten context | actual project/session/conversation forget-before-old-plan SIGKILL/recovery; closed-lifecycle admission and explicit trusted new lifecycle tests |
| ac2: coherent bounded reads | distinct native version-pinned handles, opaque lease registration, final binding/generation/time checks after asynchronous cleanup; expiry, rebinding, forget, SQL-like qualifier, row/reference/byte overflow cases |
| ac3: independent module/package/lifecycle | exact public exports/dependencies, external installed Node22 consumer, private committed-store smoke, pure imports and separately missing fs-ext/Lance native bindings; safe rollback and natural exit |
| ac3: index/memory/queue isolation | real isolated IndexerService rebuild plus closed temporary graph/vector reset; complete cold memory/proof/guard and pending-frame/segment-byte oracle (t15) |
| ac3: safe internal cleanup targeting | exact canonical owned memory.lance preflight, rejected root/queue/metadata/foreign/alias/child/inode substitutions; non-destructive graph/vector/queue preservation oracle |
| Resource and latency limits | t16 method and completed hardware/source/profile report required; logical quotas and observed RSS must remain distinct |
| Final current-source package/backend qualification | Package: 138/138 pass on APFS and ext4 at 0990b423e; t17-platforms.json and CI run 41695843142. Backend: 7,238 pass, 21 fail, 135 skipped, 3 todo; initial focused retry 26 pass/5 fail. See t17.md and t17-backend-results.json. Source unchanged across sweep. User explicitly deferred all backend failures to https://github.com/insors-ai/insrc/issues/98 on 2026-11-04; handoff revalidation/review pending. Global sweep remains failed. |
| Independent code review and story closure | Pending post-build review and explicit user BUILD approval |

Full epic AC29 remains pending S7/S9. S7 must qualify actual host index/memory/queue
overlap and alias prevention; S9 must qualify real queued physical cleanup/reset
while preserving required receipt/tombstone protection, pending events and unrelated
graph/vector data. S3 exposes no reset/delete endpoint, does not purge physical
history and does not count unsupported future operations as successful skipped tests.

The module's semantic normalizer/deduplication worker (S4), public retrieval/context
packing (S5), standalone IPC (S6), insrc host integration (S7), agent adapters (S8)
and retention/purge/migration (S9) are later stories. Public semantic reads and
delivery explicitly remain NOT_READY. No model/runtime configuration was changed.
