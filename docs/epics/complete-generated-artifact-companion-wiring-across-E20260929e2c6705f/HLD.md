<!-- insrc:artifact HLD-e2c6705fd105d4ac -->

# HLD: complete-generated-artifact-companion-wiring-across

## Summary

This epic completes three pieces of already-built artifact-enrichment machinery by wiring each one at its own existing seam, with no new abstraction layer and no rework of the shipped data-model or UX companions. Design documents gain the UX mock they were built to prompt for, every completed build records its change-log and feedback to the ledger regardless of build path, and two new diagram companions (sequence + component-dependency) join the companion family under the same content-gated discipline.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-e2c6705fd105d4ac** § 1. Problem

## 2. Framework summary

Chosen framework: MIRROR THE ESTABLISHED SEAMS (a1). Every gap is a missing instance of a pattern the codebase already runs, closed at that pattern's own seam rather than behind a new registry or abstraction. S1 injects the already-defined UX content-gate rule into the three synthesize-prompt builders that already inject its ER twin, guarded by a source-scan test. S2 invokes the existing build-record writer + change-log collector at a NEW call site on the completion/approve path, relying on the writer's existing read-merge-write upsert for idempotency. S3 adds two new companion families (sequence, component-dependency) as parallel copies of the er/ux three-part contract (schema+gate / definition+toIr / renderer) plus a finalize call mirroring the ER one, consuming the graph-derived diagram source the existing docgen docTypes already produce. Every touch is additive, content-gated, and in-process; the existing er/ux companions and the validate-path record are untouched.

## 3. Architecture shape

Three independent wiring slices over the workflow artifact pipeline, each landing at a distinct, already-tested seam:

(1) COMPANION-GATE INJECTION (S1, and the pattern S3 re-instances). The synthesize-prompt builders at orchestrator.ts (HLD :1424, LLD :1801), design-story/index.ts:297, and design-epic/index.ts:268 already splice ER_CONTENT_GATE_RULE into the synthesizer's HARD RULES. S1 splices UX_CONTENT_GATE_RULE (ux-schema.ts) at the same sites; a source-scan guard asserts every prompt that admits the uxDefinition slot also carries the gate. No schema, renderer, or review-dimension change — those all shipped.

(2) COMPLETION-PATH PROVENANCE (S2). Today persistBuildRecord (standalone-record.ts:172) + collectBuildChangeLog (changed-files.ts:67) run ONLY in the build-step validate phase (validate.ts:99-103). S2 adds a second invocation on the completion/approve path so a controller-side build that never ran validate still writes its BUILD-<hash>-<story> record. Idempotency (k3) is the writer's existing merge-with-prior upsert: a validate-then-complete sequence merges onto one record; a derivation failure yields an empty change-log rather than aborting completion.

(3) DIAGRAM COMPANION FAMILIES (S3). Two new companion triples under artifacts/companion/ mirror the er/ux contract: a <x>-schema.ts (X_DEFINITION_PROPERTY_SCHEMA admitted into the synth body + X_CONTENT_GATE_RULE injected at the same three sites as S1), a <x>.ts (XDefinition + xDefinitionToIr → DocumentIR), and a render.ts renderXCompanion. A renderXCompanionForBody finalize call mirrors renderErCompanionForBody (orchestrator.ts:1503-1526), content-gating on the body carrying the definition. The diagram source is the existing graph-derived docgen call-sequence / component-dependency output — no new diagram engine.

S1 and S3 share the SAME synth-prompt injection sites and finalize seam as a CONVENTION (each injects its own gate + adds its own renderXCompanionForBody), not as a code dependency: neither imports the other, so the stories stay independent. S2 is orthogonal to both.

## 4. Diagrams

- [ER model](docs/epics/complete-generated-artifact-companion-wiring-across-E20260929e2c6705f/er-model.html)

## 5. Shared contracts

### 5.1 sc1: UX content-gate injection into the synthesize prompts

**Owner Story:** `s1`
**Consumed by:** `s1`

**Purpose:** Wire the already-defined-but-never-injected UX_CONTENT_GATE_RULE into every design-document synthesize-prompt builder that admits the uxDefinition slot, so the synthesizer is told WHEN to author a UX mock (parallel to the ER gate), guarded so it cannot silently drift out again.

