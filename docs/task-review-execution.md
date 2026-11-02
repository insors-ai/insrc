# Task review execution and inactivity

The explicit `codeReview.task.*` engine reviews the submitted committed change
set. Commits are lookup pointers, not an alternative source of review scope.
The retired design and dimension/chunk engines remain unavailable with
`PENDING REVIEW RE-IMPLEMENTATION`; there is no fallback or activation flag.
Normal MCP entrypoint integration belongs to the review epic's S3.

## Execution policy

A task has no fixed wall-clock deadline. Its S/M/L duration is an advisory hint.
The task-owned monitor intervenes after **30 minutes without observed activity**.
Native model output and tool starts/completions renew that grace. A heartbeat,
a live process, an assignment poll or a replayed event does not. Tool IDs and
elapsed times are tracked separately; an open tool alone cannot renew the lease.
The host does not claim a separate per-tool kill mechanism or infer a proven hang
from silence. Cancellation still kills the owned subprocess group.

Claude task sessions consume incremental `stream-json` output; Codex consumes
incremental JSONL and waits for successful turn completion to establish finality.
Only normalized metadata is emitted as activity. Raw prompts, reasoning and tool
output are not progress messages. Frames, candidates, active tool records and
retained diagnostics are bounded; overflow refuses explicitly, without truncating
an assessment. Unrelated bounded provider calls keep their existing semantics.
Ollama activity-supervised task mode is explicitly unsupported; it is refused
before a model call or checkpoint write, without switching providers. Its bounded
non-task sessions remain available.

## Controller protocol

A controller start/resume declares `timingProtocol: "activity-v1"`. Frames expose
`executionId`, `taskId`, `nextSequence`, and `timing` with `mode: "activity"`,
`inactivityMs`, `inactivityRemainingMs` and advisory `expectedDurationMs`.
There is no `remainingMs` task-deadline field.

Scope, activity and result requests include the current task ID, execution ID and
strictly ordered positive sequence. `codeReview.task.activity` carries only
`model_output`, `tool_started` or `tool_completed`; tool events require a tool ID.
The host supplies observation timestamps. The latest accepted exchange receipt is
replayable exactly, without extending the grace. Conflicting, out-of-order,
wrong-owner and stale-generation requests reject. Explicit resume creates a new
execution ID for unfinished work. Completed task results are not repeated.
Disconnect interrupts controller-owned execution; it never silently continues it.

## Feedback and recovery

The host validates candidate schema, scope and evidence using the ordinary task
assessment path, then atomically saves the completed task before returning an
accepted receipt. Only then may the CLI be stopped. A later CLI wrapper failure
cannot revoke durable feedback. Partial JSON and tool acknowledgements are not
assessments; an unsaved or invalid candidate is never reported completed.
Validation/commit and inactivity intervention share one serialized task queue, so
feedback queued first can finish before a later expiry callback. Failed writes
stop scheduling and preserve the last durable checkpoint. There is no automatic
whole-review retry; callers explicitly resume unfinished work or submit a new
attempt for terminal failed/incomplete work.

## Diagnostics and next story

Inactivity diagnostics record the phase, activity age, active tools, sampled
local load/event-loop delay and metric availability. Local pressure is an
observation, not proof that it caused remote silence. Unknown remote/model waits
remain explicitly unconfirmed. These facts currently support internal execution;
user-facing incremental progress and durable progress snapshots belong to
`STORY-e6ddcdcb3d9cf330-s4` in the separate review epic.

Tests use fake clocks, real temporary Git repositories, real local IPC and fake
CLI binaries producing synthetic protocol frames. They establish implementation
behavior, not a live hosted-model acceptance result. Live verification follows
the daemon update and the separately approved progress work; no paid live sweep
is implicit in the deterministic tests.

## Incremental progress (S4)

`codeReview.task.progress` accepts `{ repo, reviewId, attempt }` and returns a
sanitized, read-only view. It never starts/resumes execution, renews inactivity,
or invokes a model. The view includes authoritative status/publication and
completed counts, plus task/phase, observed elapsed time, last meaningful
activity, last process observation and `live`, `stale` or `unknown` freshness.
A process observation is historical evidence, not proof of current liveness.
Generic native tools remain generic; the host does not guess that a command is
a test. Missing observations stay unknown, and no percentages are invented.

