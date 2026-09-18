<!-- insrc:artifact LLD-1703991c69967193-s2 -->

# LLD: E202609181703991c:S002

**Epic:** `add-bugfix-triage-category-insrc-framework`
**HLD base run:** `wf-1789726188697-irhvw2`
**HLD effective hash:** `e08e0c0d9f7b...`

## HLD context

**Framework:** Bugfix becomes a first-class, scope-gated category that reuses the existing stage/artifact/approve/tracker machinery end-to-end. Triage gains a new `bugfix` SizeClass carrying a magnitude (a small fix vs an M/L fix) and a route that is NOT a single fixed startStage but branches on that magnitude. The flow's first stage is a new first-class `issue` workflow whose synthesized IssueArtifact — reproduction + root cause + fix intent — is the single source of truth serving both the internal chain record and, later, the GitHub issue body. A tiered parent-locator (deterministic ref-resolver → graph code-ownership → semantic match → user prompt → standalone) attaches the fix to the epic/story whose behaviour it corrects, recording which tier decided and at what confidence, with auto-attach only above a high threshold. A scope-gated orchestrator then routes a small fix issue→build and an M/L fix issue→design→plan→build, with the existing post-build code-review gating completion; where a tracker is configured a GitHub issue is created from the same issue content, linked to the located parent, and closed on completion. All five constraints k1–k6 are satisfied by conforming to the framework's own conventions rather than inventing a parallel mechanism.
**Rollout phase:** Phase B — issue record + parent attachment
**Owns:** `sc2` (IssueArtifact)
**Consumes:** `sc1` (BugfixTriageResult)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The classifier heuristics/prompt that recognise a user-declared defect fix as `bugfix` and size it into small vs sized magnitude — the sizing rubric, the analyze grounding it runs, and the pure route table branch — stay private to s1. No other story reaches into how the size decision is made; they consume only the resulting BugfixTriageResult/TriageRoute values. — owns `sc1`
- `s3`: The tiered resolver internals stay private to s3: the deterministic ref-resolver reuse, the graph code-ownership scoring over candidate stories, the semantic embedding match against epic/story artifacts, the per-tier high-confidence auto-attach thresholds, and the user-prompt interaction and its standalone fallback. Consumers see only the ParentLocation decision (tier + parentRef + confidence + evidence), not the scoring that produced it. — owns `sc3`
- `s4`: The scope-gated orchestration is private to s4: how the chain/orchestrator sequences the bugfix stages (small: issue→build; sized: issue→design→plan→build), how gates.ts enforces an approved+fresh IssueArtifact and a resolved ParentLocation before proceeding, and how the existing post-build code-review is wired as the completion gate. s4 introduces no new shared type — it composes sc1's route, sc2's approved issue, and sc3's parent into the run sequence and reuses the existing build + code-review stages verbatim.
- `s5`: The GitHub integration path is private to s5: rendering the issue body from the IssueArtifact content via the existing tracker create/link surface, linking the created issue to the ParentLocation (or leaving it standalone), closing it on completion, and the tracker-not-configured no-op branch. s5 reuses tracker/github.ts, refs.ts, link.ts, sync.ts, and setup.ts rather than adding any new external path (k5/k6) and defines no new shared type.

## Contract details

**Surface level:** internal-shared

### `renderIssueMarkdown`

```typescript
export function renderIssueMarkdown(artifact: IssueArtifact): string
```

**Parameters:**
- `artifact: IssueArtifact` — The synthesized issue record (meta + body + citations).

