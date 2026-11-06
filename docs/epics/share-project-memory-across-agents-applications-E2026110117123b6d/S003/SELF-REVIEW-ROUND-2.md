# S3 self-review round 2 — no remaining findings in the reviewed fixes

Date: 2026-11-04. Reviewed fix commit: `ae9146c01`.
Controller self-review requested by the user while the daemon review framework is
being repaired elsewhere. No independent daemon CR or workflow approval is claimed.

**Result: the three round-1 findings are resolved; no additional blockers found
in this round.** The original [report](SELF-REVIEW.md) remains historical evidence.
See [source-bound validation evidence](evidence/self-review-round-2.json) and the
[75-test TAP](evidence/self-review-round-2-store.tap).

## Finding disposition

| Finding | Correction | Verification |
| --- | --- | --- |
| SR1 HIGH: successful forget without protection | `store/plan.ts` now requires a tombstone for every successful forget, including `committed`. Existing guards still enforce the admitted selector, scope, operation, queue cutoff and generation before publication. No-effect failure/quarantine handling remains unchanged. | All six selector kinds reject an empty successful plan without advancing root generation or publishing a receipt. Mismatched selectors are rejected. Valid committed forgets survive reopen. Existing broad-forget/replay tests pass. The exact original probe now stops with `INVALID_REQUEST`. |
| SR2 HIGH: cold proof survives missing protection | `store/lance-store.ts` checks receipt-to-marker dependencies and marker-to-creator bindings before readiness. Published markers must match creator generation, project, epoch, queue, time and scope; cited rejection markers must predate the rejecting receipt. Missing or inconsistent dependencies make open unavailable. | Valid forget/rejection history reopens successfully and stays protected. Six corruption cases cover missing published protection, missing rejection protection independently of the creator's list, wrong queue, wrong generation, wrong creator and wrong timestamp. Every case fails before the recovery callback runs. The exact original probe now stops with `STORE_UNAVAILABLE`. |
| SR3 MED: backward clock adjustment returns not-yet-valid memory | `store/reads.ts` always samples final wall time and rejects rollback before projection evaluation. Forward boundary and monotonic lease checks are retained. | Rollback is rejected both with and without a future boundary; leases are released. Fresh reads at the earlier time return no item, and reads at `validFrom` return the item. Existing forward expiry/start and cleanup-race tests pass. The exact original probe now stops with `REVISION_CONFLICT`. |

## Review of the revised paths

Inspected the complete fix diff and traced each change through plan snapshotting,
writer admission/publication, protection guards, native open and cleanup, queue
recovery gating, and read finalization. The successful-forget check runs before
writer effects; rejection releases its admission reservation. Failed/quarantined
plans remain subject to the existing no-effect rule.

Cold audits retain bounded reference sets for one receipt and one decoded marker
at a time. Published-marker queries filter on the creator operation. Rejection
dependencies stream narrow physical keys and namespaces, derive candidate keys,
and fetch only referenced payloads. Referenced payload bytes are bounded; duplicate
matches fail closed. Every marker is independently checked against its creator,
so a rejection receipt cannot establish a marker's authority by citation alone.
The existing final native-version/owner checks still run before open succeeds.
No new store columns, format migration, public API or SDK dependency were added.

Reviewed normal successful forget, no-effect rejection, exact replay, broad and
exact selectors, scope/epoch boundaries, cold logical corruption, ownership on
failed open, forward validity transitions and monotonic read cleanup. Final wall
time is sampled after awaited cleanup and final binding/generation checks; no
new await follows that sample before the projection is returned.

## Validation and limits

- Relevant native store suite: **75 passed, zero failures/skips/cancellations**
  on Node 22.23.2/macOS APFS. This includes all 72 earlier store tests and three
  new grouped regression tests covering multiple selector/fault/time scenarios.
- Package typecheck and TypeScript build passed. Staged diff whitespace checks
  passed. The three archived round-1 probes were rerun unchanged; a harness
  asserted their expected typed rejection and nonzero exit status.
- No full backend, Linux, SIGKILL/platform or resource sweep was repeated. Earlier
  platform/source fingerprints qualify the preceding candidate, not this fix.
  Deferred backend failures remain tracked separately in issue #98.
- Cold corruption was injected deliberately into closed isolated stores. This
  validates fail-closed dependency checking, not arbitrary coordinated tamper
  detection or a hardware power-loss guarantee.
- Rejection-dependency scans remain history dependent. This round removes
  unrelated payload reads; it establishes no new recovery latency/RSS/SLO result.
- Runtime/model configuration and the broken review framework were not changed.
  No formal BUILD approval was made; later-story scope and prior deferred coverage
  remain pending as documented in the completion map.
