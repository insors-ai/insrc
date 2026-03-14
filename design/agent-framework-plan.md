# Agent Framework — Implementation Plan

7 phases, each producing a working, testable milestone. Old code stays working throughout — removed only after the new path is validated.

## Dependency Graph

```
Phase 1 (types, checkpoint, atomic writes)
    │
    ▼
Phase 2 (runner + TestChannel)
    │
    ├───────────┬───────────┐
    ▼           ▼           ▼
Phase 3     Phase 4      Phase 5
(ReplChannel) (designer)  (coder)
    │           │           │
    └───────────┴───────────┘
                │
                ▼
          Phase 6 (REPL integration, CLI commands)
                │
                ▼
          Phase 7 (cleanup, remove old code)
```

Phases 3, 4, and 5 can run in parallel — they share only the types and runner from Phases 1–2.

---

## Phase 1: Framework Core Types and Persistence

**Goal:** Foundational types, checkpoint store, atomic-write utilities. Everything independently testable with no external dependencies.

### Step 1.1: Add `agents` path to PATHS

**Modify:** `src/shared/paths.ts`

Add two entries to the `PATHS` object:
```typescript
agents:     join(INSRC_DIR, 'agents'),
agentIndex: join(INSRC_DIR, 'agents', 'index.json'),
```

### Step 1.2: Create framework types

**Create:** `src/agent/framework/types.ts`

All types from the design document:

- **Message envelope:** `AgentMessage<T>` — id (nanoid), agentId, runId, kind, payload, timestamp, replyTo?
- **Outbound messages:** `EmitMessage`, `GateMessage`, `GateAction`, `DoneMessage`, `ErrorMessage`, `CheckpointMessage`, `ProgressMessage`
- **Inbound messages:** `ReplyMessage`, `CancelMessage`
- **Channel interface:** `send()`, `gate()`, `onMessage()`, `close()`
- **Agent abstractions:** `AgentState`, `AgentStep<S>` (with optional `artifacts?`), `StepContext`, `AgentDefinition<S>` (id, version, initialState, steps, firstStep, migrate?)
- **Checkpoint:** runId, agentId, version, stepName, stepIndex, state, createdAt, completedSteps, status, pid, heartbeat
- **RunStatus:** `'running' | 'paused' | 'completed' | 'failed' | 'crashed'`
- **RunOptions**, **RunResult**, **RunIndexEntry**

Keep `AgentState` as `Record<string, unknown>` base. The generic `<S>` on `AgentStep` and `AgentDefinition` provides compile-time safety within each agent.

### Step 1.3: Create checkpoint persistence

**Create:** `src/agent/framework/checkpoint.ts`

File-based persistence — no daemon dependency:

| Function | Purpose |
|---|---|
| `atomicWriteSync(path, data)` | Write to `path.tmp`, then `renameSync` to `path` |
| `createRunDir(runId)` | `mkdir ~/.insrc/agents/<runId>/` + `artifacts/` |
| `writeCheckpoint(runDir, checkpoint)` | Atomic write `state.json` |
| `readCheckpoint(runDir)` | Parse `state.json`, delete orphaned `.tmp` |
| `writeMeta(runDir, meta)` | Write `meta.json` (agentId, version, repo, createdAt, inputHash) |
| `appendEvent(runDir, event)` | Append JSONL to `events.jsonl` |
| `writeArtifact(runDir, name, content)` | Atomic write to `artifacts/<name>` |
| `readArtifact(runDir, name)` | Read artifact or return null |
| `updateIndex(entry)` | Read-modify-write `index.json` (atomic) |
| `readIndex()` | Read all index entries |
| `acquireLock(runDir)` | `O_CREAT \| O_EXCL` lock file + stale-lock detection via PID probe |
| `releaseLock(runDir)` | Delete lock file |
| `deleteRun(runId)` | `rm -rf` run directory + remove from index |
| `pruneCompleted(maxAgeDays)` | Delete completed runs older than N days |

All checkpoint writes are synchronous to ensure crash safety. The lock protocol reuses the PID-probe pattern from `src/daemon/lifecycle.ts` (`process.kill(pid, 0)` + ESRCH handling).

**Design note:** `index.json` read-modify-write is not atomic across processes. Fine for single-process agents. Document as a known limitation.

### Step 1.4: Create helpers / StepContext builder

