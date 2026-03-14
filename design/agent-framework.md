# Agent Framework: Lightweight IPC Agents with Checkpointing

## Problem

The designer pipeline (`src/agent/tasks/designer/`) uses an async generator + `ValidationChannel` for 2-way communication. This has fundamental limitations:

- **No checkpoint/resume** — if the process crashes mid-requirement, all work is lost
- **No cancellation** — once a requirement loop starts, no clean abort
- **Fragile re-entry** — detail rejection rollback is incomplete (TODO in code)
- **Coupled to REPL** — generator ↔ readline tight coupling makes testing and alternate UIs impossible
- **No observability** — no structured event log; progress is ad-hoc `log.info()` calls

The tool loop (`src/agent/tools/loop.ts`) has similar issues — 25-iteration hard cap, no checkpointing, no way to pause and resume.

## Design Principles

1. **Message-based, not call-based** — agents communicate through typed messages, not function calls
2. **Checkpoint at every gate** — state is serializable and persisted before any user interaction
3. **Resume from any checkpoint** — crashed or abandoned runs can be resumed
4. **Transport-agnostic** — the message channel is an interface; REPL readline, WebSocket, or test harness all work
5. **Local-first persistence** — checkpoints persist to `~/.insrc/agents/<runId>/` as plain JSON files, no daemon dependency
6. **Single-process agents** — agents run in the REPL process (no new processes), use daemon IPC for DB when available

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Transport (implements Channel)                          │
│  ┌─────────┐  ┌───────────┐  ┌────────────┐             │
│  │  REPL   │  │ WebSocket │  │ Test Harness│             │
│  └────┬────┘  └─────┬─────┘  └──────┬─────┘             │
│       └─────────────┼───────────────┘                    │
│                     │                                    │
│              ┌──────▼──────┐                             │
│              │  Dispatcher │  routes messages to agents   │
│              └──────┬──────┘                             │
│          ┌──────────┼──────────┐                         │
│    ┌─────▼─────┐  ┌─▼────┐  ┌─▼──────┐                  │
│    │ Designer  │  │ Coder │  │ Tester │  ... agents      │
│    │  Agent    │  │ Agent │  │ Agent  │                   │
│    └─────┬─────┘  └──┬───┘  └───┬────┘                   │
│          └────────────┼─────────┘                        │
│                  ┌────▼────┐                             │
│                  │Checkpoint│  serialize + persist        │
│                  │  Store   │                             │
│                  └────┬────┘                             │
└───────────────────────┼──────────────────────────────────┘
                        │
                  ~/.insrc/agents/<runId>/
                        ├── state.json        current checkpoint
                        ├── events.jsonl      append-only event log
                        └── artifacts/        step outputs (sketches, diffs, etc.)
```

## Storage Layout

All agent state lives under `~/.insrc/agents/`, owned by the agent process (not the daemon). No DB dependency for core agent operation.

```
~/.insrc/
  agents/
    index.json                     # registry of all runs { runId, agentId, repo, status, updatedAt }
    <runId>/
      state.json                   # current checkpoint (AgentState + step cursor)
      events.jsonl                 # append-only event log (every message sent/received)
      artifacts/                   # step-produced files
        sketch-0.md                # requirement 0 sketch
        sketch-1.md                # requirement 1 sketch
        detail-0.md                # requirement 0 detail
        assembled.html             # final output
      meta.json                    # { agentId, version, repo, createdAt, input hash }
```

**Why files, not DB:**
- Agent must work even if daemon is down (local-first principle)
- JSON files are inspectable, diffable, and trivially backed up
- No schema migrations — just version field in meta.json
- Atomic writes via write-to-temp + rename (crash-safe on Linux/macOS)
- Cleanup is `rm -rf ~/.insrc/agents/<runId>`

**Retention:**
- Completed runs: pruned after 7 days (on session start)
- Active (incomplete) runs: kept indefinitely until resumed or explicitly deleted
- `insrc agent list` / `insrc agent prune` CLI commands for management

## Core Abstractions

### Message Protocol

All communication is typed messages. No function calls cross the agent boundary.

```typescript
// --- Envelope ---

