<!-- insrc:artifact EXT-e6ddcdcb3d9cf330-s4 -->

# Extend: review-committed-work-task-checkpoints — Show incremental progress during background code reviews

> **Extends Epic `review-committed-work-task-checkpoints`** — this builds on existing docs + code; no new Epic was created.

**Scope:** M   ·   **New Story:** `s4`

Adds S4 to the current task-checkpoint review epic: incremental user-visible review progress. Backlog only.

## Added Story

### s4: Show incremental progress during background code reviews

**User value:** Users can see which task is being reviewed and the last observed activity throughout a long review, without additional model calls. This story supplies activity observations for FUTURE-progress-based-review-timeouts; timeout intervention policy remains separate. Backlog only; no implementation authorized.

**Acceptance criteria:**
- **ac1:** Given A background review is running, when The controller polls its progress, then It shows phase, task ID/name and position, completed/total tasks, review/task elapsed time and timestamp of last observed activity. Phases cover scope preparation, task review, test execution, feedback persistence and CR publication; unavailable activity is explicitly unknown..
- **ac2:** Given A task runs for several minutes, when Native CLI events report source reads, tool/test starts or completions, model output or feedback submission, then Bounded sanitized progress metadata updates during the task without extra model calls, reasoning text, raw prompts or raw tool output; routine updates are throttled and do not rewrite immutable submitted packets or completed results..
- **ac3:** Given A subprocess is alive but no meaningful activity is observable, when A heartbeat is received or elapsed time advances, then The display distinguishes process liveness from last meaningful activity and never invents progress percentages, findings or completion. This story does not change timeout/retry policy..
- **ac4:** Given Claude or Codex performs the review, when Progress is polled after reconnect or for concurrent independent review IDs, then Both providers expose the same normalized behavior; progress is isolated by review ID/attempt/task, stale data is labelled, and reconnect recovers the latest snapshot without restarting review..
- **ac5:** Given A user waits for review, when A phase changes or 30–60 seconds pass, then The controller surfaces a concise update using existing polling, while terminal completion and errors remain visible and authoritative. No additional LLM summary requests are made..

## Building on

- `file` docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/DEF.md
- `file` src/workflow/code-review/task-review/coordinator.ts
- `file` plans/progress-based-review-timeouts.future-work.json

## Next

Proposed HLD amendment `AMD-e6ddcdcb3d9cf330-1` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-e6ddcdcb3d9cf330-1`) and the updated Epic, then run `design.story` for the new Story `s4` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"e6ddcdcb3d9cf330","storyId":"s4"}
```
