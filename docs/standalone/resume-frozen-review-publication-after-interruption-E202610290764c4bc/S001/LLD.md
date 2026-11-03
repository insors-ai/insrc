<!-- insrc:artifact LLD-0764c4bcaa076f8e-s1 -->

# LLD: STORY-0764c4bcaa076f8e-s1

## Summary

**Epic:** `resume-frozen-review-publication-after-interruption`
**HLD base run:** `wf-1793271216692-3ugmxy`
**HLD effective hash:** `24be9a22390b...`

Make the approved review publication boundary recoverable after interruption. Persist one frozen intent and checkpoint before invoking the publisher, preserve them across owner takeover, and reject conflicting or late publication attempts. This fix supplies recovery and fencing only; S5 still decides coverage and writes the canonical review.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `RecoveryStore`

```typescript
class RecoveryStore { withPublicationFence<T>(leaseId: string, generation: number, checkpointDigest: string, intentRef: string | null, publish: (frozenIntentRef: string, assertCurrent: () => void) => Promise<T>): Promise<T>; }
```

**Parameters:**
- `leaseId: string` — Current daemon-owned run lease identity.
- `generation: number` — Persisted fencing generation.
- `checkpointDigest: string` — Exact accepted block checkpoint to freeze; never a HEAD diff.
- `intentRef: string | null` — Run-scoped staged immutable intent reference; null retrieves an already accepted intent.
- `publish: (frozenIntentRef: string, assertCurrent: () => void) => Promise<T>` — Trusted bounded publisher callback; it must assert current authority inside its canonical artifact queue immediately before mutation.

**Returns:** `Promise<T>` — Callback result only after verified frozen intent and still-valid ownership; callback is not promised exactly-once and S5 must reconcile its own canonical operation.

**Errors:**
- `RecoveryError` when Invalid/foreign reference, checkpoint or intent conflict; missing intent on null lookup; stale owner; terminal/stale run; unsupported legacy pending publication; callback timeout/failure or uncertain intent append.

**Preconditions:**
- Exclusive daemon process guard, current lease/generation and valid verified recovery history.
- No issued/partially-accepted provider attempt remains active. S5 must assess eligibility/freshness/party before entering this primitive.
- Callback is trusted daemon composition, performs no LLM call, honors guard before canonical mutation, and does not recursively enter the same recovery queue.

**Postconditions:**
- Durable publication-intent acceptance freezes one checkpoint and state completion-requested before callback invocation.
- Repeated identical binding reuses original intent; different intent/checkpoint refuses before callback. Null never invents intent.
- No canonical CR, coverage decision, review verdict, human approval or terminal receipt is manufactured by this primitive.

## 3. Data model changes

### 3.1 `RecoveryView publication binding` — field-add

Modify existing src/workflow/code-review/investigation/recovery-replay.ts and src/workflow/code-review/investigation/recovery-types.ts. Add private replay projection publication: {version:1,intentRef:string,intentDigest:string,checkpointDigest:string,acceptedGeneration:number} | null. Initialize null for existing histories. The run owns zero or one binding; binding references exactly one immutable staged intent blob and one accepted checkpoint. The intent object remains opaque to sc4; validate canonical JSON object and run-scoped reference/digest closure only. Record the digest independently and verify blob content on each replay/retrieval. No change to the approved ReviewRecoveryV1 public shape or canonical artifact JSON. [c1,c2]

```
RecoveryView.publication: { readonly version: 1; readonly intentRef: string; readonly intentDigest: string; readonly checkpointDigest: string; readonly acceptedGeneration: number } | null;
```

**Call sites:**
- `src/workflow/code-review/investigation/recovery-replay.ts`
- `src/workflow/code-review/investigation/recovery-types.ts`

### 3.2 `Publication-intent journal transition` — new

Implement in existing src/workflow/code-review/investigation/recovery-lifecycle.ts and src/workflow/code-review/investigation/recovery-store.ts, with the event kind registered in recovery-types.ts/recovery-journal.ts. Payload version1 contains leaseId, wallMs, intentRef, intentDigest and checkpointDigest; existing envelope carries run/subject/policy/generation and ordered hash-chain identity. Validate current running owner, checkpoint equality, absence of active issued attempts and prior binding before append. Resolve staged object before accepting. This one event atomically creates binding and changes state to completion-requested; fsync precedes callback. No second append of requestCompletion is required. Uncertain append returns no callback result; reconcile event under owner before retry. Same binding replay appends nothing; conflicting binding refuses. Event ordinal advances while accepted-block sequence/checkpoint stay unchanged. Pending work cannot be accepted once frozen. [c1,c2]

**Call sites:**
- `src/workflow/code-review/investigation/recovery-store.ts`
- `src/workflow/code-review/investigation/recovery-lifecycle.ts`
- `src/workflow/code-review/investigation/recovery-journal.ts`