interface AgentMessage<T = unknown> {
  id:        string;       // unique message ID (nanoid)
  agentId:   string;       // source or target agent
  runId:     string;       // execution run ID (groups a full agent invocation)
  kind:      string;       // discriminator for payload type
  payload:   T;
  timestamp: string;       // ISO 8601
  /** If this message is a reply, the id of the message it replies to. */
  replyTo?:  string;
}

// --- Agent → Transport (outbound) ---

/** Agent produced text output (streamable). */
interface EmitMessage {
  kind: 'emit';
  payload: { text: string; stream?: boolean };
}

/** Agent needs user input. Blocks until a Reply arrives. */
interface GateMessage {
  kind: 'gate';
  payload: {
    gateId:      string;
    stage:       string;     // e.g. 'requirements', 'sketch', 'detail'
    title:       string;     // short label for the gate
    content:     string;     // rendered content to show user
    actions:     GateAction[];  // allowed responses
    context?:    Record<string, unknown>;  // structured data for rich UIs
  };
}

interface GateAction {
  name:    'approve' | 'edit' | 'reject' | 'skip' | string;  // extensible
  label:   string;   // display label
  hint?:   string;   // help text
  needsInput?: boolean;  // true if action requires a text payload
}

/** Agent completed. Carries final result. */
interface DoneMessage {
  kind: 'done';
  payload: { result: unknown; summary: string };
}

/** Agent encountered an unrecoverable error. */
interface ErrorMessage {
  kind: 'error';
  payload: { error: string; recoverable: boolean };
}

/** Agent hit a checkpoint (informational — persistence is automatic). */
interface CheckpointMessage {
  kind: 'checkpoint';
  payload: { stepIndex: number; label: string };
}

/** Agent status update (progress, non-blocking). */
interface ProgressMessage {
  kind: 'progress';
  payload: { message: string; pct?: number };
}

// --- Transport → Agent (inbound) ---

/** User response to a gate. */
interface ReplyMessage {
  kind: 'reply';
  payload: {
    gateId:   string;
    action:   string;        // matches a GateAction.name
    feedback?: string;       // user text (for 'edit', 'reject')
  };
}

/** External request to cancel the run. */
interface CancelMessage {
  kind: 'cancel';
  payload: { reason?: string };
}
```

### Channel Interface

The transport layer. Decouples agents from the REPL.

```typescript
interface Channel {
  /** Send a message from agent to transport. Non-blocking for emit/progress/checkpoint. */
  send(msg: AgentMessage): void;

  /**
   * Send a gate message and wait for a reply.
   * Returns the reply payload. Throws if cancelled.
   */
  gate(msg: AgentMessage<GateMessage['payload']>): Promise<ReplyMessage['payload']>;

  /** Subscribe to inbound messages (cancel, etc.). */
  onMessage(handler: (msg: AgentMessage) => void): void;

  /** Signal that the agent run is complete. */
  close(): void;
}
```

### Agent Interface

Agents are state machines. Each step receives state, does work, returns new state + next step.

```typescript
/** Serializable agent state — must survive JSON round-trip. */
type AgentState = Record<string, unknown>;

/** A single step in the agent's workflow. */
interface AgentStep<S extends AgentState = AgentState> {
  name: string;
  /** Execute the step. Returns updated state and the name of the next step (or null to finish). */
  run(state: S, ctx: StepContext): Promise<{ state: S; next: string | null }>;
}

interface StepContext {
  channel:   Channel;
  runId:     string;
  agentId:   string;
  config:    AgentConfig;
  providers: {
    local:  LLMProvider;
    claude: LLMProvider | null;
  };
  /** Convenience: emit progress without constructing a full message. */
  progress(msg: string, pct?: number): void;
  /** Convenience: request user input at a gate. */
  gate(opts: Omit<GateMessage['payload'], 'gateId'>): Promise<ReplyMessage['payload']>;
  /** Convenience: emit text (optionally streaming). */
  emit(text: string, stream?: boolean): void;
  /** Read-through to daemon IPC (best-effort — returns null if daemon down). */
  rpc<T = unknown>(method: string, params?: unknown): Promise<T | null>;
  /** Write an artifact file to the run directory. */
  writeArtifact(name: string, content: string): Promise<string>;  // returns path
  /** Read an artifact from a prior step. */
  readArtifact(name: string): Promise<string | null>;
  /** AbortSignal — set when cancel message received. */
  signal: AbortSignal;
}

