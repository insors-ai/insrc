# Pipeline V2: 4-Stage Incremental Architecture

## Problem Statement

The current creative pipelines (requirements, design, plan, implement, refactor) all follow a rigid 2-stage pattern: local sketch (2–4K tokens) → Claude enhance (3–4K tokens). This fails for:

- **Large inputs**: files > context window silently truncate (we saw `vscode-plugin.html` truncated from 17K to 16K tokens)
- **Large outputs**: a full HTML design doc can't fit in 4K tokens — the response gets cut off mid-CSS
- **No decomposition**: the LLM must produce the entire artifact in one shot, with no ability to focus on parts
- **No streaming**: user sees nothing until the entire response returns, which can take 60–120s
- **No progress**: no visibility into what the agent is doing or how far along it is

The `gen-cli-design.ts` script proved the fix: break into 22 independent sections, execute each with focused prompts, assemble at the end. Result: 88KB complete HTML, every section thorough, total time ~18 minutes with live progress.

## Proposed Architecture

```
User Input → ANALYZE → PLAN → EXECUTE (per-step, streaming) → ASSEMBLE
```

### Stage 1: Analyze

**Purpose**: Understand the input, chunk if needed, extract key requirements.

**What it does**:
- If input is a file/prompt, estimate token count
- If input > model context window, chunk into overlapping segments
- Run a fast local LLM pass on each chunk to extract:
  - Key requirements / constraints
  - Referenced entities (files, functions, types)
  - Output format expectations (HTML, Markdown, code, diff)
  - Scope estimate (small: 1 step, medium: 3–8 steps, large: 8+ steps)
- Merge chunk analyses into a single `AnalysisResult`
- Stream status: `[analyze] Reading input... 3 chunks (24K tokens)`
- Stream status: `[analyze] Extracted 19 requirements, output format: HTML`

**Interface**:
```typescript
interface AnalysisResult {
  /** Original input (or reference to it) */
  inputRef: string;
  /** Chunked summaries if input was split */
  chunks: ChunkSummary[];
  /** Extracted requirements (numbered) */
  requirements: string[];
  /** Referenced entities from the codebase */
  referencedEntities: string[];
  /** Expected output format */
  outputFormat: 'markdown' | 'html' | 'diff' | 'code' | 'json' | 'text';
  /** Scope estimate */
  scope: 'small' | 'medium' | 'large';
  /** Token count of original input */
  inputTokens: number;
}

interface ChunkSummary {
  /** Chunk index */
  index: number;
  /** Condensed summary of this chunk */
  summary: string;
  /** Key points extracted */
  keyPoints: string[];
  /** Token count of original chunk */
  tokens: number;
}
```

**LLM calls**: 1 per chunk (local, fast, ~500 token output each)

### Stage 2: Plan

**Purpose**: Produce a modular execution plan with independent steps.

**What it does**:
- Takes the `AnalysisResult` and produces an ordered list of `ExecutionStep`s
- Each step is scoped to produce a self-contained output fragment
- Steps have no cross-dependencies on each other's output (parallel-safe)
- For diff-producing pipelines (implement/refactor): one step per file or logical change
- For document-producing pipelines (design/requirements): one step per section
- For plan pipeline: one step per plan-step to flesh out
- The plan itself is produced by a single LLM call (local or Claude depending on scope)
- Stream status: `[plan] 14 steps planned for design document`

**Interface**:
```typescript
interface ExecutionPlan {
  /** Pipeline type */
  pipeline: 'requirements' | 'design' | 'plan' | 'implement' | 'refactor';
  /** Analysis that produced this plan */
  analysis: AnalysisResult;
  /** Ordered execution steps */
  steps: ExecutionStep[];
  /** Shared context passed to every step (system prompt, code context, etc.) */
  sharedContext: string;
  /** Output assembly strategy */
  assemblyStrategy: 'concatenate' | 'merge-diff' | 'json-combine';
}

interface ExecutionStep {
  /** Step index (0-based) */
  index: number;
  /** Human-readable title */
  title: string;
  /** Focused prompt for this step — includes only the relevant requirements/section */
  prompt: string;
  /** Which requirements (by index) this step addresses */
  requirementIndices: number[];
  /** Expected output token budget */
  maxTokens: number;
  /** Whether this step needs Claude enhancement or local-only is sufficient */
  needsEnhance: boolean;
}
```

