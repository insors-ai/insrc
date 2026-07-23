<!-- insrc:artifact LLD-aa737b47e8712a83-S001 -->

# LLD: S001

**Epic:** `add-surgical-audit-correction-loop-daemon`
**HLD base run:** `wf-1784804966200-8b7p8t`
**HLD effective hash:** `aa737b47e871...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `boundaryHardFailure`

```typescript
function boundaryHardFailure(message: string, findings?: readonly BoundaryFinding[]): ValidationFailure
```

**Parameters:**
- `message: string` — The one-line human-readable summary (e.g. 's8 scope-boundary hard-fail on: sbdry4'), unchanged from today. [[c2]]
- `findings: readonly BoundaryFinding[]` _(optional)_ — The structured flagged items (itemId + verdict + detail) extracted from the audit output, so the runner can build a targeted correction directive instead of parsing the message string. [[c2]]

**Returns:** `ValidationFailure` — A boundary-kind failure; marked correctable (carrying findings) when findings are supplied, else the historical terminal retryable:false. [[c2]]

**Preconditions:**
- Each findings[].itemId is a real audit item id from the frozen audit step output (sb1..sb3 for define, sbdry1..sbdry4 for design.story).

**Postconditions:**
- Returned failure has kind='boundary' and retryable=false.
- When findings is non-empty the failure carries findings and correctable=true so the runner attempts correction; called without findings it preserves today's terminal behavior for client/MCP-driven call-sites.

### `runWorkflowServerSide`

```typescript
function runWorkflowServerSide(intent: WorkflowIntent, provider: LLMProvider, opts: RunWorkflowOpts): Promise<RunWorkflowResult>
```

**Parameters:**
- `intent: WorkflowIntent` — The workflow intent being driven (unchanged). [[c1]]
- `provider: LLMProvider` — Structured-output-capable provider for synthesize + re-audit calls (unchanged). [[c1]]
- `opts: RunWorkflowOpts` — Adds maxCorrectionRounds?: number (default 3; 0 = historical terminate-on-first-boundary-fail) alongside the existing runId/epicKey/modelLabel/maxSynthAttempts/signal/onProgress fields. [[c1]]

**Returns:** `Promise<RunWorkflowResult>` — The persisted artifact path + artifact + runId, exactly as today on success.

**Errors:**
- `Error` when Thrown only after maxCorrectionRounds correction rounds still leave a boundary audit failing, or on a genuinely non-correctable failure (e.g. a schema failure surviving maxSynthAttempts) — termination is now the last resort, not the first response to a boundary hard-fail.

**Preconditions:**
- provider.capabilities.structuredOutput is true (existing gate).

**Postconditions:**
- On a correctable boundary failure, the runner injects the findings into the existing feedback channel, re-emits the synthesized body, re-runs ONLY the audit against the corrected body, swaps the fresh verdict into the audit step output, and re-finalizes — up to maxCorrectionRounds rounds; no design step s1..s7 is re-run and no scope re-run occurs.
- A persisted artifact is written (writeAtomic) only when finalizeArtifact returns ok, so a failing run leaves no partial artifact.
- onProgress emits a correction-round frame per round.

## Data model changes

### `BoundaryFinding` — new

A structured audit finding carried on a boundary failure so the correction loop can target it: { itemId: string; verdict: 'missed' | 'ambiguous'; detail: string }. itemId is the audit item (e.g. 'sbdry4'), verdict mirrors the audit verdict values read at finalize, detail is the auditor's own explanation (its evidence/notes) of what was flagged. Extracted from the frozen audit step output via a boundaryFindings helper at the point boundaryHardFailure is minted. [[c2]][[c3]]

**Call sites:**
- `src/workflow/synthesizer.ts`
- `src/workflow/orchestrator.ts`
- `src/daemon/workflow-rpc.ts`

### `ValidationFailure` — field-add

Add two optional, additive fields to the existing ValidationFailure interface: findings?: readonly BoundaryFinding[] (the structured flagged items) and correctable?: boolean (true when a targeted correction loop can fix it; distinct from retryable, which governs plain synth re-emits). Existing consumers are unaffected because both fields are optional; the runner treats kind==='boundary' && correctable===true as the signal to enter the correction loop rather than throw. [[c3]]

```
interface ValidationFailure { ok:false; kind:'schema'|'citations'|'boundary'; message:string; details?:readonly string[]; retryable?:boolean; findings?:readonly BoundaryFinding[]; correctable?:boolean }
```

**Call sites:**
- `src/workflow/synthesizer.ts`
- `src/workflow/orchestrator.ts`
- `src/daemon/workflow-rpc.ts`

### `reAuditBoundary` — new

A new internal helper in the daemon runner that, given the corrected artifact, re-runs ONLY the scope-boundary audit against the corrected content and returns fresh verdicts shaped like the audit step output ({results:[{itemId,verdict,evidence}]}). This lets finalize judge the CORRECTED body instead of the stale frozen audit output. Paired with a correctionDirective helper that builds the tightly-scoped 'fix only the flagged reference, change nothing else, ground replacements in s1' directive. Both live in src/daemon/workflow-rpc.ts and are invoked from the reshaped runWorkflowServerSide correction loop. [[c1]]

**Call sites:**
- `src/daemon/workflow-rpc.ts`

## Error paths

### Error cases

- **The boundary audit still fails after the correction loop has run maxCorrectionRounds rounds.** (terminal)
  - Detection: The runner's correction-round counter reaches maxCorrectionRounds while the fresh re-audit verdict for the current content still reports a boundary finding.
  - Response: Throw a terminal error listing the persistent findings (itemId + detail), emitted only as the last resort after exhausting rounds. No artifact is persisted.
  - User impact: Run terminates with a clear 'could not correct after N rounds' message enumerating exactly which items remained — far more actionable than today's immediate abort, and only after real correction attempts.
- **A correction round removes the flagged reference but the re-emitted body introduces a DIFFERENT invented reference (or trips a different sbdry item).** (recoverable)
  - Detection: The fresh re-audit against the corrected body returns a boundary failure whose findings differ from the prior round's.
  - Response: Treat it as the next correctable finding: build a new directive from the new findings and continue the loop, still bounded by maxCorrectionRounds.
  - User impact: Transparent — another bounded round; the correction-round progress frame shows the shifting findings so a watcher sees forward motion, not a silent spin.
- **The provider emits malformed / schema-invalid JSON on the audit RE-RUN (reAuditBoundary), not the synthesize.** (terminal)
  - Detection: The structured-output layer (completeStructured against RE_AUDIT_SCHEMA) rejects the re-audit response.
  - Response: The provider's own structured-output retry applies; if a valid verdict still cannot be produced the call throws and the run surfaces the malformed-re-audit reason — never looping unbounded on a broken re-audit.
  - User impact: The round ends without a false 'passed'; the failure surfaces with a clear cause.
- **The abort signal fires while the correction loop is mid-flight (between or during rounds).** (terminal)
  - Detection: checkAbort() (signal.aborted) is invoked at the top of every correction round and before each provider call.
  - Response: Throw 'workflow.run: aborted' exactly as today; because writeAtomic runs only after a successful finalize, no partial artifact is left behind.
  - User impact: Run stops promptly on cancel with no half-written artifact.
- **A non-boundary, non-retryable failure (e.g. a schema failure explicitly marked retryable:false) reaches the failure branch.** (terminal)
  - Detection: failure.kind !== 'boundary' || failure.correctable !== true.
  - Response: Preserve today's terminal behavior — surface immediately without entering the correction loop; the correction path is gated strictly on a correctable boundary failure.
  - User impact: Genuinely uncorrectable failures still fail fast, so the loop never masks a real defect or wastes rounds on something feedback cannot fix.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A boundary failure whose findings list is empty (kind='boundary' but nothing structured extracted, so correctable is unset). | Not treated as correctable — terminate as today; the loop requires concrete findings to build a directive. |
| opts.maxCorrectionRounds = 0. | Behaves exactly like today: a boundary hard-fail is surfaced immediately with no correction attempt — fully backward-compatible at the zero bound. |
| The first synthesize already passes the boundary audit (no invented reference). | The correction loop is never entered; zero extra provider calls or latency on the happy path. |
| The audit flags multiple items at once (e.g. sbdry2 AND sbdry4). | A single correction directive enumerates all findings and one corrected re-emit + re-audit addresses them together, rather than one item per round. |

### Invariants to preserve

- Validation precedes every side effect: writeAtomic persists the artifact ONLY after finalizeArtifact returns ok, so a run that exhausts correction rounds or aborts leaves no partial artifact on disk. [[c1]]
- Provider calls are never Promise.all'd — the synthesize re-emit and the audit re-run in each correction round stay serial sequential awaits, matching the repo-wide LLM-provider rule. [[c1]]
- After a correction, the boundary decision must be taken against the FRESH re-audit verdict for the corrected content — never the stale frozen stepOutputs['s8']/['s4'], which described the pre-correction body. [[c4]]
- The change is additive to the failure taxonomy: findings and correctable are optional fields, and boundaryHardFailure called without findings preserves the exact terminal behavior existing MCP/client-driven call-sites rely on. [[c2]]

## Test strategy

**Test framework:** `node:test (run via tsx --test, the repo-wide convention)`

### Test levels

- **unit** — Lock the failure-taxonomy change: a scope-boundary hard-fail is now CORRECTABLE and carries structured findings (itemId + verdict + detail), and a clean audit yields no boundary failure.
  - Subjects: `finalizeArtifact (correctable-boundary path)`, `boundaryHardFailure + boundaryFindings extraction`, `ValidationFailure additive fields (findings, correctable)`
  - Fixtures: `A minimal LldBody that satisfies isLldBody plus a crafted stepOutputs['s8'] flagging sbdry4 (verdict missed, evidence carrying the invented path)`, `A standalone design.story WorkflowIntent`
- **unit** — Lock the runner correction helpers: the targeted directive names each finding + demands change-nothing-else + grounding, and the re-audit call carries the corrected artifact + prior findings and returns fresh verdicts.
  - Subjects: `correctionDirective(findings)`, `reAuditBoundary(provider, artifact, findings, sco)`
  - Fixtures: `A capturing fake LLMProvider that records the messages it receives and returns a canned re-audit verdict`
- **live** — Prove the full recover-instead-of-throw loop end-to-end: a run whose audit flags an invented reference is corrected and finalizes instead of being discarded. Requires real analyze grounding (buildRun) so it runs against define/design.story, not a fake provider.
  - Subjects: `runWorkflowServerSide correction loop over a real define/design.story run`
  - Fixtures: `A registered + indexed repo and a focus known to tempt an invented reference (the dogfood scenario that originally hard-failed)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: finalizeArtifact returns a CORRECTABLE boundary failure carrying structured findings (sbdry4, detail) when s8 flags an invented reference`, `unit: correctionDirective names each finding + its detail and demands change-nothing-else + grounding in s1` |
| `ac2` | `unit: reAuditBoundary audits the CORRECTED artifact for the flagged items and returns fresh verdicts (passed once resolved)`, `live: a run whose audit never clears terminates after exactly maxCorrectionRounds rounds, listing the persistent findings` |
| `ac3` | `unit: a CLEAN s8 (all passed) yields no boundary failure from finalizeArtifact`, `live: opts.maxCorrectionRounds=0 surfaces a boundary hard-fail immediately (backward-compatible)` |
| `ac4` | `live: after correction rounds are exhausted, NO artifact file exists on disk (writeAtomic never ran)`, `live: a run whose first synthesize passes the audit persists the artifact and never enters the correction loop` |

## Migration

**State before:** boundaryHardFailure (src/workflow/orchestrator.ts) returned { kind:'boundary', retryable:false } with no structured findings, and runWorkflowServerSide (src/daemon/workflow-rpc.ts) THREW on the first boundary hard-fail — discarding the whole run's work and tokens. The audit verdict is frozen in stepOutputs['s8']/['s4'] and finalize reads it directly; there was no correction path. ValidationFailure carried only message/details. [[c1]][[c2]]

**State after:** boundaryHardFailure optionally carries structured findings and marks the failure correctable; runWorkflowServerSide, on a correctable boundary failure, runs a bounded correction loop (maxCorrectionRounds, default 3): inject the specific findings into the existing feedback channel, re-emit the synthesized body, re-run ONLY the audit (reAuditBoundary) against the corrected body, swap the fresh verdict into the audit step output, re-finalize — terminating only after the bound is exhausted. Design steps are never re-run; the happy path and all client-driven call-sites are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the BoundaryFinding type and two OPTIONAL additive fields (findings, correctable) to the ValidationFailure interface in the synthesizer module. Purely additive — no existing consumer reads them yet. — ↩ rollbackable
2. Extend boundaryHardFailure to accept an optional findings argument and, at each mint site (define s4, define-extend, design.story s8), extract the flagged items (itemId + verdict + detail) from the frozen audit output via a boundaryFindings helper and pass them in, marking the failure correctable when findings are present. Calling boundaryHardFailure with no findings keeps today's terminal semantics. — ↩ rollbackable
3. Add the reAuditBoundary + correctionDirective helpers in the daemon runner and reshape runWorkflowServerSide's non-retryable branch: on a correctable boundary failure, loop up to maxCorrectionRounds (new opt, default 3) building a targeted 'change only the flagged reference, preserve everything else, ground replacements in s1' directive, re-emitting the body, re-auditing the corrected body, swapping the fresh verdict into the audit step output, and re-finalizing. Non-boundary / non-correctable failures keep failing fast. — ↩ rollbackable
4. Rebuild and fast-forward-restart the installed daemon (the standard scripts/daemon-ctl.sh update + restart) so the running instance picks up the correction loop. — ↩ rollbackable _(needs: `orders 1-3 committed and tests green`)_

**Backward compat:** Fully backward-compatible. findings/correctable are optional additive fields, so existing ValidationFailure consumers compile and behave unchanged. boundaryHardFailure called without findings and opts.maxCorrectionRounds=0 both reproduce today's immediate-surface behavior exactly. The change is confined to the daemon-side runWorkflowServerSide path; client/MCP-driven runs (insrc_workflow_step) do not use runWorkflowServerSide and are wholly unaffected. No IPC method name or payload shape changes. In-flight daemon runs are dropped by the FF-restart, which is the pre-existing behavior of every daemon update — not new to this change.

## Alternatives considered

### a1: Synthesize-time correction + audit re-run — **CHOSEN**

Make the boundary failure correctable: inject the specific findings into the existing synth feedback channel, re-emit the corrected artifact body, then re-run only the audit against that corrected body — loop N rounds.

Extend ValidationFailure with a structured findings list (the flagged sbdry items + detail) and a correctable marker, minted by boundaryHardFailure. In runWorkflowServerSide, replace the throw at the non-retryable branch with a correction round: (1) format the findings into a targeted directive appended to the EXISTING feedback channel; (2) re-issue the synthesize call to get a corrected artifact; (3) re-run ONLY the boundary audit against the corrected content to get a fresh verdict; (4) swap the fresh verdict into the audit step output and re-finalize. Bound by maxCorrectionRounds (generalizes maxSynthAttempts, default 3). No design step (s1-s7) is re-run; no scope re-run.

### a2: Dedicated surgical correction pass (patch only flagged fields)

A new correction runner takes {flagged findings, current body} and emits a minimal patch touching ONLY the invented-reference fields; splice it in, re-run the audit, then finalize — no full body re-emit.

Add a small correction runner/prompt: input = the flagged findings + the exact offending fragments; output = a minimal correction (remove the invented ref, or replace it with a real path from the s1 bundle). Splice the correction back into the frozen content (field-level merge), then re-run the audit against the patched content and finalize. Bound by N rounds.

**Rejected because:** Most surgical on paper, but the extra splice/merge machinery introduces new failure surface that can hurt correction accuracy — the very thing we are improving. A superset of a1; deferred unless whole-body re-emit proves lossy in practice. Scores partial on minimal-blast-radius vs a1's satisfies.

### a3: Re-run the offending design step via the executor

Identify which design step (s1-s7) produced the invented reference, re-invoke just that step through resumeRun with a correction directive, patch its stepOutput, re-run the audit, then synthesize.

Map the flagged finding back to the design step that introduced it, rebuild that step's pause, re-drive it through the executor's resumeRun with a correction directive, overwrite that single stepOutput, re-run the audit step, then prepareSynthesize/finalizeArtifact fresh.

**Rejected because:** Heaviest and least aligned with the surgical/no-rerun mandate; violates surgical-correct-flagged-only and minimal-blast-radius, and needs finding-to-step provenance the audit does not emit. Rejected.

## Open questions

- ep3 (non-hard): the 'provider calls never Promise.all'd' invariant is grounded in the repo-wide LLM-provider convention (CLAUDE.md) rather than a specific s1 analyze bundle — a minor grounding caveat, not a design gap.

## Citations

- **[[c1]]** `code` `src/daemon/workflow-rpc.ts`
- **[[c2]]** `code` `src/workflow/orchestrator.ts`
- **[[c3]]** `code` `src/workflow/synthesizer.ts`
- **[[c4]]** `code` `src/workflow/executor.ts`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-07-23T11:24:50.656Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | manual | boundaryHardFailure in src/workflow/orchestrator.ts accepts an optional findings parameter of type readonly BoundaryFinding[]. | orchestrator.ts:400 defines `function boundaryHardFailure(message: string, findings?: readonly BoundaryFinding[]): ValidationResult` — exact signature match. | none — verified sound |
| c2 | citation | LOW | manual | ValidationFailure in src/workflow/synthesizer.ts carries optional findings?: readonly BoundaryFinding[] and correctable?: boolean fields. | synthesizer.ts:66 `readonly findings?: ReadonlyArray<BoundaryFinding>;` and :72 `readonly correctable?: boolean;` both present on ValidationFailure. | none — verified sound |
| c3 | citation | LOW | manual | The BoundaryFinding type { itemId; verdict; detail } is defined in src/workflow/synthesizer.ts. | synthesizer.ts:43 `export interface BoundaryFinding` with :44 itemId:string and :45 verdict:'missed'\|'ambiguous'. The other readonly itemId matches (workflow-rpc ReAuditResult, todos.ts) are unrelated types, not contradictions. | none — verified sound |
| c4 | citation | LOW | manual | reAuditBoundary and correctionDirective helpers exist in src/daemon/workflow-rpc.ts. | workflow-rpc.ts:543 `export async function reAuditBoundary(` and :505 `export function correctionDirective(` both present. | none — verified sound |
| c5 | citation | LOW | manual | RunWorkflowOpts in src/daemon/workflow-rpc.ts adds a maxCorrectionRounds option, defaulting to 3 in runWorkflowServerSide. | workflow-rpc.ts:88 `readonly maxCorrectionRounds?: number \| undefined;` and :165 `const maxCorrectionRounds = opts.maxCorrectionRounds ?? 3;` confirm the option and the default of 3. | none — verified sound |
| c6 | semantic | LOW | manual | The correction loop swaps the fresh re-audit verdict into the audit step output (liveStepOutputs[auditStepId]) before re-finalizing, rather than reading the frozen verdict. | workflow-rpc.ts:166 selects auditStepId ('define'->'s4' else 's8') and :201 swaps the fresh verdict `liveStepOutputs = { ...liveStepOutputs, [auditStepId]: freshAudit }` before re-finalize — the fresh-verdict semantic holds. | none — verified sound |
| c7 | inventory | LOW | manual | boundaryHardFailure is minted at the scope-boundary mint sites in the orchestrator (define s4, define-extend, design.story s8), each now passing boundaryFindings(failed). | Exactly three mint sites at orchestrator.ts:627 (define s4), :718 (define-extend s4), :1243 (design.story s8), each passing boundaryFindings(failed). Inventory of three confirmed. | none — verified sound |
| c8 | semantic | LOW | manual | The re-audit uses RE_AUDIT_SCHEMA and returns results shaped {itemId, verdict, evidence} matching what finalize reads. | workflow-rpc.ts:518 `const RE_AUDIT_SCHEMA` and :564 `provider.completeStructured<ReAuditResult>` confirm the re-audit schema + typed return shape. | none — verified sound |
| c9 | semantic | LOW | manual | A boundary hard-fail is marked correctable only when findings are non-empty (an empty-findings boundary failure stays terminal). | orchestrator.ts:403 spreads `{ findings, correctable: true }` only when `findings !== undefined && findings.length > 0` — an empty-findings boundary failure stays terminal, exactly as claimed. | none — verified sound |
| c10 | citation | LOW | manual | The correctable-boundary taxonomy and the correction helpers are covered by tests in src/daemon/__tests__/workflow-rpc-correction.test.ts. | workflow-rpc-correction.test.ts:61 tests the CORRECTABLE-with-findings taxonomy and :127 tests reAuditBoundary against the corrected artifact — coverage confirmed. | none — verified sound |