### 3.3 `Completion-requested takeover` — invariant-change

Change only the sc4 lifecycle/replay/store files. Permit claim/takeover of completion-requested when a valid durable publication binding exists, preserving that state and exact checkpoint/intent while strictly increasing generation. Ordinary running/paused recovery unchanged; completed/cancelled/stale cannot acquire new publication authority. Earlier requestCompletion histories with no durable binding remain readable and explicitly unsupported for automatic publication recovery; do not synthesize a publication operation from an unfrozen legacy state. S5 must start a newly assessed publication/run for those states. At completed status the caller reads the existing terminal receipt; withPublicationFence must not invoke a mutating callback again. This deliberately fixes new frozen-publication recovery without claiming a nonexistent legacy intent. [c1,c2]

**Call sites:**
- `src/workflow/code-review/investigation/recovery-lifecycle.ts`
- `src/workflow/code-review/investigation/recovery-store.ts`

### 3.4 `Bounded publication fence` — new

Implement the approved method on RecoveryStore in src/workflow/code-review/investigation/recovery-store.ts, factoring a new src/workflow/code-review/investigation/recovery-publication.ts helper only if needed for readability. Enter the existing canonical run-root queue, assert exclusive process ownership/current lease, validate/stabilize the frozen binding, then invoke callback. A closure checks active invocation token, checkpoint/intent/generation/process guard/lease and monotonic deadline. Ten-second callback response ceiling is independent of review's five-minute model allowance. Successful callback is not a terminal run transition; S5 records its verified receipt afterward through existing recordCompletion outside this queue. On callback failure or timeout retain frozen intent and expose uncertainty. Timeout revokes assertCurrent and reports failure, but does not pretend to cancel an already-started external commit. Keep the queue's write fence held until the actual callback settles; if it never settles, that run remains fenced until the daemon process is safely restarted. Do not release the queue merely because the caller's timeout promise resolved. No takeover/concurrent mutation can overlap the undrained callback. Late callbacks must call the revoked guard before writing; this is a trusted adapter requirement, not a sandbox for arbitrary JS. Same-intent retry may invoke callback again so S5 can perform its canonical identity/CAS reconciliation. [c1,c3]

**Call sites:**
- `src/workflow/code-review/investigation/recovery-store.ts`
- `src/workflow/code-review/investigation/recovery-journal.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/resume-frozen-review-publication-after-interruption-E202610290764c4bc/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Foreign/missing/corrupt intent or mismatched checkpoint.** (terminal)
  - Detection: Resolve run-scoped blob, validate object/version/digest and compare current accepted checkpoint with persisted binding.
  - Response: Reject before callback, no new intent or terminal state; corrupt reachable history refuses.
  - User impact: Publication cannot use the wrong review state.
- **Lease takeover or late callback after timeout.** (recoverable)
  - Detection: Generation/lease/process-epoch assertion plus active invocation token and deadline fail.
  - Response: Revoke callback authority; retain frozen intent and uncertainty. Keep queue fence until callback drains; unresponsive run requires safe daemon restart.
  - User impact: No competing publication starts while an old side effect is still in flight.
- **Crash after intent append or callback side effect but before terminal receipt.** (recoverable)
  - Detection: Verified journal has frozen binding and no terminal receipt after reopening.
  - Response: Permit current owner takeover, preserve frozen state and invoke same-intent reconciliation; never claim callback exactly-once.
  - User impact: Recover canonical result through S5 without repeating review work.
- **Attempt still executing when publication is requested.** (recoverable)
  - Detection: Replayed accounting contains issued or partially-accepted live attempt.
  - Response: Refuse intent acceptance; caller settles/cancels/reconciles attempt first.
  - User impact: Review and publication cannot advance concurrently.
- **Legacy completion-requested state has no frozen binding.** (terminal)
  - Detection: Replay yields pending state with publication null.
  - Response: Explicit unsupported automatic publication recovery; retain history and require a newly assessed run, never infer prior canonical intent.
  - User impact: Honest limit on old incomplete state recovery.
- **Callback throws, returns after revocation, or attempts nested store writes.** (recoverable)
  - Detection: Callback rejection/deadline/guard failure; queue contract prohibits reentrancy, and wrapper diagnostics identify undrained invocation.
  - Response: No success result or completion receipt; frozen intent retained. Document callback as trusted/non-reentrant and test its required guard behavior.
  - User impact: Failure stays resumable or explicitly fenced rather than falsely completed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Same intent and checkpoint repeated after lost ACK. | Return original binding; callback may reconcile same operation but no new intent event. |
| Null intentRef with an accepted binding. | Use original ref/digest; null with no binding refuses. |
| Distinct callback callers race on one run. | One run queue serializes them; stale generation or conflicting intent refuses before callback. |
| Run already completed. | Read terminal receipt through existing status; no new mutating callback authority. |
| Source-only or indexed run. | Same opaque intent/fencing behavior; sc4 does not evaluate review criteria or mode. |

**Invariants to preserve**

- The run journal is authoritative and accepted-block sequence is independent of control event ordinal; immutable blob closure is verified. Reused discovery bundle c1. [[c1]]
- Canonical eligibility/publication remains S5 and rollout remains S6; approved AMD only grants sc4 recovery/fence responsibility. Approved artifact bundle c2. [[c2]]

## 6. Test strategy

**Test framework:** `node:test and node:assert/strict via tsx; reuse recovery fixtures and real child-process crash harness; no live LLM.`

**Test levels**

- **unit** — Verify frozen binding/reducer and callback authority checks.
  - Subjects: `Publication intent identity, run reference, checkpoint and active-attempt validation`, `Completion-requested lease takeover preserves frozen state`, `Identical/null binding replay and conflict refusal`, `Deadline revocation and undrained callback write-fence retention`
  - Fixtures: `Existing deterministic recoveryFixture`, `gated callback and fake/mock timer`, `forged/corrupt/missing intent values`
- **integration** — Prove actual journal durability and concurrency around the callback boundary.
  - Subjects: `Crash before/after frozen intent commit and after callback before receipt`, `Concurrent same/different intent and stale owner callbacks`, `Successful callback followed by separately recoverable terminal receipt`, `Legacy pending state refusal and unaffected existing recovery`
  - Fixtures: `Extend recovery child worker with publication fault boundaries`, `temporary private run root and append faults`, `deterministic external-write stand-in with operation identity`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Local acceptance: one valid intent/checkpoint becomes durable before callback; identical/null replay no new event; forged or conflicting binding refuses.` |