interface AgentDefinition<S extends AgentState = AgentState> {
  id:          string;              // unique agent type ID, e.g. 'designer'
  version:     number;              // state schema version (for migrations)
  initialState: (input: unknown) => S;   // create initial state from user input
  steps:       Record<string, AgentStep<S>>;
  firstStep:   string;              // entry point step name
  /** Optional: migrate state from older version. */
  migrate?:    (state: AgentState, fromVersion: number) => S;
}
```

### Agent Runner

The execution engine. Drives the step loop, handles checkpointing, resume, and cancellation.

```typescript
interface RunOptions {
  /** If set, resume from this checkpoint instead of starting fresh. */
  resumeFrom?: Checkpoint;
  /** Agent input (ignored if resuming). */
  input?: unknown;
}

interface Checkpoint {
  runId:        string;
  agentId:      string;
  version:      number;
  stepName:     string;
  stepIndex:    number;
  state:        AgentState;
  createdAt:    string;
  /** Completed steps log — for observability and replay. */
  completedSteps: Array<{ name: string; durationMs: number; timestamp: string }>;
}

interface RunResult {
  runId:    string;
  result:   unknown;       // from DoneMessage
  summary:  string;
  steps:    number;        // total steps executed
  resumed:  boolean;       // was this a resumed run?
}
```

**Runner pseudocode:**

```
function runAgent(definition, channel, options):
  if options.resumeFrom:
    state = options.resumeFrom.state
    step  = options.resumeFrom.stepName
    index = options.resumeFrom.stepIndex
    runId = options.resumeFrom.runId
  else:
    state = definition.initialState(options.input)
    step  = definition.firstStep
    index = 0
    runId = nanoid()
    createRunDir(runId)     // mkdir ~/.insrc/agents/<runId>/
    writeMeta(runId, ...)   // meta.json

  ctx = buildStepContext(channel, runId, ...)

  // Listen for cancel
  channel.onMessage(msg => {
    if msg.kind === 'cancel': ctx.abort()
  })

  while step !== null:
    if ctx.signal.aborted:
      throw Cancelled

    // Execute step
    { state, next } = await definition.steps[step].run(state, ctx)

    // Checkpoint after every step (atomic write)
    checkpoint = { runId, agentId, version, stepName: next ?? step, stepIndex: index, state, ... }
    atomicWrite('~/.insrc/agents/<runId>/state.json', checkpoint)
    appendEvent('~/.insrc/agents/<runId>/events.jsonl', { kind: 'checkpoint', step, index })
    updateIndex(runId, { status: 'active', updatedAt: now })
    channel.send(CheckpointMessage)

    step = next
    index++

  // Mark complete
  updateIndex(runId, { status: 'completed', updatedAt: now })
  channel.send(DoneMessage { result: state.result, summary: state.summary })
  channel.close()
  return { runId, result, summary, steps: index, resumed: !!options.resumeFrom }
```

**Atomic writes:** `writeFileSync` to a temp file in the same directory, then `renameSync` to the target path. This guarantees that `state.json` is always valid JSON — a crash mid-write leaves only the temp file, and the last valid checkpoint is intact.

## Channel Implementations

### ReplChannel (readline)

The existing REPL path. Maps gates to interactive prompts.

```typescript
class ReplChannel implements Channel {
  private messageHandlers: Array<(msg: AgentMessage) => void> = [];

