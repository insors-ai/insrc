# S001 manual code review, round 7 — pass

Date: 2026-11-05. Story: E202611031bd72813:S001.
Review cycle 3, round 1, explicitly requested after fixes.

**Verdict: PASS within the reviewed source/host scope. No remaining HIGH or MED
finding identified.** Reviewed `6996817e3..dfee30261cadae230d97fc5d6697aba7da41a901`:
the turn-ended decision persistence correction and its two-request reload regression,
with checks of the related batch, restore, outcome and process-recovery paths.

This is a manual review, not a daemon CR or workflow approval. No production changes
or existing BUILD/TESTS/approval records were made. Historical review reports remain
unchanged; the prior MED is resolved at this reviewed head.

## MR6 resolved: pending delivery survives batch removal and reload

The decision handler now saves a full unresolved request for turn-ended decisions,
as it already did for in-turn decisions, before the completed batch removal is
persisted. The request retains its originating turn, title/detail, tool and command.
The delivered-batch removal/filtering still prevents a settled batch from being
restored and automatically rerun.

The original diagnostic gates the continuation before spawn, serializes the saved
session into an independent store, and opens a new host on that state. Observed:

- A full unresolved `batch-req` record remains, including `fixture-command` and its
  original turn, although the consumed batch is absent from the queue snapshot.
- The restored host emits an actionable approval card (`restoredApprovalEvents: 1`).
- An explicit retry is accepted (`retryStartedRun: true`). Reload itself does not
  automatically execute the old decision.

The new suite regression also covers two requests: both survive the handoff with
their payloads; neither reruns automatically; after both explicit approvals the
restored host starts one continuation containing both commands and settles both
records. The delivered-batch reload regression continues to pass.

Executable: [batch-handoff.mts](evidence/manual-code-review-round-7/probes/batch-handoff.mts).

## Regression checks

Thirteen diagnostics exercised the current sources, including these earlier findings:

| Area | Observed result |
| --- | --- |
| Detached A recovery while B runs | Targeted handle stops only A; B receives no signal and finishes naturally; continuation resumes native-A with A-command |
| Missing original process handle | Failure recorded without signaling A or B; no substitute foreground stop |
| Synchronous and asynchronous write failure | Known original stops and resumes its native session in covered active-origin cases |
| Unconfirmed exit | Actual adapter stopVerified returns false after both signal graces; host regression starts no continuation |
| Same-chat reused request ID | Separate commands and resolved records for distinct originating turns |
| Restored reused request ID | Approve/deny settle the new record and leave the old record unchanged |
| Cross-chat late callback | Originating conversation receives its own action; selected chat is not resumed |
| Legacy declaration ledger | A later turn reusing a call ID opens its own panel |
| Legacy panel closure | Surviving keyed panel receives refreshed content and its decision acknowledgement |
| Cancelled continuation | Releasing the original after delivery timeout does not launch the cancelled follow-up |

The corresponding affected suite includes the actual-adapter delayed-setup cancellation,
observer/follow replay, decoder checkpoint correlation, protocol and panel regressions.

## Validation and limits

- **765 passed, 0 failed, 0 skipped, 0 cancelled**, 16 affected test files,
  Node 22.23.2, serial file concurrency, `--test-force-exit`, 41,487.838375 ms.
  [Raw TAP](evidence/manual-code-review-round-7/affected-tests.tap).
- Plugin typecheck passed from `vscode-plugin`:
  `../node_modules/.bin/tsc --noEmit -p tsconfig.json`.
- [Evidence and source hashes](evidence/manual-code-review-round-7/evidence.json)
  preserve exact commands, observations and portable probe sources. A diagnostic's
  exit zero means execution succeeded; the recorded observations establish its result.
- Adherence, conventions, coverage and quality were checked in the current fix and
  related paths against the preceding findings. No additional concrete blocking
  finding was established. This is not a claim that every possible interleaving is
  exhaustively verified.
- Real hosts/lifecycle/presenter and the actual adapter stop boundary were exercised
  with injected clients/adapters/processes and in-memory stores. The reload probe uses
  an independent JSON-restored store; no real process or disk crash was simulated.
- No live providers/models, real shell actions, full backend sweep, rendered VS Code
  UI or JetBrains validation. Natural teardown is not established by force-exit tests.
  Native dropdown icon rendering remains unverified. These limits are unchanged from
  the earlier review scope and are not represented as completed verification.
- Unrelated dirty workflow files were preserved. No production code, runtime/model
  configuration or existing approval records were changed. **Manual review is passed;
  BUILD approval remains a separate explicit user action.**
