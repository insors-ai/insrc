# Design review execution

`insrc_review_step` reviews a current DEF, HLD or LLD through coherent chunks and a final consistency check. The reviewer reads document paths and may inspect the codebase. Prompts contain policy and references; the artifact body is not copied into them.

The artifact's recorded author determines the opposite reviewer: controller-authored designs use the daemon's configured review role; daemon-authored designs use the live controller. Unknown authors are refused. The native reviewer uses the existing core model floor and activity supervision, with a 30-minute inactivity grace and separately tracked tools. Polls and heartbeats do not renew that grace.

## Workflow context

| Subject | Required context |
|---|---|
| Epic DEF | Declared seed SPEC, when present |
| Epic HLD | Approved DEF and any declared seed SPEC |
| Epic story LLD | Approved DEF containing the story, approved HLD, and declared seed SPEC |
| Standalone LLD | Captured scope and any declared seed SPEC; no invented DEF/HLD |
| Sized issue LLD | Approved originating ISSUE and any declared seed SPEC |

ISSUE, SPEC, PLAN and small/trivial routes without an LLD are not design-review subjects. A missing required Epic ancestor cannot change the route into standalone. A correction link provides context; it does not establish workflow ancestry. Future PLAN/TASKS/BUILD/CR artifacts are not prerequisites.

## Initial review protocol

Read `insrc_schema` for the current tool and phase before constructing a request. All phases use `repo`, `reviewId` and `attempt`. Repositories must be registered; paths remain within the project.

1. Call `start` with attempt `1`, a unique project-scoped review ID and `artifactPath` (canonical artifact JSON or its marked Markdown document). The acknowledgement returns the artifact identity, derived reviewer, status and checkpoint path. Exact duplicate admission is idempotent; conflicting input or concurrent reviews of the same subject are refused.
2. Native execution continues in the background after the submitting client disconnects. Poll `progress` about every 10–30 seconds and report meaningful progress. Defaults return metadata only. With `includeResult: true`, use `afterCompletedChunk` and the returned `nextCompletedChunk` to retrieve one completed result per page.
3. For a controller reviewer, keep the same MCP session and call `assignment`. The response contains `assignment` (possibly null while preparation finishes) and progress. An assignment contains the prompt, schema, execution ID, kind, optional chunk ID and latest accepted sequence.
4. Submit `plan`, `activity`, `result` or `failure` with that execution ID and the next positive sequence. Activity includes real session/tool events. `failure` carries a bounded technical code/summary. The host enforces actual connection ownership, generation, schema and sequence. Exact response replay is idempotent. Schema-invalid envelopes leave the healthy assignment intact; structurally valid but invalid review output consumes a technical failure and rotates the generation. Fetch the new assignment and pointed previous technical feedback. Accepted submissions acknowledge only after checkpoint persistence.
5. Wait for the entire review before corrections, finding resolution or approval. HIGH/MED findings and honest verification gaps do not skip later chunks. The host derives counts and final status from accepted feedback, with incomplete verification taking precedence over substantive changes requested.

Every inventory unit must have substantive coverage; a final consistency chunk cannot substitute for it. Missing mandatory verification is reported as a limitation, never a pass. Optional improvements and skipped optional execution belong in advice. Subject-only file watches and a one-second fallback check detect changes during long-running work; boundary and checkpoint-save checks reject late output. Once observed, invalidation remains even if original bytes are restored. Unrelated external changes do not restart the review.

## Recovery and technical retries

Recovery is an explicit `recover` request containing the usual identity, a literal `actionId`, and an `operation`. `attempt` names the source/current attempt. The owner persists admission and the next unit generation/reservation before acknowledgement. Exact action/input replay observes the same admission; conflicting reuse of an action ID is rejected. If a daemon was interrupted after admission, replay does not launch again: use the returned interrupted state to explicitly request recovery with a fresh action ID.

| State | Operation | Direction required |
|---|---|---|
| Interrupted unchanged subject | `resume` | Explicit controller retrigger; retain accepted plan/chunks and counters |
| Paused after technical exhaustion | `resume` | User approval recorded as `userDecision: {action: 'retry_failed_unit', reason, recordedAt}`; one extra execution only |
| Invalidated subject | `restart_full` | User approval recorded as `userDecision: {action: 'restart_full', reason, recordedAt}`; append a fresh full attempt without chunk reuse |
| Failed storage/domain/provider capability | No automatic recovery | Report the concrete error and await user direction |