**Create:** `src/agent/framework/helpers.ts`

| Function | Purpose |
|---|---|
| `buildStepContext(channel, runId, agentId, config, providers, runDir, abortController)` | Wires all convenience methods into a StepContext |
| `createMessage<T>(agentId, runId, kind, payload)` | Message factory with nanoid + ISO timestamp |
| `generateRunId()` | `crypto.randomUUID()` |

StepContext convenience methods wire through to:
- `progress(msg)` → `channel.send(ProgressMessage)`
- `gate(opts)` → generate gateId, call `channel.gate()`, return reply
- `emit(text)` → `channel.send(EmitMessage)`
- `rpc(method, params)` → IPC call to daemon (best-effort, null on failure)
- `writeArtifact` / `readArtifact` → delegate to checkpoint module
- `signal` → from AbortController

### Step 1.5: Install test framework

**Modify:** `package.json`

Add `vitest` as devDependency. Add `"test": "vitest"` script. Create `vitest.config.ts` if needed (vitest auto-detects ESM + TypeScript).

### Step 1.6: Phase 1 tests

**Create:** `src/agent/framework/__tests__/checkpoint.test.ts`

- `atomicWriteSync`: round-trip, orphaned temp cleanup
- `createRunDir`: creates expected directory structure
- `writeCheckpoint` / `readCheckpoint`: serialization round-trip
- `acquireLock` / `releaseLock`: acquisition, stale lock detection, concurrent attempts
- `updateIndex` / `readIndex`: round-trip
- `pruneCompleted`: prunes old, preserves active

All tests use a temp directory.

---

## Phase 2: Agent Runner (Step Loop Engine)

**Goal:** The core `runAgent()` function. Testable with trivial mock agents.

### Step 2.1: Create the runner

**Create:** `src/agent/framework/runner.ts`

`runAgent(definition, channel, options): Promise<RunResult>`

**Initialization:**
1. If resuming: load checkpoint, validate version (call `migrate` if mismatch), verify artifact integrity (roll back if missing). Clean orphaned `.tmp` files.
2. If fresh: call `definition.initialState(options.input)`, generate runId, create run directory, write meta.

**Lock:** `acquireLock()` — throw if locked by another live process.

**Cancel:** Subscribe `channel.onMessage()` for cancel → set AbortController.