Each attempt can carry one optional bounded `progress` section inside the
existing `.insrc/tmp/code-review/<review-id>.json`. There is no progress journal
or second recovery file. Submitted packets and terminal feedback are unchanged.
Routine writes coalesce over five seconds; phase changes request an immediate
flush with at most one pending write. Task/feedback/publication boundaries use
the existing serial atomic writer. A provisional progress write failure retains
the prior durable observation and exposes a sanitized warning; feedback write
failure retains its existing fail-stop behavior. Timers and queued progress
writes stop when the execution retires.

`pollTaskReviewProgress` in
`src/workflow/code-review/task-review/progress-client.ts` is the explicit
controller helper. Supply `{ repo, reviewId, attempt }`, an `AbortSignal`, and
`onUpdate(text, view)`. It polls every five seconds and emits deterministic
updates on task/phase/status changes or after 45 seconds. It stops on completion,
interruption, reported review/publication error, cancellation or read failure.
No LLM summary call is involved. Cancelling observation does not cancel a daemon
review. Controller review still requires its existing owned connection; progress
polling cannot replace that connection or restart it after disconnect.

Reconnect to a running daemon review reads the same execution without retrigger.
After process restart, saved observations are stale; their elapsed values stay
frozen until an explicit review resume establishes a new execution. Existing
checkpoints without progress remain readable with unknown metadata. Downgrade
recovery with an older strict-schema binary is not promised; preserve checkpoints
and use the matching version. Normal MCP/session entrypoint migration remains S3;
retired review endpoints still raise `PENDING REVIEW RE-IMPLEMENTATION`.

Verification uses synthetic Claude/Codex stdout producers through the production
CLI decoder, IPC server, progress read route and polling helper. Tests also cover
write failure, stale process restart and independent review IDs. This is
controlled adapter/integration evidence, not hosted-model acceptance or a claim
that the installed daemon has already been updated.

The progress view also reports execution ownership as `active`, `starting` or
`inactive`, separately from the saved review status. A fatal checkpoint-write
failure or daemon restart can leave the durable header at `running` while no
execution exists. In that case the observer reports **explicit recovery required**
and stops polling; it does not invent failed task feedback, overwrite the
checkpoint or automatically retrigger. Cancellation closes the observation RPC
socket immediately and suppresses late updates; it does not cancel review work.

## Mandatory review and optional execution

Every review must inspect all in-scope changed code/modules, requirements and
acceptance checks, and relevant test coverage. Time, size, missing access or
another difficulty does not justify silently skipping a module. Missing
mandatory inspection or an unassessed coverage question belongs in `limitations`
and requires `incomplete`, with supported findings retained.

Running tests, integration checks, typecheck and builds is optional. The reviewer
may execute them when useful, but not running or rerunning them alone cannot
block a completed review. Record these disclosures in the existing nonblocking
`advice` section, prefixed `Optional execution:`; retain actual execution results
in `executedTests`. Never claim a builder-reported execution as the reviewer's.

`testCoverage.assessment: verified` means the evidence-based coverage assessment
is complete, not that the reviewer ran tests. Demonstrated missing or incorrect
tests are findings; missing coverage inspection remains incomplete. Reports label
review limitations as blocking and optional verification/advice as nonblocking.
The stored result shape and pinned historical assessments remain unchanged;
explicit historical `incomplete` results are not automatically promoted.

## Attribution scope

Attribution uses the submitted task selection, not every task in the referenced
Plan indiscriminately. A task-scoped review names only that task; a whole-story
review names all applicable Plan tasks. This is identical for initial reviews,
re-reviews and both reviewer routes. Instructions include the applicable IDs and
exact row count, and the native schema constrains IDs and row count accordingly.
The shared host validator still rejects duplicate/foreign/missing scopes and
omitted submitted change or test attribution. Applicable tasks with completed
results remain in attribution context; their saved results are never rewritten
or rerun by same-attempt recovery. Schema generation clones its templates so
concurrent scopes cannot alter one another's native constraints.

