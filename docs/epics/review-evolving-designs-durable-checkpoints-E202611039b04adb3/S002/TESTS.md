<!-- insrc:artifact TESTS-9b04adb36cac716d-s2 -->

# Tests: 9b04adb36cac716d s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 52 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T14:15:45.296Z on commit `0e8caf5be`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Strict recover/failure schemas discriminate phase and operation and reject invalid identities, attempts, decisions, unknown fields and size limits.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recovery and failure envelopes strictly separate transport phase, operation and user direction | `src/workflow/review/design-review/__tests__/recovery-contracts.test.ts` |

**unit: Additive S1 checkpoints and bounded sc3 counters/actions/unit summaries/progress metadata round-trip without copied content or raw transcripts.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S1 checkpoints remain readable and bounded recovery metadata round-trips without content or transcripts | `src/workflow/review/design-review/__tests__/recovery-contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/recovery-contracts.test.ts` | 0 | 2 | 0.7 s |  |

## t2

Run at 2026-11-03T14:23:27.541Z on commit `594b26247`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Atomic checkpoint failures preserve accepted snapshots and fence execution; direct save and commit preserve domain versus normalized I/O errors.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checkpoint I/O errors are normalized while domain and corruption codes survive without replacing accepted bytes | `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` |
| pass | coordinator commit preserves domain errors and fences every failed save before provider dispatch | `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` |
| pass | atomic checkpoint failure preserves the last accepted snapshot and cleans its own temporary file | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**unit: Per-unit counters, action replay identity, one-fill outcomes, sealed summaries and prior attempts enforce monotonic immutable history.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checkpoint recovery counters actions outcomes and completed-unit summaries are monotonic and prior attempts freeze | `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` |
| pass | accepted feedback cannot be rewritten and oversized stored results cannot bypass paging limits | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` | 0 | 4 | 0.7 s |  |
| `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` | 0 | 3 | 0.7 s |  |

## t3

Run at 2026-11-03T14:36:20.287Z on commit `3b77f023b`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Explicit unchanged-subject recovery skips accepted plan/chunks and completes report-only work without model calls.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit native recovery preserves accepted prefixes and durable replay reserves only unfinished work | `src/workflow/review/design-review/__tests__/recovery.test.ts` |
| pass | report-only recovery rebuilds the checkpoint report with zero provider construction or calls | `src/workflow/review/design-review/__tests__/recovery.test.ts` |

**unit: Recovery action replay/conflicts, missing checkpoints, controller rebind and fresh approved restart preserve authority, history and workflow context.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit native recovery preserves accepted prefixes and durable replay reserves only unfinished work | `src/workflow/review/design-review/__tests__/recovery.test.ts` |
| pass | controller recovery rebinds only after disconnect and rejects stale generations without repeating completed chunks | `src/workflow/review/design-review/__tests__/recovery.test.ts` |
| pass | changed subject recovery latches invalidation and approved full restart refreshes party without reusing old work | `src/workflow/review/design-review/__tests__/recovery.test.ts` |
| pass | recovery refuses missing checkpoints stale attempts and unavailable publication without invoking a provider | `src/workflow/review/design-review/__tests__/recovery.test.ts` |
| pass | workflow matrix resolves Epic designs, standalone LLD and ISSUE LLD without future artifacts | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | workflow requirements do not downgrade broken Epics or turn correction links into ancestors | `src/workflow/review/design-review/__tests__/subject.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/recovery.test.ts` | 0 | 5 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/subject.test.ts` | 0 | 3 | 0.7 s |  |

## t4

Run at 2026-11-03T14:49:37.107Z on commit `92d1e2f32`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Native and controller technical failures share initial-plus-three retry budget, pointed feedback and fresh generation while semantic findings/incomplete results never retry.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native retries only the failed unit with pointed feedback and preserves substantive findings and prior summaries | `src/workflow/review/design-review/__tests__/retry.test.ts` |
| pass | controller technical failures use the same budget and invalid review output rotates generation without accepting it | `src/workflow/review/design-review/__tests__/retry.test.ts` |
| pass | four controller execution failures pause remaining work with no reassignment or automatic budget reset | `src/workflow/review/design-review/__tests__/retry.test.ts` |
| pass | findings and verification gaps continue chunks, while failed durability and mutation stop advancement | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |
| pass | native schema failures retain pointed diagnostic corrections without raw output and pause after three retries | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |

**unit: Crash reservations survive recovery; exhausted reviews pause until one-launch user direction without resetting automatic budget or losing unit summaries.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | exhausted native retries pause and each approved recovery grants one execution without resetting the budget | `src/workflow/review/design-review/__tests__/retry.test.ts` |
| pass | failed retry reservation stops execution and an orphan exhausted reservation cannot reset its budget | `src/workflow/review/design-review/__tests__/retry.test.ts` |
| pass | checkpoint recovery counters actions outcomes and completed-unit summaries are monotonic and prior attempts freeze | `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/coordinator.test.ts` | 0 | 8 | 2.1 s |  |
| `src/workflow/review/design-review/__tests__/recovery-checkpoint.test.ts` | 0 | 3 | 0.7 s |  |
| `src/workflow/review/design-review/__tests__/retry.test.ts` | 0 | 5 | 0.8 s |  |

## t5

Run at 2026-11-03T15:01:41.412Z on commit `aa5842850`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Subject-only monitoring detects edits/deletion/rename during blocked execution and persists sticky invalidation despite restoration and late output.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | subject polling invalidates deletion symlink replacement and atomic rename for either subject representation | `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` |
| pass | blocked native work is durably invalidated before return and restored bytes cannot accept late output | `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` |
| pass | observed controller subject changes invalidate every exchange boundary and cannot be restored into acceptance | `src/workflow/review/design-review/__tests__/controller.test.ts` |

