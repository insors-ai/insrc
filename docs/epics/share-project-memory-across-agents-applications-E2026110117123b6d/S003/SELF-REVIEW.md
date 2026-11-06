# S3 detailed self-review — blocked

Historical round-1 report. The three findings were corrected in `ae9146c01`;
the [post-fix round-2 review](SELF-REVIEW-ROUND-2.md) found no additional blockers
in the revised paths. Original observations below are preserved unchanged.

Date: 2026-11-04. Evidence snapshot HEAD: `c3123f929`; project-memory sources are unchanged
from candidate `0990b423e`. Verdict: **BLOCK — two HIGH findings and one MED finding**.

The user requested a controller self-review while the daemon review framework is
being repaired in another branch. This report records that review; it is not an
independent daemon CR verdict or BUILD approval. No production fixes are included.
Source fingerprints and executable observations are in
[self-review-evidence.json](evidence/self-review-evidence.json).

## SR1 — HIGH: successful forget can publish no deletion barrier

Locations: `packages/project-memory/src/store/plan.ts:72` and
`packages/project-memory/src/store/guards.ts:118–163`.

Only a `cleanup-pending` disposition requires a tombstone. A `committed` forget
with empty rows and empty revision preconditions passes validation. The guards
validate supplied tombstones but never require a matching marker for this
successful disposition. The writer therefore publishes a terminal success receipt
without durable protection against older pending captures.

Reproduction: enqueue capture A, then project-forget B. Submit B's otherwise valid
private commit plan with `rows: []` and a successful `committed` disposition.
B commits with zero markers; A remains eligible, commits, and becomes readable:

```json
{"forget":"committed","markers":0,"oldFrameEligible":true,"capture":"committed","currentCount":1}
```

This uses the intended private CommitPlan boundary, without direct native-table
mutation. A future worker omission could silently violate the store's enforced
deletion contract. LLD §3.15 requires broad protection even when affected memory
IDs are not yet known; §2.1 requires invalid plans to fail before publication.

Required correction: require the authorized, correctly bound protection marker
for every successful forget disposition, including `committed`. Preserve the
permitted no-effect failure/quarantine path. Reject invalid plans before mutation.
Add negative tests for missing/empty/mismatched protection across selectors and
positive tests proving that older frames stay rejected after replay and reopen.

Executable: [missing-forget-marker.mts](evidence/self-review-probes/missing-forget-marker.mts).

## SR2 — HIGH: cold reopen accepts a receipt whose protection is missing

Locations: `packages/project-memory/src/store/lance-store.ts:270–307` and
`packages/project-memory/src/store/receipts.ts:31–35`.

The cold metadata audit checks row validity, uniqueness, receipt counts and
row-to-receipt associations. It does not establish that the tombstones named by
retained receipts still exist and match those receipts. The receipt verifier can
then return terminal proof while eligibility evaluation sees no deletion barrier.

Reproduction: enqueue capture A, commit a valid project-forget B with a tombstone,
and confirm A is blocked. Close the store, remove only its tombstone through the
test native SDK, then reopen through the real fixture/recovery path. Reopen and
receipt verification succeed; A becomes eligible and readable:

```json
{"beforeEligible":false,"reopened":true,"proofStatus":"found","afterEligible":true,"capture":"committed","currentCount":1}
```

This is deliberate cold logical-corruption injection into an isolated closed
store. It demonstrates a fail-closed integrity gap, **not** that an ordinary
native crash produces a torn transaction. Hot native-version drift checks do not
cover this case: cold open adopts the already-corrupted version as its baseline.

Required correction: validate retained receipt protection dependencies before
readiness or queue recovery, including tombstone identity and operation, queue,
epoch and generation bindings. Missing/inconsistent protection must make the
store unavailable rather than restore eligibility. Apply bounded checks without
an unbounded history allocation. Add cold missing-marker and mismatched-marker
tests, including receipts rejecting events because of earlier tombstones. Future
S9 cleanup must preserve this invariant; S3 currently implements no history purge.

Executable: [cold-missing-marker.mts](evidence/self-review-probes/cold-missing-marker.mts).

## SR3 — MED: final read checks miss a backward wall-clock adjustment

Location: `packages/project-memory/src/store/reads.ts:145–157`.

Projection records future validity boundaries relative to its evaluation time.
The final check only detects crossing such a boundary in the forward direction.
It neither rejects a clock rollback nor always samples final wall time when no
future boundary exists. A memory valid during projection can therefore become
not-yet-valid before return and still be delivered.

Reproduction: commit memory with `validFrom: 100`, project at time 100, and rewind
the injected clock to 99 at `read-before-final`. One item is returned:

```json
{"finalNow":99,"validFrom":100,"evaluatedAt":100,"items":1,"nextBoundary":null}
```

LLD §2.4 requires re-evaluating validity at current time even without a generation
change. Monotonic lease expiry accounting is separate and does not repair this
wall-time eligibility check.

Required correction: always sample final eligibility time and reject rollback
before the projection evaluation time, or fully re-evaluate applicable bounds.
Retain forward-boundary checks and monotonic lease accounting. Add a regression
with no future boundary and a clock rollback, alongside forward expiry/start tests.

Executable: [backward-clock.mts](evidence/self-review-probes/backward-clock.mts).

## Validation and evidence

Ran the existing store suite with supported Node 22.23.2, serial test concurrency:

```sh
/opt/homebrew/opt/node@22/bin/node --import tsx --test --test-concurrency=1 packages/project-memory/src/__tests__/store-*.test.ts
```

Result: **72 passed, zero failed/skipped/cancelled**; duration 34,468.834792 ms.
The [raw TAP](evidence/self-review-focused.tap) is preserved. The three diagnostic
probes above were executed against separate real temporary native stores, then
rerun from their archived repository paths with identical observations. Run each
using Node 22 with `--import tsx`. They report defects; exit zero means the probe
executed, not that a safety assertion passed. They are outside the normal test glob.

Reviewed atomic writer publication, exact replay and revision preconditions,
canonical codecs and admitted source provenance, host policy and scope guards,
lifecycle transitions, tombstone applicability, proof lookup and queue recovery
integration, version-pinned read handles, opaque lease binding and final checks,
native open/audit/failure settlement, ownership retention, lazy package exports,
runtime shutdown and targeted cleanup boundaries. Reviewed the corresponding
S3 tests and approved LLD/plan, plus queue admission and relevant runtime code.
This was not a complete re-review of all S1/S2 internals or later-story features.

The main atomic publication/retry paths, trusted-host boundary, package isolation
and intentional NOT_READY public surfaces have supporting source/test evidence.
No additional concrete blockers were established in those areas. Existing forward
time and normal broad-forget tests pass but do not cover the adversarial cases.

## Limits and completion status

- Graph analysis was attempted but returned `repo-indexing` (631/5,096 files), so
  this review used direct source inspection and executable native probes.
- Checked the ER and sequence companions' presence and embedded diagram sources;
  browser-rendered visuals were not verified in this review.
- No new full backend/platform sweep was run. Prior package APFS/ext4 qualification
  and resource measurements remain historical evidence, with their existing limits.
  Backend failures deferred to [issue #98](https://github.com/insors-ai/insrc/issues/98)
  are separate from these three newly established S3 defects.
- No production code, runtime/model configuration or workflow approval was changed.
  The broken daemon review framework was not restarted or modified.
- All 17 task validations remain recorded, but passing validation does not resolve
  these findings. **S3 remains blocked on corrections and regression validation.**
