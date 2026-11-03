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
4. Submit `plan`, `activity` or `result` with that execution ID and the next positive sequence. Activity includes real session/tool events. The host enforces actual connection ownership, execution generation, schema and sequence. Exact response replay on the live owner connection is idempotent; semantic errors do not transfer ownership or close a healthy connection. Accepted submissions acknowledge only after checkpoint persistence.
5. Wait for the entire review before corrections, finding resolution or approval. HIGH/MED findings and honest verification gaps do not skip later chunks. The host derives counts and final status from accepted feedback, with incomplete verification taking precedence over substantive changes requested.

Every inventory unit must have substantive coverage; a final consistency chunk cannot substitute for it. Missing mandatory verification is reported as a limitation, never a pass. Optional improvements and skipped optional execution belong in advice. Subject changes invalidate the run at review boundaries; unrelated external changes do not restart it.

## Checkpoints and limits

Checkpoints live at `<project>/.insrc/tmp/design-review/<review-id>.json`. Each attempt retains the submitted identity, original subject baseline and inventory, accepted plan, completed feedback, progress and final report. Completed feedback is immutable and saved before the next unit starts. Default progress never returns baseline bodies or full history. One result page is at most 1 MiB; subject files are at most 8 MiB each and a checkpoint is at most 64 MiB. Oversize input is rejected rather than silently trimmed.

This first story supports initial attempts only. A controller disconnect preserves completed chunks as interrupted; no observer can take ownership. Technical failure, interruption or subject invalidation requires user input. Automatic retries, recovery, subsequent attempts, affected-chunk analysis and approval-history publication belong to later stories. Checkpoint feedback alone does not satisfy an approval gate; do not manufacture a legacy review record.

The main daemon owns all execution, including when session workers are enabled. Normal MCP and the short unary `designReview.start/progress/assignment/plan/activity/result` operations share that owner. Retired `workflow.review`, `workflow.reviewArtifact`, `workflow.resolveFinding` and old stream/claim/judge pipelines remain unavailable with `PENDING REVIEW RE-IMPLEMENTATION`. Working task-based code review is unchanged.

## Build and verification

Update/restart both the daemon and MCP process for normal deployment; existing MCP sessions retain their advertised schema until reconnecting. For an isolated check without replacing the running daemon:

```sh
npm run build
node scripts/smoke-design-review.mjs
node scripts/smoke-design-review.mjs --live --repo /absolute/project --artifact .insrc/artifacts/LLD-HASH-s1.json
```

The default smoke uses an explicitly synthetic CLI binary through compiled stdio MCP and Unix IPC. `--live` uses the configured native review provider and a real design subject through the same normal MCP tool. Evidence is written under `/tmp/insrc-design-smoke-*/evidence.json`, including acknowledgement latency, observed unit timing, feedback visibility, model configuration, outcomes and limitations. Poll-based timing is approximate at the polling interval; it is not native model telemetry. A technical failure is outstanding, not a passing live check. A completed review may validly contain findings or substantive verification limitations.
