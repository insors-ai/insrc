# Inclusive review budget: release handoff

Story: `a8c4399a90185f7f/s1`. Origin: `ISSUE-ecf8440c29a6aa99`.

The existing `review.chunkTokens` configuration remains unchanged (default
128000). It now caps the estimated complete request, including the final
serialized prompt and schema, declared tools, native/transport reserves,
completion allowance and reviewer inspection reserve. The estimator remains
three characters per token. This is the approved estimated policy, not a
verified hard ceiling on hidden native CLI requests.

Default reserves are 16384 native tokens, 1024 transport tokens, 8192 output
tokens, and 24576 inspection tokens for reviewer sessions. Planning reserves
8000 characters for correction; dispatch counts the actual correction instead.
A smaller declared context window lowers the effective cap. Missing,
unqualified or changed profiles refuse before provider dispatch. Managed
Ollama review calls charge accumulated history, tools and final structured
answers, preserving required evidence or refusing explicitly.

Execution uses ten minutes per current logical model-work unit, measured from
one original epoch. Completed units remain counted; replacing a unit with
subdivisions replaces its contribution. Retries retain the unit and epoch.
Attempts are bounded by role limits, remaining job time and the maximum attempt
ceiling. Adding work cannot revive an expired job. Outer transport, idle and
freshness limits remain distinct; a known incompatible outer ceiling refuses
explicitly.

Controller review clients must send a versioned `reviewBudget` declaration
with a qualified `controller-reserved` profile and fresh host-context reserve
on every turn. The server admits the whole MCP response, pins the policy and
assigns one request. Replies echo version, generation and callId with the
assigned answer. Old raw answers and tokens refuse. Schemas remain discoverable
through `insrc_schema`. External controller execution is unobserved; its host
context is reserved, not independently measured.

Central state claims are bound to the actual daemon request/channel owner.
Concurrent submissions refuse while claimed. Safe pre-write failures release
the claim; interrupted or ambiguous writes invalidate it. Completion receipts
make final-call replay idempotent. Design extraction and verdict coverage are
exact, with one whole claim and all its evidence per verification turn.
Generated `.insrc/artifacts/**` JSON/JSONL and histories are excluded from review
material, not deleted. Review documents stay in `/tmp`.

## Validation evidence

- Tasks t1–t12 passed daemon validation; task t12's initial missing verification
  cases were added and the second validation passed.
- Original 371253/225429-character fixtures exercise assembled planner,
  driver and provider preflight using real schemas and mode-specific reserves.
  Complete source atoms survive subdivision; telemetry contains counts and
  bounded identifiers, not source text.
- Registered MCP schemas, all review roles, managed history/final answers,
  dynamic time limits, central state ownership, real worker duplicates and
  real-git attribution are covered by the focused suite.
- Final focused matrix: 642 tests, 624 passed, 18 optional/live skips, no failures.
- Final full sweep: 7596 tests, 7347 passed, 98 failed, 10 cancelled, 138 skipped,
  3 todo. The same-runtime prebuild baseline also has 98 failures and
  10 cancellations. No new individual test failure remains; one extra file-level
  indexing-worker wrapper failure reports the same existing Node22 `.js` import
  resolution issue. It reproduces on the unchanged baseline in isolation
  (`/tmp/review-budget-node22-baseline-indexing-worker.log`).
- Full-suite and same-Node22 prebuild-baseline comparisons are retained under
  `/tmp/review-budget-final-full-comparison.json`. Existing backend failures
  are reported separately; the full suite is not claimed green.
- Production build evidence: `/tmp/review-budget-t13-build.log`.
- Final focused regression evidence: `/tmp/review-budget-t13-final-tests.log`.

## Controller recovery and compatibility after review fixes

Both controller flows and the protected design terminal share the same
owner-bound claim transaction. A fresh positive host reserve is admitted on
all turns, including the exact completion frame before persistence. Stored
frames carry attempt deadlines; state from the earlier incomplete protocol
without that deadline refuses explicitly. Each code-review dimension retains its own original execution epoch; Story reporting sums the completed dimension allocations.

| Reference | Direction and cardinality | Ownership and compatibility |
| --- | --- | --- |
| uncertain-state evidence.artifactId | uncertain receipt → canonical artifact, zero or one | The daemon derives the bounded ID before discarding source-bearing state; it is a recovery pointer, not proof of completion. |
| uncertain-state evidence.runId | uncertain receipt → review run, zero or one | Server-derived identifier retained for the existing bounded state lifetime; replay never reacquires a write claim. |

Lifecycle events also reach progress with numeric timing and digested obligation
identifiers. Budget errors distinguish dispatch, inspection, controller-frame
and mandatory-context overflow. Ordinary dependency exception text is excluded
from persistent review failure logs. Required corrections and evidence are
preserved or refused; unsupported review blocks are never silently dropped.

