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
- Full-suite and same-Node22 prebuild-baseline comparisons are retained under
  `/tmp/review-budget-final-full-comparison.json`. Existing backend failures
  are reported separately; the full suite is not claimed green.
- Production build evidence: `/tmp/review-budget-t13-build.log`.
- Final focused regression evidence: `/tmp/review-budget-t13-final-tests.log`.

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