**unit: Final-report/activity-save races fail closed; external changes are ignored and watcher resources clean up and re-arm.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | subject change during final report save preserves historical feedback but never exposes a valid report | `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` |
| pass | subject invalidation rejects controller feedback queued behind a delayed activity save | `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` |
| pass | subject monitor filters unrelated events rearms renamed watches and disposes without treating polling as activity | `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` |
| pass | failed invalidation persistence stays visibly failed and never retries native work | `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` |
| pass | subject identity, containment and party are validated and only subject changes invalidate | `src/workflow/review/design-review/__tests__/subject.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/controller.test.ts` | 0 | 5 | 0.9 s |  |
| `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` | 0 | 6 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/subject.test.ts` | 0 | 3 | 0.8 s |  |

## t6

Run at 2026-11-03T15:09:08.564Z on commit `5be98972f`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Virtual-clock native/controller activity permits long active tools and meaningful progress without fixed deadlines, while true idle waits expire at thirty minutes.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | active tool lifetime defers expiry without renewing model activity and completion restores thirty-minute grace | `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` |
| pass | native and controller reviews survive a two-hour tool then complete under the same activity policy | `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` |
| pass | a truly idle controller expires through the shared bounded retry policy and ends paused | `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` |

**unit: Polling, heartbeat and process liveness do not renew activity; tool completion/failure and late output obey unit cancellation and timer cleanup.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | active tool lifetime defers expiry without renewing model activity and completion restores thirty-minute grace | `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` |
| pass | stopping a design activity monitor cancels tool-wait observation without synthetic activity | `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` |
| pass | native inactivity is supervised by the owner and observation never renews its grace | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |
| pass | a native provider returning after inactivity cannot publish a late valid plan | `src/workflow/review/design-review/__tests__/coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` | 0 | 4 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/coordinator.test.ts` | 0 | 8 | 2.1 s |  |

## t7

Run at 2026-11-03T15:24:37.395Z on commit `43db4833b`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Normal MCP and short main-owned IPC recover/failure routes enforce strict schema/repo gates, native provider routing and actual controller ownership.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal MCP and main-owned unary recovery preserve partial native work while independent subjects progress | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal stdio controller failure and explicit recovery retain actual connection authority and generations | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal stdio MCP and Unix IPC preserve native background work and controller connection authority | `src/mcp/__tests__/design-review.test.ts` |

**integration: Independent subjects and multi-session recovery preserve accepted results and reject duplicate dispatch, stale generations and observer takeover.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal MCP and main-owned unary recovery preserve partial native work while independent subjects progress | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal stdio controller failure and explicit recovery retain actual connection authority and generations | `src/mcp/__tests__/design-review.test.ts` |

**unit: Schema/guide and bounded progress expose retry/pause/restart rules while retired review calls remain unavailable.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | design schema discovery and steering expose bounded current phases and completion discipline | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal MCP and main-owned unary recovery preserve partial native work while independent subjects progress | `src/mcp/__tests__/design-review.test.ts` |
| pass | retired review operations throw the exact exception before parsing, providers or IO | `src/workflow/__tests__/review-unavailable.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/design-review.test.ts` | 0 | 4 | 9.4 s |  |
| `src/workflow/__tests__/review-unavailable.test.ts` | 0 | 2 | 0.9 s |  |

## t8

Run at 2026-11-03T15:42:21.824Z on commit `9d0831fdf`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: Compiled isolated fake-CLI normal-entrypoint recovery demonstrates retry pause/user action, subject invalidation and zero repeated accepted-chunk calls.**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-design-recovery-aPP8FU/evidence.json; /tmp/dr-s2-t8-recovery-smoke-final.log. Three compiled scenarios with 17 explicitly synthetic CLI calls; separate owner process was terminated/restarted, accepted prefix preserved, four automatic final dispatches followed by one directed execution, then mutation invalidation and a full fresh attempt. Installed daemon untouched. Baseline: /tmp/insrc-design-smoke-FWjH0y/evidence.json.

**integration: Focused regressions qualify native/controller parity and Epic/Standalone/Issue contexts with disposable fixtures, preserving unrelated review engines.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal MCP and main-owned unary recovery preserve partial native work while independent subjects progress | `src/mcp/__tests__/design-review.test.ts` |
| pass | normal stdio controller failure and explicit recovery retain actual connection authority and generations | `src/mcp/__tests__/design-review.test.ts` |
| pass | workflow matrix resolves Epic designs, standalone LLD and ISSUE LLD without future artifacts | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | native and controller reviews survive a two-hour tool then complete under the same activity policy | `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` |
| pass | optional execution notes remain nonblocking on daemon and controller routes and in CR publication | `src/workflow/code-review/task-review/__tests__/review-scope-policy.test.ts` |
| pass | skipped mandatory modules or test-coverage review stay incomplete even when optional checks pass | `src/workflow/code-review/task-review/__tests__/review-scope-policy.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/design-review.test.ts` | 0 | 4 | 9.3 s |  |
| `src/workflow/code-review/task-review/__tests__/review-scope-policy.test.ts` | 0 | 3 | 0.9 s |  |
| `src/workflow/review/design-review/__tests__/activity-monitor.test.ts` | 0 | 4 | 0.7 s |  |
| `src/workflow/review/design-review/__tests__/subject.test.ts` | 0 | 3 | 0.7 s |  |