**Interface sketch (type-level):**

```
// existing constant, already exported (src/workflow/artifacts/companion/ux-schema.ts)
export const UX_CONTENT_GATE_RULE: string;

// injected at the SAME builder sites that already carry ER_CONTENT_GATE_RULE:
//   src/workflow/orchestrator.ts (HLD synth ~:1424, LLD synth ~:1801)
//   src/workflow/runners/design-story/index.ts (~:297)
//   src/workflow/runners/design-epic/index.ts (~:268)
// No signature change to the builders; the rule string joins the HARD-RULES block.

// guard (type-level intent):
interface GateInjectionGuard {
  readonly promptBuildersAdmittingUxSlot: readonly string[]; // every builder that admits uxDefinition
  readonly eachCarriesRule: 'UX_CONTENT_GATE_RULE';           // asserted by a source-scan test
}
```

**Assumptions cited:** [[c1]]

### 5.2 sc2: Completion-path BUILD-record persistence

**Owner Story:** `s2`
**Consumed by:** `s2`

**Purpose:** Persist the BUILD ledger record (change-log + feedback) on the completion/approve path so controller-side builds that skip the validate phase still record provenance, idempotently and without failing completion when the changed set can't be derived.

**Interface sketch (type-level):**

```
// existing writer + collector, reused UNCHANGED (no signature change):
//   persistBuildRecord(repoPath: string, rec: BuildRecord): { md: string; json: string }   // standalone-record.ts:172, read-merge-write upsert
//   collectBuildChangeLog(repoPath: string, ctx: { author: string; timestamp: string; version?: string }): Promise<ChangeLog>  // changed-files.ts:67, swallows derivation failure to []

// NEW invocation shape on the completion/approve path (type-level intent only):
interface CompletionRecordHook {
  readonly trigger: 'build-approve' | 'completion-hook';
  readonly idempotent: true;   // via persistBuildRecord merge-with-prior upsert (k3)
  readonly emptyChangeLogSafe: true; // underivable changed set → [] rather than throwing (k1 ac3)
  readonly exactlyOneRecordPerStoryBuild: true;
}
```

**Assumptions cited:** [[c2]]

### 5.3 sc3: Sequence + component-dependency diagram companion families

**Owner Story:** `s3`
**Consumed by:** `s3`

**Purpose:** Add two new authored-definition companion families that extend the er/ux three-part contract so a design document can carry a sequence diagram and a component-dependency diagram under the same content-gate discipline, rendered from the existing graph-derived diagram source.

**Interface sketch (type-level):**

```
// NEW parallel triples under src/workflow/artifacts/companion/ (type-level intent, mirrors er/ux):

// sequence-schema.ts
export const SEQUENCE_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown>; // admitted into the synth body
export const SEQUENCE_CONTENT_GATE_RULE: string;                            // injected at the sc1 sites
// sequence.ts
interface SequenceDefinition { /* participants + ordered messages; graph-derived */ }
export function sequenceDefinitionToIr(def: SequenceDefinition): DocumentIR;
// render.ts
export function renderSequenceCompanion(def: SequenceDefinition, title: string, destPath: string, opts?: object): Promise<CompanionArtifactRef>;

// component-schema.ts / component.ts (same shape)
export const COMPONENT_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown>;
export const COMPONENT_CONTENT_GATE_RULE: string;
interface ComponentDependencyDefinition { /* nodes + directed dependency edges */ }
export function componentDependencyDefinitionToIr(def: ComponentDependencyDefinition): DocumentIR;
export function renderComponentCompanion(def: ComponentDependencyDefinition, title: string, destPath: string, opts?: object): Promise<CompanionArtifactRef>;

// finalize seam — mirror renderErCompanionForBody (orchestrator.ts:1503):
export function renderDiagramCompanionsForBody(
  body: { readonly sequenceDefinition?: SequenceDefinition | undefined; readonly componentDependencyDefinition?: ComponentDependencyDefinition | undefined },
  destPath: string,
  repoPath: string,
): Promise<readonly CompanionArtifactRef[]>; // content-gated: absent definition → no companion
```

**Assumptions cited:** [[c3]]

