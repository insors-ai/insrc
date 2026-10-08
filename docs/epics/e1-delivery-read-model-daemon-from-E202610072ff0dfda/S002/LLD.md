<!-- insrc:artifact LLD-2ff0dfdadb1c8d1c-s2 -->

# LLD: E202610082ff0dfda:S002

## Summary

**Epic:** `e1-delivery-read-model-daemon-from`
**HLD base run:** `wf-1791360301609-41fijn`
**HLD effective hash:** `215b5fd4f60f...`

This Story adds the stage pass to the delivery read model. For every story and issue it works out the route the item was triaged onto, from the fields its records carry, and then places it in one of six stages with one ordered rule list. The route alone decides which approval makes the item ready: an approved plan for the full chain, feature and sized-bugfix routes, an approved design for the small route, and an approved issue for a small bugfix. Every stage carries a reason naming the records behind it; an item whose route cannot be read keeps the stage its records establish and gets an unknown-route notice.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-2ff0dfdadb1c8d1c** § 2. Framework summary

**Rollout phase:** Phase B — stage, gate and currency passes
**Owns:** `sc4` (StageAnnotation)
**Consumes:** `sc1` (ArtifactRecordSet), `sc2` (WorkItemGraph), `sc3` (DeliveryNotice)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to s1: how the store directory is listed and each file parsed; how a record's kind, work-item hash and raw story id are lifted from its file name and meta; the use of the canonical ordinal rule to join s1/S1/S001 and the decision of when two records are ambiguous rather than the same; sourcing story membership from the Define's story list and from accepted extension records; attaching fix stories to an issue through the shared work-item hash and resolving meta.parentRef; nesting tasks by plan and build task ids; and the sort order of records, failures and child lists. No other story reads the files or re-derives identity. Also private: the per-kind lift, including reading flat amendment records; the anchor-date rule for minting canonical ids after grouping by hash and ordinal, which must reproduce deriveWorkItemIdentity and the existing path-scheme folder for every work item those can identify; attaching each SPEC to the item that names it in meta.seededFromSpec; resolving a slug-only parentRef through records' meta.epicSlug. Its LLD maps each of s1 ac1-ac6 to a named test, including ac3 (an ambiguity notice naming the other record), ac4 (two fix stories under one issue) and ac6 (colliding short task ids in two stories). Task items are minted only from t<n> build and plan task ids; a build task id equal to the story's id is left for s3 as a story-level result, with a fixture of that shape. Slug resolution of an issue's parentRef excludes records sharing the issue's own hash; a parentRef that names only the issue itself yields no corrected parent and no notice. Fixtures cover both real shapes: a self-slug parentRef (for example ISSUE-0855311b6b32eb72) and an outward slug (for example ISSUE-2d9e9e694a94116b). — owns `sc1`, `sc2`, `sc3`
- `s3`: Private to s3: reading each artifact's recorded review per kind (meta.review for design artifacts; body.verdict, body.counts and meta.reviewedBy for code-review records) and its recorded override; deciding when a block is still blocking, by reusing effectiveReviewVerdict over meta.review and meta.reviewResolutions and then requiring the artifact to be unapproved with no meta.reviewOverride; reading build task results from body.tasks[].passed and matching them to planned tasks; detecting the approved-with-failed-tasks conflict; and the attention rule itself, including the confirmed policy that a pending artifact stops counting once a downstream gate on the same work item is approved. It never changes a stage. Its LLD maps each of s3 ac1-ac7 to a named test, including ac7 against the confirmed attention policy. A build task recorded under the story's own id is the story-level result, never an unplanned task. A failed story-level result on an approved build raises the validation conflict and the validation-failed reason exactly as a failed task does; s3's LLD tests this with the shape of BUILD-0855311b6b32eb72-S001. — owns `sc5`
- `s4`: Private to s4: deciding review currency only from recorded fields (for example the framework's existing story-design staleness against its high-level design) and reporting unknown otherwise, never from file modification time; comparing accepted extension records with their epic framing; and detecting expected-but-missing fields, such as an artifact with no title. It never decides route-dependent gaps, which need s2's route. It reports through notices and never adds or removes work items. Also private: deriving each epic's amendments, and any story design's staleness against its high-level design, from the AMD, HLD and LLD records already in sc1, reusing only pure helpers such as computeHldEffectiveHash and never the amendments module's disk-reading listers, so the pass adds no second read and one malformed amendment cannot fail the snapshot. Staleness hashes the epic's approved amendments in rising approvedAt order, the order the existing scanner uses, which is separate from sc6's presentation sort by amendmentId. Its LLD maps each of s4 ac1-ac5 to a named test, including ac5 asserting that no file in the store changes. Its ac4 test covers the missing-field half (an artifact with no title); the build-without-plan half is tested in s5. — owns `sc6`
- `s5`: Private to s5: running the load, graph and three annotation passes in order for one request; joining annotations onto items; deciding needsAttention as any sc5 attention reason or any notice with attention true; computing counts over the full item set; the deterministic sort of items and notices; choosing openWith from whether an artifact's markdown carries its marker; the two daemon handler-map entries and their repo resolution and error mapping; the artifact-id validation that keeps evidence reads inside the artifact store; and the 1,000-artifact performance fixture. Also private: the error-path mapping (absent store is an empty snapshot; unreadable store, invalid or unknown evidence id is { error }). Also private: the determinism test (two snapshots over the same fixture are identical) and the regression check that the existing workflow.pending and workflow.artifactContent tests pass unchanged. Its LLD maps each of s5 ac1-ac6 to a named test: ac1 asserts the store is byte-identical after a request, ac3 reads a marker-less BUILD through workflow.deliveryEvidence, and ac6 is a type-level check that the VS Code plugin compiles against the published types plus a fixture the JetBrains mirror parses. Also private: the one route-dependent completeness check, raising an 'incomplete-evidence' notice for a story whose sc4 route requires a plan (full-chain, feature, sized-bugfix) but which has a build and no plan; small and small-bugfix routes never get it. Its LLD also owns the test for the build-without-plan half of s4 ac4: a full-chain story with a build and no plan gets the incomplete-evidence notice, and small and small-bugfix stories with a build and no plan do not. — owns `sc7`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `StagePassResult (deriveStages)`

```typescript
export function deriveStages(graph: WorkItemGraph, recordSet: ArtifactRecordSet): StagePassResult
```

**Parameters:**
- `graph: WorkItemGraph` — The s1 graph; its story and issue items are annotated, using their evidenceArtifactIds, parentId, childIds, workItemHash and standalone.
- `recordSet: ArtifactRecordSet` — The s1 record set; records are looked up by artifactId and approval is read only from ArtifactRecord.approval.state.

**Returns:** `StagePassResult` — stages: one StageAnnotation per story and issue item, keyed by item id (epics and tasks have none). notices: the pass's unknown-route and review-without-build notices, sorted with sortNotices.

**Preconditions:**
- graph was built from recordSet.

**Postconditions:**
- Never throws: a missing record, an unexpected field type or an unknown value yields route 'unknown' or the stage the remaining records establish.
- Pure and deterministic: no I/O, and the same inputs give the same map and notice order.
- Reads no gate (sc5) or currency (sc6) annotation and never changes the graph.

### 2.2 `DeliveryRoute (route resolution)`

```typescript
type DeliveryRoute = 'full-chain' | 'feature' | 'small' | 'small-bugfix' | 'sized-bugfix' | 'trivial' | 'unknown'
```

**Returns:** `DeliveryRoute` — First match wins. Issue item: its ISSUE's meta.magnitude, 'small' to small-bugfix, 'sized' to sized-bugfix. Story: (1) when an ISSUE record has the story's workItemHash, that ISSUE's magnitude as above (ahead of any BUILD stamp); (2) else its LLD's meta.sizeClass; (3) else the meta.sizeClass of its BUILD records whose meta.standalone is true, when they all agree; (4) else, when the story is not standalone and its parent is an epic, 'full-chain'. sizeClass maps 'feature', 'small' and 'trivial' to the route of the same name. A missing field, a value that is not a SizeClass member (such as 'M'), 'epic', 'bugfix' with no ISSUE for the hash, or disagreeing standalone BUILD stamps give 'unknown'. A non-standalone BUILD's sizeClass is never read.

**Postconditions:**
- A route is never guessed: anything not covered by the rules above is 'unknown'.

### 2.3 `DeliveryStage (stage rules)`

```typescript
type DeliveryStage = 'scoped' | 'design-plan' | 'ready-design-approved' | 'ready-plan-approved' | 'build-recorded' | 'complete'
```

**Returns:** `DeliveryStage` — For a story, the first rule that matches its evidence: (1) complete, when any BUILD is approved; (2) build-recorded, when any BUILD exists (pending or rejected), whatever its task results; (3) the route's ready gate: full-chain, feature and sized-bugfix give ready-plan-approved when a PLAN is approved; small gives ready-design-approved when its LLD is approved; small-bugfix gives ready-design-approved when the ISSUE for its hash is approved; trivial and unknown have no ready gate; (4) design-plan, when an LLD or PLAN exists in any state, or the route is sized-bugfix and its ISSUE is approved; (5) scoped. CR records are in no rule. For an issue with fix-story children, the least advanced child's stage in the order scoped < design-plan < ready-design-approved < ready-plan-approved < build-recorded < complete; for an issue with none, the same rules over its own ISSUE (so a small-bugfix issue with an approved ISSUE is ready-design-approved, a sized one design-plan, a pending one scoped).

**Postconditions:**
- Every story and issue gets exactly one of the six stages.

### 2.4 `StageAnnotation (reason)`

```typescript
interface StageAnnotation { readonly itemId: string; readonly stage: DeliveryStage; readonly route: DeliveryRoute; readonly reason: { readonly text: string; readonly artifactIds: readonly string[] } }
```

**Returns:** `StageAnnotation` — reason.artifactIds are the records the matching rule used, sorted (for an issue placed by a child, that child's reason ids); reason.text names them and the rule, e.g. 'PLAN-<id> approved; the full-chain route is ready once its plan is approved', 'LLD-<id> approved; the small route needs no plan', 'ISSUE-<id> approved; the small-bugfix route needs no design or plan', 'BUILD-<id> recorded and not approved', 'BUILD-<id> approved', 'no design, plan or build record'. An unknown route adds 'route unknown, so no ready gate applies'.

**Postconditions:**
- A ready stage's text never mentions running activity or a missing plan.

### 2.5 `DeliveryNotice (stage-pass notices)`

```typescript
makeNotice('unknown-route' | 'review-without-build', message, { itemIds, artifactIds })
```

**Returns:** `DeliveryNotice` — unknown-route: one per story or issue whose route is unknown, naming the item and the records whose route fields were read. review-without-build: one per story with a CR record and no BUILD record, naming the item and the CR records. Both have attention false (from NOTICE_ATTENTION).

**Postconditions:**
- The CR never changes the stage.

## 3. Data model changes

### 3.1 `DeliveryStage, DeliveryRoute, StageAnnotation, StagePassResult` — new

The sc4 types, added to src/workflow/delivery/types.ts beside sc1-sc3 so s5 imports every contract type from one module, exactly as sketched in the HLD.

**Call sites:**
- `src/workflow/delivery/types.ts`

### 3.2 `deriveStages` — new

New module src/workflow/delivery/stage.ts. It imports graph.ts and notice.ts (its dependencies: WorkItemGraph, makeNotice, sortNotices); it has no caller yet. Its only caller will be s5's snapshot pass.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Defines the sc4 types and produces StagePassResult. |
| `sc1` | consumes | Looks records up by artifactId; reads meta.magnitude, meta.sizeClass, meta.standalone and approval.state only. |
| `sc2` | consumes | Annotates story and issue items using evidenceArtifactIds, parentId, childIds, workItemHash and standalone; adds no items. |
| `sc3` | consumes | Raises unknown-route and review-without-build through makeNotice and sorts with sortNotices. |

## 5. Error paths

**Error cases**

- **An item's evidenceArtifactIds names an id with no record in the record set.** (recoverable)
  - Detection: The artifactId lookup in the record-set index returns undefined.
  - Response: The id is skipped for every rule; the stage comes from the records that are present.
  - User impact: None beyond what s1 already reports for that record; the stage pass does not throw.
- **A route field has an unexpected type (meta.sizeClass is a number, meta.magnitude an object, meta.standalone a string).** (recoverable)
  - Detection: A typeof check against the expected string or boolean before mapping.
  - Response: The field is treated as absent, so the rule falls through and the route is 'unknown' when nothing else matches.
  - User impact: The item shows its records' stage with an unknown-route notice instead of a wrong route.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A full-chain story with an approved PLAN and no BUILD. | ready-plan-approved; reason names the PLAN and no running activity. |
| A small story (LLD sizeClass small) with an approved LLD and no PLAN. | ready-design-approved; no notice about a missing plan. |
| A small-bugfix issue with an approved ISSUE and no fix story yet. | The issue is ready-design-approved. |
| A sized-bugfix fix story with an approved LLD and no PLAN. | design-plan: the sized-bugfix route's gate is the approved PLAN. |
| A full-chain story with an approved LLD and no PLAN. | design-plan, not ready. |
| A story with a pending or rejected BUILD whose tasks all passed. | build-recorded. |
| A story with an approved BUILD whose tasks failed and whose CR is block. | complete; task results and review verdicts are not read here (s3 reports the conflict). |
| A story with a CR and no BUILD. | Stage unchanged by the CR; one review-without-build notice naming the CR. |
| A standalone story whose LLD has no sizeClass and whose BUILD has none. | route 'unknown', stage from its records, one unknown-route notice. |
| A non-standalone BUILD stamped sizeClass 'M' on an epic story. | The stamp is not read; the story is full-chain. |
| A fix story under a small issue whose BUILD is stamped 'trivial'. | Route small-bugfix: the ISSUE magnitude wins over the BUILD stamp. |
| A standalone LLD stamped 'bugfix' whose hash has no ISSUE record. | Route 'unknown' with a notice. |
| Two standalone BUILDs on one story stamped 'small' and 'trivial'. | Route 'unknown' with a notice naming both. |
| A trivial story with only an approved BUILD. | complete, route trivial. |
| An issue with fix stories S001 complete and S002 design-plan. | The issue is design-plan, reason from S002. |
| A Define story with no records under a non-standalone epic. | scoped, route full-chain, no notice. |
| An ISSUE with no magnitude. | The issue and its fix stories have route 'unknown' and a notice each. |

## 6. Test strategy

**Test framework:** `node:test via `npx tsx --test` (node:assert/strict), over fabricated records from src/workflow/delivery/__tests__/fixtures.ts`

**Test levels**

- **unit** — Stage rules per route, one test per acceptance criterion.
  - Subjects: `stage.test.ts: 'a full-chain story with an approved plan and no build is ready-plan-approved, naming the plan'`, `stage.test.ts: 'a small story with an approved design and a small-bugfix issue with an approved issue are ready-design-approved with no plan notice'`, `stage.test.ts: 'a story with an unapproved build whose tasks all passed is build-recorded'`, `stage.test.ts: 'a story with an approved build is complete whatever its task results and review verdict'`, `stage.test.ts: 'a code review with no build leaves the stage and raises review-without-build'`, `stage.test.ts: 'an item with no recorded route keeps its records' stage and raises unknown-route'`, `stage.test.ts: 'a story or issue with no design, plan or build is scoped'`
  - Fixtures: `defRecord, lldRecord, planRecord, buildRecord, crRecord and issueRecord builders with approvedAt / sizeClass / magnitude / standalone set per case.`
- **unit** — Route resolution precedence and the remaining edge cases.
  - Subjects: `stage.test.ts: 'the issue magnitude decides a fix story's route ahead of its build stamp'`, `stage.test.ts: 'a non-standalone build stamp is never read and an epic story is full-chain'`, `stage.test.ts: 'a sized-bugfix or full-chain story with an approved design and no plan is design-plan'`, `stage.test.ts: 'an unknown or disagreeing stamp gives the unknown route, never a guess'`, `stage.test.ts: 'an issue takes the least advanced stage of its fix stories'`, `stage.test.ts: 'missing evidence records and wrongly typed fields never throw'`, `stage.test.ts: 'every story and issue in the real-shape fixtures gets exactly one stage, deterministically'`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `stage.test.ts: 'a full-chain story with an approved plan and no build is ready-plan-approved, naming the plan'` |
| `ac2` | `stage.test.ts: 'a small story with an approved design and a small-bugfix issue with an approved issue are ready-design-approved with no plan notice'` |
| `ac3` | `stage.test.ts: 'a story with an unapproved build whose tasks all passed is build-recorded'` |
| `ac4` | `stage.test.ts: 'a story with an approved build is complete whatever its task results and review verdict'` |
| `ac5` | `stage.test.ts: 'a code review with no build leaves the stage and raises review-without-build'` |
| `ac6` | `stage.test.ts: 'an item with no recorded route keeps its records' stage and raises unknown-route'`, `stage.test.ts: 'an unknown or disagreeing stamp gives the unknown route, never a guess'` |
| `ac7` | `stage.test.ts: 'a story or issue with no design, plan or build is scoped'` |

## 7. Alternatives considered

### 7.1 a1: Route first, then one ordered stage rule list — **CHOSEN**

Resolve each item's route from its recorded fields, then pick the stage with one first-match-wins rule list whose ready rule is read from a per-route gate table.

A new src/workflow/delivery/stage.ts exports deriveStages(graph, recordSet): StagePassResult, with the sc4 types beside the other contract types in types.ts. For every story and issue it (1) resolves the route by the HLD precedence (ISSUE magnitude for the issue and its fix stories; else the LLD sizeClass; else a standalone BUILD's sizeClass; else full-chain for a story under a non-standalone epic; anything else unknown), (2) looks up the route's ready gate in a fixed table (full-chain, feature, sized-bugfix: approved PLAN gives Ready · plan approved; small: approved LLD gives Ready · design approved; small-bugfix: approved ISSUE gives Ready · design approved; trivial and unknown: no ready gate), and (3) applies one ordered rule list: approved BUILD gives Complete, any BUILD gives Build recorded, the route's ready gate, any design record gives Design & plan, else Scoped. Each rule names the artifacts it matched, which become the reason. An issue's stage is the least advanced of its fix stories, or its own ISSUE when it has none. Notices: unknown-route for an unknown route, review-without-build for a CR with no BUILD.

### 7.2 a2: Per-route state machines

Model each route as its own small state machine over its expected records and walk it per item.

Define one transition table per route (full-chain DEF to HLD to LLD to PLAN to BUILD; small LLD to BUILD; small-bugfix ISSUE to BUILD; and so on) and advance an item through its route's states as each expected record is found approved.

**Rejected because:** Correct for well-ordered records but brittle on out-of-order evidence, and heavier.

### 7.3 a3: Records-first stage, route only as a label

Pick the stage from which records exist and are approved, and attach the route afterwards as information.

Derive the stage purely from record presence: approved BUILD, BUILD, approved PLAN, approved LLD, any design record, nothing. Then compute the route separately and attach it.

**Rejected because:** Breaks FR2 and ac2.

## 8. References

- **[[c1]]** `code` `src/workflow/delivery/types.ts` — "export interface WorkItemNode {"
- **[[c2]]** `code` `src/workflow/delivery/notice.ts` — "export function makeNotice(code: NoticeCode, message: string, refs: NoticeRefs): DeliveryNotice {"
- **[[c3]]** `code` `src/workflow/delivery/graph.ts` — "export function buildWorkItemGraph(recordSet: ArtifactRecordSet): WorkItemGraph {"
- **[[c4]]** `code` `src/workflow/triage/types.ts` — "export type SizeClass = 'epic' | 'feature' | 'small' | 'trivial' | 'bugfix';"
- **[[c5]]** `analyze-bundle` `design.story/s1 data-model.trace: route fields recorded in the live store (.insrc/artifacts)`
- **[[c6]]** `prior-artifact` `HLD-2ff0dfdadb1c8d1c sc4 StageAnnotation and the s2 story boundary`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-08T10:27:28.372Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