| `ac2` | `Local acceptance: restart/takeover preserves completion-requested state and frozen intent with increased generation; old owner cannot publish.` |
| `ac3` | `Local acceptance: ten-second response timeout revokes guard but queue remains fenced until actual callback drains; no false cancellation/exactly-once claim.` |
| `ac4` | `Local acceptance: crash/lost-ACK reuses frozen intent and terminal receipt remains separate; legacy no-intent pending run is explicitly unsupported and existing recovery tests pass.` |

## 7. Migration

**State before:** Discovery c1: RecoveryStore has per-run queue and completion-requested state but no frozen publication binding; lifecycle claim rejects that state. Existing real reproduction confirms refusal. Discovery c2: approved AMD/S5 LLD require this owner-scoped prerequisite.

**State after:** Existing recovery runtime supports one durable publication binding and fenced callback with safe completion-requested takeover. No canonical CR changes or production routing activation.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Extend internal replay projection with nullable publication binding and register versioned publication-intent event; preserve all existing event semantics. — ↩ rollbackable
2. Implement exact approved withPublicationFence method and conditional pending-state takeover; exercise deterministic faults/concurrency/deadline tests. — ↩ rollbackable
3. Expose capability to downstream S5/S6 only after prerequisite build approval. Older binaries encountering the new event must refuse rather than discard it; rollback keeps affected runs paused and journal intact. — ↩ rollbackable

**Backward compat:** No change to ReviewRecoveryV1 public fields, sc3/sc6 signatures, artifact JSON or default engine. Existing histories initialize publication null. New event kinds are forward-incompatible with older runtime readers and therefore never silently downgraded. Legacy completion-requested runs without a binding remain readable but explicitly non-resumable for automatic publication.

## 8. Alternatives considered

### 8.1 a1: One durable intent transition in the existing run journal — **CHOSEN**

Freeze an opaque intent reference and checkpoint atomically in sc4, then execute a fenced callback.

Extend the existing recovery reducer with one versioned publication-intent event. Reuse per-run queue and generation fencing; completion-requested takeover preserves the accepted intent. The public approved withPublicationFence method returns the callback result only while its authority is valid, without interpreting canonical CR content.

### 8.2 a2: Separate publication sidecar with journal pointer

Store publication state in a second durable sidecar linked from the run journal.

Keep frozen intent and callback state in an independently versioned sidecar, with journal records linking accepted sidecar revisions. Recovery verifies both stores and fences callbacks against the linked revision.

**Rejected because:** More failure boundaries without added user value.

## 9. References

- **[[c1]]** `code` `src/workflow/code-review/investigation/recovery-store.ts`
- **[[c2]]** `code` `src/workflow/code-review/investigation/recovery-lifecycle.ts`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/AMD-c32aa60534232f36-1.json`
- **[[c4]]** `prior-artifact` `docs/standalone/resume-frozen-review-publication-after-interruption-E202610290764c4bc/ISSUE.md`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 7 hold** · template `design-issue` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-29T10:59:10.834Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