## 6. Story boundaries

### 6.1 Story E20260929e2c6705f:S001

**Owns:** `sc1`

S1 keeps private the exact join point and ordering of UX_CONTENT_GATE_RULE within each HARD-RULES block and the specific assertion mechanism of the source-scan guard test. It touches only the three synth-prompt builders and adds one test; it introduces no new companion type, schema, renderer, or review dimension (all already shipped) and does not alter the ER injection it mirrors.

### 6.2 Story E20260929e2c6705f:S002

**Owns:** `sc2`

S2 keeps private the precise completion/approve call site (build-approve handler vs. a completion hook), how it resolves the epicHash/storyId + repoPath at that point, and how it threads the author/timestamp context into collectBuildChangeLog. It reuses persistBuildRecord and collectBuildChangeLog unchanged and does not modify the validate-phase invocation.

### 6.3 Story E20260929e2c6705f:S003

**Owns:** `sc3`

S3 keeps private the internal shape of each new definition type (participant/message and node/edge structures), the DocumentIR mapping in each toIr, how each renderer assembles its offline HTML via the shared render spine, and which graph-derived docgen query feeds each diagram. It re-instances the sc1 injection convention for its two gates independently (no code dependency on S1) and adds its own finalize call without touching renderErCompanionForBody or the er/ux families.

## 7. Non-functional targets

- **Performance:** Companion rendering and build-record writes happen at finalize/completion, off the interactive path; no added latency to synthesize. Diagram companions reuse the existing offline docgen render, so no new network or engine cost (k5).
- **Security:** No new external surface: all work is in-process framework machinery over the local graph + filesystem. No cloud/REST path, no model-side steering change (k5).
- **Observability:** Each authored companion produces a CompanionArtifactRef linked from the document; each completed build produces a BUILD-<hash>-<story>.json/.md ledger entry with change-log + feedback, making build provenance auditable regardless of build path.
- **Durability:** Build-record persistence is idempotent via the existing read-merge-write upsert — exactly one record per story build even when validate and completion both run (k3); a companion or record write is additive and never mutates existing artifacts (k1).

## 8. Rollout

**Phase A — UX gate + build provenance (pure wiring)**

**Stories:** `s1`, `s2`

Both are pure re-wiring of already-shipped, independently-tested machinery with the smallest blast radius: S1 injects the existing UX gate at the three ER injection sites + a guard test; S2 adds the completion-path invocation of the existing build-record writer/collector. They share no code, touch disjoint seams (synth prompts vs. build/completion path), and each delivers immediate value, so they ship together first as the low-risk foundation.

**Backward compat:** S1: a document with no user-facing layout authors no uxDefinition → byte-identical output (k1/ac2); the ER injection it mirrors is untouched. S2: the validate-phase record path is unchanged and the completion-path write merges via the existing upsert so exactly one record persists (k3); an underivable changed set yields an empty change-log, never a completion failure.

**Phase B — sequence + component diagram companions (net-new)**

**Stories:** `s3`

S3 is the only net-new capability: two new companion families + a finalize call. It re-instances the same content-gate injection convention S1 uses (independently, no code dependency), so sequencing it after Phase A lets the UX gate wiring land and be reviewed first, giving S3 a proven, in-tree template (the now-live UX injection alongside the existing ER injection) to copy. It carries the largest surface, so it ships last.

**Backward compat:** A document that authors no sequence/component definition produces no diagram companion and is byte-identical to today (k1/ac3). The new families are additive parallel triples; renderErCompanionForBody and the er/ux families are not modified (Epic non-goal upheld).

