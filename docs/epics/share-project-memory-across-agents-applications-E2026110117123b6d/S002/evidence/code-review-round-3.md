<!-- insrc:artifact CR-17123b6d304af2a2-s2 -->

# Code review: 17123b6d304af2a2:s2

⛔ **BLOCK** — HIGH 2 · MED 1 · LOW 2 · model `claude:claude-sonnet-5`

**Changed files:** 36

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | packages/project-memory/src/runtime.ts:submit/operation (EmbeddedMemoryService) | EmbeddedMemoryService.submit(command) and .operation(request) have the exact same call graph as .context/.search/.inspect: each resolves to a single call to the local unavailable() helper, with no reference to the queue/admission ingress at all. The MemoryIngress interface declared in the same file has zero callers anywhere in the changed set, confirming it is never invoked. Compare this to QueueAdmission's markResolved/seal/close/recycleResolvedSegments methods, which each show a self-named delegate callee proving they forward to FileQueue; submit/operation show no such delegate call. So the public service still answers submit/operation with NOT_READY/unavailable exactly like the still-unimplemented context/search/inspect paths, even though the whole durable queue (FileQueue/QueueAdmission) was built in this Story. |
| MED | scripts/__tests__/project-memory-s2-performance.test.ts | This test file's structural summary shows an empty callee set (no calls at all, not even the nativeTest harness call that every other test file in this Story records), consistent with a vacuous/placeholder test that never exercises the named-hardware/OS/filesystem benchmark corpus (1KiB/64KiB/1MiB/16MiB commands, empty/1k/metadata-cap backlog profiles, p50/p95 acceptance+recovery+byte/RSS measurement) that this task is supposed to produce. |

## conventions — 0 finding(s)

_No findings._

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | packages/project-memory/src/queue/admission.ts | The approved plan promised an integration test named 'adversarial-admission-and-recycled-scope-isolation', but no test file in the grounding or reportedTests contains a title matching this name. queue-admission.test.ts covers 'concurrent-admission-fifo-and-idempotent-retry', 'privacy-binding-and-scope-status-isolation-before-enqueue', and 'admission-quota-refunds-and-hanging-policy-drains-safely'; queue-retirement.test.ts covers 'recycled-identity-requires-authoritative-receipt-capability'; none exercises adversarial admission against a recycled scope specifically. |

## quality — 0 finding(s)

_No findings._

## functional-coverage — 0 finding(s)

_No findings._

## diagram — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | erDefinition:classes.QueueAcknowledgement | class 'QueueAcknowledgement' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.MemoryCommand | class 'MemoryCommand' declares no identifier slot (identifier:true) — the entity has no primary key |

