<!-- insrc:artifact CR-0764c4bcaa076f8e-s1 -->

# Code review: 0764c4bcaa076f8e:s1

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 2 · model `claude:claude-sonnet-5`

**Changed files:** 12

## adherence — 0 finding(s)

_No findings._

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/code-review/investigation/recovery-journal.ts | Every other exported type/interface in this module and recovery-types.ts (RecoveryFault, RecoveryJournalOptions, RecoveryManifest, RecoveryEvent, RecoveryCompatibility, RecoveryPublicationBinding, RecoveryView, RecoveryControlFold) is prefixed `Recovery`; `RootQueue` breaks that local naming idiom. |

## coverage — 0 finding(s)

_No findings._

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/code-review/investigation/recovery-replay.ts:isUnresolved | isUnresolved(ref:string) is defined but has zero callers anywhere in the Story's changed set, including inside applyRecoveryBlock itself (whose actual callees are validateLedgerBasis, appendImpactRequirements, ledgerDigest, ledgerEqual, evidenceFromReceipt, applyReviewLedgerDelta, read — not isUnresolved). A predicate named for detecting an unresolved recovery reference that is never invoked suggests the unresolved-ref check this crash/recovery Story needed was never wired into the replay fold, leaving that case silently unchecked. A recovery block referencing a genuinely unresolved (crashed mid-publish) item would fold as if the reference were valid, masking the exact class of crash-recovery defect commits da9667728/df4ba3b83 target. |
| MED | src/workflow/code-review/investigation/recovery-store.ts:renew | renew, requestCompletion, issueAttempt, settleAttempt and extendAllowance on RecoveryStore all show empty callers and testsReaching:[] — none of this Story's new publication/crash-recovery tests (publication-binding, publication-owner, publication-callback, publication-deadline, publication-crash-worker, publication-integration) exercise them, even though they route through the same exclusive/replay/assertLease/control pipeline as the tested claim/release/withPublicationFence. If a crash or race hits one of these untested transitions instead, a fencing regression (e.g. a stale generation accepted, or assertLease skipped) would ship unnoticed despite the Story's explicit focus on crash-safe publication recovery. |
| LOW | src/workflow/code-review/investigation/__tests__/publication-integration.test.ts:tick | tick() is redefined identically (zero-arg, no return) in both publication-deadline.test.ts and publication-integration.test.ts instead of sharing one helper from publication-fixtures.ts, which already centralizes other shared test helpers like recoveryFixture and acceptPublication. If the fake-timer-advance semantics need to change (e.g. to flush a microtask queue added by withPublicationFence), a future edit to one copy can miss the other, letting one of the two crash/deadline suites silently test against stale timer behavior. |

## functional-coverage — 0 finding(s)

_No findings._

## diagram — 0 finding(s)

_No findings._

