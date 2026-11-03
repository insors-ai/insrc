# S2 manual self-review

Reviewed 2026-11-03 by the implementation author (controller), at the user's explicit request after automated review failures. Source fix: `0f4ee7724215c3661e2193d761338c290a1b99e9`.

**Result: one HIGH finding reproduced and fixed; no remaining blocking finding identified within the reviewed S2 scope.** This is a manual self-review, with the limitation that author and reviewer are the same party. It does not constitute an independent daemon review or stamp formal BUILD completion.

## Finding and correction

**HIGH — retained identity could be masked by a conflicting authoritative receipt.** `FileQueue.persist` checked a returned receipt against the incoming retry and returned it before checking the retained queue identity. A receipt matching changed content or scope could therefore report committed while a different accepted frame for that identity remained retained. This violates the approved identity/hash/scope conflict invariant, even when the external receipt provider misbehaves.

The new `retained-identity-rejects-conflicting-authoritative-receipt` case failed before the fix with `Missing expected rejection: payload, terminal=false`. It now checks changed payload and branch scope against both pending and terminal retained entries. The fix also matches the proof to the retained entry before returning a terminal receipt. The test verifies REVISION_CONFLICT, an unchanged checkpoint and original content hash, and continued queue availability. Existing valid receipt-first retry behavior remains covered and passing.

Evidence: `evidence/manual-review/receipt-before.tap` and `receipt-after.tap`. The failing-before log is intentional regression evidence, not a current failing test.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `queue/codec.ts`, `shape.ts`, `types.ts` | Canonical bounded JSON rejects unsafe values/getters, malformed Unicode, excess depth/nodes/bytes; identity and full admitted-command digest remain distinct. Public v1 types are unchanged. |
| `queue/admission.ts` | Input is copied synchronously before FIFO admission; binding/admission are serialized, policy cannot change identity/envelope/scope, and all reservations release on rejection/completion. Host-supplied policy is the authority; no auto-registration or backend import is introduced. |
| `queue/io.ts`, `configuration.ts`, `ownership.ts`, `private-file.ts` | Private paths and ownership/inode checks surround mutations; short writes loop; file and directory syncs are awaited. Descriptor/root ownership is retained when cleanup is unverified. `acquireOwnership` catches failure after layout establishment and closes through `failedAcquisition`; the previous graph-based leak claim is contradicted by this source. |
| `queue/checkpoint.ts`, `recovery.ts` | Accepted replies follow data sync and atomic checkpoint publication plus directory sync. Published corruption never falls back to an older frontier. Recovery validates contiguous accepted frames, promotes only complete valid suffixes, repairs only unaccepted partial EOF under durable intent, and rejects event-bearing orphans. The refactor preserves this order in named phases. |
| `queue/file-queue.ts`, `index-record.ts` | Admission/status use the same lane; byte/control/call bounds are checked before mutation; exact retry does not append, including at quota. Uncertain persistence fences the queue. Replay captures pending frames in sequence order and pins their segments. |
| `queue/receipts.ts`, `retirement.ts` | Typed proof validation alone is insufficient: all retained identity/hash/scope/epoch evidence must agree (fixed above). Terminal bookkeeping requires durable proof and generation; unlink requires a proven terminal prefix, no reader pins, a receipt barrier, and a durable retiring checkpoint. Recovery re-verifies surviving files or confirms already-unlinked retirement references before dropping metadata. |
| `host-node.ts`, `runtime.ts` | The factory awaits recovery and binds QueueAdmission into actual submit/operation ingress. Those methods forward to that ingress. Deferred context/search/inspect reject NOT_READY. Drain counts owned work, not durable backlog, and close releases ownership only after verified cleanup. An unreturned private replay iterator or ignored host promise can keep close pending, as explicitly allowed by the approved design. |
| Package/tests/measurement evidence | Recursive emitted-import and tarball allowlist tests enforce the standalone dependency boundary; isolated installed consumers test crash/reopen/retry and natural exit. The performance proof is explicitly registered with node:test, and actual current-source measurements were refreshed. |

The earlier test-name concerns were checked against the real TESTS mappings and source assertions: plan names map to multiple concrete cases. The adversarial-scope requirement includes scope/epoch isolation and a wrong-scope check after retirement. `public-v1-types-and-emitted-boundary` recursively disallows backend/daemon dependencies. Empty call-graph edges are not evidence that delegation or node:test registration is absent.

The ER identifier suggestions concern embedded value objects owned by frames/qualified operations; adding new public primary-key fields is unnecessary. Existing relevant relationship definitions and previews remain unchanged; this review inspected source and prior visual evidence, and did not claim a new rendering pass.

## Verification

- Related admission/replay/retirement tests: **11 passed** after the fix.
- Full macOS/APFS Node 22.23.2 package suite: **63 passed, 0 failed, 0 skipped**.
- Full Linux/ext4 Node 22.22.1 qualification: **63 passed, 0 failed, 0 skipped** (14 lifecycle, 4 packed consumers, 45 queue cases). [CI run 41602463831](https://github.com/insors-ai/insrc/actions/runs/41602463831), source `0f4ee7724215c3661e2193d761338c290a1b99e9`.
- **55 actual SIGKILL boundaries** on each platform, including observed accepted replies.
- Root build passed. Full benchmark rerun; current-source macOS/Linux/performance proof checks: **3 passed**.
- Task t8 daemon validation passed with the new regression mapped alongside the existing receipt proof cases.
- Latest task t14 tests/typechecks passed, but its overall automated verdict is **failed**: the validator classified historical canonical-root production commit `d2a7e5ae8` as outside T14 verification/documentation scope. The manual source review checks that fix against the S2 queue I/O and host-composition requirements (T2/T10); it is within the approved Story, while its historical T14 commit label is inaccurate. No history was rewritten or automated result changed. This task-attribution issue remains explicit in the formal ledger.

Logs and metadata are archived in `evidence/macos`, `evidence/linux`, `evidence/performance`, `evidence/backend`, and `evidence/manual-review`.

## Limits and continuation

The previous backend-wide sweep has 18 failures and 2 cancellations, plus a revision-change caveat; it remains separately recorded in `evidence/backend/full-sweep.json`. A clean current backend-wide sweep is not claimed. These isolated package checks do not establish Lance commit atomicity, semantic-worker throughput or hardware power-loss durability. S3 must implement the authoritative receipt store; S4/S9 handoff obligations remain in `design-verification.md`.

The automatic review attempts produced no usable current independent review: graph-based findings were contradicted by source, diff reviews hit timeout/invalid-fragment failures, and Codex was refused by the tool-free isolation guard. The canonical old CR is retained for provenance. Formal BUILD completion remains pending the latest T14 attribution verdict and the workflow's non-overridable freshness/independence check; this report is the requested manual evidence and continuation basis, not a forged independent CR. S3 design can proceed against the approved HLD and implemented sc3 contract while this bookkeeping limit remains explicit.

Configuration was left unchanged throughout this manual review, per user instruction.