**LLM calls**: 1 (local, ~1K token output — just the step list as JSON)

### Stage 3: Execute

**Purpose**: Run each step independently, streaming progress.

**What it does**:
- Iterates through `ExecutionPlan.steps` sequentially (or parallel for independent steps)
- For each step:
  1. Build focused messages: shared context + step-specific prompt
  2. **Stage 3a**: Local model produces step output (sketch)
  3. **Stage 3b**: If `step.needsEnhance` and Claude available, enhance the output
  4. Store the step result
  5. Stream status: `[execute] [3/14] Interactive REPL... ✓ (42s)`
- Each step operates within its token budget — no single call needs to produce the full artifact
- Failed steps are retried once, then marked as failed with the error (assembly handles gaps)

**Interface**:
```typescript
interface StepResult {
  /** Step index */
  index: number;
  /** Step title */
  title: string;
  /** Produced output fragment */
  output: string;
  /** Whether enhancement was applied */
  enhanced: boolean;
  /** Execution time in ms */
  durationMs: number;
  /** Error if failed */
  error?: string;
}
```

**LLM calls**: 1–2 per step (local sketch + optional Claude enhance)

### Stage 4: Assemble

**Purpose**: Combine step outputs into the final artifact.

**What it does**:
- Strategy depends on pipeline type:
  - **concatenate** (design, requirements): join sections with HTML/Markdown structure, wrap in template (CSS, head/body)
  - **merge-diff** (implement, refactor): merge per-file diffs into a single unified diff, validate, apply
  - **json-combine** (plan): merge step JSON arrays into a single plan object, resolve cross-step dependencies
- For document pipelines: add shared boilerplate (CSS, HTML skeleton) that was intentionally excluded from per-step generation
- Validate the assembled output (HTML well-formedness, diff parse, JSON schema)
- Stream status: `[assemble] Combining 14 sections... 88KB HTML written to design/cli.html`

**Interface**:
```typescript
interface AssemblyResult {
  /** Final assembled output */
  output: string;
  /** Output format */
  format: 'markdown' | 'html' | 'diff' | 'code' | 'json' | 'text';
  /** Per-step results (for debugging) */
  steps: StepResult[];
  /** Total execution time */
  totalDurationMs: number;
  /** Any assembly warnings */
  warnings: string[];
  /** Files written (for diff pipelines) */
  filesWritten?: string[];
}
```

**LLM calls**: 0 (pure code — template wrapping, diff merging, JSON combining)

## Pipeline-Specific Behaviour

### Requirements Pipeline

| Stage | What happens |
|-------|-------------|
| Analyze | Extract requirements from user prompt, identify referenced code |
| Plan | One step per requirements section: Existing Code, Gaps, Requirements, Open Questions, Constraints |
| Execute | Each section generated independently with focused prompt |
| Assemble | Concatenate sections into structured requirements document |

### Design Pipeline

| Stage | What happens |
|-------|-------------|
| Analyze | Parse requirements context + user prompt, detect output format (HTML/MD), chunk reference docs if large |
| Plan | One step per design section (e.g., Overview, Architecture, Command Structure, ...) — sections derived from requirements and reference material |
| Execute | Each section gets: shared CSS reference + section-specific requirements + code context |
| Assemble | Wrap sections in HTML template with CSS, or concatenate as Markdown |

### Plan Pipeline

| Stage | What happens |
|-------|-------------|
| Analyze | Extract scope from user prompt + requirements + design context |
| Plan | One step per major feature area — each produces 2–5 plan steps |
| Execute | Each area produces JSON array of PlanStep objects |
| Assemble | Merge JSON arrays, resolve cross-area dependencies, deduplicate, build Plan object |

### Implement Pipeline

| Stage | What happens |
|-------|-------------|
| Analyze | Parse user request, identify affected files from code context |
| Plan | One step per file to modify (or group of tightly coupled files) |
| Execute | Each step produces a unified diff for its file(s), Claude validates per-file |
| Assemble | Merge diffs, dry-run, apply to disk, request re-index |

### Refactor Pipeline

| Stage | What happens |
|-------|-------------|
| Analyze | Same as implement but with 2-hop graph context |
| Plan | One step per file, ordered by dependency graph (leaves first) |
| Execute | Each step produces diff, Claude validates behaviour equivalence |
| Assemble | Merge diffs in dependency order, apply, re-index |