**Returns:** `string` — The GH-body-ready markdown: an artifact-id marker header (via artifactIdMarker(issueArtifactId(meta.issueHash))) then one section per BODY field only (## Reproduction / ## Root cause / ## Fix intent under a `# <title>` heading). Walks the body ONLY — magnitude/parentRef live on meta and are NOT rendered into the issue body (k4).

**Preconditions:**
- artifact.body passes isIssueBody; meta.issueHash is set.

**Postconditions:**
- Output contains no routing/linking metadata (magnitude, parentRef) — pure defect prose (k4).
- Mirrors renderSpecMarkdown's structure (id-marker header + one ## section per body field).

### `isIssueBody`

```typescript
export function isIssueBody(v: unknown): v is IssueArtifactBody
```

**Parameters:**
- `v: unknown` — Candidate body from a synthesize turn or a read-back JSON.

**Returns:** `v is IssueArtifactBody` — Runtime type guard: true iff v has non-empty string title/reproduction/rootCause/fixIntent (mirrors isSpecBody).

**Postconditions:**
- Rejects a body missing any of the four required prose fields.

### `issueArtifactId`

```typescript
export function issueArtifactId(issueHash: string): string
```

**Parameters:**
- `issueHash: string` — The issue work-item hash (mirrors specHash).

**Returns:** `string` — `ISSUE-${issueHash}` — the canonical artifact id used in the id-marker + the .json filename (mirrors specArtifactId).

**Postconditions:**
- Format matches the existing id-helper family (SPEC-/DEF-/HLD-...).

### `registerIssueRunners`

```typescript
export function registerIssueRunners(): void
```

**Returns:** `void` — Idempotent: registers the issue stage's StepRunners (issue.capture, checklist.verify) via registerRunner. Added to registerWorkflowRunners in index.ts, mirroring registerBrainstormRunners/registerDefineRunners.

**Postconditions:**
- After the call, executor.ts can look up the issue stage's runners by their ids; a second call is a no-op (the `registered` guard).

### `finalizeIssue`

```typescript
finalizeIssue(intent: WorkflowIntent, stepOutputs: Record<string, unknown>, runId: string, elapsedMs: number, llmResponse: unknown, model: string, attribution?: unknown): FinalizeResult
```

**Parameters:**
- `intent: WorkflowIntent` — The workflow intent (workflow:'issue', focus, repoPath, seed params incl. magnitude).
- `stepOutputs: Record<string, unknown>` — The issue.capture + checklist.verify step outputs.
- `llmResponse: unknown` — The synthesize turn's emitted { body, citations }.

**Returns:** `FinalizeResult` — Builds the IssueArtifact ({ workflow:'issue', ...meta incl. magnitude + issueHash, body, citations }), renders via renderIssueMarkdown, and writes md+json through storage — mirroring finalizeBrainstorm. The third `case 'issue'` arm of orchestrator.finalizeArtifact.

**Errors:**
- `schemaFailure` when the synthesize response is not an object / body fails isIssueBody — same failure path as finalizeBrainstorm.

**Preconditions:**
- issue.capture produced repro/root-cause/fix-intent; the bugfix magnitude is available on the intent/seed.

**Postconditions:**
- Exactly one IssueArtifact persisted under the docs/ work-item tree; meta.workflow==='issue' so insrc_review_step/insrc_workflow_approve gate it like every other stage.

## Data model changes

### `IssueArtifactBody` — new

New interface in src/workflow/artifacts/issue.ts holding ONLY the human-readable, GH-body-ready defect prose. Mirrors SpecArtifactBody.

```
export interface IssueArtifactBody {
  readonly title:        string;
  readonly reproduction: string;
  readonly rootCause:    string;
  readonly fixIntent:    string;
}
```

**Call sites:**
- `src/workflow/artifacts/issue.ts (new; mirrors src/workflow/artifacts/spec.ts SpecArtifactBody)`
- `consumed by s5 via sc2 (renders the GH issue body from these fields)`

### `IssueArtifact` — new

`export type IssueArtifact = WorkflowArtifact<IssueArtifactBody>` (shared generic base = { meta, body, citations }, types.ts:429). magnitude (from sc1) + parentRef (stamped by s3) ride on meta (like specHash/approvedAt), NOT the reviewed body. meta also carries issueHash.

```
export type IssueArtifact = WorkflowArtifact<IssueArtifactBody>;
// meta additionally carries: issueHash, magnitude, parentRef?|null, approvedAt?|null
```

**Call sites:**
- `src/workflow/artifacts/issue.ts (new)`
- `src/workflow/orchestrator.ts finalizeIssue (builds it)`
- `consumed by s4 (meta.magnitude) + s5 (meta.parentRef + body) via sc2`

### `ISSUE_SCHEMA_VERSION` — new

`export const ISSUE_SCHEMA_VERSION = 1` in artifacts/issue.ts, mirroring SPEC_SCHEMA_VERSION.

```
export const ISSUE_SCHEMA_VERSION = 1;
```

**Call sites:**
- `src/workflow/artifacts/issue.ts (new)`

### `ArtifactKind` — field-add

Add 'ISSUE' to the closed union in path-scheme.ts:45. ISSUE is item-root (like SPEC/DEF/HLD) — NOT added to STORY_SCOPED (line 67). allArtifactMdPaths (~173) must include ISSUE alongside SPEC/DEF/HLD.

```
-export type ArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'EXT';
+export type ArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'EXT' | 'ISSUE';
```

**Call sites:**
- `src/workflow/path-scheme.ts:45`
- `src/workflow/path-scheme.ts:67 (STORY_SCOPED — ISSUE NOT added)`
- `src/workflow/path-scheme.ts:~173 (allArtifactMdPaths)`

### `issueArtifactId + issue path helper` — new

Add issueArtifactId(issueHash)='ISSUE-${issueHash}' (mirrors specArtifactId, storage.ts:165) + a per-artifact path function returning { md, json } (mirrors the spec path helper ~319).

```
export function issueArtifactId(issueHash: string): string { return `ISSUE-${issueHash}`; }
```

**Call sites:**
- `src/workflow/storage.ts (new; mirrors specArtifactId:165 + spec path helper ~319)`

### `registerWorkflowRunners` — invariant-change

Add the registerIssueRunners import + call inside registerWorkflowRunners (index.ts:24). Additive — existing registrations unchanged.

```
 export function registerWorkflowRunners(): void {
   ... registerPlanRunners();
+  registerIssueRunners();
   registerTrackerRunners(); }
```

**Call sites:**
- `src/workflow/index.ts:24`

### `orchestrator per-workflow switches` — invariant-change

Add a `case 'issue'` arm to each of the three switches (buildDecomposerPrompt ~146 -> issueDecomposer; buildSynthesizerPrompt ~263 -> issueSynthesizer; finalizeArtifact ~375 -> finalizeIssue). The four existing arms are untouched.

```
+  case 'issue': return issueDecomposer(intent);
+  case 'issue': return issueSynthesizer(intent, stepOutputs);
+  case 'issue': return finalizeIssue(intent, stepOutputs, runId, elapsedMs, llmResponse, model, attribution);
```

**Call sites:**
- `src/workflow/orchestrator.ts:~146`
- `src/workflow/orchestrator.ts:~263`
- `src/workflow/orchestrator.ts:~375`

### `issue stage runners` — new

New src/workflow/runners/issue/index.ts (+ schemas.ts): issue.capture (assemble repro/root-cause/fix-intent, grounded via insrc_analyze_step, seeded from focus+magnitude) + checklist.verify (audit) StepRunners + registerIssueRunners. Mirrors runners/define/index.ts.

```
const issueCapture: StepRunner = { id:'issue.capture', workflow:'issue', run, finalize };
const checklistVerify: StepRunner = { id:'checklist.verify', workflow:'issue', run, finalize };
export function registerIssueRunners(): void { /* registerRunner(...) */ }
```

**Call sites:**
- `src/workflow/runners/issue/index.ts (new; mirrors runners/define/index.ts)`
- `src/workflow/executor.ts:87 registerRunner`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | implements | s2 owns sc2 (IssueArtifact). Realized as IssueArtifact = WorkflowArtifact<IssueArtifactBody> in a new artifacts/issue.ts mirroring spec.ts: defect prose (title/reproduction/rootCause/fixIntent) in the body; routing/linking fields (magnitude from sc1, parentRef stamped by s3, approvedAt, issueHash) on meta. renderIssueMarkdown emits the body verbatim as the single-source GH issue body (k4). The stage runs via a new registered `issue` runner + the three orchestrator arms, reusing storage/path-scheme/gates/synthesizer + insrc_review_step/insrc_workflow_approve (k1/k6). |
| `sc1` | consumes | The issue stage is seeded from the bugfix classification: the sc1 magnitude is carried onto the IssueArtifact meta (read later by s4's router). s2 does NOT re-run classification or routeForSizeClass — it consumes the already-decided magnitude as seed context. |

## Error paths

### Error cases

- **The issue.capture / synthesize turn emits a body missing (or empty) one of title/reproduction/rootCause/fixIntent.** (recoverable)
  - Detection: finalizeIssue runs isIssueBody(body) before building the artifact; it returns false when any of the four prose fields is absent or a non-empty-string check fails, and finalizeIssue returns a schemaFailure (the same guard-then-schemaFailure path finalizeBrainstorm uses via isSpecBody).
  - Response: The synthesize turn is rejected with a schemaFailure and re-emitted (the standard synthesize retry); no partial IssueArtifact is persisted.
  - User impact: The stage re-runs the synthesize turn; the user never gets a half-formed issue record. No silent write.
- **A synthesized citation array is malformed (not an array of {id,kind,ref}).** (recoverable)
  - Detection: isCitationArray(citations) (reused from the shared artifact-guard family) returns false in finalizeIssue.
  - Response: schemaFailure -> re-emit; the artifact is not written.
  - User impact: Transparent retry; the persisted issue always carries a well-formed citations block.
- **A future ArtifactKind member is added but a switch/consumer that enumerates kinds is not updated for 'ISSUE' (or vice-versa).** (recoverable)
  - Detection: Compile-time: ArtifactKind is a closed union; exhaustive consumers (STORY_SCOPED membership check, allArtifactMdPaths enumeration, artifact-kind parsing) that switch/map over it are type-checked, so an unhandled 'ISSUE' surfaces at tsc (mirrors S001's SizeClass exhaustiveness).
  - Response: The build fails at tsc rather than silently skipping ISSUE in a tree scan or mis-classifying it as story-scoped.
  - User impact: None at runtime — caught before ship; protects the docs/ tree round-trip.

### Edge cases

| Input | Expected |
| :--- | :--- |
| A bugfix issue with NO located parent yet (parentRef absent/null on meta) — the standalone case before s3 runs. | The IssueArtifact persists and reviews/approves normally; renderIssueMarkdown emits the same GH-ready body regardless of parentRef (parentRef is meta-only and never rendered into the body). null parentRef = standalone (k3's load-bearing fallback, filled by s3 later). |
| renderIssueMarkdown called on an IssueArtifact whose meta carries magnitude + parentRef. | The output contains ONLY the # title + ## Reproduction / ## Root cause / ## Fix intent sections (+ the id marker) — magnitude and parentRef never appear in the rendered body, so the bytes are the exact GitHub issue body s5 will post (k4). |
| An M/L (sized) bugfix issue is produced (magnitude='sized' on meta). | The issue stage produces the SAME IssueArtifact shape as a small bugfix; magnitude on meta is untouched by rendering. The sized-vs-small routing (issue->build vs issue->design->plan->build) is s4's concern, not the issue stage's — s2 only records the magnitude, it does not branch on it. |
| insrc_review_step / insrc_workflow_approve run over the ISSUE artifact. | Because meta.workflow==='issue', the review stage is keyed 'issue' and the approve stamps meta.approvedAt — identical to how brainstorm's 'brainstorm'-keyed SpecArtifact is reviewed/approved. No issue-specific gate code is added (k6). |

### Invariants to preserve

- The IssueArtifact BODY holds only the defect prose (title/reproduction/rootCause/fixIntent); routing/linking fields (magnitude, parentRef, approvedAt, issueHash) live on meta — exactly as the spec.ts analog keeps post-synthesis stamps (specHash/approvedAt) on meta and the body pure content. This is what makes renderIssueMarkdown's output the single-source GH issue body (k4) and lets s3 stamp parentRef without rewriting the reviewed body. [[c2]]
- A workflow stage adds NO per-stage persistence: the ISSUE artifact writes through the shared storage/path-scheme/gates/synthesizer, keyed by its canonical id via the id marker (identity never comes from the filename). The stage is authored purely as a runner + record family + the three orchestrator arms + one registration line. [[c1]]
- ArtifactKind is a CLOSED union; adding 'ISSUE' must keep the four existing item-root/story-scoped classifications byte-for-byte unchanged (SPEC/DEF/HLD stay item-root; LLD/PLAN/BUILD/CR/EXT stay story-scoped) and ISSUE joins the item-root singletons — the existing kinds' persistence paths must not shift. [[c3]]
- The review/approve gate keys off meta.workflow: an ISSUE artifact (meta.workflow==='issue') must be reviewable by insrc_review_step and approvable by insrc_workflow_approve with NO issue-specific gate code — the same path brainstorm's 'brainstorm'-keyed SpecArtifact uses (k1/k6). [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test) with node:assert — matches src/workflow/__tests__/spec-artifact.test.ts + spec-review-approve.test.ts`

### Test levels

- **unit** — Prove the IssueArtifact record family: the body-only guard, the GH-body-ready renderer, the id helper — mirroring spec-artifact.test.ts.
  - Subjects: `isIssueBody accepts { title, reproduction, rootCause, fixIntent } (all non-empty) and rejects a body missing/emptying any of the four fields`, `renderIssueMarkdown emits the id-marker header + `# <title>` + `## Reproduction`/`## Root cause`/`## Fix intent` sections in order`, `renderIssueMarkdown output contains NONE of magnitude/parentRef/issueHash (meta-only fields never leak into the GH body) — k4`, `issueArtifactId(hash) === `ISSUE-${hash}` and the id-marker round-trips (extractable back to the id)`, `ISSUE_SCHEMA_VERSION === 1`
  - Fixtures: `a minimal IssueArtifact fixture (meta with issueHash+magnitude+optional parentRef, body, citations)`
- **unit** — Prove the closed-union extension is additive: 'ISSUE' is item-root (not story-scoped) and the four existing kinds are unchanged.
  - Subjects: `ArtifactKind includes 'ISSUE'; STORY_SCOPED does NOT include 'ISSUE' (item-root like SPEC/DEF/HLD)`, `the existing kinds keep their classification: SPEC/DEF/HLD item-root, LLD/PLAN/BUILD/CR/EXT story-scoped (byte-for-byte unchanged)`, `an ISSUE artifact path resolves to an item-root `ISSUE.md` (+ its .json), and allArtifactMdPaths enumerates it alongside SPEC/DEF/HLD`
- **integration** — Prove the issue stage runs end-to-end: register -> decompose -> capture+verify -> synthesize -> one persisted IssueArtifact, reviewable/approvable like the other stages (mirrors spec-artifact.test.ts + spec-review-approve.test.ts).
  - Subjects: `registerIssueRunners registers issue.capture + checklist.verify (idempotent; second call no-ops) and executor can look them up`, `buildDecomposerPrompt('issue') / buildSynthesizerPrompt('issue') return the issue stage prompts (the three orchestrator `case 'issue'` arms are wired)`, `finalizeIssue turns a converged capture+synthesize output into exactly ONE persisted IssueArtifact (meta.workflow==='issue', magnitude carried from the seed) written md+json under the docs/ tree`, `finalizeIssue rejects a body failing isIssueBody / malformed citations with a schemaFailure (no partial write)`, `insrc_review_step over the ISSUE md keys stage='issue' and insrc_workflow_approve stamps meta.approvedAt — no issue-specific gate code (reuses the brainstorm/DEF path)`, `the four existing workflows' decomposer/synthesizer/finalize arms are unaffected by the new `case 'issue'``
  - Fixtures: `a temp repo dir + a WorkflowIntent{workflow:'issue', focus, magnitude}`, `a converged issue.capture step output + a synthesize { body, citations }`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `finalizeIssue turns a converged capture+synthesize output into exactly ONE persisted IssueArtifact (meta.workflow==='issue', magnitude carried) written md+json under the docs/ tree`, `isIssueBody requires title/reproduction/rootCause/fixIntent (the single record captures reproduction + root cause + fix intent)`, `renderIssueMarkdown output is the pure defect prose (k4 single-source) with an id marker mapping md->json`, `an ISSUE artifact path resolves to an item-root ISSUE.md (+ .json) and is enumerated by allArtifactMdPaths (persisted, cited artifact on the chain)` |
| `ac2` | `insrc_review_step over the ISSUE md keys stage='issue' and insrc_workflow_approve stamps meta.approvedAt — reviewed + explicitly approved before consumption, no issue-specific gate code (same manner as the other stage artifacts)`, `finalizeIssue rejects a body failing isIssueBody with a schemaFailure so only a well-formed issue reaches the approve gate` |

## Migration

**State before:** Per s1 structural-map + persistence-map: the workflow framework has seven stages (brainstorm/define/design.epic/design.story/plan/stub/tracker) each authored as a runners/<stage>/ step set + an artifacts/<stage>.ts record family, registered via registerWorkflowRunners (index.ts:24) and dispatched by the THREE per-workflow orchestrator switches (buildDecomposerPrompt ~146, buildSynthesizerPrompt ~263, finalizeArtifact ~375). There is NO 'issue' stage runner, NO artifacts/issue.ts, and NO 'issue' arm in any switch. path-scheme.ts's ArtifactKind (line 45) is the closed union SPEC/DEF/HLD/LLD/PLAN/BUILD/CR/EXT with SPEC/DEF/HLD item-root and LLD/PLAN/BUILD/CR/EXT story-scoped (STORY_SCOPED, line 67); there is no 'ISSUE' kind and no issueArtifactId. The 'issue' WorkflowName literal already exists (added in S001). The brainstorm SpecArtifact (artifacts/spec.ts) is the closest single-artifact analog.

**State after:** A new `issue` stage exists end-to-end: artifacts/issue.ts (IssueArtifactBody prose + IssueArtifact = WorkflowArtifact<IssueArtifactBody> + ISSUE_SCHEMA_VERSION + renderIssueMarkdown + isIssueBody); path-scheme.ts's ArtifactKind gains item-root 'ISSUE' (allArtifactMdPaths enumerates it); storage.ts gains issueArtifactId + an issue path helper; runners/issue/ (issue.capture + checklist.verify) + registerIssueRunners; index.ts calls registerIssueRunners; and the three orchestrator switches gain a `case 'issue'` arm. Running the `issue` workflow now produces exactly one persisted, cited, reviewable, approvable IssueArtifact under the docs/ tree, keyed on issueHash, magnitude carried on meta. All seven existing stages + the eight existing ArtifactKinds are byte-for-byte unchanged.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the artifacts/issue.ts record family (IssueArtifactBody, IssueArtifact, ISSUE_SCHEMA_VERSION, renderIssueMarkdown, isIssueBody) mirroring artifacts/spec.ts. Pure addition. — ↩ rollbackable _(needs: `bugfixCategory`)_
2. Add 'ISSUE' to ArtifactKind (item-root, NOT STORY_SCOPED) + include it in the item-root md-path enumeration; add issueArtifactId + the issue path helper to storage.ts. — ↩ rollbackable _(needs: `bugfixCategory`)_
3. Add runners/issue/ (index.ts + schemas.ts) with issue.capture + checklist.verify + registerIssueRunners. New module; registers nothing until called. — ↩ rollbackable _(needs: `bugfixCategory`)_
4. Wire the three orchestrator `case 'issue'` arms (issueDecomposer/issueSynthesizer/finalizeIssue) mirroring the brainstorm arms; existing arms untouched. — ↩ rollbackable _(needs: `bugfixCategory`)_
5. Add the registerIssueRunners() call + import to registerWorkflowRunners (index.ts) — the single line that makes the stage live. — ↩ rollbackable _(needs: `bugfixCategory`)_
6. Add the issue-stage tests (record-family round-trip, ArtifactKind additive-invariant, end-to-end register->run->persist->review->approve) mirroring spec-artifact.test.ts + spec-review-approve.test.ts; run `npx tsx --test 'src/workflow/**/*.test.ts'` to confirm green locally. — ↩ rollbackable

**Backward compat:** Every change is additive. registerWorkflowRunners gains one more registration call (existing seven unchanged, still idempotent). The three orchestrator switches gain a new `case 'issue'` arm only — the existing arms return byte-for-byte identical prompts/artifacts. ArtifactKind GROWS by one member; the eight existing kinds keep their exact item-root vs story-scoped classification and their md/json paths, so already-written SPEC/DEF/HLD/LLD/PLAN/BUILD/CR/EXT artifacts resolve unchanged. No existing public API signature changes; no persisted artifact is rewritten. The only non-additive files are the new tests.

## Alternatives considered

### a1: Mirror the SpecArtifact analog: body = GH-ready defect prose, magnitude/parentRef on meta, capture+verify runner — **CHOSEN**

A new artifacts/issue.ts (IssueArtifactBody = title/reproduction/rootCause/fixIntent) + a new 'ISSUE' ArtifactKind, a 2-step runner (issue.capture -> checklist.verify), and three `case 'issue'` orchestrator arms — mirroring the brainstorm SpecArtifact stage exactly.

artifacts/issue.ts defines IssueArtifactBody (defect prose ONLY), IssueArtifact = WorkflowArtifact<IssueArtifactBody>, ISSUE_SCHEMA_VERSION, renderIssueMarkdown (GH-body-ready), isIssueBody. magnitude (from sc1) + parentRef (stamped by s3) live on meta, NOT the reviewed body. ArtifactKind gains item-root 'ISSUE'; storage gains issueArtifactId. The runner has two steps (issue.capture -> checklist.verify) mirroring the define/design idiom; registerIssueRunners + three orchestrator arms wire it; review/approve reuse the meta.workflow='issue' path.

### a2: Single-step issue stage (mirror brainstorm's lone elicit step), no in-stage checklist

Same artifacts/issue.ts + ArtifactKind, but a ONE-step runner (issue.capture -> synthesize) mirroring brainstorm's single elicit step, relying solely on the post-stage insrc_review_step for audit.

Identical record family + persistence to a1, but the runner is a SINGLE issue.capture step (no in-stage checklist.verify), mirroring the brainstorm stage's lone elicit step; issueDecomposer emits a 1-step plan.

**Rejected because:** PARTIAL on ac2's 'same manner as the other stage artifacts' — it omits the in-stage checklist.verify self-audit the define/design/plan stages all carry, leaning entirely on the post-stage review. Sound but a weaker adherence match than a1.

### a3: Fold magnitude + parentRef into the IssueArtifactBody (literal HLD sketch shape)

Same stage + runner as a1, but IssueArtifactBody carries magnitude + parentRef as body fields (matching the HLD sketch's flat IssueArtifact literally).

Record family as a1 EXCEPT IssueArtifactBody = { title, reproduction, rootCause, fixIntent, magnitude, parentRef? }; renderIssueMarkdown must special-case magnitude/parentRef out of the GH body, and s3 stamps parentRef by rewriting the already-approved body.

**Rejected because:** PARTIAL on ac2 + sc2 + k4: folding the s3-stamped parentRef and the routing magnitude into the REVIEWED body forces s3 to rewrite an approved artifact and forces the renderer to special-case routing fields out of the single-source GH body — the exact hazards a1 avoids by putting magnitude/parentRef on meta.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map — src/workflow/index.ts, executor.ts:87, runners/define/index.ts, orchestrator.ts (three per-workflow switches ~146/263/375)` — "A workflow STAGE is authored across five seams, all keyed by WorkflowName: registerWorkflowRunners; runners/<stage>/ StepRunners via registerRunner; the three orchestrator switches; artifacts/<stage>."
- **[[c2]]** `analyze-bundle` `s1 closest-analog — src/workflow/artifacts/spec.ts, types.ts:429, orchestrator.ts finalizeBrainstorm` — "spec.ts is the analog: SpecArtifactBody + SpecArtifact = WorkflowArtifact<SpecArtifactBody> + SPEC_SCHEMA_VERSION + renderSpecMarkdown + isSpecBody; post-synthesis stamps (specHash/approvedAt) live on"
- **[[c3]]** `analyze-bundle` `s1 persistence-map — src/workflow/path-scheme.ts:45/67/173, storage.ts:165/259/319` — "ArtifactKind is the closed union SPEC/DEF/HLD/LLD/PLAN/BUILD/CR/EXT; SPEC/DEF/HLD item-root, LLD/PLAN/BUILD/CR/EXT story-scoped; identity comes from the id marker, never the filename; specArtifactId +"
- **[[c4]]** `analyze-bundle` `s1 boundary-scope — src/workflow/gates.ts, orchestrator.ts` — "The review/approve gate keys off meta.workflow (brainstorm's 'brainstorm'-keyed SpecArtifact); s2 consumes sc1 magnitude as seed, leaves parentRef to s3 (meta field), routing to s4, GH render to s5."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-09-18T12:40:20.011Z

_No load-bearing premises were extracted._