Native requesting-client disconnects do not stop background work. A reviewing-controller disconnect interrupts unfinished work; recovery binds an actual live replacement connection only after the old execution has ended. An observer cannot steal an active assignment. Daemon restart never scans or resumes checkpoints automatically. Same-attempt recovery checks only the admitted subject pair, ignoring external reference/source changes; a fresh restart re-derives the workflow context and opposite reviewer.

The coordinator is the sole technical retry owner: one initial dispatch plus at most three automatic retries of only the failed planning/chunk unit. Native internal retries are disabled. Completed units stay unchanged. Each retry carries pointed diagnostics, not raw output or reasoning. Findings and honest incomplete coverage are accepted feedback, not retryable failures. After exhaustion no remaining unit starts; a directed extra execution does not reset the automatic budget. A crash after reservation conservatively consumes that reservation.

There is no fixed task deadline. Verified active tools retain their separate identity/elapsed state; their continued lifetime defers idle expiry without manufacturing activity. Tool completion restores the ordinary 30-minute model-wait grace. Polling, heartbeat and mere process presence never renew it; process/tool failures still reach the technical failure path.

## Checkpoints and limits

Checkpoints live at `<project>/.insrc/tmp/design-review/<review-id>.json`. Each attempt retains the original baseline/inventory, accepted plan/chunks, unit reservations, bounded technical diagnostics, recovery actions and one-fill directed outcomes. Completed units retain sealed retry summaries for later history publication. Older attempts are frozen when a new attempt is appended. Completed feedback is saved before advancement. Default progress returns current unit/retry/recovery metadata, never baseline bodies or full history; historical attempts remain observable by attempt number. One result page is at most 1 MiB; subject files are at most 8 MiB each and a checkpoint is at most 64 MiB. There are at most128 attempts/actions per their respective arrays, and at most129 completed planning/chunk summaries per attempt. Limits reject excess rather than silently discarding coverage/history.

S1 checkpoints remain readable. An interrupted S1 execution conservatively counts as an already-used initial reservation; old failed/completed terminal attempts are not silently revived. Selective impact analysis and permanent lifecycle/history publication remain later stories. `retry_publication` returns `publication_unavailable` until that publisher exists. Checkpoint feedback alone does not satisfy an approval gate; do not manufacture a legacy review record.

The main daemon owns all execution, including when session workers are enabled. Normal MCP and short unary `designReview.start/progress/assignment/plan/activity/result/recover/failure` operations share that owner. Assignment can persist a detected invalidation and uses the registered-repo modifying-call gate. Retired `workflow.review`, `workflow.reviewArtifact`, `workflow.resolveFinding` and old stream/claim/judge pipelines remain unavailable with `PENDING REVIEW RE-IMPLEMENTATION`. Working task-based code review is unchanged.

## Build and verification

Update/restart both the daemon and MCP process for normal deployment; existing MCP sessions retain their advertised schema until reconnecting. For an isolated check without replacing the running daemon:

```sh
npm run build
node scripts/smoke-design-review.mjs
node scripts/smoke-design-review.mjs --recovery
node scripts/smoke-design-review.mjs --live --repo /absolute/project --artifact .insrc/artifacts/LLD-HASH-s1.json
```

The default smoke uses an explicitly synthetic CLI binary through compiled stdio MCP and Unix IPC. `--live` uses the configured native review provider and a real design subject through the same normal MCP tool. Evidence is written under `/tmp/insrc-design-smoke-*/evidence.json`, including acknowledgement latency, observed unit timing, feedback visibility, model configuration, outcomes and limitations. Poll-based timing is approximate at the polling interval; it is not native model telemetry. A technical failure is outstanding, not a passing live check. A completed review may validly contain findings or substantive verification limitations.

`--recovery` uses only synthetic providers and a separate fixture owner process, project, private socket and fake CLI. It terminates/restarts that fixture owner, verifies unfinished-only recovery, exhausts four final-unit dispatches before one approved extra execution, and invalidates a running tool before an approved fresh full attempt. It never updates/stops the installed daemon and cannot be combined with `--live`. Evidence and checkpoint snapshots are under `/tmp/insrc-design-recovery-*/evidence.json`. Long-duration inactivity behavior is proven separately by virtual-clock tests, not real thirty-minute waits.