**Heartbeat:** `setInterval(30_000)` (unref'd) writes timestamp to a separate `heartbeat.json` file. Separate from `state.json` to avoid write races.

**Step loop:**
```
while step !== null:
  check signal.aborted → throw Cancelled
  look up step from definition.steps[stepName]
  result = await step.run(state, ctx)
  { state, next } = result

  // Checkpoint (atomic)
  write checkpoint to state.json
  append event to events.jsonl
  update index.json
  send CheckpointMessage

  step = next
  stepIndex++
```

**Completion:** Update index to `completed`, send `DoneMessage`, `channel.close()`.

**Finally:** Stop heartbeat interval, `releaseLock()`.

**Error handling:** Catch errors from `step.run()`. Send `ErrorMessage`. If recoverable, preserve checkpoint (allowing retry). If not, set status to `failed`.

**Artifact validation on resume:**
```
for each completedStep:
  if step.artifacts defined:
    for each expected artifact:
      if missing → roll back to this step, truncate completedSteps
```

### Step 2.2: Create TestChannel

**Create:** `src/agent/framework/test-channel.ts`

- Constructor takes scripted replies: `Array<{ gateId?, reply }>`
- `gate()` shifts next reply from script
- `send()` collects all sent messages into a `messages` array
- `cancel(reason)` simulates cancel via registered handlers
- Assertion helpers: `getEmitted()`, `getProgress()`, `getGates()`

### Step 2.3: Phase 2 tests

**Create:** `src/agent/framework/__tests__/runner.test.ts`

Trivial `CounterAgent` (steps: increment → increment → done, state: { count, target }):
- Fresh run completes with correct state
- Checkpoint written after each step
- Resume from mid-run continues correctly
- Cancel aborts the loop
- Missing artifact triggers rollback on resume
- Lock prevents concurrent runs
- Version migration called on mismatch

---

## Phase 3: ReplChannel

**Goal:** Terminal transport that maps the message protocol to readline I/O.

### Step 3.1: Create ReplChannel

**Create:** `src/agent/framework/channel.ts`

Exports `Channel` interface (re-export from types) and `ReplChannel`:

| Method | Behavior |
|---|---|
| `send(emit)` | `process.stdout.write(text)` |
| `send(progress)` | `log.info(message)` |
| `send(checkpoint)` | `log.debug(label)` |
| `send(error)` | `log.error(error)` |
| `gate(msg)` | Render gate to terminal → `askOnce('> ')` → parse response → return reply |
| `cancel(reason)` | Invoke all registered message handlers with CancelMessage |

Gate rendering adapts the existing `renderGate()` logic from `src/agent/tasks/designer/validation.ts` but generalized to work with `GateAction[]` (not hardcoded approve/edit/reject/skip). The `parseGateResponse()` is similarly generalized — actions are matched by name from the gate's action list.

Extract `askOnce()` from `src/agent/index.ts` (line 946) into a shared utility within `channel.ts`.

### Step 3.2: Framework barrel export

**Create:** `src/agent/framework/index.ts`

Re-export all public APIs: types, `runAgent`, `ReplChannel`, `TestChannel`, checkpoint functions.

---

## Phase 4: Designer Agent Migration

**Goal:** Rewrite the designer as an `AgentDefinition` with discrete steps. Old code stays working — REPL uses a feature flag.

### Step 4.1: Define DesignerState

**Create:** `src/agent/tasks/designer/agent-state.ts`

```typescript
interface DesignerState extends AgentState {
  input: {
    message:          string;
    codeContext:       string;
    template:         DesignTemplate;
    intent:           'requirements' | 'design' | 'review';
    requirementsDoc?: string;
    repoPath:         string;
    closureRepos:     string[];
  };
  requirements:       RequirementTodo[];
  currentReqIndex:    number;
  editRounds:         Record<string, number>;
  completedSketches:  RequirementSketch[];
  completedDetails:   string[];
  compressedHistory:  string;
  assembledOutput?:   string;
  summary?:           string;
  rawRequirements?:   string;
  enhancedRequirements?: string;
}
```

### Step 4.2: Create designer steps

**Create:** `src/agent/tasks/designer/steps.ts`

Each step is a thin orchestration wrapper around the existing pure functions. The LLM logic stays in `requirements.ts`, `sketch.ts`, `detail.ts`, `assembly.ts`, `context.ts`.

| Step | Calls | Artifacts | Next |
|---|---|---|---|
| `extract-requirements` | `extractRequirements()` | — | `enhance-requirements` |
| `enhance-requirements` | `enhanceRequirements()` | — | `validate-requirements` |
| `validate-requirements` | `ctx.gate()` | — | approve → `pick-next-requirement`, edit → self, reject → `extract-requirements` |
| `pick-next-requirement` | state scan | — | found → `sketch`, none → `assemble` |
| `sketch` | `writeSketch()` | `sketch-{N}.md` | `review-sketch` |
| `review-sketch` | `reviewSketch()` | — | `validate-sketch` |
| `validate-sketch` | `ctx.gate()` | — | approve → `detail`, edit → self, skip → `pick-next-requirement` |
| `detail` | `writeDetail()` | `detail-{N}.md` | `validate-detail` |
| `validate-detail` | `ctx.gate()` | — | approve → `pick-next-requirement`, edit → self, reject → `pick-next-requirement` (resets todo to pending) |
| `assemble` | `assembleDocument()` | `assembled.{md\|html}` | `null` (done) |

**Detail rejection fix:** On reject, mark todo as `pending` and clear sketch/detail. `pick-next-requirement` naturally re-selects it. This cleanly solves the incomplete TODO in the current code (line 264-283 of `index.ts`).

**Review intent:** Keep as a direct function call — not migrated. Single LLM call with no gates, no iteration, no value in checkpointing.

### Step 4.3: Create designer AgentDefinition

**Create:** `src/agent/tasks/designer/agent.ts`

Wire steps into `AgentDefinition<DesignerState>`:
- `id: 'designer'`
- `version: 1`
- `initialState`: map `DesignerInput` → `DesignerState`
- `steps`: all 10 steps from Step 4.2
- `firstStep: 'extract-requirements'`

### Step 4.4: Designer step tests

**Create:** `src/agent/tasks/designer/__tests__/steps.test.ts`

Test each step in isolation with `TestChannel` and mock LLM providers:
- `extract-requirements`: mock LLM, verify state update
- `validate-requirements`: approve/edit/reject scripts
- `pick-next-requirement`: selection logic
- Full requirement lifecycle (sketch → review → gate → detail → gate)
- `assemble`: verify final output

### Step 4.5: Designer integration test

**Create:** `src/agent/tasks/designer/__tests__/agent.test.ts`

End-to-end: `runAgent(designerAgent, testChannel, { input })` with scripted channel and mock LLM:
- Correct step sequence
- All artifacts written
- Resume from mid-run checkpoint
- Final output structure

---

## Phase 5: Coder Agent Migration (Tool Loop)

**Goal:** Rewrite the tool loop as a two-step agent.

### Step 5.1: Define CoderState

**Create:** `src/agent/tasks/coder/types.ts`

```typescript
interface CoderState extends AgentState {
  messages:      LLMMessage[];
  iterations:    number;
  maxIterations: number;
  intent:        string;
  pendingTools:  ToolCall[];
  results:       ToolResult[];
  finalResponse: string;
}
```

### Step 5.2: Create coder steps

**Create:** `src/agent/tasks/coder/steps.ts`

Two steps that form a loop:

| Step | What it does | Next |
|---|---|---|
| `plan-call` | Send messages + tools to LLM. If tool calls → store in pendingTools, next: `execute-tools`. If end_turn → store text, next: `null` | `execute-tools` or `null` |
| `execute-tools` | For each pending tool: if mutating + validate mode → `ctx.gate()` for approval. Execute. Append results to messages. Increment iterations. | `plan-call` (or `null` if max iterations hit) |

Checkpoint after each `execute-tools` completion (full round), not per individual tool.

**Claude pre-validation:** The existing `validateWithClaude()` can run as a pre-filter before the gate — auto-reject obviously dangerous calls before asking the user.

### Step 5.3: Create coder AgentDefinition

**Create:** `src/agent/tasks/coder/agent.ts`

- `id: 'coder'`, `version: 1`
- `firstStep: 'plan-call'`

### Step 5.4: Coder tests

**Create:** `src/agent/tasks/coder/__tests__/steps.test.ts`

- Mock LLM returns tool calls then end_turn
- Gate interaction for mutating tools
- Max iteration enforcement
- Checkpoint after each round
- Resume from mid-loop

---

## Phase 6: REPL Integration and CLI Commands

**Goal:** Wire the framework into the REPL (feature-flagged) and add `insrc agent` commands.

### Step 6.1: Resume detection in Session

**Modify:** `src/agent/session.ts`

Add `findActiveRuns(): RunIndexEntry[]`:
1. Read `~/.insrc/agents/index.json`
2. Filter by `this.repoPath` + status `running` or `paused`
3. For `running` entries: PID probe + heartbeat check → reclassify as `crashed` if dead
4. Return active + crashed entries

### Step 6.2: Feature-flagged designer path in REPL

**Modify:** `src/agent/index.ts`

In `handlePipelineIntent()`, for `requirements`/`design` intents, add a conditional block gated on `process.env['INSRC_NEW_AGENT']`:

```
if INSRC_NEW_AGENT:
  check for active designer runs → prompt resume
  create ReplChannel
  runAgent(designerAgent, replChannel, { input or resumeFrom })
  extract result from final state → update context tags
else:
  (existing ValidationChannel + for-await code)
```

The old code path remains the default until validated.

### Step 6.3: Feature-flagged coder path in REPL

**Modify:** `src/agent/index.ts`

Same pattern: gate on `INSRC_NEW_AGENT`, dispatch to `runAgent(coderAgent, ...)` or fall through to existing `runToolLoop()`.

### Step 6.4: CLI agent commands

**Create:** `src/cli/commands/agent.ts`

Following the pattern in `src/cli/commands/daemon.ts`:

| Command | Action |
|---|---|
| `insrc agent list` | Read index, crash-detect `running` entries, display table |
| `insrc agent resume <runId>` | Read checkpoint, create ReplChannel, `runAgent(..., { resumeFrom })` |
| `insrc agent discard <runId>` | `deleteRun(runId)` |
| `insrc agent prune` | `pruneCompleted(7)` |

**Modify:** `src/cli/index.ts`

Add `registerAgentCommands(program)` alongside existing command registrations.

### Step 6.5: Manual integration testing

Test scenarios:
1. Fresh designer run via `insrc chat` with `INSRC_NEW_AGENT=1`
2. Kill the process mid-requirement → restart → verify resume prompt → complete
3. `insrc agent list` shows the run
4. `insrc agent discard` cleans up
5. Tool loop with gate interactions for mutating tools
6. `insrc agent prune` cleans completed runs

---

## Phase 7: Cleanup

**Goal:** Make the framework the default. Remove old code.

### Step 7.1: Remove feature flag

Make `INSRC_NEW_AGENT` the default (or remove the check). Old path becomes dead code.

### Step 7.2: Delete old code

| Action | File |
|---|---|
| Delete | `src/agent/tasks/designer/validation.ts` (replaced by ReplChannel) |
| Remove | `runDesignerPipeline` generator from `src/agent/tasks/designer/index.ts` |
| Remove | Old `for-await` + `ValidationChannel` code from `src/agent/index.ts` |
| Remove | `runToolLoop` from `src/agent/tools/loop.ts` (if fully replaced) |

Keep re-exports from `designer/index.ts` that other code depends on (types, template utilities).

### Step 7.3: Simplify REPL

The REPL (`src/agent/index.ts`) becomes thinner: create `ReplChannel`, dispatch to agents, handle session lifecycle. The 980-line monolith should shrink significantly.

### Step 7.4: Update design doc

Update `design/agent-framework.md` with any deviations discovered during implementation.

---

## New Files Summary

| File | Phase | Purpose |
|---|---|---|
| `src/agent/framework/types.ts` | 1 | All framework types |
| `src/agent/framework/checkpoint.ts` | 1 | File persistence, locks, atomic writes |
| `src/agent/framework/helpers.ts` | 1 | StepContext builder, message factories |
| `src/agent/framework/runner.ts` | 2 | Core `runAgent()` step loop |
| `src/agent/framework/test-channel.ts` | 2 | Scripted channel for tests |
| `src/agent/framework/channel.ts` | 3 | Channel interface + ReplChannel |
| `src/agent/framework/index.ts` | 3 | Barrel export |
| `src/agent/tasks/designer/agent-state.ts` | 4 | DesignerState type |
| `src/agent/tasks/designer/steps.ts` | 4 | 10 designer step implementations |
| `src/agent/tasks/designer/agent.ts` | 4 | Designer AgentDefinition |
| `src/agent/tasks/coder/types.ts` | 5 | CoderState type |
| `src/agent/tasks/coder/steps.ts` | 5 | 2 coder step implementations |
| `src/agent/tasks/coder/agent.ts` | 5 | Coder AgentDefinition |
| `src/cli/commands/agent.ts` | 6 | CLI agent management |

## Modified Files Summary

| File | Phase | Change |
|---|---|---|
| `src/shared/paths.ts` | 1 | Add `agents`, `agentIndex` |
| `package.json` | 1 | Add vitest |
| `src/agent/session.ts` | 6 | Add `findActiveRuns()` |
| `src/agent/index.ts` | 6 | Feature-flagged new agent dispatch |
| `src/cli/index.ts` | 6 | Register agent commands |

## Test Files

| File | Phase | Tests |
|---|---|---|
| `src/agent/framework/__tests__/checkpoint.test.ts` | 1 | Persistence, locks, pruning |
| `src/agent/framework/__tests__/runner.test.ts` | 2 | Step loop, resume, cancel, artifacts |
| `src/agent/tasks/designer/__tests__/steps.test.ts` | 4 | Per-step isolation tests |
| `src/agent/tasks/designer/__tests__/agent.test.ts` | 4 | End-to-end designer |
| `src/agent/tasks/coder/__tests__/steps.test.ts` | 5 | Tool loop steps |

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| REPL monolith complexity | High | Feature flag; surgical modification of `handlePipelineIntent()` only |
| Heartbeat vs checkpoint write race | Medium | Separate `heartbeat.json` file (not `state.json`) |
| `index.json` concurrent access | Low | Single-process design; documented limitation |
| `askOnce()` readline conflicts | Low | Known existing issue, behavior unchanged |
| No test infra yet | Medium | Phase 1 establishes vitest before any logic is written |
| Designer step refactoring errors | Medium | Steps wrap existing pure functions; behavior preserved |