## Release sequence — pending BUILD approval

1. Complete the independent Story code review, resolve blocking findings and
   present BUILD and CR for explicit completion approval.
2. Audit the exact Story-trailered commits and the shared working tree. Preserve
   concurrent Stories and artifact approval/history records. Push the approved
   commits using the established branch workflow.
3. Update and restart the installed daemon with the established maintenance
   flow. Verify its reported installed commit includes this Story's final
   commit; rebuilding this checkout alone does not update that daemon.
4. Run one fresh TU1 review for `c66d49bb81925886/s1`. Record the new review ID,
   installed commit, source/chunk counts, inclusive budgets and timing. Confirm
   excluded artifact histories never enter material and every required chunk
   finishes before a review record is written.
5. Present the fresh review result. Keep TU1's existing approval and implementation
   records intact; resume its own workflow only after this installed smoke.

Deployment and the live TU1 smoke have not been performed by this build. The
previous failed TU1 review is diagnostic evidence, not a fresh passing review.

## Post-review validation

Production build and compiled smoke passed (`/tmp/review-budget-cr-fixes-final-build.log`, `/tmp/review-budget-cr-fixes-packaged-smoke.log`). Final targeted checks passed 51/51 (`/tmp/review-budget-cr-fixes-final-checks.log`); the broader review matrix passed 630 with 18 optional skips. The full suite remains non-green: baseline failures persist; two diagnostic expectation changes were corrected and rechecked, and a concurrent git_ls_files maxBytes change has an unrelated approval-class assertion failure. Comparison: `/tmp/review-budget-cr-fixes-full-comparison.json`.


## Review cycle 2 corrections

The production runtime forwards the trusted fourth request argument into the
step host. Both controllers share frame admission, observed duration and attempt
expiry helpers. Dimension jobs remain independent, as the approved LLD explicitly
requires; the earlier request to pool daemon dimensions conflicts with that
clause and is not applied. Corrections have their dedicated refusal code.

| Evidence | Ownership and lifetime | Compatibility |
| --- | --- | --- |
| CR body callEvents | successful CR → ordered safe call outcomes, zero or many | Optional additive field for older records. |
| .insrc/review-runs/<run-id>.jsonl | repository → per-run append-only diagnostic stream; contains start and terminal events even when no CR completes | Diagnostic evidence only; never a review pass or approval. Generated JSONL remains excluded from review source. |

Source digests are checked after awaited inspection and immediately before the
first review write. Authorized review fixes can then persist normally. The
completion receipt uses the persisted run ID. Every managed inspection turn
includes the full closing schema, and unsupported original blocks refuse before
flattening. Call observers cannot replace the review result or original error.

Cycle-2 validation: production build `/tmp/review-budget-cycle2-build.log` and packaged smoke `/tmp/review-budget-cycle2-smoke.log` passed. The affected matrix `/tmp/review-budget-cycle2-final-tests.log` reports 543 tests: 538 pass, five optional skips, zero failures. Existing full-backend baseline limitations remain documented above.


Cycle-2 follow-up: frame durations use process-monotonic time across worker handoffs. Controller start/terminal events also append to the canonical per-run evidence stream. Source fingerprints bind code continuations to file bytes and approved design/build inputs; attribution metadata is not source identity. The design persistence guard runs again after the awaited history read. Legacy code continuations refuse stale before requiring new protocol fields. Mandatory correction errors retain `correction-budget-exceeded` under the LLD's specific correction clause; generic dispatch growth keeps its separate code. Managed admission now reserves the complete known closing instruction as well as its native schema before inspection; a final request distinguishes oversized prior history from closing-instruction growth.

Follow-up validation: `/tmp/review-budget-cycle2-r2-final-tests.log` reports 543 tests, 538 pass, five optional skips and zero failures. Production build `/tmp/review-budget-cycle2-r2-build.log` and packaged smoke `/tmp/review-budget-cycle2-r2-smoke.log` pass. Deployment remains pending.


Final cycle-2 correction set: attempt expiry and observed durations use the same monotonic clock. Both current source bytes and the original resolved Story file scope are pinned. Recorder failures are reported with bounded categories and cannot skip transaction cleanup or replace the original error. Daemon artifact reviews persist their safe start/outcome events under `wr-<uuid>` run identities. Known incompatible outer allowances refuse before deterministic work starts. Legacy design continuations classify stale before requiring new fields; impossible gather obligations return inclusive typed breakdowns. Final affected matrix: `/tmp/review-budget-cycle2-final-matrix.log`, 553 tests: 548 pass, five optional skips, zero failures.
