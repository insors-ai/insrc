<!-- insrc:artifact LLD-185807ba9a6b35d3-s3 -->

# LLD: E20260717185807ba:S003

**Epic:** `add-build-workflow-insrc-5th-stage`
**HLD base run:** `wf-1784289418318-fl5y3m`
**HLD effective hash:** `6d130af6ef10...`
**Tracker:** [insors-ai/insrc#4](https://github.com/insors-ai/insrc/issues/4)

## HLD context

**Framework:** Chosen framework: **a2 — a registered `build` stage that delegates each Task's editing work to a CliProvider subprocess, while the daemon keeps sequencing and verification on its own side.** The stage is added exactly where the sibling stages live: a `src/workflow/runners/build/` subdir (index.ts + schemas.ts, one exported `registerBuildRunners(): void`, no classes, no base class — mirroring the confirmed design-story shape) plus a `src/workflow/artifacts/build.ts` artifact definition, reusing the parent module's `hash.ts` / `slug.ts` writers and `gates.ts` rather than adding skeleton machinery. The `insrc_workflow_step` surface gains a `build` phase handler mirroring `phases/plan.ts`, so the developer-facing turn shape (start → decompose → synthesize → finalize) is unchanged.

Why a2 over the field: it is the only alternative with no partial or unknown across all nine constraints. It removes the k9 dependency instead of absorbing it — the multi-turn edit/test/repair loop does **not** live inside the synthesize seam that is proven only for one-JSON-document-per-turn; it lives behind a one-Task-at-a-time subprocess boundary, so `executor.ts`/`orchestrator.ts` are asked only to do what they already demonstrably do (host a stage, run a gate, finalize an artifact). It keeps k2 enforcement daemon-side: the daemon decides advancement from a test run and a tree diff it performs itself, so a non-cooperating implementer cannot advance the run — unlike the advisory-order failure the Epic's problem statement names. And k8 is satisfied by construction rather than by special pleading: CliProvider is CLAUDE.md's sanctioned cloud path and one-subprocess-at-a-time is serial by definition.

Two items are carried into design as unproven, not settled. (1) **CliProvider's structured-output path is built for JSON returns, not for supervising a long free-form editing session** — that usage is unverified and may require provider-level work; the design must inspect `src/agent/providers/cli-provider.ts` directly, since no analyze bundle touched it (k8 is carried verbatim from CLAUDE.md). (2) Per the coverage-gap bundle, `gates.ts`, `hash.ts` and `slug.ts` are cited at **module level only** — no exploration located an entity in them by name — so k1's gate shape and k3's writer contract are unread APIs that must be read directly, alongside k9's required reading of `executor.ts` and `orchestrator.ts`. The scope phase's "clear match" verdict on `src/workflow` answers "does the skeleton exist?" (yes) and is not license to assume those files fit a code-editing workload.
**Rollout phase:** Phase C — sequenced Task loop + implementer adapter
**Owns:** `sc4` (BuildTaskOutcome), `sc5` (TaskImplementerAdapter)
**Consumes:** `sc1` (BuildStageRegistration), `sc2` (WorkflowStepInputBuild), `sc3` (BuildAdmissionResult)

## Contract details

**Surface level:** internal-shared

### `implement`

```typescript
implement(req: TaskImplementerRequest): Promise<TaskImplementerReport>
```

**Parameters:**
- `req: TaskImplementerRequest` — The single Task to implement plus its read-only context: the PlanTask (verbatim from the approved plan), the Story design + plan markdown, the already-completed dependency outcomes, the registered repoRoot, and the bounded per-Task maxAttempts repair budget.

**Returns:** `Promise<TaskImplementerReport>` — An ADVISORY self-report ({ claimedComplete, narrative }) from the one implementer subprocess. The sequencer never advances on this value; advancement is decided daemon-side from a real test run + working-tree diff (sc4/ac4). Provided only for observability/context to later Tasks.

**Errors:**
- `provider/subprocess error (rejected Promise)` when The CliProvider subprocess fails to spawn or errors mid-session. The sequencer treats a rejection as an implementer failure, not a Task pass — the Task's authoritative status still comes from the daemon's own test run, which on a failed/absent implementer session yields a non-passing BuildTestVerdict.

**Preconditions:**
- Called strictly serially — the caller awaits one implement() call to settle before invoking the next (ac3). Never Promise.all'd (ac5, k8).
- The build run was admitted (sc3 BuildAdmissionResult.admitted === true) — the adapter is unreachable on a refused run, so treeUntouched holds structurally.
- Every task in req.task.dependsOn already has a 'completed' BuildTaskOutcome (ac2).

**Postconditions:**
- Exactly one CliProvider subprocess ran to completion (ac3): free-form editing session via the LLMProvider abstraction, cloud reached only through the claude/codex CLI binaries (k8), no direct REST.
- The working tree MAY carry edits made by the subprocess; those edits are advisory input to the daemon's diff, never the advance decision (sc4 load-bearing property).
- No BuildTaskOutcome is produced here — the sequencer computes it afterward from the daemon's test run + diff.

### `complete`

```typescript
complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse>
```

**Parameters:**
- `messages: LLMMessage[]` — The conversation driving the free-form editing turn handed to the CliProvider subprocess.
- `opts: CompletionOpts` _(optional)_ — Optional completion controls (model/temperature/etc.).

**Returns:** `Promise<LLMResponse>` — Free-form text from one CLI subprocess turn (cli-provider.ts:109-127). This is the surface the implementer adapter reshapes into a multi-turn code-editing session; the design must read the method body directly since the HLD carries the long-editing-session usage as UNPROVEN and no callsite exists to clone (usage.example returned 0 callers).

**Errors:**
- `provider/subprocess error (rejected Promise)` when CLI subprocess spawn or execution failure — surfaces to implement() as a rejection.

**Preconditions:**
- One provider call at a time on the whole build path — never Promise.all (ac5, k8).
- Reached only via the shared LLMProvider abstraction; cloud auth/quota stays with the user's CLI OAuth session (no API keys in this stage).

**Postconditions:**
- A single subprocess turn executed serially; no concurrent provider activity anywhere on the path.

### `completeStructured`

```typescript
completeStructured(messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T>
```

**Parameters:**
- `messages: LLMMessage[]` — The conversation for a schema-constrained turn.
- `schema: StructuredSchema` — The JSON schema constraining the single returned document.
- `opts: StructuredCompletionOpts` _(optional)_ — Optional structured-completion controls (StructuredCompletionOpts lives in src/shared/types.ts).

**Returns:** `Promise<T>` — Exactly one typed JSON document per call (cli-provider.ts:161-167). The HLD flags this one-document-per-turn shape as UNPROVEN for supervising a long free-form editing loop — s3 owns the finding: the design must read the body to establish whether it can host the loop, and provider-level work is reserved if it cannot.

**Errors:**
- `schema-validation failure (rejected Promise after retries)` when The subprocess cannot produce a document matching schema within the provider's retry budget.

**Preconditions:**
- One call at a time (ac5); cloud via CLI only (k8).
- Used, if at all, only where a single-document return fits — not as the mechanism for the multi-turn edit loop unless the direct read of the body proves it can supervise one.

**Postconditions:**
- At most one typed document returned per call; no parallel provider activity.

## Data model changes

### `BuildTaskOutcome` — invariant-change

sc4, owned by s3. Reshaped per the winning a2 alternative from the HLD's flat interface into a status-discriminated union so the load-bearing invariant (filesTouched/testVerdict are daemon-produced, never self-reported) is enforced at the type level. `BuildTaskReached` (status 'completed' | 'failed') REQUIRES a daemon-produced `testVerdict: BuildTestVerdict` and carries `filesTouched`/`attempts`; `BuildTaskUnreached` (status 'blocked' | 'not-reached') carries none of them because nothing ran. Common fields (taskId, title, dependsOn, note?) sit on both arms. Consumers s4/s5 narrow on `status` (or `'testVerdict' in outcome`) before reading the verdict — the single, well-justified narrow-on-status this reshape costs. The sequencer that produces the outcome is PRIVATE (topological ordering, the for...of walk, attempt/repair budget, how the diff and test exit code are combined into the advance decision). A boundary amendment (hld.amendmentProposal, sharedContract.fieldRemove on testVerdict, breaking:true) accompanies this divergence.

```
// HLD sketch (flat):
// interface BuildTaskOutcome {
//   taskId; title; dependsOn; status: BuildTaskStatus;
//   filesTouched; testVerdict?: BuildTestVerdict | undefined; attempts; note?;
// }

// a2 reshape (src/workflow/runners/build/schemas.ts):
export type BuildTaskStatus = 'completed' | 'failed' | 'blocked' | 'not-reached';

interface BuildTaskCommon {
  readonly taskId: string;        // PlanTask id, verbatim from the approved plan
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly note?: string | undefined;
}

export interface BuildTaskReached extends BuildTaskCommon {
  readonly status: 'completed' | 'failed';
  readonly filesTouched: readonly string[];   // daemon working-tree diff
  readonly testVerdict: BuildTestVerdict;      // REQUIRED — daemon test run
  readonly attempts: number;
}

export interface BuildTaskUnreached extends BuildTaskCommon {
  readonly status: 'blocked' | 'not-reached';  // nothing ran: no diff, no verdict
}

export type BuildTaskOutcome = BuildTaskReached | BuildTaskUnreached;
```

**Call sites:**
- `src/daemon/workflow-rpc.ts`
- `src/daemon/__tests__/workflow-rpc.test.ts`

### `BuildTestVerdict` — new

The daemon's own authoritative verdict for a Task's stated tests — kept from the HLD sketch unchanged ({ command, passed, exitCode, summary }, all readonly). Produced daemon-side by executing the test command extracted verbatim from the PlanTask (the approved artifact is the authorization boundary for what runs); it is the only thing that advances a Task to a terminal status. Present on the BuildTaskReached arm only. The workflow-rpc test stub (whose complete()/completeStructured() throw) is the ready pattern for exercising the verdict-driven sequencer without a live provider.

```
export interface BuildTestVerdict {
  readonly command: string;   // from PlanTask stated tests, verbatim
  readonly passed: boolean;
  readonly exitCode: number;
  readonly summary: string;
}
```

**Call sites:**
- `src/daemon/workflow-rpc.ts`
- `src/daemon/__tests__/workflow-rpc.test.ts`

### `TaskImplementerRequest` — new

sc5 input, owned by s3. The context bundle handed to one implementer subprocess: the PlanTask (bound to the WORKFLOW PlanTask at src/workflow/artifacts/plan.ts:54-64 — NOT the same-named analyze-types.ts:87-95 interface), the Story design + plan markdown, completedDependencies (finished BuildTaskOutcome values, for context only), repoRoot (the implementer's entire blast radius), and maxAttempts (the bounded per-Task repair budget — kept generous, since giving up early produces a wrong 'failed'). Kept structurally as the HLD sketch.

```
export interface TaskImplementerRequest {
  readonly task: PlanTask;                                 // src/workflow/artifacts/plan.ts:54-64
  readonly storyDesignMarkdown: string;
  readonly planMarkdown: string;
  readonly completedDependencies: readonly BuildTaskOutcome[];
  readonly repoRoot: string;
  readonly maxAttempts: number;
}
```

**Call sites:**
- `src/workflow/artifacts/plan.ts`
- `src/agent/providers/cli-provider.ts`

### `TaskImplementerReport` — new

sc5 output, owned by s3. ADVISORY ONLY ({ claimedComplete, narrative }, both readonly) — the sequencer NEVER advances on it; advancement is decided by the daemon's own test run + diff. Kept deliberately two-field/minimal to reinforce the k2/sc5 quarantine: other Stories consume finished BuildTaskOutcome values and must never infer status from this narrative.

```
export interface TaskImplementerReport {
  readonly claimedComplete: boolean;   // advisory; never trusted to advance
  readonly narrative: string;
}
```

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `src/daemon/workflow-rpc.ts`

### `TaskImplementerAdapter` — new

sc5 seam, owned by s3. The quarantine boundary: a single implement() method that runs exactly one CliProvider subprocess per Task, serial by construction (ac3/ac5, k8). Isolates the k9-UNPROVEN long free-form editing workload (and the k8-UNPROVEN structured-output-for-editing question) from executor.ts/orchestrator.ts, which are asked only to host a stage, run a gate, and finalize an artifact. The concrete CliProvider invocation shape and the direct cli-provider.ts inspection are PRIVATE to s3; s4 consumes only the finished outcomes.

```
export interface TaskImplementerAdapter {
  /** Runs exactly one implementer subprocess to completion. Serial by construction. */
  implement(req: TaskImplementerRequest): Promise<TaskImplementerReport>;
}
```

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `src/workflow/__tests__/executor.test.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | s3 owns and produces BuildTaskOutcome (HLD: ownedByStory s3). It diverges from the flat HLD interfaceSketch into a status-discriminated union (a2) — see the accompanying hld.amendmentProposal — so testVerdict/filesTouched exist only on the reached arm and are daemon-populated, never self-reported. Consumers s4 (halts on it) and s5 (finalizes it) narrow on status before reading the verdict. |
| `sc5` | implements | s3 owns TaskImplementerAdapter (HLD: ownedByStory s3). implement() runs one CliProvider subprocess per Task, serial and never Promise.all'd; its TaskImplementerReport is advisory and never advances the run. s4 consumes finished BuildTaskOutcome values only and must never call implement() directly (boundary: sequencer/adapter internals are private). |
| `sc1` | consumes | s3's start/decompose/synthesize/finalize turn handlers are registered into the per-stage runner registry via registerBuildRunners() (owned by s1). s3 adds the sequencing turn behind that registration; it does not re-register or mutate sibling stages. |
| `sc2` | consumes | s3's per-Task outcomes surface to the developer through the WorkflowStepOutputBuild driving surface (owned by s1) — BuildRunProgress at each Task boundary and, at finalize, the markdown. s4 owns the progress framing; s3 emits the outcome data that flows through it (no second source of truth). |
| `sc3` | consumes | s3 consumes BuildAdmissionResult (owned by s2) at the start turn: the sequencer materializes the PlanTask work list and makes the implementer adapter reachable only when admitted === true, so on refusal treeUntouched:true holds structurally before any code-touching path exists. |

## Error paths

### Error cases

- **The CliProvider subprocess fails to spawn, or the claude/codex CLI errors mid-session, during the one implementer turn for a Task.** (recoverable)
  - Detection: The `await` on complete()/completeStructured() inside implement() settles as a rejected Promise; the sequencer's try/catch around that single awaited call catches the rejection.
  - Response: The rejection is treated as an implementer failure, NOT a Task pass. implement() surfaces it (or the sequencer records the failed session); the Task's authoritative status still comes from the daemon's own test run, which on a failed/absent editing session yields a non-passing BuildTestVerdict — so the Task lands as BuildTaskReached status 'failed', never 'completed'.
  - User impact: The developer sees the Task did not reach passing tests rather than a falsely-completed Task; the run halts at s4 instead of building the dependent Task on absent work.
- **A Task's stated tests never pass: after the bounded per-Task repair loop is exhausted, the daemon test run still fails.** (terminal)
  - Detection: On the final attempt (attempts === maxAttempts) the daemon-produced BuildTestVerdict has passed === false / exitCode !== 0; the sequencer observes the terminal non-passing verdict after its attempt/repair budget is spent.
  - Response: The Task is finalized as BuildTaskReached with status 'failed' carrying that failing daemon verdict (the verdict is never self-reported from the advisory TaskImplementerReport). The run does not advance to the next Task; s4 halts on the failed outcome.
  - User impact: The developer sees a concrete failing test command + exit code, and the run stops rather than silently continuing on top of a Task whose tests do not pass.
- **A Task is reached whose dependsOn names a Task that did not complete (its outcome is 'failed', 'blocked' or 'not-reached').** (terminal)
  - Detection: Before starting a Task, the sequencer resolves each id in req.task.dependsOn against the already-produced BuildTaskOutcome map and finds one whose status is not 'completed'.
  - Response: The implementer adapter is NOT invoked for this Task; the sequencer emits a BuildTaskUnreached with status 'blocked' (no filesTouched, no testVerdict — nothing ran, so the union arm has no field to fabricate one in).
  - User impact: The dependent Task is transparently marked blocked rather than being built on an incomplete predecessor, preserving the plan's dependency guarantee (ac2).
- **completeStructured is used for a schema-constrained turn and the subprocess cannot produce a document matching the schema within the provider's retry budget.** (recoverable)
  - Detection: completeStructured (cli-provider.ts:161-167) rejects after exhausting its internal retry budget; the rejection propagates through the awaited call in implement().
  - Response: Handled identically to a subprocess error — surfaced as an implementer failure, never as a Task advance; the daemon test run remains the sole authority and yields a non-passing verdict for that Task.
  - User impact: A malformed structured response degrades to a reported implementer failure, not a corrupt or fabricated Task outcome.
- **The PlanTask reached for implementation states no runnable test command (its TaskTestRef set is empty or resolves to an empty command).** (terminal)
  - Detection: When the sequencer extracts the test command from req.task to hand the daemon, the extracted command string is empty/absent — checked before dispatching the daemon test run.
  - Response: ac4 ('bring stated tests to passing') cannot be authoritatively satisfied, so the Task is not advanced to 'completed'; it is finalized as BuildTaskReached status 'failed' with a BuildTestVerdict recording the missing command (or, if editing never began, BuildTaskUnreached 'not-reached'). The advisory report is never used to claim completion.
  - User impact: A Task with no verifiable tests cannot masquerade as completed; the developer sees it flagged rather than silently passed.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A work list containing Tasks whose dependency graph would permit two or more to run in parallel (independent Tasks, no dependsOn overlap). | They are still implemented strictly one at a time — exactly one Task worked at any moment (ac3) — because concurrency is forbidden even where dependencies would allow it; the topological order is walked with a serial for...of, never Promise.all'd. |
| A Task with dependsOn === [] reached first in the topological order. | No dependency gate applies; the implementer adapter runs immediately for it, and its daemon verdict decides its terminal status. |
| An admitted build run whose approved plan holds exactly one Task. | The work list is that single Task; one implement() call runs, the daemon test+diff produces its BuildTaskOutcome, and the run finalizes with a one-element outcome list. |
| A Task whose stated tests already pass and whose implementer session makes no edits (a no-op editing turn). | The daemon working-tree diff is empty (filesTouched === []) and the test verdict passes, so the Task is BuildTaskReached status 'completed' with an empty filesTouched — a valid completion, not an error. |
| An admitted build run whose plan holds zero Tasks. | The materialized work list is empty; the sequencer runs no implementer subprocess, produces no BuildTaskOutcome, and the run finalizes trivially with treeUntouched holding structurally. |
| req.maxAttempts === 1 (minimal repair budget). | The implementer gets a single attempt; the first daemon verdict is taken as terminal (passed → 'completed', failed → 'failed'), with no repair loop iteration. |

### Invariants to preserve

- All LLM interaction on the build path goes through the shared LLMProvider abstraction one call at a time — the implementer runs a single CliProvider subprocess per Task, serially, and provider calls are never Promise.all'd (ac5, k8; CLAUDE.md serial-provider rule). [[c2]]
- Cloud LLM access is reached only through the claude/codex CLI binaries via CliProvider; no direct REST provider is introduced, and cloud auth/quota stays with the user's CLI OAuth session. [[c2]]
- CliProvider.completeStructured returns exactly one typed JSON document per call (cli-provider.ts:161-167); the design must not assume it hosts a multi-turn editing loop — the HLD carries that as UNPROVEN and the adapter quarantines the question rather than silently relying on it. [[c2]]
- The approved plan is a fixed input: the run consumes PlanTask values verbatim from src/workflow/artifacts/plan.ts:54-64 in the recorded order with the recorded dependencies, adding/dropping/reordering nothing (c2, ac1). checkPlanTaskGraph has already validated the dependency graph upstream, so the sequencer treats ordering as pre-validated and never re-derives it. [[c3]]
- The daemon-side runner RPC surface — WorkflowProgress frame shape and the runStart/runWorkflowServerSide server-side entrypoints — is the existing observability/sequencing contract the build stage mirrors; the sequencer emits outcome data through it and does not introduce a second source of truth for Task status. [[c1]]

## Test strategy

**Test framework:** `node:test (executed via `npx tsx --test`, suites under `src/**/__tests__/*.test.ts`) — the convention s1 reports from the daemon/workflow test layout (src/daemon/__tests__/workflow-rpc.test.ts, src/workflow/__tests__/executor.test.ts).`

### Test levels

- **unit** — Prove the private sequencer over deterministic in-memory inputs, with no live provider and no real git/test execution: work-list materialization from the approved plan, topological ordering, the serial for...of walk, dependency gating, and the BuildTaskOutcome discriminated-union invariant (testVerdict/filesTouched exist only on the reached arm).
  - Subjects: `the build-stage sequencer (private ordering + for...of walk + attempt/repair budget) in src/workflow/runners/build`, `BuildTaskOutcome union + BuildTestVerdict shape in src/workflow/runners/build/schemas.ts`, `binding to the WORKFLOW PlanTask (src/workflow/artifacts/plan.ts:54-64) and reliance on the pre-validated checkPlanTaskGraph ordering`
  - Fixtures: `an in-memory PlanArtifact whose PlanBody holds several ordered, dependency-labelled PlanTask values (chain + independent-pair + dependsOn:[] + single-Task + zero-Task variants)`, `a stub LLMProvider modelled on src/daemon/__tests__/workflow-rpc.test.ts whose complete()/completeStructured() are instrumented (record call order, optionally throw)`, `a fake daemon test-run+diff hook returning a canned BuildTestVerdict (passed/failed, exitCode, command) and a filesTouched list, so advancement is driven without executing real tests`
- **integration** — Exercise the TaskImplementerAdapter.implement() seam wired to the sequencer against a fake provider and a fake daemon verdict/diff source: one subprocess per Task, advisory TaskImplementerReport never advancing the run, rejection handling, and the admitted-run precondition (treeUntouched holds on refusal).
  - Subjects: `TaskImplementerAdapter.implement() invocation shape against CliProvider signatures (src/agent/providers/cli-provider.ts complete 109-127 / completeStructured 161-167)`, `sequencer → adapter → daemon-verdict advance decision end-to-end (BuildTaskReached/BuildTaskUnreached production)`, `the sc3 admission gate: adapter unreachable when BuildAdmissionResult.admitted !== true`
  - Fixtures: `a fake CliProvider/LLMProvider that (a) counts in-flight calls to assert never >1, (b) can resolve, reject, or emit an advisory report claiming completion regardless of the real verdict`, `a stubbed daemon test-run + working-tree diff producing BuildTestVerdict + filesTouched independently of the advisory report`, `a scratch repoRoot / registered-repo fixture and a canned Story design + plan markdown bundle for TaskImplementerRequest`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: materializes the run work list verbatim from the approved PlanArtifact — same PlanTask ids, same recorded order, same dependsOn, nothing added/dropped/reordered`, `unit: an admitted plan with zero Tasks yields an empty work list, runs no implementer subprocess, and finalizes trivially with treeUntouched holding`, `unit: a single-Task admitted plan yields a one-element work list and a one-element BuildTaskOutcome result` |
| `ac2` | `unit: a dependent Task is not started until every id in its dependsOn has a status:'completed' BuildTaskOutcome`, `unit: when a dependency ended 'failed'/'blocked'/'not-reached', the dependent Task is emitted as BuildTaskUnreached status 'blocked' with no filesTouched/testVerdict and the adapter is never invoked for it`, `integration: the depended-upon Task's implement()+daemon verdict completes before the dependent Task's implement() is dispatched` |
| `ac3` | `integration: an in-flight-call counter on the fake adapter/provider is never observed >1 across the whole run — exactly one Task worked at any moment`, `unit: a work list with two independent Tasks (no dependsOn overlap) is still walked one at a time via serial for...of, never Promise.all'd`, `unit: implement() calls settle in strict topological sequence (each awaited before the next is invoked)` |
| `ac4` | `integration: a Task advances to BuildTaskReached status 'completed' only when the daemon-produced BuildTestVerdict passes (exitCode 0)`, `integration: an advisory TaskImplementerReport with claimedComplete:true does NOT advance the Task — a failing daemon verdict still yields status 'failed'`, `unit: after the bounded per-Task repair loop is exhausted (attempts === maxAttempts) with a still-failing daemon verdict, the Task finalizes as BuildTaskReached status 'failed' carrying that verdict, and the run halts (does not build the dependent Task)`, `unit: a Task whose stated tests resolve to an empty/absent command is flagged failed/not-reached rather than completed`, `unit: maxAttempts === 1 takes the first daemon verdict as terminal with no repair iteration; a no-op editing turn with an empty diff and passing verdict is a valid status 'completed' with filesTouched === []` |
| `ac5` | `integration: a concurrency guard on the stub LLMProvider (increment-on-entry / assert-never-gt-1) confirms provider calls are issued strictly serially and never in parallel across the build path`, `integration: the LLM is reached only through the injected CliProvider/LLMProvider abstraction — no direct REST client is constructed — and a rejected provider Promise is treated as an implementer failure, never a Task pass`, `integration: a completeStructured rejection after the retry budget degrades to a reported implementer failure, leaving the daemon verdict as the sole authority for the Task's status` |

## Migration

**State before:** No `build` stage exists yet. Per the s1 bundles, the per-stage runner registry (sc1, registerWorkflowRunners at src/workflow/index.ts:23-32) hosts only define / design.epic / design.story / tracker, and the daemon drives runs server-side through src/daemon/workflow-rpc.ts (module.profile: WorkflowProgress, runStart, runWorkflowServerSide) — there is no build-specific outcome type on that surface. sc4 `BuildTaskOutcome` currently exists ONLY as a flat HLD interface sketch (`testVerdict?: BuildTestVerdict | undefined`, `filesTouched`, `attempts` as always-optional top-level fields) — not yet code — so its load-bearing invariant (filesTouched/testVerdict are daemon-produced, never self-reported) is documented but unenforced. sc5 (`TaskImplementerAdapter`/`Request`/`Report`) does not exist. CliProvider (src/agent/providers/cli-provider.ts:76-291) already exposes `complete()` (109-127) and `completeStructured()` (161-167) with zero callers for a long editing session (symbol.locate, usage.example totalCallers:0). The workflow PlanTask/PlanArtifact (src/workflow/artifacts/plan.ts:54-64, 83-87) already exist and are pre-validated by checkPlanTaskGraph (data-model.trace), so the ordered, dependency-labelled task list is a fixed input.

**State after:** The `build` stage runs the plan's Tasks one at a time in dependency order. sc4 `BuildTaskOutcome` is a status-discriminated union (`BuildTaskReached` {status 'completed'|'failed'} REQUIRES a daemon-produced `testVerdict: BuildTestVerdict` plus `filesTouched`/`attempts`; `BuildTaskUnreached` {status 'blocked'|'not-reached'} carries none), making the daemon-produced invariant un-forgeable at the type level. `BuildTestVerdict` and the sc5 seam (`TaskImplementerRequest`/`TaskImplementerReport`/`TaskImplementerAdapter`) exist; the adapter runs exactly one CliProvider subprocess per Task, serial by construction, and its report is advisory only. A private sequencer walks the pre-validated PlanTask list topologically, computes each outcome from the daemon's own test run + working-tree diff, and streams progress at each Task boundary via WorkflowProgress. The build turn handlers are registered into the sc1 registry via registerBuildRunners(); in-design consumers s4/s5 narrow on `status` before reading `testVerdict`/`filesTouched`.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the new build schemas module (src/workflow/runners/build/schemas.ts) defining BuildTaskStatus, the BuildTaskCommon base, and BuildTestVerdict ({command, passed, exitCode, summary}, all readonly). Purely additive new types — no existing symbol touched. — ↩ rollbackable
2. Add the sc4 BuildTaskOutcome as the two-arm status-discriminated union (BuildTaskReached | BuildTaskUnreached) instead of the flat HLD sketch, with testVerdict/filesTouched/attempts present only on the reached arm. This is the sc4 boundary reshape carried by the accompanying hld.amendmentProposal (sharedContract.fieldRemove testVerdict, breaking:true). — ↩ rollbackable
3. Add the sc5 seam types (TaskImplementerRequest bound to the WORKFLOW PlanTask at src/workflow/artifacts/plan.ts:54-64, TaskImplementerReport, TaskImplementerAdapter). Additive new interfaces. — ↩ rollbackable
4. Implement the TaskImplementerAdapter — one CliProvider subprocess per Task via the shared LLMProvider abstraction, run strictly serially and never Promise.all'd (ac3/ac5/k8), with the report treated as advisory. New code, no existing behaviour altered. — ↩ rollbackable
5. Implement the private sequencer: materialize the pre-validated PlanTask list as the work list only when the run is admitted (sc3 admitted===true), walk it topologically one Task at a time, and compute each BuildTaskOutcome from the daemon's own test run + working-tree diff rather than the advisory report. New private code. — ↩ rollbackable
6. Update the in-design sc4 consumers (s4 halt logic, s5 finalize) to narrow on status (or 'testVerdict' in outcome) before reading the relocated testVerdict/filesTouched fields. This is the one narrow-on-status the reshape costs; must land together with step 2. — ↩ rollbackable
7. Register the build turn handlers into the sc1 registry via registerBuildRunners(), adding the sequencing turn behind the existing per-stage registration without re-registering or mutating sibling stages. — ↩ rollbackable
8. Extend the test harnesses to exercise the verdict-driven sequencer without a live provider: reuse the src/daemon/__tests__/workflow-rpc.test.ts LLMProvider stub whose complete()/completeStructured() throw, and the src/workflow/__tests__/executor.test.ts llmRunner harness (line 49). — ↩ rollbackable

**Backward compat:** sc4 is internal-shared (surfaceLevel), not a published or deployed API, and the entire `build` stage is new and unreleased — there are no external IDE/IPC clients or on-disk BuildTaskOutcome data to preserve. The only compatibility surface is intra-design, between sibling Stories: the sc4 reshape from the flat HLD sketch to the discriminated union is breaking (breaking:true), so the in-design consumers s4 (halts on the outcome) and s5 (finalizes it) MUST narrow on `status` before reading `testVerdict`/`filesTouched`, which on the reached arm move out of the top-level optional position. This is covered by the accompanying hld.amendmentProposal and by migration step 6, which must land in the same change as step 2. No existing runner stage's contract (sc1 registry shape, workflow-rpc.ts runStart/runWorkflowServerSide/WorkflowProgress, CliProvider complete()/completeStructured(), PlanTask/PlanArtifact) is modified — the build stage only registers alongside them.

## Alternatives considered

### a1: HLD-literal flat records (advisory report + daemon-authoritative outcome)

Take sc4 BuildTaskOutcome and sc5 TaskImplementerAdapter verbatim from the HLD sketch — flat interfaces, plain status union, thin advisory report, daemon fills filesTouched/testVerdict.

Adopt both owned contracts exactly as the HLD interfaceSketch draws them. BuildTaskOutcome is a single flat interface: taskId/title/dependsOn bound verbatim from PlanTask (plan.ts:54-64), status as a plain 'completed'|'failed'|'blocked'|'not-reached' string-literal union, attempts as a bare number, filesTouched and an optional testVerdict populated only by the daemon's own working-tree diff and test run. The TaskImplementerAdapter exposes a single implement(req): Promise<TaskImplementerReport>, and TaskImplementerReport stays the two-field advisory {claimedComplete, narrative} — never consulted to advance. The sequencer carries a private BuildTaskOutcome[] and s5 finalizes it. Consumed sc1/sc2/sc3 are used as-is: admission (sc3) gates before any outcome exists, and outcomes flow out through the sc2 progress/markdown surface.

**Rejected because:** Safest, lowest-cost (XS), zero HLD divergence — s2/s4/s5 bind against already-published shapes. Loses to a2 only on ac4/sc4: the load-bearing invariant is documented, not type-enforced, an accuracy gap the project's accuracy-primary principle disfavors.

### a2: Status-discriminated outcome union (verdict presence tied to terminal status) — **CHOSEN**

Reshape BuildTaskOutcome into a discriminated union on status so a completed/failed variant requires testVerdict+filesTouched and a blocked/not-reached variant forbids them.

Keep sc5's TaskImplementerAdapter and its advisory report unchanged. Split sc4 BuildTaskOutcome into a discriminated union keyed on status: a 'reached' variant ({status:'completed'|'failed', filesTouched, testVerdict: BuildTestVerdict, attempts}) that REQUIRES the daemon-produced verdict and diff, and an 'unreached' variant ({status:'blocked'|'not-reached', note?}) that has no verdict or filesTouched field at all. taskId/title/dependsOn (from PlanTask) are common to both arms. This encodes the HLD's stated invariant — testVerdict/filesTouched are produced only by a real daemon test run + tree diff — directly in the type: an unreached Task literally cannot carry a verdict. s4 narrows on status to decide halt; s5 narrows to render.

### a3: Structured per-attempt log on the outcome

Replace attempts:number with attempts:BuildTaskAttempt[], each recording its testVerdict and advisory narrative, so the repair loop is reviewable in the finalized artifact.

Leave sc5's adapter signature exactly as sketched — still one implement() call per attempt, driven serially by the sequencer. Reshape sc4 so attempts becomes a readonly BuildTaskAttempt[], where each BuildTaskAttempt records that attempt's daemon test verdict plus the implementer's advisory narrative for that cycle. BuildTaskOutcome's top-level testVerdict is defined as the final attempt's verdict (or absent for unreached Tasks). taskId/title/dependsOn stay bound to PlanTask; filesTouched remains the cumulative daemon diff. The sequencer records each edit→test→repair cycle into the attempt list as it walks the work list.

**Rejected because:** Serves the observability NFR well (bounded repair budget becomes reviewable), but leaks declared-private sequencer repair mechanics into the sc4 cross-Story contract and enlarges the artifact payload. The boundary violation risk on sc4 ranks it below a1's clean fidelity and a2's type-enforced strengthening.

### a4: Run-state accumulator as a first-class checkpoint contract

Introduce a BuildRunState (completed[]/inFlight?/pending[] over the plan's Tasks) that the sequencer advances one Task at a time and persists at every Task boundary, with BuildTaskOutcome staying the per-Task unit.

Keep sc4 BuildTaskOutcome as the per-Task result and sc5's adapter unchanged. Add a BuildRunState value that partitions the plan's PlanTask[] into completed: BuildTaskOutcome[], an optional inFlight taskId, and pending taskIds — advanced by the sequencer exactly one Task at a time and persisted incrementally at each Task boundary through the parent module's hash-json/slug writers. s4 halts on this state and s5 finalizes it; BuildRunProgress frames are derived from its transitions. This turns the durability NFR ('persist incrementally so a restart leaves a readable record') and the observability NFR into a typed object rather than an implementation detail of the private BuildTaskOutcome[] carry.

**Rejected because:** The durability-as-first-class-contract idea is attractive, but it adds an unnamed contract (BuildRunState) beyond s3's HLD ownership (sc4/sc5 only), overlaps sc2's progress surface and the declared-private sequencer internal, and costs M with a second-source-of-truth risk. Highest boundary-scope risk of the four, so it ranks last despite the strongest durability story.
