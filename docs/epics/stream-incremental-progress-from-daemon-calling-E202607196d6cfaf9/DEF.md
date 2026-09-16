<!-- insrc:artifact DEF-6d6cfaf9a9b14bd4 -->

# Epic: During long-running daemon IPC operations — a workflow run or an analyze run that can take 30 to 40 minutes — the calling framework has no observable signal that anything is happening.

**Flavor:** enhancement
**Tracker:** [insors-ai/insrc#41](https://github.com/insors-ai/insrc/issues/41)

## Problem

During long-running daemon IPC operations — a workflow run or an analyze run that can take 30 to 40 minutes — the calling framework has no observable signal that anything is happening. Claude Code and Codex driving the daemon through the MCP server, and the IDE workbench driving it through its RPC client, both sit silent for the full duration: they cannot tell which internal stage is executing, cannot see that tokens are still being produced, and cannot distinguish a healthy long-running operation from one that has hung. The daemon internally tracks fine-grained phase and token progress for these operations, but that progress never reaches the caller, so an operator watching the client has no basis to decide whether to keep waiting or abort, and the experience of every long operation is an indefinite dark window ending only when the final result appears.

## Non-goals

- **Changing or extending the daemon-side emission of progress and token frames.** — The daemon already produces onProgress phase frames and onToken delta frames as IpcStreamMessage over the stream protocol; the defect is entirely on the consumption/forwarding side, so re-opening the emitter would expand scope without addressing the silence the caller experiences.
- **Defining a new on-wire frame format or a new IpcStreamKind for progress.** — IpcStreamMessage and IpcStreamKind already include the 'progress' and 'delta' kinds this work needs; a uniform progress contract should build on the existing frame type rather than invent a parallel one.
- **Adding, reordering, or altering workflow-chain stage semantics (task breakdown, task implementation, gates).** — Those concerns are owned by the existing plan and build Epics; this Epic is about the progress-transport path, not what the long operations themselves do.
- **Persisting a durable progress history, audit log, or replayable timeline of past operations.** — The gap is live in-flight visibility during an operation, not after-the-fact storage; adding persistence would be a separate storage concern and is not what makes the caller go dark.
- **Reintroducing or re-routing LLM provider access as part of the transport work.** — Provider routing and cloud-auth delegation are settled project constraints unrelated to forwarding progress frames; touching them here would violate existing architectural rules for no benefit to the progress path.

## Assumptions

- `high` The daemon already emits structured phase progress and token-delta frames as IpcStreamMessage on the unix-socket stream channel for workflow.run, so the missing work is downstream of emission. [[c3]]
- `high` The on-wire stream frame contract already carries the needed kinds ('progress' and 'delta') within IpcStreamKind / IpcStreamMessage, so a uniform progress-event contract can extend the existing frame rather than replace it. [[c1]]
- `high` The MCP tool surface today performs no forwarding of daemon progress frames to the client — no progressToken, progress-notification, or reportProgress plumbing exists. [[c2]]
- `med` These long operations routinely run on the order of 30 to 40 minutes, which is why the absence of any interim signal reads as a frozen client rather than a brief pause. [[c6]]
- `med` analyze.run is a sibling long-running operation that must be covered by the same progress-event contract, not just workflow.run. [[c4]]
- `med` The IDE workbench, like the MCP-driven callers, does not consume or render these frames today and needs a clean consumption API on its RPC client. [[c6]]

## Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | contract | The progress-event contract must be uniform across long operations, covering at least workflow.run and analyze.run, rather than a one-off shape per operation. | [[c4]] |
| `k2` | invariant | The design must build on the existing IpcStreamMessage / IpcStreamKind frame (which already includes 'progress' and 'delta') and must not introduce a competing wire format. | [[c1]] |
| `k3` | contract | The MCP tool surface must forward daemon progress to the calling framework as MCP progress notifications keyed by the caller-supplied progressToken. | [[c7]] |
| `k4` | contract | The IDE RPC client must be given a clean consumption API it can render as live phase + token progress, rather than parsing raw stream frames ad hoc. | [[c7]] |
| `k5` | convention | All caller access to the daemon stays IPC-only over the unix socket; the MCP server and IDE workbench never open the databases directly, so the progress path must ride the existing stream protocol seam. | [[c8]] |

## Stories

### E202607196d6cfaf9:S001 — One consistent progress signal for every long daemon operation

**User value:** `size: M`

A caller watching any long-running daemon operation receives progress events of a single consistent shape, so client tooling can render live progress the same way no matter which operation is running.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a long-running daemon operation (a workflow run or an analyze run) is in progress, when the operation advances from one internal stage to the next, then the caller receives a progress event of the uniform shape that identifies the stage now executing. _(operationalizes `k1`, `k2`)_
- **ac2:** Given a long-running daemon operation is actively producing output, when further output is generated while the operation continues, then the caller receives incremental progress events in the same uniform shape reflecting that ongoing production. _(operationalizes `k1`, `k2`)_
- **ac3:** Given both a workflow run and an analyze run are exercised end to end, when each reports its progress, then the events observed for both conform to the same contract with no operation-specific divergence in shape. _(operationalizes `k1`)_

### E202607196d6cfaf9:S002 — MCP-driven callers see live progress instead of silence

**User value:** `size: M`

Claude Code and Codex driving the daemon through the MCP server see live phase and token progress for a long operation, so an operator can tell a healthy 30-40 minute run apart from a hung one.

**Depends on:** `s1`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac1:** Given a caller invokes a long-running MCP tool and supplies a progress token with the request, when the underlying daemon operation reports progress, then the caller receives progress notifications keyed to that supplied progress token as the operation advances. _(operationalizes `k3`, `k5`)_
- **ac2:** Given a caller invokes the same long-running MCP tool without supplying a progress token, when the operation runs to completion, then the operation completes normally and no progress notifications are emitted for it. _(operationalizes `k3`)_
- **ac3:** Given a long-running MCP operation is in flight with a progress token supplied, when the operation both changes stage and continues producing output, then the notifications the caller receives convey the current stage and the ongoing production, not merely a final result. _(operationalizes `k3`, `k1`)_

### E202607196d6cfaf9:S003 — IDE workbench renders live progress through a clean consumption API

**User value:** `size: M`

The IDE workbench can render live phase and token progress for a long daemon operation through a clean consumption API on its RPC client, rather than sitting dark or parsing raw stream frames ad hoc.

**Depends on:** `s1`

**Acceptance criteria:**

- **ac1:** Given the IDE workbench drives a long-running operation through its RPC client, when the daemon reports progress for that operation, then the RPC client surfaces the current phase and ongoing token progress through a clean consumption API the workbench can render. _(operationalizes `k4`, `k5`)_
- **ac2:** Given the IDE is consuming live progress for an operation, when the operation finishes and its final result arrives, then the consumption API signals completion and stops reporting further progress for that operation. _(operationalizes `k4`)_
- **ac3:** Given progress is being reported to the IDE for a long-running operation, when the workbench reads that progress, then it consumes structured phase and token events through the provided API rather than interpreting raw stream frames itself. _(operationalizes `k4`)_