## Selected source supplied to reviewers

New packets select only reviewed-version code ranges: `segments: [{ after: [start, end] }]`
(inclusive, one-based). `before` selections are rejected on new attempts. The host
resolves the selected text from the pinned commit and embeds only those blocks,
with line ranges, in both attribution and task-assessment inputs. It does not
embed surrounding or previous-version source. Commit/parent/path pointers let
the reviewer fetch context or previous code from Git when needed.

A pure deletion is `segments: [{ deletionAt: n }]`, where `n` is the number of
reviewed-version lines preceding the deletion (zero at the beginning or for a
deleted file). The host verifies this boundary against the selected commit.
The marker contains no removed text; the reviewer can retrieve that from Git.
A deletion finding uses `path:max(1,n)`. Empty segments remain reserved for
metadata/non-textual changes.

Attribution changes and test records have explicit zero-based indices; every
entry must still be assigned. Re-review prompts embed saved attempt metadata
and feedback, with the complete immutable checkpoint available through read
tools, rather than repeating historical submitted packets. Existing stored
before/after attempts remain readable and resumable without rewriting their
input or feedback. They cannot be submitted as a new attempt.

## Native event duplicate window

The native stream decoder remembers the last 4,096 distinct accepted event IDs.
New IDs evict the oldest retained ID instead of ending an active review. A
duplicate still in the window is ignored without renewing activity. Events
older than this bounded window can be processed again; this is not a session
event quota. Active tools and accepted feedback have separate state, so window
turnover neither completes a tool nor discards an accepted assessment. UUID
length, frame/candidate byte limits, finality and malformed-input checks remain
in force. This applies to both Claude and Codex native review streams.

## Output failures and previous-round feedback

Claude and Codex activity sessions retain bounded output diagnostics through
`onDiagnostic` and `ReviewOutputFailureError`. Schema errors come from the same
AJV validation that accepts/rejects candidates. Claude tool errors are correlated
to `StructuredOutput`; unrelated Read/Bash failures are not schema errors. Codex
JSON errors apply to the final agent message after successful turn completion.
Neither route accepts malformed output or extracts missing fields from prose.

The host writes optional `review-response.failureDiagnostics` into the existing
review checkpoint. Attribution has one phase-level entry; assessment entries
belong to a selected task. Diagnostic receipts use the existing serial writer
and execution fences; they never renew inactivity or complete a task. Valid
corrected feedback marks the output diagnostic `resolved` while retaining its
evidence. New readers accept historical checkpoints without diagnostics. Old
strict binaries may reject new fields: do not strip/backfill history to downgrade
an active review. No separate recovery file or retry loop is introduced.

Each snapshot keeps at most eight distinct issues, bounded field/correction/error
strings and an optional 8 KiB rejected-output preview. Only declared output
fields are previewed; reasoning/prompt fields and arbitrary invalid-JSON prose
are excluded. All diagnostic evidence in an attempt is bounded to 32 KiB, inside
the existing whole-checkpoint limit. Optional excerpts/messages are removed first;
if required compact errors still cannot fit, persistence fails visibly.

The next attribution and task-assessment inputs carry structured, pointed data:

```json
{
  "previousRoundFeedback": [
    {
      "attempt": 4,
      "taskId": "t2",
      "phase": "assessment",
      "errors": [
        {
          "code": "MISSING_REQUIRED_FIELD",
          "field": "findings",
          "correction": "Return findings as a top-level JSON array."
        }
      ]
    }
  ]
}
```

This projection uses the latest earlier attempt by the same reviewer party and
only applicable unresolved tasks/phases. Exact failed-result origins retain their
original diagnostic provenance. A newer pass or resolved output error suppresses
older corrections. No diagnostic history means an empty array; old errors are
not inferred from generic messages. Corrections use host templates, never native
prose. Raw previews/messages and repeated schemas are excluded from this property
and raw diagnostics are also removed from ordinary inline history. The feedback
projection is at most 4 KiB; `previousRoundFeedbackTruncated` makes truncation
explicit. Full saved evidence remains available at the checkpoint path.

A native controller integration relays its diagnostic callback on the existing
`codeReview.task.activity` exchange, with the usual task/execution/sequence
fields and this event:

```json
{"kind":"diagnostic","phase":"assessment","diagnostic":{"provider":"codex","issues":[{"code":"INVALID_JSON","field":"/","correction":"Return one valid JSON object.","occurrences":1}]}}
```

Use the phase of the frame that started that native session (`scope` maps to
`attribution`); a late diagnostic from another phase is rejected. Advance the
exchange sequence only after an accepted receipt. Terminal native failures remain
failed task results; the diagnostic event itself is evidence, not completion.
The caller explicitly requests any subsequent attempt. The daemon still supplies
and enforces the output schema on every new submission.

## Normal MCP requests and story approval cleanup

`insrc_code_review_step` now exposes `start`, `resume`, `progress`, `publish`,
`assignment`, `scope`, `activity` and `result`. Use `insrc_schema` for the registered
input and `insrc_guide({ workflow: 'code-review' })` for the procedure. Every call
carries project, epic hash, review ID and attempt. Create the committed packet
before `start`: after-version blocks/deletion anchors alone define finding scope;
commit pointers never authorize a generic HEAD diff. Complete test details and
mandatory inspection of code/modules and relevant assertions remain required.
Optional test, integration and build execution remains nonblocking advice.

Start returns after admission/checkpoint creation; it does not wait for a model.
Poll progress/checkpoint separately. Controller exchanges use the live MCP
review-owner connection and exact task/execution/sequence envelope returned by the
host. Each review ID gets its own connection, so cancellation cannot disconnect a
different review. MCP session closure interrupts controller work, preserving durable
task results; explicitly resume after reconnect. Daemon reviews survive observer
loss. Neither process restart nor polling automatically resumes work. Terminal
failed/incomplete tasks are handled only in a later sequential attempt.

Task-review requests and code-review step calls stay with one main-daemon owner
through the existing worker router. Different review IDs can overlap native CLI
execution, while each review's task/provider calls remain serial. No worker-local
coordinator, additional thread pool, lease database or global model-review queue is
introduced. Design review and retired dimension/chunk routes remain unavailable.

Successful story BUILD approval invokes the canonical post-approval cleanup hook
for direct, single and batch approval. Approval returns `result.cleanup` containing
`deleted`, `retained` and `errors`; cleanup failure does not revoke approval. A short
story fence covers admissions, running reviews and publication retries. Active
matching work defers cleanup; repeat explicit approval of the same BUILD after it
settles. Missing daemon/cleanup support is reported as retained/errors rather than
silently dropping temporary history. A direct approval client delegates deletion
to the daemon; it does not create a separate cleanup owner.

Only bounded, literal regular checkpoint files in the canonical project directory
are candidates. Every saved attempt must be terminal, published and matched to
permanent version-2 CR history, including scope, results and origins. Unfinished,
unrepresented, malformed, future, foreign and symlinked files remain with reasons.
New CR summaries retain pointed native output failures (provider, task/phase,
code/field/correction/count and terminal code), omitting previews and verbose native
messages. Historical diagnostic-bearing checkpoints whose older CR lacks that
summary are retained; cleanup does not backfill or rewrite immutable attempts.
Unlink failures are per-file and retryable; permanent CR records survive deletion.
Terminal controller replay state is released only after its checkpoint is deleted.

Reproduce the compiled local integration smoke with Node 22:

```sh
npm run build
node scripts/smoke-task-review.mjs
```

The harness uses temporary Git/artifact files, real MCP and Unix sockets, an actual
worker route, a child-process restart, and a fake native Codex CLI. It verifies two
independent overlapping reviews, per-review ordering, duplicate rejection, native
validation failure followed by corrected next-attempt input, live-controller
interruption/explicit resume, unavailable design review, and approval-driven cleanup.
It calls no hosted model and claims no actual code-review accuracy or live test
coverage from its synthetic results. It does not touch the user's running daemon.

Deployment: push the reviewed/approved implementation, update and restart the
daemon, and restart/reconnect the MCP server so the advertised schema is refreshed.
Then explicitly repeat approval of the already-approved S2 BUILD to retry its
cleanup; inspect retained/errors rather than running another S2 model review.