## Changes to Existing Code

### New Files

```
src/agent/pipeline/
  analyze.ts          # Stage 1: input analysis and chunking
  plan.ts             # Stage 2: execution plan generation
  execute.ts          # Stage 3: per-step execution with streaming
  assemble.ts         # Stage 4: output assembly
  types.ts            # Shared types (AnalysisResult, ExecutionPlan, etc.)
  chunker.ts          # Input chunking logic (token estimation, overlap)
```

### Modified Files

```
src/agent/tasks/
  requirements.ts     # Refactor to use pipeline/
  design.ts           # Refactor to use pipeline/
  plan.ts             # Refactor to use pipeline/
  implement.ts        # Refactor to use pipeline/
  refactor.ts         # Refactor to use pipeline/
```

Each existing pipeline file becomes a thin wrapper that:
1. Defines its section templates / step generators
2. Defines its assembly strategy
3. Calls the shared 4-stage pipeline with its configuration

### Unchanged Files

- `diff-utils.ts` — still handles diff parsing/application (used by implement/refactor assemble)
- `graph-context.ts` — still enriches validation context (used by implement/refactor execute)
- `plan-store.ts` — still persists plans to Kuzu (used by plan pipeline assemble)

## Streaming Integration

### Log callback

Every stage emits structured log events through a callback:

```typescript
type PipelineEvent =
  | { stage: 'analyze'; status: 'start' | 'chunk' | 'done'; detail: string }
  | { stage: 'plan'; status: 'start' | 'done'; stepCount: number }
  | { stage: 'execute'; status: 'step-start' | 'step-done' | 'step-error'; step: number; total: number; title: string; durationMs?: number }
  | { stage: 'assemble'; status: 'start' | 'done'; outputSize: number };

type PipelineLogger = (event: PipelineEvent) => void;
```

### REPL rendering

The REPL formats events as:
```
  [analyze] Reading input... 3 chunks (24K tokens)
  [analyze] Extracted 19 requirements, output: HTML
  [plan] 14 steps planned
  [execute] [1/14] Overview... ✓ (23s)
  [execute] [2/14] Architecture... ✓ (31s)
  ...
  [assemble] Combining 14 sections... 88KB written
```

### CLI one-shot rendering

Same format, all to stderr. Final output to stdout.

### JSON mode

`--json` suppresses streaming, returns full `AssemblyResult` as JSON.

## Backward Compatibility

- The public interfaces (`DesignResult`, `PlanResult`, `ImplementResult`, etc.) remain unchanged
- Callers (REPL, CLI, tests) don't need to change
- The `log` callback signature is extended but backward-compatible (existing `(msg: string) => void` still works — a shim converts to PipelineEvent)
- Small inputs (< 4K tokens, scope: small) short-circuit to a single-step plan — effectively the same as current behaviour, no overhead

## Implementation Order

### Phase 1: Core pipeline framework
1. Create `src/agent/pipeline/types.ts` with all interfaces
2. Create `src/agent/pipeline/chunker.ts` — token estimation and overlap chunking
3. Create `src/agent/pipeline/analyze.ts` — input analysis with chunking
4. Create `src/agent/pipeline/plan.ts` — execution plan generation
5. Create `src/agent/pipeline/execute.ts` — per-step execution loop
6. Create `src/agent/pipeline/assemble.ts` — output assembly strategies

### Phase 2: Migrate design pipeline (proof of concept)
7. Refactor `src/agent/tasks/design.ts` to use the 4-stage pipeline
8. Verify with `scripts/gen-cli-design.ts` style test — same quality, streaming progress
9. Verify small input still works (short-circuit path)

### Phase 3: Migrate remaining pipelines
10. Refactor `src/agent/tasks/requirements.ts`
11. Refactor `src/agent/tasks/plan.ts`
12. Refactor `src/agent/tasks/implement.ts`
13. Refactor `src/agent/tasks/refactor.ts`

### Phase 4: Tests
14. Add unit tests for chunker (token estimation, overlap)
15. Add unit tests for analyze (requirement extraction, chunking)
16. Add unit tests for assemble (concatenate, merge-diff, json-combine)
17. Add e2e test: design pipeline with large input produces complete output
18. Add e2e test: implement pipeline with multi-file change produces valid merged diff
19. Update existing e2e tests in `scripts/test-agent-e2e.ts`