  send(msg: AgentMessage): void {
    switch (msg.kind) {
      case 'emit':       process.stdout.write(msg.payload.text); break;
      case 'progress':   log.info(msg.payload.message); break;
      case 'checkpoint': log.debug(`checkpoint: ${msg.payload.label}`); break;
      case 'done':       /* handled by runner */ break;
      case 'error':      log.error(msg.payload.error); break;
    }
  }

  async gate(msg: AgentMessage): Promise<ReplyMessage['payload']> {
    // Render gate content
    renderGateToTerminal(msg.payload);
    // Block until user responds
    const answer = await askOnce('> ');
    return parseGateResponse(answer, msg.payload.actions);
  }

  onMessage(handler): void { this.messageHandlers.push(handler); }

  // Called by REPL on Ctrl+C
  cancel(reason?: string): void {
    for (const h of this.messageHandlers) {
      h({ kind: 'cancel', payload: { reason } } as AgentMessage);
    }
  }

  close(): void { /* cleanup */ }
}
```

### TestChannel (for tests)

Pre-scripted responses. No readline dependency.

```typescript
class TestChannel implements Channel {
  constructor(private script: Array<{ gateId: string; reply: ReplyMessage['payload'] }>) {}

  async gate(msg: AgentMessage): Promise<ReplyMessage['payload']> {
    const entry = this.script.shift();
    if (!entry) throw new Error('TestChannel: no scripted reply');
    return entry.reply;
  }
  // ...
}
```

### Future: WebSocketChannel

For a VS Code extension or web UI — same protocol over WebSocket. The message format is already JSON, so no serialization adapter needed.

## Designer Agent: Rewritten as Steps

The current designer pipeline maps to these steps:

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│  extract     │────▶│  enhance     │────▶│  validate-reqs     │──┐
│  requirements│     │  requirements│     │  (gate)            │  │
└─────────────┘     └──────────────┘     └────────────────────┘  │
                                                                  │
          ┌───────────────────────────────────────────────────────┘
          │
          ▼
    ┌───────────┐     ┌──────────────┐     ┌───────────────┐
    │  pick-next │────▶│  sketch      │────▶│  review-sketch│
    │  requirement│    │  (local LLM) │     │  (Claude)     │
    └───────────┘     └──────────────┘     └───────┬───────┘
          ▲                                         │
          │                                         ▼
          │                                  ┌──────────────┐
          │                                  │ validate-     │
          │                                  │ sketch (gate) │
          │                                  └──────┬───────┘
          │                                         │
          │                                         ▼
          │                                  ┌──────────────┐
          │                                  │  detail       │
          │                                  │  (local LLM)  │
          │                                  └──────┬───────┘
          │                                         │
          │                                         ▼
          │                                  ┌──────────────┐
          │    (more reqs pending)           │ validate-     │
          └──────────────────────────────────│ detail (gate) │
          │                                  └──────┬───────┘
          │ (all done)                              │
          ▼                                         │
    ┌──────────────┐                                │
    │  assemble    │◀───────────────────────────────┘
    │  document    │
    └──────────────┘
```

**State shape:**

```typescript
interface DesignerState extends AgentState {
  // Input (immutable after init)
  input: {
    message:          string;
    codeContext:       string;
    template:         DesignTemplate;
    intent:           'requirements' | 'design' | 'review';
    requirementsDoc?: string;
    repoPath:         string;
    closureRepos:     string[];
  };

  // Evolving state (checkpointed)
  requirements:       RequirementTodo[];
  currentReqIndex:    number;
  editRounds:         Record<string, number>;   // gateId → rounds used
  completedSketches:  RequirementSketch[];
  completedDetails:   string[];
  compressedHistory:  string;                   // compressed prior sections
  assembledOutput?:   string;
  summary?:           string;
}
```

**Each step is independently testable.** The `pick-next-requirement` step just looks at `state.requirements`, finds the next `pending` one, and sets `currentReqIndex`. The `sketch` step reads `state.requirements[state.currentReqIndex]` and calls the local LLM. No step holds a reference to the generator or the REPL.

**Artifacts:** Each sketch and detail is written to `artifacts/sketch-N.md` and `artifacts/detail-N.md`. The assemble step reads all artifacts and produces `artifacts/assembled.html`. On resume, completed artifacts don't need to be regenerated — they're read from disk.

