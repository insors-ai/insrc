# S3 t15 — verified ZIP ownership and archive boundaries

Task `c3d71313f34bce71/s3/t15` / #291, approved LLD revision 6 and PLAN revision 3.

ZIP verification and extraction now share one numeric descriptor. Ownership transfers to pinned yauzl 3.4.0 only when fromFd succeeds; failed opening/verification closes the caller-owned descriptor. A FileHandle is deliberately not shared with yauzl, avoiding a stale GC finalizer after yauzl closes the fd. Cancellation destroys/drains streams, waits for the pinned FdSlicer pending-I/O queue, then requires the actual ZIP close event. Failed/timed-out closure remains resource-close-uncertain. Cancellation during successful close is preserved; it cannot erase a prior unclosed output resource in the error cause chain.

Decoder output is consumed with reads bounded to 64 KiB. This fixes the legitimate coalesced-buffer rejection found during t14 without widening byte/file/memory limits or changing checksums, directory validation or immutable publication. The initial short-buffer implementation stalled; its exact owned coordinator was cooperatively stopped and recorded confirmed owned-group closure, and the short-buffer loop was corrected before qualification. The isolated diagnostic probe was also positively observed closed and its exact temporary root removed.

## Checks performed

- Canonical Node 22.22.1 build/typechecks passed.
- Eight surrounding files: 32/32 passed, zero failure/skip/cancel, confirmed owned-group closure. Run `3609bb10-51da-4507-84f2-6ab27a433137`. Includes archive/tar/ZIP/prepare/validation, production control packaging and forbidden-spawn scanner.
- Current ZIP ownership check: 6/6 passed in `1a895d6a-94a8-424f-bf0c-384c7e392c3e`, zero failure/skip/cancel with confirmed owned-group closure. Includes cancellation during close and a genuinely unclosed output handle under cancellation.
- Descriptor tests replace the verified pathname with different same-size bytes and prove original contents are extracted, with one positive fd close. They also hold a real queued read callback, abort, prove no premature completion/close, then release it and observe closure. A close fault really leaves the fd open and returns resource uncertainty; the test itself subsequently closes that exact owned fd.
- Tar vectors cover valid and escaping GNU L/K metadata, positive/negative base-256, valid/negative/oversized PAX size, nonzero padding, missing second terminator block, data after terminator, link entries with data and setuid normalization. Nested inventory.json is regular vendor data and never root trusted metadata; reserved root inventory names are rejected.
- Zstd vectors cover reserved flags, external dictionary, content-size mismatch, skippable frame and a controlled fzstd output divergence against the real Node decoder. Assertions require the intended error code/message, not a transport failure or incidental EEXIST.
- ZIP vectors cover genuine signed ZIP64 descriptors and corrupt sizes, unambiguous/ambiguous EOCD-in-comment cases, Info-ZIP Unicode name agreement/disagreement, and data gaps/overlap before writes.
- Alias cancellation occurs after a real copy write, positively observes source/output close, and composes through prepareOllama to prove disposal and absence at the actual dependency publication destination. An incumbent application release remains unchanged. Older unused root/releases assertions were removed; partial-file polling was replaced with real write/close barriers.

No full backend or combined installer suite was run. No host daemon/Ollama changes or native target enablement occurred. Archive-format fixtures are not native Linux/Windows installation qualification; those claims remain t17-owned. The registered task gate follows this commit; final story approval remains pending.

## Real-path assertion correction

The first tracked round passed tests/typecheck and the descriptor/archive checks, but identified two inaccurate path assertions. GNU traversal now checks the actual payload parent/escaped target. Prepared-payload conflict now asserts the actual offer.destination remains present, its CLI inode/tampered bytes and receipt remain unchanged, and transport calls remain zero with the intended archive-unsafe error. The unrelated home/releases absence check was removed.

Focused matrix/prepare run `85a3e464-d774-4d4b-a4f0-db48ca35f14b`: 9/9 passed, zero failure/skip/cancel with confirmed owned-group closure. Tracked revalidation follows.

The second registered gate returned passed=true against `079a1f46f`: all five acceptance checks, all seven mapped test subjects and typecheck passed. The compact verdict is `docs/plans/s3-t15-build-gate-2026-11-26.json`; the workflow BUILD/TESTS ledger records the authoritative result. T16–T18 and final story approval remain pending.
