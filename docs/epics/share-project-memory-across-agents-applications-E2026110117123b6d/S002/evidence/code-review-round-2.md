<!-- insrc:artifact CR-17123b6d304af2a2-s2 -->

# Code review: 17123b6d304af2a2:s2

⛔ **BLOCK** — HIGH 3 · MED 4 · LOW 2 · model `claude:claude-sonnet-5`

**Changed files:** 36

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | scripts/__tests__/project-memory-s2-performance.test.ts | This file is the designated evidence point for PLAN task t13 ('Measure queue resource and durability costs') and LLD testStrategy item 'queue-resource-and-fsync-cost-measurement', but its callees list is completely empty — no calls at all, not even a test-registration call — in contrast to scripts/__tests__/project-memory-s2-qualification.test.ts (calls fresh/crashProof) or packages/project-memory/src/__tests__/queue-cost.test.ts (calls nativeTest). This indicates the file likely does not actually register or execute the required p50/p95 acceptance-latency, cold-recovery, physical-byte and RSS/heap measurement evidence that t13's acceptance checks and the LLD's nonFunctional.performance section mandate before OD-02 can be considered closed. |

## conventions — 0 finding(s)

_No findings._

## coverage — 6 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| HIGH | packages/project-memory/src/queue/io.ts:1 | Promised test 'macos-apfs-linux-ext4-node22-queue-qualification' has no corresponding test anywhere in the grounding (no test-record title, no testsReaching edge from any file hints at it). |
| HIGH | packages/project-memory/src/runtime.ts:1 | Promised test 'pure-import-and-no-daemon-or-backend-storage-dependency' has no corresponding test anywhere in the grounding (no test-record title, no testsReaching edge from any file hints at it). |
| HIGH | packages/project-memory/src/runtime.ts:1 | Promised test 'package-suite-root-build-and-current-source-ci-evidence' has no corresponding test anywhere in the grounding (no test-record title, no testsReaching edge from any file hints at it; the only similarly-named title found, scripts/project-memory-s2-performance.test.ts#full-current-source-queue-resource-study-evidence, covers a different promise). |
| MED | packages/project-memory/src/queue/admission.ts:1 | Promised test 'adversarial-admission-and-recycled-scope-isolation' is present but unverified: queue-crash.test.ts (which testsReaching edges show calling FileQueue.append/operation and QueueAdmission entry points — a plausible home for this test) exists in the grounding but is entirely absent from the latest test-record run, so its pass-state cannot be confirmed. |
| MED | packages/project-memory/src/queue/recovery.ts:1 | Promised test 'accepted-set-survives-process-kill-at-every-boundary' is present but unverified: queue-crash.test.ts and its queue-crash-peer.ts fixture (which call recoverQueue/FileQueue.start and simulate a killed peer process per testsReaching edges) exist in the grounding but queue-crash.test.ts is entirely absent from the latest test-record run, so its pass-state cannot be confirmed. |
| MED | packages/project-memory/src/queue/file-queue.ts:1 | Promised test 'packed-external-submit-crash-reopen-and-operation' is present but unverified: queue-crash.test.ts (whose testsReaching edges show it calling FileQueue.start/append/operation and acquireOwnership, matching a submit-crash-reopen scenario) exists in the grounding but is entirely absent from the latest test-record run, so its pass-state cannot be confirmed. |

## quality — 0 finding(s)

_No findings._

## functional-coverage — 0 finding(s)

_No findings._

## diagram — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | erDefinition:classes.QueueAcknowledgement | class 'QueueAcknowledgement' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.MemoryCommand | class 'MemoryCommand' declares no identifier slot (identifier:true) — the entity has no primary key |