**Ordering rationale:** All three Stories have dependsOn [] and each shared contract (sc1/sc2/sc3) is owned and consumed by its own Story, so there is no hard ordering edge. The phases are sequenced by RISK and by template-availability, not dependency: Phase A groups the two lowest-risk pure-wiring fixes (S1, S2) that reuse existing writers/renderers unchanged; Phase B follows with the net-new diagram companions (S3), which benefit from copying the UX gate injection that Phase A makes live. This also matches the merge-convenience of landing the confidence-1 fixes before the larger capability.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| S2 completion-path idempotency (k3) | If the completion-path write does not reuse the validate path's read-merge-write upsert keyed on the same BUILD-<epicHash>-<storyId> identity, a build that ran validate AND completion could produce two records or clobber the validate change-log. | Invoke persistBuildRecord unchanged (it already merges-with-prior on the same on-disk record); add a test asserting a validate-then-complete sequence yields exactly one record whose change-log is preserved. |
| S1/S3 gate injection drift (k4) | The whole epic exists because UX_CONTENT_GATE_RULE was defined but never injected; a new gate could silently fail to reach one of the three synth-prompt builders (HLD, LLD/design-story, design-epic) and go dark exactly as the UX gate did. | A source-scan guard test (mirroring the feedback-synth-schema guard) asserts every prompt builder that admits the definition slot also carries its content-gate rule; run it for the ux gate (S1) and each new diagram gate (S3). |
| S3 diagram-source binding | Sequence + component-dependency diagrams currently exist only as insrc_docgen docTypes that need a symbol / path input; binding them as an authored companion must consume the graph-derived source offline without a new engine or network path (k5), and an author-supplied definition that references a missing symbol/path could throw at finalize. | Reuse the existing docgen render spine (as er/ux do), content-gate on the body carrying the definition, and swallow a render failure to a no-companion outcome (mirroring the ux renderer's absent-safe behaviour) so finalize never aborts. |

## 9. Alternatives considered

### 9.1 a1: Mirror the established er/ux companion + provenance patterns at their existing seams — **CHOSEN**

Extend each shipped pattern in place — inject the dead gate, add the completion-path record call, add two more companion triples — with no new abstraction layer.

Treat every gap as a missing instance of a pattern the codebase already runs, and close it at that pattern's own seam. S1 imports UX_CONTENT_GATE_RULE and injects it into the three synth-prompt builders that already inject ER_CONTENT_GATE_RULE (orchestrator.ts:1424/:1801, design-story/index.ts:297, design-epic/index.ts:268), plus a source-scan guard test that asserts every prompt admitting the uxDefinition slot also carries the gate. S3 adds two new companion families as literal copies of the er/ux three-part contract — a sequence-schema.ts + sequence.ts + renderSequenceCompanion, a component-schema.ts + component.ts + renderComponentCompanion — wired through a renderXCompanionForBody call mirroring renderErCompanionForBody at orchestrator.ts:1503, and consuming the graph-derived diagram source the insrc_docgen call-sequence/component-dependency docTypes already produce.

S2 invokes the existing persistBuildRecord + collectBuildChangeLog at a new call site on the completion/approve path (insrc_workflow_approve of a BUILD), relying on persistBuildRecord's existing read-merge-write upsert for idempotency (k3): if the validate step already wrote the record, the completion-path write merges onto it rather than duplicating. No shared framework is introduced; each seam is touched independently following its own local idiom, exactly as the two prior epics established.

**Pros:**
- Lowest risk: every touch point is a proven, tested seam (er/ux at render.ts + orchestrator.ts:1503; persistBuildRecord upsert at standalone-record.ts:172) — no new abstraction to validate.
- Backward-compat (k1) falls out for free: content-gated authoring means an absent definition writes no companion, byte-identical to today, exactly as er/ux already behave.
- Idempotency (k3) reuses persistBuildRecord's existing merge-with-prior upsert rather than inventing dedup logic.
- Each story is independently shippable and testable against an existing mirror test (er-companion-finalize.test.ts, build-record.test.ts, the ER guard test).

**Cons:**
- S1 and S3 both re-plumb the same synth-prompt injection + finalize-render seam independently, so the gate-injection wiring is duplicated three-plus times per companion type rather than centralized.
- Two near-identical new companion families (sequence, component) copy the er/ux triple, carrying some structural duplication the codebase already tolerates but does not factor out.
- No guard against a FUTURE fourth companion type dropping its gate again beyond the per-type source-scan test.

**Cost estimate:** M

### 9.2 a2: Introduce a companion registry + a single gate-injection/finalize driver, then register er/ux/sequence/component

Refactor the companion families behind one registry that centralizes gate injection and finalize rendering, then add the two diagram types as registry entries.

Factor the repeated per-companion wiring into a single registry: each companion type (er, ux, sequence, component) registers its property schema, its content-gate rule, its toIr, and its renderer. One driver then injects every registered gate into the synth prompts and, at finalize, iterates the registry to render whichever definitions the body carries. S1 becomes 'register the ux gate that was never registered'; S3 becomes 'register two more entries'; the three hand-wired ER injection sites collapse to one registry-driven loop.

S2 is handled the same way as a1 (completion-path invocation of the existing writer), since it is orthogonal to the companion registry. This approach trades more up-front refactoring for a single choke point where a gate can never again be silently omitted — the registry, not each prompt builder, is the source of truth for which companions exist.

**Pros:**
- A single choke point makes k4 structural rather than test-enforced: a registered companion cannot lose its gate because injection iterates the registry.
- Adding the 3rd/4th/Nth companion type becomes one registration, eliminating the per-type synth-prompt edits.
- Removes the existing three-site ER injection duplication as a side effect.

**Cons:**
- Reworks the existing er/ux wiring, directly violating the Epic non-goal 'do NOT rework the existing er/ux companion behaviour' and risking regressions in shipped, working code.
- Larger blast radius: the registry refactor touches orchestrator.ts finalize + all synth-prompt builders at once, so backward-compat (k1) must be re-proven across er/ux, not just the new types.
- Turns a bounded wiring epic into an architecture change, inflating cost and review surface with no user-visible benefit beyond a1.

**Cost estimate:** L

**Rejected because:** Best k4 story (a single registry-driven injection loop makes gate-omission structurally impossible), but it reworks the existing er/ux wiring — directly against the Epic non-goal 'do NOT rework the existing er/ux companion behaviour' — dropping k1 to partial and inflating cost to L for no user-visible benefit over a1. A defensible future refactor, not this bounded wiring epic.

### 9.3 a3: Wire the two proven gaps (S1+S2) now; defer diagram companions (S3) to a separate epic

Ship the pure-wiring fixes (dead UX gate + completion-path build record) as this epic and split the net-new diagram-companion capability into its own later epic.

Scope this epic down to the two gaps that are pure re-wiring of already-shipped machinery: S1 (inject the dead UX gate) and S2 (persist the build record on the completion path). Both are small, low-risk, and reuse existing writers/renderers with no new types. S3 — which genuinely adds two new companion families, a new definition schema, renderer, and a diagram source binding — is carved out into a follow-on epic where the net-new capability gets its own design budget.

This keeps the current epic tightly about 'complete the wiring that was dropped' and separates it from 'add new capability', matching the LESSON that an epic is ideally one coherent release. The two shipped fixes deliver immediate value (UX artifacts start firing, build provenance stops being silently empty) without waiting on the larger diagram work.

**Pros:**
- Fastest path to the two highest-confidence, lowest-risk fixes — both are wiring-only and independently valuable.
- Keeps the epic thematically pure (complete dropped wiring) vs. mixing in a net-new capability with a larger design surface.
- S3's diagram-source binding (which graph query feeds each diagram, how it renders offline) gets proper design attention in its own epic rather than being rushed.

**Cons:**
- Directly contradicts the user's explicit 'bundle all the findings into one fix' instruction — splits the bundle the user asked to keep together.
- Leaves the diagram-companion gap open indefinitely; the net-new value the user surfaced is deferred, not delivered.
- Two epics carry two review/approval cycles instead of one, more process overhead for closely-related work.

**Cost estimate:** S

**Rejected because:** Lowest per-story risk, but it splits the bundle the user explicitly asked to keep together ('bundle all the findings into one fix') and leaves k2's diagram dimension only partially realized (diagram companions deferred). Scope-correct only if the user reverses that instruction — they have not.

## 10. References

- **[[c1]]** `analyze-bundle` `s1 wiring-gap A — UX_CONTENT_GATE_RULE (ux-schema.ts:39) has zero source usages; ER_CONTENT_GATE_RULE injected at orchestrator.ts:1424/:1801, design-story/index.ts:297, design-epic/index.ts:268; UX_DEFINITION_PROPERTY_SCHEMA admitted at orchestrator.ts:1467/:1863; the 'ux' review dimension (code-review/dimensions/ux/index.ts) keys on body.uxDefinition.`
- **[[c2]]** `analyze-bundle` `s1 wiring-gap B — persistBuildRecord (standalone-record.ts:172, read-merge-write upsert) + collectBuildChangeLog (changed-files.ts:67, git_diff, failure→[]) invoked only from mcp/build-step/phases/validate.ts:99-103; FeedbackRecord in artifacts/provenance/types.ts.`
- **[[c3]]** `analyze-bundle` `s1 companion-contract — the er/ux three-part contract (x-schema.ts gate/schema, x.ts XDefinition+xDefinitionToIr, render.ts renderXCompanion) and the finalize seam renderErCompanionForBody (orchestrator.ts:1503-1526, sole caller of renderErCompanion render.ts:61-86); er-companion-finalize.test.ts is the finalize integration test; sequence/component diagrams exist as insrc_docgen docTypes.`
- **[[c4]]** `prior-artifact` `The shipped artifact-docs-readability epic (companion subsystem er/ux + review dimensions, bbbbf7a) and the provenance/feedback epic (BUILD change-log + feedback, fcca379) — this epic completes their wiring.`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.epic (design.epic)

**0 HIGH · 0 MED · 6 LOW** · model `client` · reviewed 2026-09-29T15:46:05.542Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc1/c1 | inventory | LOW | auto | ER_CONTENT_GATE_RULE is injected into the synth-prompt builders at orchestrator.ts (HLD + LLD), design-story/index.ts, and design-epic/index.ts — the three sites S1 mirrors for the UX gate. | grep confirms ER_CONTENT_GATE_RULE injected at orchestrator.ts:1424 + :1801, design-epic/index.ts:268, design-story/index.ts:297 (defined er-schema.ts:71, imported at three sites). The three mirror-sites S1 targets are accurate. | Confirmed — no change. |
| sc1/c1 | citation | LOW | auto | UX_CONTENT_GATE_RULE is defined/exported in src/workflow/artifacts/companion/ux-schema.ts and has no injection usage in the synth-prompt builders (dead gate). | READ confirms ux-schema.ts:39 = `export const UX_CONTENT_GATE_RULE =`; the only src/ occurrence is that definition, so the dead-gate premise holds. | Confirmed — no change. |
| sc3/c3 | citation | LOW | auto | renderErCompanionForBody is the finalize seam in orchestrator.ts (around line 1503) that S3's renderXCompanionForBody mirrors, and it is the caller of renderErCompanion (render.ts around line 61). | READ confirms orchestrator.ts:1503 = `async function renderErCompanionForBody(`; it is the sole caller of renderErCompanion (render.ts) and is invoked at the HLD finalize (:1669) and two LLD finalize sites (:2012, :2160) — the seam S3's renderXCompanionForBody mirrors is accurate. | Confirmed — no change. |
| sc3/c3 | citation | LOW | auto | The er/ux companion three-part contract exists: erDefinitionToIr in er.ts and uxDefinitionToIr in ux.ts (the toIr converters S3's new families mirror). | grep confirms erDefinitionToIr at er.ts:214 and uxDefinitionToIr at ux.ts:215, both consumed by render.ts (:67, :112). The er/ux three-part contract S3 mirrors exists as cited. | Confirmed — no change. |
| sc2/c2 | inventory | LOW | auto | persistBuildRecord (standalone-record.ts) + collectBuildChangeLog (changed-files.ts) are invoked from the build-step validate phase (validate.ts) as the sole production call site S2 adds a second invocation next to. | grep confirms the only production call sites are validate.ts:102 (persistBuildRecord) and validate.ts:101 (collectBuildChangeLog); standalone-record.ts:195 is the module's own internal delegate, all other hits are tests. The 'sole validate-phase invocation' premise S2 extends holds. | Confirmed — the S2 completion-path invocation target is accurate. |
| sc3/c3 | inventory | LOW | auto | No sequence or component-dependency companion definition exists yet — S3 is genuinely net-new relative to the existing er/ux companion families. | grep `SequenceDefinition\|ComponentDependencyDefinition\|renderSequenceCompanion\|renderComponentCompanion` returned 8 matches, all in docs (this HLD/DEF), zero in src/. No such companion exists yet — S3 is genuinely net-new. | Confirmed — no change. |