**Checkpoint boundaries:** After every step completion. If the process crashes during a sketch LLM call, resume replays from the `pick-next-requirement` step for the current requirement (the LLM call is re-executed, which is safe since sketches are regenerated anyway). After a gate response, the checkpoint includes the user's decision, so it's never re-asked.

## Resume Flow

```
User: insrc chat
  → On session start, scan ~/.insrc/agents/index.json for active runs with matching repo
  → If found:
      log: "Found incomplete designer run (3/7 requirements done). Resume? [Y/n]"
      → User: Y
      → Read state.json from run directory
      → runAgent(designerDefinition, channel, { resumeFrom: checkpoint })
      → Runner skips to stepName from checkpoint, restores state
      → Continues from requirement 4

User: insrc agent list
  → Show all active/completed runs with status, age, step progress

User: insrc agent resume <runId>
  → Resume a specific run by ID

User: insrc agent discard <runId>
  → rm -rf ~/.insrc/agents/<runId>/, update index
```

## Crash Recovery

Three categories of crash, each with a defined recovery path.

### Crash Scenario 1: Mid-Step (LLM Call or Computation)

The process dies while a step's `run()` is executing — e.g., during an LLM call, a daemon RPC, or artifact generation.

**What happens:**
- `state.json` holds the checkpoint from the **previous completed step**
- The current step produced no checkpoint (steps are atomic: checkpoint only on success)
- Any partially-written artifact temp files are orphaned (the real artifact was never renamed into place)

**On resume:**
- Runner reads `state.json` → gets `stepName` pointing to the step that needs to run
- Re-executes that step from scratch with the same state
- Safe because steps are **idempotent**: an LLM call that didn't complete produced no persisted side effects

**Example:** Crash during `sketch` LLM call → resume loads checkpoint from after `pick-next-requirement` → re-enters `sketch` for the same requirement → LLM call runs again.

### Crash Scenario 2: Mid-Checkpoint Write

The process dies while writing `state.json` after a step completes.

**What happens — atomic write protocol:**
```
1. writeFileSync(runDir + '/state.json.tmp', JSON.stringify(checkpoint))
2. renameSync(runDir + '/state.json.tmp', runDir + '/state.json')
```

- Crash before `rename`: `state.json` still holds the previous valid checkpoint. `state.json.tmp` is orphaned.
- Crash after `rename`: new checkpoint is fully committed.
- **There is no state where `state.json` contains partial or corrupt JSON.**

**On resume:**
- Runner reads `state.json` — always valid
- If `state.json.tmp` exists, delete it (orphaned from a prior crash)
- The step that completed but didn't get checkpointed will re-execute (same as Scenario 1 — idempotent)

### Crash Scenario 3: Mid-Artifact Write

The process dies while writing an artifact file (e.g., `artifacts/sketch-2.md`).

**What happens:**
- Artifacts also use atomic write (temp + rename), so partial artifacts should be rare
- Even without atomic write, artifacts are **derived from state**, not the source of truth

**On resume:**
- The step that produces the artifact re-runs (since the checkpoint is from before it)
- The step overwrites any corrupt/partial artifact with a fresh one
- No special artifact validation needed — the step is the authority

### Run Status and Crash Detection

The runner maintains a `status` field in both `state.json` and `index.json` to distinguish between clean and dirty states:

```typescript
type RunStatus =
  | 'running'     // step loop is actively executing (set on enter, PID recorded)
  | 'paused'      // user explicitly paused or gate is waiting (clean state)
  | 'completed'   // agent finished successfully
  | 'failed'      // agent encountered an unrecoverable error
  | 'crashed';    // detected on resume — was 'running' but process is dead
```

**State file includes process identity:**

```typescript
interface Checkpoint {
  // ... existing fields ...
  status:       RunStatus;
  pid:          number;        // process.pid of the owning process
  heartbeat:    string;        // ISO timestamp, updated every 30s while running
}
```

