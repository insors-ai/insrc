<!-- insrc:artifact CR-17123b6d304af2a2-s2 -->

# Code review: 17123b6d304af2a2:s2

⛔ **BLOCK** — HIGH 2 · MED 4 · LOW 3 · model `claude:claude-sonnet-5`

**Changed files:** 36

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | packages/project-memory/src/runtime.ts:EmbeddedMemoryService.submit | EmbeddedMemoryService.submit and EmbeddedMemoryService.operation both resolve purely by calling the local `unavailable()` helper — the same helper used by context/search/inspect — with no call edge into the queue/admission layer (FileQueue/QueueAdmission.append or .operation). By contrast, EmbeddedMemoryService.drain/close do call queue-shaped lifecycle methods (`pending`, `stop`) on their owned participants, showing the composition seam exists for lifecycle but was never wired for the data path. This means submit/operation still report NOT_READY/unavailable exactly like the explicitly-deferred context/search/inspect capabilities, instead of performing real durable queue work. |

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | packages/project-memory/src/__tests__/queue-admission.test.ts | The plan promised an integration test named 'adversarial-admission-and-recycled-scope-isolation' but no test with this name (or an equivalent title) appears anywhere in the test-record results for any file (queue-admission.test.ts, queue-replay.test.ts, queue-retirement.test.ts, etc.), nor is it listed under reportedTests. |
| MED | packages/project-memory/src/__tests__/contracts.test.ts | The plan promised a smoke test named 'pure-import-and-no-daemon-or-backend-storage-dependency'; the only similarly-themed test in the record is contracts.test.ts#'pure-public-import-without-native-or-daemon' (passing), which checks absence of a native/daemon import but does not clearly cover the promised 'no backend storage dependency' assertion. Title and scope don't exactly match the promise, so it is unverified whether this is the same test or a distinct one that was never written. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | packages/project-memory/src/ownership.ts:1 | establishOwnedLayout and ownershipGuard both call checkIdentity (which can throw on a root/file identity mismatch, e.g. a race where the directory changed after the lock file was opened) but neither lists failedAcquisition among its callees — unlike lockDescriptor, which explicitly routes checkIdentity/openLockCandidate failures through failedAcquisition to close the open FileHandle. If acquireOwnership does not wrap these two later steps in the same catch that calls failedAcquisition, a checkIdentity failure after the lock descriptor is already open will leak that file descriptor instead of closing it. |
| MED | packages/project-memory/src/queue/codec.ts:1 | record()+fields() in codec.ts reimplement the same 'assert object shape with required/optional string keys' validation that checkpoint.ts's object()+fields() already implement (same parameter shapes, differing only in which never-returning error function — invalid() vs corrupt() — they call on failure). A shape-validation bug fixed in one copy (e.g. an optional-key check) will not propagate to the other. |
| MED | packages/project-memory/src/queue/recovery.ts:1 | recoverQueue is a single function wiring together ~22 distinct operations across IO (segmentName/syncDirectory/exists/list/read/write/truncate/unlink/scan), checkpoint (advance/reserveMetadata/initialCheckpoint/load/publish), retirement (verifyBarrier/finishRetirement) and indexing (indexFrame/hash/marker/tailReport/corrupt) in one place. Boot-time crash recovery is inherently order-sensitive, and concentrating this much sequencing in one routine makes it hard to verify each failure path is handled correctly and hard to unit-test the sub-steps in isolation. |
| LOW | packages/project-memory/src/queue/receipts.ts:1 | receipts.ts's shape() is a third independent reimplementation of the same required/optional-key assertion pattern already present as codec.ts's record()+fields() and checkpoint.ts's object()+fields(), rather than reusing either. |

## functional-coverage — 0 finding(s)

_No findings._

## diagram — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | erDefinition:classes.QueueAcknowledgement | class 'QueueAcknowledgement' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.MemoryCommand | class 'MemoryCommand' declares no identifier slot (identifier:true) — the entity has no primary key |

