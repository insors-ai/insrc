<!-- insrc:artifact CR-c32aa60534232f36-s4 -->

# Code review: c32aa60534232f36:s4

⚠️ **WARN** — HIGH 0 · MED 3 · LOW 4 · model `claude:claude-sonnet-5`

**Changed files:** 25

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/code-review/investigation/recovery-store.ts | issueAttempt is reached only from recovery-crash-worker.ts, a non-.test.ts helper script that the test-record does not list as a result file, so its pass-state cannot be confirmed from the gate's recorded runs; present but failing/unverified rather than confirmed-passing. |
| MED | src/workflow/code-review/investigation/recovery-store.ts | ports is reached only from recovery-crash-worker.ts, a non-.test.ts helper script that the test-record does not list as a result file, so its pass-state cannot be confirmed from the gate's recorded runs; present but failing/unverified rather than confirmed-passing. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/code-review/investigation/recovery-lifecycle.ts:foldRecoveryLifecycle | foldRecoveryLifecycle folds the raw payload of every lifecycle control event (lease/release/state/attempt-issued/attempt-settled/extension/usage-pending/usage-recorded) directly into the RecoveryView with no visible calls to the recovery-types assertion helpers (recoveryId/recoveryInteger/recoveryLabel/recoveryRecord/recoveryVersion). Its sibling fold handlers in the same reducer family, foldRecoveryAttempt and foldRecoveryUsage, both call several of those assertions (recoveryDigest/recoveryInteger/recoveryRecord/recoveryLabel, and validateRecoveryUsage) before touching the view. Since this is the crash-recovery replay path, a corrupted or partially-written journal entry for a lifecycle event (the most common event kind, lease/claim/release) would reach foldRecoveryLifecycle unvalidated: failure scenario is a mid-write crash that leaves a truncated or type-corrupted lifecycle event (e.g. generation as a string, or a missing leaseId) in the recovery journal; replayRecovery -> RecoveryStore.control -> foldRecoveryLifecycle applies it to the view without asserting field shapes, producing a view with malformed lease state or throwing an unstructured error instead of a recoverable RecoveryError, undermining the durable-recovery guarantee the Story is built around. |
| LOW | src/workflow/code-review/investigation/recovery-replay.ts:isUnresolved | isUnresolved is defined but shows zero callers and zero callees in the graph; it is not wired into applyRecoveryBlock's requirement/impact resolution logic (which calls appendImpactRequirements, ledgerDigest, ledgerEqual, evidenceFromReceipt, applyReviewLedgerDelta instead), looking like a leftover or half-wired helper from the block-progress resolution path. Failure scenario: if isUnresolved was meant to gate which impact requirements get re-marked unresolved during replay but is never invoked, replay could treat a requirement as resolved when it should still be pending (or vice versa), silently diverging from the live (non-recovered) code path. |
| LOW | src/workflow/code-review/investigation/recovery-types.ts:recoveryId | recoveryId, recoveryDigest and recoveryLabel all share the identical signature `(value: unknown): asserts value is string` and are called from overlapping sites (manifest/event validation, fold handlers); they appear to be near-identical type-assertion wrappers distinguished only by which field they're invoked on, rather than one parameterized assertion. Not a functional bug by itself, but a maintenance risk: fixing a validation edge case (e.g. rejecting empty strings) in one requires remembering to mirror it in the other two. |

## functional-coverage — 0 finding(s)

_No findings._

## diagram — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | erDefinition:classes.RecoveryEvent | class 'RecoveryEvent' declares no identifier slot (identifier:true) — the entity has no primary key |
| LOW | erDefinition:classes.BlockCheckpoint | class 'BlockCheckpoint' declares no identifier slot (identifier:true) — the entity has no primary key |

