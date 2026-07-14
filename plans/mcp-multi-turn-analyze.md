# Multi-turn MCP interface for `insrc_analyze`

Plan doc. Status: **shipped** (Phase A + B + C landed 2026-07-10 / 2026-07-11). Target: new tool `insrc_analyze_step` alongside the existing `insrc_analyze`; the existing one gets a small description tweak in Phase C but is otherwise untouched.

**Ship notes (deviations from the original plan):**
- State is held **server-side** keyed by a short 22-char opaque token, NOT round-tripped as a base64+gzip blob. The V1 blob-echo design broke under live testing: Claude Code's outer LLM transcribed the 2.6 KB base64 state character-by-character and corrupted it (dropped `==` padding + flipped one char mid-string). Server-side store fixes this. See [`state-store.ts`](../src/insrc/mcp/analyze-step/state-store.ts) for the LRU/TTL contract and [[mcp_state_tokens_not_blobs]] in agent memory for the rule.
- No `pauseOnNarrowLLM` callback on `executePlan`. Instead a separate `stepPlan(args, resumeState?)` primitive was added -- keeps the existing one-shot executor path unchanged and gives the multi-turn handler its own explicit resume state.
- No `withStructuredRetry`-style corrective retry loop at the MCP boundary (yet). If the client emits a bad JSON, the phase handler returns `{ next: 'error', error: { code: 'plan-schema' | 'bundle-schema' | 'narrow-finalize', retryable: true } }` and the outer LLM re-emits against the same state token. This matches how the outer LLM's own retry logic works and needs less server machinery.

## 1. Motivation

The existing `insrc_analyze` MCP tool is a **one-shot** interface: the client invokes it once and the daemon runs the entire analyze pipeline internally (decomposer → executor → synthesizer). Internal LLM calls are made via `shaperProvider`:

- `ollama` -- local model, works standalone. **The interface stays fully valid here.**
- `cli-claude` / `cli-codex` -- spawns a fresh `claude --print` / `codex exec` subprocess per LLM call (2-5 spawns per analyze run, each ~1-2 s startup overhead + separate billing).
- `mcp-sampling` -- routes inner LLM calls back to the client via `sampling/createMessage`. **Blocked**: neither Claude Code (2.1.206, feature request open [anthropics/claude-code#1785](https://github.com/anthropics/claude-code/issues/1785)) nor Codex (0.141.0, feature request CLOSED as won't-implement [openai/codex#4929](https://github.com/openai/codex/issues/4929)) ship this capability. Additionally the MCP spec 2026-07-28 RC deprecates sampling entirely (SEP-2577) in favor of Multi Round-Trip Requests (MRTR), which no client has shipped either.

The Ollama path is fine as-is. The Claude/Codex path today is either awkward (subprocess spawns) or blocked (sampling). We need a shape that:

- Works with **every current MCP client**, no new client capability required.
- Uses the **outer client's LLM** for reasoning (single session, single OAuth event, no subprocess churn).
- Preserves the existing analyze discipline (same recipes, same prompts, same schemas, same citation contract).
- **Does not touch the existing `insrc_analyze` tool** -- Ollama-backed users keep the one-shot interface.

The proposed shape is a **phase-driven multi-turn tool** where the server exposes each LLM step's prompt + schema in tool responses; the client's own LLM emits the required JSON as its next reasoning step and calls the tool again with the result. This is essentially MRTR done manually via a chain of tool calls.

## 2. Design overview

New tool: `insrc_analyze_step`. Single tool name; behavior driven by a `phase` argument.

```
client ─► insrc_analyze_step({ phase: 'start', focus, repo? })
       ◄─ { next: 'emit_plan', prompt: '<decomposer system prompt>',
            userTurn: '<intent + context>',
            schema: <ExplorationPlan JSON Schema>,
            state: '<opaque blob>' }

[client's LLM emits an ExplorationPlan JSON as its next reasoning step]

client ─► insrc_analyze_step({ phase: 'plan', plan, state })
       ◄─ (a) { next: 'emit_narrow', explorationId, prompt, userTurn, schema, state }
              -- when the plan contains a narrow-LLM step that needs the client
       ◄─ (b) { next: 'emit_bundle', prompt: '<synthesizer prompt>', userTurn, schema, state }
              -- when all deterministic + narrow-LLM steps have completed

[iterate 'emit_narrow' round trips until every narrow LLM output is captured]

client ─► insrc_analyze_step({ phase: 'bundle', bundle, state })
       ◄─ { next: 'done', markdown: '<rendered bundle>' }
```

Every LLM step is a **regular reasoning turn** of the client's own model. The server never spawns a subprocess, never issues a sampling request, never touches Ollama.

## 3. Tool interface

### Input

```typescript
type InsrcAnalyzeStepInput =
  | { phase: 'start';   focus: string; repo?: string; target?: RunTarget; scope?: AnalyzeScope }
  | { phase: 'plan';    plan: ExplorationPlan;               state: string }
  | { phase: 'narrow';  explorationId: string; output: unknown; state: string }
  | { phase: 'bundle';  bundle: AnalyzeContextBundleLayers;  state: string };
```

### Output

Two shapes: `Continue` (server needs another turn from the client) and `Done` (analyze complete).

```typescript
type InsrcAnalyzeStepOutput =
  | ContinueEmitPlan
  | ContinueEmitNarrow
  | ContinueEmitBundle
  | DoneResult
  | ErrorResult;

interface ContinueEmitPlan {
  next:      'emit_plan';
  prompt:    string;                 // decomposer system prompt (verbatim)
  userTurn:  string;                 // pre-composed user turn (intent + repo context)
  schema:    Record<string, unknown>; // ExplorationPlan JSON Schema
  state:     string;                 // opaque blob to pass back
  guidance:  string;                 // 1-2 sentence "what to do next"
}

interface ContinueEmitNarrow {
  next:          'emit_narrow';
  explorationId: string;             // stable id inside the executed plan
  reason:        string;             // e.g. "doc.decision.trace for topic=X"
  prompt:        string;             // narrow LLM system prompt
  userTurn:      string;
  schema:        Record<string, unknown>;
  state:         string;
  guidance:      string;
}

interface ContinueEmitBundle {
  next:     'emit_bundle';
  prompt:   string;                  // synthesizer prompt (target-specific)
  userTurn: string;                  // executed plan + intent + hint
  schema:   Record<string, unknown>; // AnalyzeContextBundle layers schema (no meta)
  state:    string;
  guidance: string;
}

interface DoneResult {
  next:     'done';
  markdown: string;                  // rendered 7-layer bundle
  meta:     BundleMeta;              // meta info (mode, shaper, toolCalls, ...)
}

interface ErrorResult {
  next:  'error';
  error: {
    code:      string;
    message:   string;
    retryable: boolean;
  };
}
```

### Tool description (directive)

```
Phase-driven multi-turn context analyzer. Alternative to `insrc_analyze` for
clients that want to keep every LLM reasoning turn in-session (no subprocess
spawn, no MCP sampling required). Use when:

- The user asks about a repository's code structure, conventions, adherence,
  reuse candidates, or design decisions.
- You want to answer using the citation-grounded analyze framework rather
  than manual grep + read.

Multi-turn loop:

  1. Call phase='start' with the user's focus. Server returns
     { next: 'emit_plan', prompt, schema, state }.
  2. Follow the prompt to emit a JSON object matching the schema (this is
     the ExplorationPlan). Then call phase='plan' with your plan + state.
  3. Server may return { next: 'emit_narrow', ... } zero or more times.
     Each time, follow the prompt to emit the narrow-LLM output, then call
     phase='narrow' with your output + state.
  4. Eventually server returns { next: 'emit_bundle', prompt, schema, state }.
     Emit the bundle JSON, then call phase='bundle' with your bundle + state.
  5. Server returns { next: 'done', markdown } -- render this to the user.

The `guidance` field on each response explains what to do next in one
sentence; the `prompt` + `schema` fields are the authoritative instructions.
Preserve `state` verbatim between calls.
```

## 4. State model

The server is stateless per invocation. All continuation info lives in the `state` field the client passes back. Two properties matter:

- **Not sensitive**: the state carries intent + partial results + config, none of which is a secret. No HMAC required for a local stdio transport.
- **Bounded size**: state grows as explorations complete. Cap ~200 KB; if the run's own outputs exceed the cap, we split the response into batches.

### Encoding

Base64-encoded gzipped JSON. Gzip because exploration outputs have a lot of repetition (file paths, entity names).

```typescript
interface StateBlob {
  readonly version:   1;
  readonly runId:     string;
  readonly repoPath:  string;
  readonly repoIndexedAt: number;   // used as part of the cache key
  readonly intent:    ClassifiedIntent;
  readonly config:    { shaperTarget: SynthesizerPromptKey };
  readonly plan?:     ExplorationPlan;
  readonly executed?: PartialExecutedPlan;   // includes results captured so far
  readonly pending?:  {                       // populated when we paused mid-plan
    readonly explorationId: string;
    readonly prepared:      unknown;          // whatever prepare() returned
  };
  readonly stage: 'awaiting_plan' | 'executing' | 'awaiting_bundle';
}
```

### Server-side validation

On every non-`start` call, the server:

1. Decodes the state.
2. Verifies `version === 1` (bump for schema changes).
3. Verifies `repoIndexedAt` matches the current repo watermark (repo re-indexed mid-run → invalidate, client restarts).
4. Verifies the client's payload matches the expected shape for the current `stage`.

### Client-side handling

The client treats `state` as opaque. Just carry it forward. If the client loses the state (session restart), the run has to restart from `phase: 'start'`.

## 5. Phase state machine

```
  start ──► emit_plan ──► plan ──► emit_narrow ──► narrow ──┐
                                                            │
                                                            ▼
                                             (loop until no more narrow)
                                                            │
                                                            ▼
                                                     emit_bundle
                                                            │
                                                            ▼
                                                         bundle
                                                            │
                                                            ▼
                                                          done
```

### Server behavior per phase

- **`start`**: Build the intent (same shape as the current one-shot handler). Compute the cache key. If cached bundle exists + repo watermark matches → return `done` immediately with the cached markdown. Otherwise: load the decomposer prompt + schema, seed state with `stage: 'awaiting_plan'`, return `emit_plan`.

- **`plan`**: Decode state, validate the client-emitted plan against `ExplorationPlan` schema (defense in depth -- the tool schema also enforces it). Start executing the plan through the existing `executePlan` primitive, but with a **paused-on-narrow-LLM** mode (see §6). When execution pauses, return `emit_narrow`. When execution completes, load the target-specific synthesizer prompt + schema, return `emit_bundle`.

- **`narrow`**: Decode state, find the `pending.explorationId`, apply the client's `output` via the exploration runner's `finalize(prepared, llmOutput)` hook. Add the finalized result to the executed plan. Resume execution from the next exploration. Same continuation logic as `plan`.

- **`bundle`**: Decode state, validate the client-emitted bundle against the layers schema. Stamp `meta` from framework-side info (mode, shaper, toolCalls = deterministic-exploration count + narrow-LLM-round count, model = 'client', schemaVersion, ...). Render as markdown. Cache the bundle. Return `done`.

### Cache behavior

The existing bundle cache lives in `analyze/context/cache.ts` keyed by `(runId, promptContentHash, inputs)`. The multi-turn variant needs a **different cache key** because the "prompt content" is now the sequence of prompts served across turns. Simplest: key on `(intent, repoIndexedAt, target)` -- same intent + same watermark → same cache line. The one-shot and multi-turn caches can coexist; a hit from one shouldn't pollute the other because the client-emitted content differs.

## 6. Exploration runner refactor

To pause mid-plan when a narrow-LLM exploration needs the outer client, every LLM-using exploration runner exposes a **prepare / finalize split**:

- `prepare(exp, ctx): Promise<{ prompt, userTurn, schema, prepared }>` -- build the LLM messages + schema; return everything the client needs to emit the output, plus an opaque `prepared` blob the finalize step needs to interpret the LLM's result.
- `finalize(exp, ctx, prepared, llmOutput): Promise<ExplorationOutput>` -- apply the LLM output. Validate, transform, return the framework-shaped `ExplorationOutput`.
- The existing `run(exp, ctx): Promise<ExplorationOutput>` -- for the Ollama / CliProvider / sampling paths. Internally calls `prepare` + provider.completeStructured + `finalize`. Behavior unchanged.

The three runners that carry narrow-LLM calls:

- `analyze/explore/doc-decision-trace.ts`
- `analyze/explore/doc-constraint-enumerate.ts`
- `analyze/explore/capability-reuse-check.ts`

Each gets split. Existing tests + call sites use `run` and continue to work; the multi-turn handler uses `prepare` + `finalize` directly.

`executePlan` also gets a **pause hook**:

```typescript
export async function executePlan(args: ExecutePlanArgs & {
  pauseOnNarrowLLM?: (exp: Exploration, prepared: unknown, msg: PrepareResult) => Promise<never>;
}): Promise<ExecutedPlan>
```

When `pauseOnNarrowLLM` is set and a narrow-LLM exploration is next, the executor calls it with the prepared payload; the handler throws a `PauseForNarrowLLM` (or resolves a promise that unwinds the stack cleanly) and the outer phase handler captures the state.

Actually cleaner: change `executePlan` to be an **iterator** internally. The multi-turn phase handler pulls one exploration at a time. Deterministic explorations complete inline; narrow-LLM ones pause. This maps directly to the `state.pending` field.

## 7. Preserving analyze discipline

Non-negotiables that MUST hold in the multi-turn shape:

- **Same prompt content.** The tool response includes the decomposer / synthesizer / narrow-LLM system prompts VERBATIM from the framework's prompt files. No paraphrasing at the MCP boundary.
- **Same JSON Schema enforcement.** The schema field in each response is the same `StructuredSchema` the Ollama path validates against. When the client returns its emitted JSON in the next call, the server re-validates via ajv (same helper as `withStructuredRetry`).
- **Same recipe.** The decomposer's plan gets executed by the same `executePlan`. Deterministic explorations are unchanged.
- **Same synthesizer discipline.** The synthesizer prompt lists the executed plan verbatim; the client's LLM sees exactly what the Ollama-path model sees. The bundle validation (schema + citation-lint) runs server-side unchanged.
- **Same cache freshness contract.** Bundle cache invalidates when the repo re-indexes.
- **Retry semantics.** When the client returns a JSON that fails validation, the server responds with the same schema + a "corrective note" appended to `userTurn`, exactly like `withStructuredRetry` does today. Max 3 attempts (config-driven).

If the client repeatedly emits invalid JSON, the server returns `ErrorResult { code: 'validation-exhausted', retryable: false }` and the loop terminates.

## 8. Phased rollout

**MVP (Phase A) — `start` + `plan` + `bundle`, no narrow-LLM support**

Ship the multi-turn tool with only two LLM handoffs (decomposer + synthesizer). Skip narrow-LLM support entirely for now: recipes that would emit narrow-LLM explorations (adherence-check, prose-retrieval, capability-discovery) fall back to server-side execution via `shaperProvider` (Ollama or CliProvider). Structural-map recipes work fully in the new interface without any server-side LLM.

MVP scope:
- New tool `insrc_analyze_step` registered alongside `insrc_analyze`
- Phase handlers: `start`, `plan`, `bundle`
- State encoding / decoding
- Cache hit path (short-circuit from `start` to `done`)
- Bundle rendering + meta stamping
- Unit tests for phase router + state codec
- Live smoke test with Claude Code on `structural-map` intent

Rough scope: **1 day** of work.

**Phase B — narrow-LLM handoff**

Refactor the three narrow-LLM runners into `prepare` / `finalize`. Add `pauseOnNarrowLLM` (or iterator conversion) to `executePlan`. Phase handler: `narrow`.

Adds:
- Runner refactor (3 files)
- Executor pause primitive
- Phase handler `narrow`
- Loop test: adherence-check with 2+ narrow-LLM round trips through Claude Code

Rough scope: **1.5 days** of work.

**Phase C — polish**

- Update `mcp/steering-template.md` with the multi-turn expectation.
- Update the client-side tool description on `insrc_analyze` to nudge complex intents toward `insrc_analyze_step` (leave the simple structural-map path on the one-shot tool).
- Compression / batching if state blobs exceed ~200 KB in the wild.
- Live measurement: how often does the outer model follow the `next` instruction reliably? If it drifts (answers the user prematurely, ignores the schema), sharpen the tool description.

Rough scope: **0.5 day**.

**Total: ~3 days** to a fully multi-turn interface with narrow-LLM support, tested against Claude Code and Codex.

## 9. Test strategy

**Unit**:
- Phase router: given `{ phase: X, ... }` returns the correct `next: Y`.
- State codec: encode → decode round-trip preserves every field.
- Cache short-circuit: `start` with a cached bundle → `done` on first call.
- Schema validation retry: return a bad plan on `plan` phase, verify server retries with corrective note.
- Validation exhaustion: return bad plans 3 times, verify server returns `ErrorResult`.

**Integration (deterministic)**:
- Mock the client loop: automate `start` → emit plan matching schema → `plan` → emit bundle matching schema → `bundle`. Verify identical bundle output vs one-shot `insrc_analyze` for the same intent.

**Live**:
- Claude Code: `insrc_analyze_step` structural-map on `insrc-ide` repo. Verify tool description reliably steers the model into the loop. Compare wall-clock + bundle quality vs one-shot.
- Codex: same test.

## 10. Open questions

**Client compliance risk.** The whole design assumes the outer model reads the `next` field and follows the `emit_plan` instruction rather than presenting the tool response to the user or improvising. Modern Claude Haiku 4.5 + GPT do structured output reliably, but there's residual risk. Mitigations: (a) very directive tool description, (b) very directive `guidance` field on every response, (c) validation exhaustion caps the failure blast radius.

**Tool description size.** The tool description above is ~250 tokens. Reasonable but not free. If the two tools (`insrc_analyze` + `insrc_analyze_step`) together get too chatty in the client's tool list, consider (a) shortening one, (b) offering only one at a time via config.

**State size in the wild.** For an L-scope adherence-check with 5+ explorations, the state blob (all exploration outputs serialized) could reach 100 KB after the executor pauses. Gzip helps, but if the tool-response envelope hits a client cap, we may need to split. Deferred until we measure.

**Concurrency.** No shared server-side state per session, so two clients can run parallel `analyze_step` chains against the same repo without interference. The graph store is multi-reader-safe.

**Naming.** Proposed `insrc_analyze_step`. Alternatives: `insrc_analyze_v2`, `insrc_analyze_flow`, `insrc_analyze_multi`. Pick before we ship.

## 11. Not doing

- **Not modifying `insrc_analyze`.** The one-shot tool stays valid for Ollama-backed users and for clients that don't want the multi-turn dance. New tool alongside.
- **Not migrating the CLI / IDE path.** The daemon's `analyze.context.buildRun` RPC keeps its one-shot shape. Multi-turn is an MCP concern only.
- **Not building MRTR support.** MCP's Multi Round-Trip Requests are the eventual industry direction, but no client has shipped them either. This design is spec-neutral: it uses only tool calls, which every MCP client supports.
- **Not adding server-side sessions.** Everything lives in the opaque `state` blob the client carries. Deferred: if client-carry payloads become a problem, migrate to server-side session storage.

## 12. Approval gate

Approve this plan → land Phase A → live-test against Claude Code + Codex → measure client compliance → decide whether to invest in Phases B + C.
