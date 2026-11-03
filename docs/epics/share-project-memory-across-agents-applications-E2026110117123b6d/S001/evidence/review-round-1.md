<!-- insrc:artifact CR-17123b6d304af2a2-s1 -->

# Code review: 17123b6d304af2a2:s1

⛔ **BLOCK** — HIGH 1 · MED 3 · LOW 1 · model `claude:claude-sonnet-5`

**Changed files:** 30

**Reviewed on the diff:** the wait for a fresh index was declined

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | packages/project-memory/src/host-node.ts | MemoryFactory.open() calls `await loadNative()` (a native binding load) before calling `prepareRoot(config)`, which is where the actual filesystem/runtime qualification (`checkFilesystem`/`validateFilesystem`) and directory creation (`mkdir`) occur. This means native work happens before the configuration's filesystem suitability has been validated. The approved plan's task t3 acceptance check explicitly requires 'Bad configuration is rejected before mkdir/provider/native calls; filesystem check uses the actual resolved target,' and the LLD's errorPaths detection for 'Invalid options or runtime' states 'configuration validation precedes mkdir/native work.' The current ordering (validateOptions -> validateRuntime -> loadNative -> prepareRoot) reverses this for the filesystem portion of validation, so an unsupported-filesystem configuration will still trigger a native binding load before being rejected, instead of failing fast with INVALID_REQUEST prior to any native call. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | packages/project-memory/src/host-node.ts:14 | The catch around service construction in MemoryFactory.open always rethrows a generic 'NOT_READY' MemoryError after awaiting owner.close(), but owner.close() can itself reject with its own MemoryError (e.g. STORE_UNAVAILABLE). In that case the caller sees the close-failure error instead of the intended NOT_READY, and the original construction failure (if any) is discarded either way, making the reported failure code depend on unrelated timing rather than the actual cause. |
| MED | packages/project-memory/src/model-dispatcher.ts:50 | #enqueue combines queue admission, timeout scheduling, abort wiring, promise settlement and lane-kick bookkeeping into one deeply nested closure (call.start/cancel, fail, cleanup, onAbort all mutually referencing each other). The intertwined mutable state makes the cancellation/timeout interaction hard to verify by inspection and increases the chance that a future edit reintroduces a double-resolve or leaked timer; the queueing/timeout/cancel concerns could be split into smaller named helpers. |
| LOW | packages/project-memory/src/ownership.ts:18 | assertFile re-implements the same 'regular file, single link, owned by this uid, mode & 0o077 === 0' identity/permission check that configuration.ts already performs in metadata() (and partially in assertRoot). The duplicated predicate must be kept in sync by hand across two files if the safety criteria ever change. |
| MED | packages/project-memory/src/runtime.ts:83 | In EmbeddedMemoryService.close(), 'for (const work of this.#work) await work.close();' aborts on the first OwnedWork that throws, so any later, unrelated work items in the array never get close() called at all. State is set to 'failed' and ownership is correctly retained, but the other work items' own resources (handles, timers, etc.) are silently leaked rather than each being attempted/collected, and this multi-item partial-failure path is not exercised by the existing close() tests (which only use a single failing work item). |

## diagram — 0 finding(s)

_No findings._