**Crash detection logic (on session start or `insrc agent list`):**

```
for each run in index.json where status === 'running':
  checkpoint = read(runDir/state.json)
  if process.kill(checkpoint.pid, 0) throws ESRCH:
    // Process is dead — this was a crash
    checkpoint.status = 'crashed'
    atomicWrite(state.json, checkpoint)
    updateIndex(runId, { status: 'crashed' })
  else if (now - checkpoint.heartbeat) > 120_000:
    // Process alive but no heartbeat for 2 minutes — treat as stuck/crashed
    checkpoint.status = 'crashed'
    atomicWrite(state.json, checkpoint)
    updateIndex(runId, { status: 'crashed' })
```

**Heartbeat:** While the runner loop is active, a `setInterval` (unref'd) writes the current timestamp to `state.json`'s `heartbeat` field every 30 seconds. This catches cases where the PID was recycled by the OS (a new process got the same PID).

### Run Lock: Preventing Concurrent Resume

A lock file prevents two processes from resuming the same run simultaneously:

```
~/.insrc/agents/<runId>/
  lock            # lock file (created with O_EXCL)
```

**Lock protocol:**

```typescript
function acquireLock(runDir: string): boolean {
  try {
    // O_CREAT | O_EXCL — atomic create-if-not-exists
    const fd = openSync(join(runDir, 'lock'), O_CREAT | O_EXCL | O_WRONLY);
    writeSync(fd, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
    closeSync(fd);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Lock exists — check if owner is still alive
      const lock = JSON.parse(readFileSync(join(runDir, 'lock'), 'utf-8'));
      try {
        process.kill(lock.pid, 0);  // probe — process alive
        return false;               // genuinely locked by another process
      } catch {
        // Owner is dead — stale lock. Break it.
        unlinkSync(join(runDir, 'lock'));
        return acquireLock(runDir);  // retry once
      }
    }
    throw err;
  }
}

function releaseLock(runDir: string): void {
  try { unlinkSync(join(runDir, 'lock')); } catch { /* ok */ }
}
```

**Runner integrates the lock:**

```
function runAgent(definition, channel, options):
  runDir = resolveRunDir(options)

  if !acquireLock(runDir):
    throw Error('Run is locked by another process')

  try:
    // ... step loop (existing pseudocode) ...
  finally:
    releaseLock(runDir)
```

The lock is released in the `finally` block, so it's freed on normal completion, cancellation, and uncaught exceptions. Only a hard crash (SIGKILL, power loss) leaves a stale lock — and the stale lock detection above handles that.

### Artifact Validation on Resume

When resuming, the runner verifies that artifacts from completed steps are intact before skipping ahead. This catches edge cases where artifacts were manually deleted or corrupted outside the framework.

**Validation is opt-in per step** via an optional `artifacts` declaration:

```typescript
interface AgentStep<S extends AgentState = AgentState> {
  name: string;
  run(state: S, ctx: StepContext): Promise<{ state: S; next: string | null }>;
  /** Artifacts this step is expected to produce. Checked on resume. */
  artifacts?: (state: S) => string[];  // returns artifact filenames
}
```

**Resume validation logic:**

```
function runAgent(definition, channel, options):
  if options.resumeFrom:
    checkpoint = options.resumeFrom
    // Validate artifacts from all completed steps
    for step in checkpoint.completedSteps:
      stepDef = definition.steps[step.name]
      if stepDef.artifacts:
        expected = stepDef.artifacts(checkpoint.state)
        for artifactName in expected:
          path = join(runDir, 'artifacts', artifactName)
          if !existsSync(path):
            // Artifact missing — roll back to this step
            log.warn(`artifact missing: ${artifactName}, rolling back to step: ${step.name}`)
            checkpoint.stepName = step.name
            checkpoint.stepIndex = step.index
            // Remove this and subsequent steps from completedSteps
            checkpoint.completedSteps = checkpoint.completedSteps.slice(0, step.index)
            break
    // Continue with (possibly rolled-back) checkpoint
    state = checkpoint.state
    step  = checkpoint.stepName
    // ...
```

**Example for designer:**

```typescript
const sketchStep: AgentStep<DesignerState> = {
  name: 'sketch',
  artifacts: (state) => [`sketch-${state.currentReqIndex}.md`],
  async run(state, ctx) {
    const sketch = await writeSketch(/* ... */);
    await ctx.writeArtifact(`sketch-${state.currentReqIndex}.md`, sketch);
    return { state: { ...state, /* ... */ }, next: 'review-sketch' };
  },
};
```

If `sketch-2.md` is missing on resume, the runner rolls back to the `sketch` step for requirement 2 and re-generates it.

## Migration & Recovery

**State version mismatch:** If `checkpoint.version < definition.version`, the runner calls `definition.migrate(state, fromVersion)` before resuming. This handles schema changes between deploys.

**Corrupted state:** If `migrate` throws or `state.json` fails to parse, the runner logs the error and offers the user a choice: discard and restart, or abort.

**Stale checkpoints:** On session start, prune completed runs older than 7 days. Active runs are kept until explicitly discarded.

## Coder Agent: Tool Loop as Steps

The current tool loop (25-iteration cap) also benefits from this framework:

```typescript
// steps: 'plan-call' → 'execute-tools' → 'plan-call' (loop) → 'done'

interface CoderState extends AgentState {
  messages:      LLMMessage[];
  iterations:    number;
  maxIterations: number;
  intent:        string;
  pendingTools:  ToolCall[];    // tools awaiting approval
  results:       ToolResult[];
  finalResponse: string;
}
```

The `execute-tools` step uses gates for mutating tool approval:

```typescript
// In execute-tools step:
for (const call of state.pendingTools) {
  if (isMutating(call)) {
    const reply = await ctx.gate({
      stage: 'tool-approval',
      title: `${call.name}`,
      content: formatToolCallPreview(call),
      actions: [
        { name: 'approve', label: 'Execute', needsInput: false },
        { name: 'reject',  label: 'Skip',    needsInput: true  },
      ],
    });
    if (reply.action === 'reject') {
      results.push({ toolCallId: call.id, content: `Rejected: ${reply.feedback}`, isError: true });
      continue;
    }
  }
  results.push(await executeTool(call));
}
```

**Checkpoint:** After each tool execution round, not after each individual tool. This keeps checkpoint frequency reasonable while still allowing resume if the LLM call for the next iteration crashes.

## New Files

```
src/agent/framework/
  types.ts          Message types, AgentState, AgentStep, AgentDefinition, Checkpoint
  runner.ts         runAgent() — step loop, checkpoint, cancel, resume
  channel.ts        Channel interface + ReplChannel
  test-channel.ts   TestChannel for scripted testing
  checkpoint.ts     File-based checkpoint persistence (~/.insrc/agents/)
  helpers.ts        StepContext builder, message factories, atomic write utils
```

**Paths addition:**
```typescript
// src/shared/paths.ts
export const PATHS = {
  // ... existing ...
  agents:    join(INSRC_DIR, 'agents'),          // agent run storage
  agentIndex: join(INSRC_DIR, 'agents', 'index.json'),
} as const;
```

**CLI additions:**
```
insrc agent list              # show all runs
insrc agent resume <runId>    # resume incomplete run
insrc agent discard <runId>   # delete run directory
insrc agent prune             # delete completed runs older than 7 days
```

**Migrated agents:**
```
src/agent/tasks/designer/   Rewrite steps as AgentStep implementations
src/agent/tasks/coder.ts    Tool-loop agent using framework
```

## What This Does NOT Include

- **Multi-agent orchestration** — no agent-to-agent messaging. If needed later, add a `dispatch(agentId, message)` method to StepContext.
- **Parallel step execution** — steps are sequential. Parallelism happens within a step (e.g. parallel LLM calls in `sketch`).
- **Distributed execution** — all agents run in the REPL process. No remote agents.
- **Event replay** — events.jsonl is append-only for observability/debugging, not for state reconstruction. State lives in state.json checkpoints.
