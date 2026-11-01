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
