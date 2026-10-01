<!-- insrc:artifact LLD-bfe98ff7f97178cf-s3 -->

# LLD: E20261001bfe98ff7:S003

## Summary

**Epic:** `build-vs-code-plugin-ui-integration`
**HLD base run:** `wf-1790840477406-bic923`
**HLD effective hash:** `44085ff6e95f...`

A document whose design was judged clearer shown than described carries a structured record of that design — an entity model, a call sequence, a component topology — and a reference to the big generated picture sitting beside it on disk. This Story draws that picture inside the review pane, from the record rather than from the 3.3 MB generated file, as a small SVG built element by element so that not one character of markup is injected. It publishes the frame both visual Stories share: a slot with exactly three states — drawn, absent, or referenced-but-unshowable — where absent means no slot at all rather than an empty one. The grounding changed the Story's shape: most diagram references in the ledger are sequence diagrams whose source record the pane never receives, so this LLD carries one small additive widening of the daemon projection — adopted in narrowed form, projecting the call-sequence record and deferring the component-topology record that no producer emits yet.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-bfe98ff7f97178cf** § 2. Framework summary

**Rollout phase:** Phase B — functional record and design diagram (independent, parallelisable)
**Owns:** `sc4` (Companion visual slot)
**Consumes:** `sc1` (ArtifactReviewView structured projection), `sc2` (Review-surface render discipline), `sc3` (Section anchor model), `sc4` (Companion visual slot)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The pane shell and its existing behaviour stay private to s1: the pending-list rendering and row click handling, the monotonic refreshSeq guard that drops superseded responses, the stale-artifact-id checks on open and decide, the approve / request-changes control wiring and the COMMENTABLE_KINDS gate, the fail-closed rule that suppresses approve when a content load failed, and the panel lifecycle (create, reveal, dispose, in-memory-only pending map). The exact wording of the ac3 degradation notice and the visual styling of headings, lists and emphasis are s1's alone. s1 must leave the approval path byte-identical in behaviour (ac5), so none of this is exposed as a contract. — owns `sc1`, `sc2`, `sc3`
- `s2`: Everything about how a functional requirement looks is private to s2: the per-requirement item layout, the visual separation from surrounding prose, the placement of the identifier relative to the statement, and the decision to render nothing at all when functionalDefinition is absent. s2 owns no contract because no other Story displays the functional record — s3 and s4 render visuals, not requirements. s2's one hard obligation comes from sc2: identifiers are written via textContent straight off the FunctionalRequirement record, never re-derived from rendered prose, which is what makes k5's character-for-character guarantee hold across upstream and downstream documents.
- `s4`: The Adaptive Cards subset renderer is private to s4: which card element types are supported, how an unsupported element degrades, and the mock's internal layout and theming within its slot. Also private is the dual-presence arrangement — how a diagram slot and an experience slot sit together when a document carries both — which s4 decides because it is the only Story that can observe both at once; it does so using the labels sc4 already derives from each ref, so the structural-versus-experience distinction ac2 requires needs no new contract.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `CompanionVisualKind`

```typescript
export type CompanionVisualKind = 'diagram' | 'experience'
```

**Returns:** `type` — Which visual a slot holds, DERIVED from the ref's CompanionKind rather than guessed: 'diagram-mermaid' and 'diagram-html' both map to 'diagram', 'ux-mock' maps to 'experience'. The mapping is total over the closed union, so a new CompanionKind member would be a compile error here rather than an unlabelled slot.

**Errors:**
- `none` when A type.

**Postconditions:**
- s4 reads the label from this mapping rather than deciding its own, which is how S004's ac2 (telling a mock apart from a diagram) is met without a second contract.

### 2.2 `CompanionSlotState`

```typescript
export type CompanionSlotState =
  | { readonly state: 'rendered';   readonly kind: CompanionVisualKind; readonly label: string; readonly body: unknown; readonly linkOut?: CompanionLinkOut | undefined }
  | { readonly state: 'unshowable'; readonly kind: CompanionVisualKind; readonly label: string; readonly reason: string; readonly linkOut?: CompanionLinkOut | undefined }
  | { readonly state: 'absent' }
```

**Returns:** `type` — Exactly three states. 'absent' carries NO other field by construction — there is nothing to label, nothing to link, nothing to size — which is how k3's never-reserve-space rule is enforced by the type rather than by discipline.

**Errors:**
- `none` when A type.

**Postconditions:**
- `body` is typed `unknown` rather than HTMLElement for the same reason sc2's StructuredRenderer is: this code lives in an exported SOURCE STRING with no TypeScript boundary of its own and is tested against DOM stubs that are deliberately not HTMLElements.
- WIDENED from the HLD sketch, additively: `linkOut` is optional on BOTH non-absent states, not only on 'rendered'. A reviewer whose diagram could not be drawn is exactly the reviewer who most needs the link to the authentic generated file — withholding it in the failure state would be the wrong way round.

### 2.3 `CompanionSlotFactory`

```typescript
export interface CompanionSlotFactory<TRecord> {
  readonly kind: CompanionVisualKind;
  build(record: TRecord | undefined, ref: CompanionArtifactRef | undefined, anchorSlug: string | undefined): CompanionSlotState;
}
```

**Parameters:**
- `record: TRecord | undefined` — The structured source of truth, projected verbatim and unvalidated by sc1. Its presence — not the ref's — decides whether anything can be DRAWN.
- `ref: CompanionArtifactRef | undefined` — The companion reference. Supplies the visual kind, the label, the link-out and the `ofSectionId` anchor. It decides whether a FAILURE must be declared, since a ref is the only evidence that a visual was supposed to exist.
- `anchorSlug: string | undefined` — The slug sc3's resolver produced for the ref's ofSectionId, or undefined when it names no present section — in which case the slot takes its default placement rather than being dropped.

**Returns:** `CompanionSlotState` — One of the three states, decided by the FOUR-COMBINATION TABLE below.

**Errors:**
- `none-thrown` when A factory never throws. A malformed record, a dangling class range, or a renderer failure all resolve to 'unshowable' with a reason. Throwing would take the document down over an adjunct, which inverts k4.

**Preconditions:**
- A `document` global with createElement/createElementNS is available (the webview, or the test's DOM stub).

**Postconditions:**
- THE FOUR-COMBINATION GATE, stated explicitly because ac2 gates on the REF while the HLD sketch gated on the RECORD, and the two disagree in both directions:
  ref absent + record absent  -> 'absent'      (ac2: no slot, no frame, no fetch, zero DOM work)
  ref present + record present -> 'rendered'   (ac1)
  ref present + record absent  -> 'unshowable' (ac3, lc1 — and the majority case today)
  ref absent  + record present -> 'rendered'   (see below)
The last row is the judgement call. The HLD's framework is render-from-the-record-never-from-the-companion-file, so making the REF the content gate would contradict it: a document carrying an entity model whose companion generation simply did not run has the design, and hiding it would serve nobody. Nothing is fabricated and no space is reserved — the content genuinely exists. It is raised as an openQuestion because it reads against ac2's literal wording.
- 'absent' is returned BEFORE any element is created, so ac2's 'no attempt is made to obtain a diagram' is provable as the absence of DOM activity rather than the absence of a visible frame.
- The label and kind come from the ref when there is one; when a record is rendered with no ref, the kind is the factory's own and the label is derived from the record, never invented per-call.

### 2.4 `CompanionLinkOut`

```typescript
export interface CompanionLinkOut { readonly relPath: string; readonly title: string }
```

**Returns:** `interface` — The offer to open the authentic generated companion file. The pane NEVER reads or embeds relPath's content — it only surfaces the path — which is what keeps 3.3 MB of foreign scripted HTML and the path-traversal surface both outside this Story (k1, k4, k6).

**Errors:**
- `none` when An interface.

**Postconditions:**
- Present on both 'rendered' and 'unshowable' whenever a ref exists, absent otherwise.

### 2.5 `DOCS_DIAGRAM_SOURCE`

```typescript
export const DOCS_DIAGRAM_SOURCE: string
```

**Returns:** `string` — The webview-side diagram renderer and slot factory, carried as SOURCE so the shell inlines it into its single nonce'd script AND the tests `new Function`-evaluate it against a DOM stub. The FOURTH member of the family DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE and DOCS_FR_SOURCE.

**Errors:**
- `none` when A string constant.

**Preconditions:**
- Concatenated into the one nonce'd script after its three siblings.

**Postconditions:**
- Contains no innerHTML, outerHTML, insertAdjacentHTML or document.write, so the surface's pinned injection-site count stays at exactly one.
- Every SVG element is created with `document.createElementNS('http://www.w3.org/2000/svg', …)` and every label set via textContent — the two facts that make ac4's 'no raw markup injected' structural rather than a promise.
- ES5-compatible style, matching its three siblings, because it runs as a plain script in the webview and under `new Function` in node:test.
- Adds the `fr`-style prefix discipline with its own namespace (`dg`), since a fifth source string arrives with S004 and all of them share one scope.

### 2.6 `renderErDiagram`

```typescript
StructuredRenderer<ErDefinition> = (record) => { readonly el: unknown; readonly degradation?: { degraded: boolean; notice?: string } | undefined }
```

**Parameters:**
- `record: ErDefinition` — `{ id?, classes: Record<string, ErClass> }`, projected verbatim and unvalidated — validateErDefinition runs daemon-side at assembly, not on the read path.

**Returns:** `{ el: unknown; degradation? }` — An SVG element drawing one box per class and one arrow per class-ranged slot. `degradation` is left ABSENT — a record that cannot be drawn is the factory's 'unshowable', not a degraded render.

**Errors:**
- `none-thrown` when Never throws. A dangling class range — which `erDefinitionToIr` treats as an ErDefinitionError daemon-side — is here a reason to omit that one edge and continue, because the client's job is to show the reviewer what it can, not to enforce referential integrity the producer already checked.

**Preconditions:**
- `record.classes` is a non-empty object; the factory applies the absent-safe gate before calling.

**Postconditions:**
- The node/edge split follows `erDefinitionToIr`'s rules EXACTLY: a slot whose `range` names a defined class becomes an edge; any other slot folds into the box's attribute list as `slotName: range`. This is a deliberate DUPLICATION of daemon rules — unavoidable, since a webview cannot import the daemon module — so the test strategy pins both against the same fixtures rather than pretending one implementation exists.
- Layout is DETERMINISTIC: classes in sorted order, a fixed placement rule, no randomness and no measurement-dependent reflow, so the same record always draws the same picture and a visual check is reproducible.
- Every label is written with textContent; no value is interpolated into markup and no attribute is built from record text.

### 2.7 `openDoc`

```typescript
async function openDoc(artifactId: string): Promise<void>
```

**Parameters:**
- `artifactId: string` — Unchanged from s1/s2.

**Returns:** `Promise<void>` — Unchanged.

**Errors:**
- `none-added` when Reading optional fields off a resolved value cannot throw; the existing try/catch is untouched.

**Preconditions:**
- `deps.client.content` resolves a DocsContent whose records are sc1's verbatim projection.

**Postconditions:**
- Forwards `erDefinition`, `companions` and — per the ADOPTED sc1 amendment — `sequenceDefinition` onto the EXISTING docs-content message by conditional spread, exactly as s2 forwarded functionalDefinition. Absence stays an ABSENT KEY.
- No new message type, no new IPC method, no second round trip (k2).
- The fail-closed arm stays unchanged and carries NO records, so a reviewer who could not read the body is never shown a diagram drawn from it.

### 2.8 `renderContent`

```typescript
function renderContent(m: { markdown?: string; sections?: SectionIndex; degradation?: RenderDegradation; functionalDefinition?: FunctionalDefinition; erDefinition?: ErDefinition; companions?: readonly CompanionArtifactRef[]; openQuestions?: readonly string[]; blocked?: boolean; commentable?: boolean; artifactId?: string }): void
```

**Parameters:**
- `m: the docs-content payload` — Extended with the records this Story reads.

**Returns:** `void` — Renders the whole surface for one opened document.

**Errors:**
- `none-added` when The slot build is wrapped in the same backstop pattern s2 established for placement.

**Preconditions:**
- Runs after renderMarkdownBody and stampSlugs, for the same reason s2's placement does: the stamper pairs headings to anchors through a pointer that only advances, so a mutated tree would mis-pair.

**Postconditions:**
- Builds the slot via the factory, then mounts it: beside the heading whose slug the ref's ofSectionId resolved to, or at the defined default position otherwise. 0 of 8 refs in the ledger carry ofSectionId, so the default is the live path and the anchored path is implemented but unexercised by real data.
- 'absent' mounts nothing at all — the slot host stays empty, with no heading, border or reserved space.
- The body, the chooser, the notice, the open questions and the approval controls are untouched; a slot failure costs the reviewer none of them.

### 2.9 `createSectionResolver`

```typescript
createSectionResolver(index: SectionIndex): SectionResolver
```

**Parameters:**
- `index: SectionIndex` — The index posted on the same message, derived by sc3's deriveSectionIndex from THIS document's markdown.

**Returns:** `SectionResolver` — Maps an ofSectionId to a slug in this document, or undefined when it names no present section.

**Errors:**
- `none-thrown` when Returns undefined for an unknown id rather than throwing — shipped behaviour, consumed unchanged.

**Preconditions:**
- docs-sections.ts is consumed as shipped and comes out of this Story BYTE-IDENTICAL, as s2 already asserts by test against the pre-S002 commit.

**Postconditions:**
- This Story mints no section identity of its own. A stale ofSectionId degrades the slot to its default placement rather than dropping the visual.

## 3. Data model changes

### 3.1 `HostToWebview (the `docs-content` variant)` — field-add

Two optional fields appended to the same variant s1 and s2 extended — `erDefinition` and `companions` — each typed by INDEXING off `DocsContent[...]` so protocol → client → daemon stay one declaration deep and cannot drift. Populated by conditional spread so absence is an ABSENT KEY. Per the ADOPTED sc1 amendment, `sequenceDefinition` joins them on the same terms. `componentDependencyDefinition` is DEFERRED: a ledger recount found 0 bodies carrying one, so it is added when a producer first emits one — a purely additive field either way.

```
// vscode-plugin/src/chat/protocol.ts — docs-content variant, existing fields unchanged
      readonly functionalDefinition?: DocsContent['functionalDefinition'];
+     readonly erDefinition?:         DocsContent['erDefinition'];
+     readonly companions?:           DocsContent['companions'];
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts — the docs-content variant s2 last extended`
- `vscode-plugin/src/chat/docs-review-panel.ts — openDoc's post, the only producer`
- `vscode-plugin/src/chat/docs-review-panel.ts — renderContent, the only consumer`
- `vscode-plugin/src/chat/docs-review-client.ts:35-37 — DocsContent, already carrying both fields indexed off ArtifactReviewView`

### 3.2 `ErDefinition / ErClass / ErSlot` — invariant-change

No type changes and no producer changes — the Epic's generation-side non-goal rules that out. What changes is what the READ side may assume. `validateErDefinition` (er.ts:102-160) ajv-validates against the LinkML metamodel at ASSEMBLY time inside the daemon, and `erDefinitionToIr` (:273-324) throws ErDefinitionError on a dangling class range — neither runs on the read path, and sc1 projects the body verbatim. So a malformed `classes`, a non-object ErClass, a slot whose `range` names nothing, and a class graph with cycles all ARRIVE at the renderer. The client's posture differs deliberately from the daemon's: the daemon REJECTS a dangling range because it is generating an artifact; the client OMITS that one edge and draws the rest, because its job is to show the reviewer what it can.

**Call sites:**
- `src/workflow/artifacts/companion/er.ts:34-44 (ErSlot), :46-48 (ErClass), :51-54 (ErDefinition)`
- `src/workflow/artifacts/companion/er.ts:102-160 (validateErDefinition — assembly-time only)`
- `src/workflow/artifacts/companion/er.ts:273-324 (erDefinitionToIr — the derivation rules this Story re-implements client-side)`
- `src/workflow/artifact-content.ts — structuredRecords, the verbatim unvalidated projection`

### 3.3 `CompanionArtifactRef / CompanionKind` — invariant-change

Consumed unchanged, with two facts the design must encode rather than assume. (1) `CompanionKind` is a CLOSED three-member union but THREE daemon renderers emit `diagram-mermaid` — ER (render.ts:104), sequence (:205) and component (:243) — so the kind does NOT identify which record draws it. The factory must therefore dispatch on the RECORD present, not on the ref's kind. (2) `diagram-html` is declared and NEVER produced (zero emit sites), so lc1's routing of it to 'unshowable' costs nothing and closes the union with no silent fall-through.

**Call sites:**
- `src/workflow/artifacts/companion/types.ts:24 (CompanionKind), :31-38 (CompanionArtifactRef)`
- `src/workflow/artifacts/companion/render.ts:104, :205, :243 (the three diagram-mermaid emit sites)`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | This Story OWNS and publishes sc4, and ships its first implementation so s4 inherits a frame that has been exercised rather than only specified. Published as the HLD sketches it, with two additive widenings recorded here rather than made silently. FIRST: `body` is typed `unknown` rather than HTMLElement, for the same reason sc2's StructuredRenderer already is — the code lives in a source string with no TypeScript boundary and is tested against DOM stubs that are deliberately not HTMLElements. SECOND: `linkOut` is optional on BOTH non-absent states rather than only on 'rendered', because a reviewer whose diagram could not be drawn is precisely the reviewer who most needs the authentic file; withholding it in the failure state would be backwards. The 'absent' state carries no other field by construction, which is how k3's never-reserve-space rule becomes a type guarantee instead of a convention. The four-combination gate is stated in full on CompanionSlotFactory because ac2 gates on the ref and the HLD sketch gated on the record, and they disagree in both directions. What is explicitly NOT published: the diagram's own layout, sizing, theming and SVG primitives remain s3-private, so s4 reuses the frame without inheriting one diagram-specific decision. |
| `sc1` | consumes | Consumed as shipped for `erDefinition` and `companions`: read off the DocsContent the existing workflow.artifactContent call already returns, forwarded by reference with no reshaping, defaulting or validation, on the EXISTING docs-content message. No new IPC method, no second read surface, no extra round trip, and no read of any file beyond the artifact JSON — k2 and k7 both hold. AN AMENDMENT IS PROPOSED, not assumed: the grounding found that 5 diagram refs exist against 2 erDefinitions and 3 sequenceDefinitions, so most diagram companions today are sequence diagrams whose source record sc1 does not project — including this Epic's own LLD-s2, which carries a 'Sequence diagram' companion and a sequenceDefinition in the same body. ac1 is therefore not satisfiable for the majority of real documents without widening the projection. The amendment is the smallest shape sc1 admits (ONE optional field — `sequenceDefinition` — absent stays absent, nothing existing changes meaning) and was raised as a typed proposal precisely because sc1 is owned by s1 and this must not be a silent build. ADOPTED at the approval gate in its NARROWED form: `componentDependencyDefinition` was DEFERRED because a ledger recount found 0 bodies carrying one, so projecting it would buy a derivation, fixtures and a visual check for a record no producer has ever emitted. Had the amendment been declined, this Story would fall back to entity models only with every client-side decision above unchanged. |
| `sc2` | consumes | The renderer is the SECOND implementation of sc2's published `StructuredRenderer<T>`, after s2's. Its hard rule is honoured in a new medium: SVG is built with `createElementNS` and every label set via textContent, so the surface's single markup-injection site — the body's one `el.innerHTML=marked.parse` — stays single and the pinned injection count stays at one. No relaxation of sc2 is requested, which matters because s1 owns it and because alternative a3 was eliminated precisely for colliding with it. The webview code is carried as a fourth exported source string inlined into the same single nonce'd script, so the strict CSP is not widened by one character, and behaviour is proved by `new Function` evaluation rather than by grepping the shell. One consequence this Story must own: S002's pinned shell baseline (sha256 + char + byte counts) moves, and must be updated in the same commit that moves it. |
| `sc3` | consumes | `createSectionResolver` is consumed exactly as shipped to turn a ref's `ofSectionId` into a slug in THIS document; this Story mints no section identity and docs-sections.ts comes out byte-identical, which s2 already asserts by test against the pre-S002 commit. One honest limitation on the record: 0 of 8 companion refs in the entire ledger populate `ofSectionId`, so ac1's 'positioned with the part of the document that references it' has nothing to position by on any document that exists today. Every slot takes the default placement. The anchored path is implemented and tested because the field is part of the contract and a producer may start setting it, but it is exercised by no real data — and populating it would be a generation-side change, which the Epic's non-goals exclude. |

## 5. Error paths

**Error cases**

- **The record arrives structurally malformed — `classes` is not an object, is null, or is an array; or an ErClass is not an object; or `attributes` is not an object. All reachable: validateErDefinition ajv-validates at ASSEMBLY inside the daemon and sc1 projects the body verbatim, so whatever the body holds arrives here.** (recoverable)
  - Detection: A typeof/Array.isArray shape check in the factory's absent-safe gate, BEFORE any element is created — the same ordering S002 used, so a malformed record costs zero DOM activity rather than a half-built picture.
  - Response: If a ref exists, return 'unshowable' with a reason saying the design record could not be read. If no ref exists either, return 'absent' — a record that is not a record is indistinguishable from no record, and the surface's rule for no record is no slot.
  - User impact: The reviewer is told a diagram was referenced and could not be drawn, with the link to the authentic file still offered, OR sees nothing at all. Never a broken picture and never a blank frame.
- **A slot's `range` names neither a defined class nor a known LinkML scalar — a dangling relationship reference. The daemon treats this as fatal: erDefinitionToIr throws ErDefinitionError.** (recoverable)
  - Detection: While deriving edges, the target name is looked up in the set of defined class names; a miss that is also not a known scalar is the dangling case.
  - Response: OMIT THAT ONE EDGE and draw everything else — deliberately diverging from the daemon. The daemon rejects because it is GENERATING an artifact and referential integrity is its job; the client's job is to show the reviewer what it can. A dangling range costs one arrow, not the whole picture.
  - User impact: The reviewer sees the entity model with one relationship missing rather than a failure message instead of a diagram. The divergence is documented at the source so it does not read as a bug.
- **A `diagram-mermaid` ref exists but no record the client can draw from — a sequence or component diagram whose source record sc1 does not project. THE MAJORITY CASE today: 5 diagram refs against 2 erDefinitions.** (recoverable)
  - Detection: The factory dispatches on the RECORD present, never on the ref's kind, precisely because CompanionKind cannot distinguish the three diagram renderers. No renderable record plus a ref is the unshowable branch.
  - Response: 'unshowable', with a reason that NAMES what was referenced and says its source record is not available to this surface — not a generic failure. The link-out to the authentic generated file is offered.
  - User impact: The reviewer learns that a diagram exists, that this pane cannot draw it, and exactly where to open it. That is the whole point of ac3: a silent omission is indistinguishable from a document that legitimately has no diagram. Under the ADOPTED amendment this branch stops firing for sequence diagrams, and survives for component diagrams (0 in the ledger today) and for genuinely absent records.
- **A `diagram-html` ref — declared in the closed CompanionKind union and produced by nothing (zero emit sites).** (recoverable)
  - Detection: The kind maps to CompanionVisualKind 'diagram' but matches no record-dispatch branch.
  - Response: 'unshowable' with a reason naming the kind, per lc1.
  - User impact: A companion kind can never render as nothing. Today this costs the reviewer nothing because no producer emits it; the value is that a future producer turning it on cannot silently fall through.
- **The renderer throws mid-construction — an unexpected record shape, a DOM method the host does not provide.** (recoverable)
  - Detection: Two layers, as S002 established: the slot is built COMPLETELY before anything is mounted, so a construction throw happens while the surface is untouched; and renderContent wraps the slot build in a backstop catch.
  - Response: The catch converts the throw into 'unshowable' with a reason, rather than letting it escape. Nothing has been mounted, so nothing needs unwinding.
  - User impact: The body, the chooser, the notice, the open questions and the approve / request-changes controls all still render. A failure in an adjunct never costs the reviewer the authoritative content — k4 holds under failure, not just in the happy path.
- **The ref's `ofSectionId` names a section this document does not have — a stale reference, or a heading renamed since the companion was generated.** (recoverable)
  - Detection: sc3's `createSectionResolver` returns `undefined` for an unknown id; this Story reads that result and does not re-derive identity.
  - Response: Mount the slot at its DEFAULT position rather than dropping it. A visual that cannot be anchored is still a visual the reviewer should see.
  - User impact: Indistinguishable from the ordinary case today, because 0 of 8 refs in the ledger carry ofSectionId at all — the default placement is the live path and the anchored path is implemented but unexercised by real data.
- **The content fetch failed, so the host took the fail-closed arm and posted blocked:true with a placeholder body.** (recoverable)
  - Detection: No detection is needed, and that is the design: the failure arm posts no records and no companions, so the factory's absent gate stops at its first test.
  - Response: 'absent'. No slot, no link-out, no diagram.
  - User impact: A reviewer who never saw the body is never shown a diagram drawn from it, and approve is already suppressed. Showing an authoritative-looking picture beside an 'unavailable' body would make an unreadable document look reviewable — the most dangerous thing this Story could do.
- **A class graph containing a cycle, or a self-referencing slot (a class whose slot ranges over its own class).** (recoverable)
  - Detection: Not an error condition to detect — it is valid input. Named here because a naive layout that walks edges to place nodes would not terminate.
  - Response: The layout must be driven by the CLASS LIST in sorted order, not by edge traversal, so cycles and self-references are structurally incapable of causing non-termination. A self-edge draws as a loop on its own box or is labelled on the box; it is never dropped.
  - User impact: A self-referencing or cyclic model — a tree, a graph of parents and children — draws correctly. These are ordinary data models, not pathological input.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A document with NO companions and NO erDefinition — the overwhelming majority of the ledger. | 'absent'. Zero createElement calls, no slot host content, no heading, no border, no reserved space, and no attempt to obtain anything. The rendered surface is byte-identical to what S002 ships. This is ac2 and it is the dominant path, so it is tested as the main case rather than as an edge. |
| A document carrying `erDefinition` but NO companion ref — companion generation did not run, or the artifact predates it. | RENDERED, with no link-out. This is the judgement call flagged as an openQuestion: ac2's wording gates on the ref, while the HLD's framework is render-from-the-record-never-from-the-companion-file. Making the ref the content gate would contradict the framework and hide a design the document genuinely carries. Nothing is fabricated and no space is reserved — the content exists. |
| A document carrying a companion ref AND an erDefinition — the intended case. | RENDERED, with the link-out to the authentic generated file, anchored to the ref's section if ofSectionId resolves and at the default position otherwise. |
| `classes: {}` — a present but empty record. | Treated as ABSENT, matching the convention functional-definition.ts states twice and S002 adopted: undefined OR empty is absent. An empty box-and-arrow diagram is a frame around nothing, which is exactly what k3 forbids. |
| A class with no `attributes`, or with `attributes: {}`. | Drawn as a box carrying only its name. A class with no attributes is a legitimate entity — often the target end of a relationship — and omitting it would break the edges that point at it. |
| A slot with `range` absent entirely. | An attribute with no type shown, following erDefinitionToIr which emits the bare slot name when range is empty. Not an edge, since no class is named. |
| Cardinality flags in every combination — required, multivalued, minimum_cardinality, maximum_cardinality, identifier. | Rendered as the crow's-foot token the daemon derives, so the in-pane picture and the generated companion say the same thing about the same relationship. An `identifier` slot is marked on the box, since it is what makes an entity addressable. |
| A class or slot name containing markdown-active or HTML-active characters — `<script>`, `&`, backticks, angle brackets. | Rendered character-for-character as TEXT via textContent, creating no element and no attribute. This is ac4's proof case in the SVG medium: SVG is XML, so an unescaped `<` in a label would be a parse hazard if markup were ever built by string concatenation — which is exactly why createElementNS + textContent is the only construction route. |
| A large model — far more classes than the 3 and 8 the ledger's two real records carry. | Every class drawn, none truncated, with the layout degrading to something denser rather than dropping content. Truncating would hide part of a design the reviewer is about to approve. If a drawn layout becomes genuinely unreadable at scale, the right response is the structured-view degradation alternative a4 described — not silent omission. |
| TWO companion refs on one document — a diagram and a ux-mock — which is the real shape of this Epic's own LLD-s2. | This Story builds only the 'diagram' slot and ignores the 'ux-mock' ref entirely; the experience slot is s4's, and how the two sit together when both are present is explicitly s4's decision per the HLD boundary. s3 must leave that arrangement undecided rather than pre-empting it. |
| The same document delivered twice — the pane posts docs-content from five sites per session. | Exactly ONE slot after the second delivery, with the same content as after the first, because renderContent rebuilds from scratch per message. The same idempotence property S002 had to model explicitly in its stubs to test at all. |

**Invariants to preserve**

- Markup is injected at exactly ONE site on this surface — the markdown body's guarded `el.innerHTML=marked.parse`. The diagram is SVG built with `document.createElementNS` and labels set via textContent; no markup string is constructed anywhere, no attribute is built from record text, and the pinned injection-site count stays at one. This is also why a diagram library was rejected: mermaid renders by producing markup, which collides with this invariant head-on. [[c2]]
- The document body remains the authoritative content and the diagram is an adjunct. The body is never edited, never truncated and never replaced to make room for a visual; a slot failure in any state leaves the body, the chooser, the notice, the open questions and the approval controls fully intact. [[c3]]
- Nothing is fabricated or reserved for an absent companion. 'absent' is the ABSENCE of a slot, enforced by the type carrying no other field, and it is returned before any element is created — so it is provable as the absence of DOM activity rather than as the absence of something visible. [[c4]]
- The read path stays additive. The records ride the response workflow.artifactContent already returns and the docs-content message the host already posts — no new IPC method, no parallel read surface, no second round trip, and NO READ OF THE COMPANION FILE ITSELF, which is what keeps both the 3.3 MB payload and the path-traversal surface of an arbitrary body-supplied relPath outside this Story. [[c7]]
- All rendering runs locally inside the editor. Nothing is fetched, nothing is sent anywhere, and the only input is a record that arrived through the existing artifact read path. [[c9]]
- Section identity has exactly one source. Slugs come from sc3's deriveSectionIndex and are resolved by its createSectionResolver; this Story reads that identity and mints none, and docs-sections.ts comes out byte-identical — which S002 already asserts by test against the pre-S002 commit. [[c2]]
- The approval path behaves identically. Approve, request-changes, the COMMENTABLE_KINDS gate, the blocked banner and the fail-closed suppression are untouched, and the fail-closed arm in particular carries no records — so a reviewer who could not read the body is never shown a diagram drawn from it. [[c5]]
- No generation-side contract is altered. ErDefinition, CompanionArtifactRef, the companion renderers and the daemon's own validation all stay exactly as they are; the proposed sc1 amendment adds two optional projection fields to a READ response and changes nothing a producer emits. [[c5]]

## 6. Test strategy

**Test framework:** `node:test via `npx tsx --test`, run from vscode-plugin/ — the framework every suite in src/chat/__tests__/ uses (docs-review-panel.test.ts now 64 tests; plugin sweep 682 pass / 4 skipped). Webview code is proved by `new Function` evaluation against a hand-built DOM stub and by lifting the REAL bootstrap out of the emitted shell, never by asserting on the HTML string. Visual checks render the real shell, screenshot it headless and READ the image back. Fast loop: `npx tsx --test 'src/chat/__tests__/docs-review-panel.test.ts'`.`

**Test levels**

- **unit** — Execute the slot factory's decision table directly. The factory is where every acceptance criterion is decided, so its four-combination gate is the single highest-value thing to pin — and the one place ac2 and the HLD sketch disagreed, which means the table must be asserted rather than inferred.
  - Subjects: `The FOUR-COMBINATION GATE asserted as a table, one row per (ref present/absent × record present/absent): absent+absent -> 'absent'; present+present -> 'rendered'; present+absent -> 'unshowable'; absent+present -> 'rendered'. Each row asserted through the returned discriminator AND through what was built`, `'absent' does ZERO DOM work — no createElement call at all, asserted as the absence of activity rather than the absence of a visible frame, and reached before any construction`, `The 'absent' state carries no other field, so no caller can read a label, a body or a link from it`, `linkOut is present on BOTH 'rendered' and 'unshowable' whenever a ref exists, and absent when there is no ref`, `CompanionVisualKind is derived from the ref's CompanionKind — 'diagram-mermaid' and 'diagram-html' -> 'diagram', 'ux-mock' -> 'experience' — and the mapping is total over the closed union`, `diagram-html routes to 'unshowable' with a reason naming the kind (lc1), never to a silent nothing`, `A diagram-mermaid ref with no projected record (the sequence/component majority case) routes to 'unshowable' with a reason that NAMES what was referenced rather than a generic failure`
  - Fixtures: `A record fixture taken from a REAL ledger erDefinition (the two that exist carry 3 and 8 classes) rather than a hand-invented one`, `A CompanionArtifactRef fixture per CompanionKind member, including the never-produced diagram-html`, `A malformed-record table: classes not an object, null, an array, an ErClass that is not an object, attributes not an object`
- **unit** — Execute the ER derivation and prove it agrees with the daemon's. This Story RE-IMPLEMENTS erDefinitionToIr's rules in a source string that cannot import the daemon module, so the two copies must be pinned against each other or they will drift silently — the mitigation the alternatives judgement named explicitly.
  - Subjects: `PARITY: the client derivation and `erDefinitionToIr` are run over the SAME fixtures and asserted to produce the same node set and the same edge set (class-ranged slot -> edge; every other slot -> an attribute on the box). This is the test that makes the duplication safe rather than merely acknowledged`, `A slot whose range names a defined class becomes an edge; a scalar-ranged slot and a rangeless slot both become attributes`, `A DANGLING range omits that one edge and still draws every box and every other edge — the deliberate divergence from the daemon, which throws ErDefinitionError there`, `Cardinality flags in every combination produce the same crow's-foot token the daemon derives, so the in-pane picture and the generated companion say the same thing about the same relationship`, `A self-referencing slot and a cyclic class graph both terminate and draw — the layout is driven by the sorted class list, never by edge traversal`, `Determinism: the same record renders an identical element tree every time, with no randomness and no measurement-dependent reflow`
  - Fixtures: `A shared fixture set importable by BOTH the client-derivation test and a daemon-side erDefinitionToIr call, so parity is asserted on identical input`, `A dangling-range record, a self-referencing record, and a cyclic record`
- **unit** — Prove ac4 structurally in the SVG medium. SVG is XML, so a label containing `<` would be a parse hazard if markup were ever built by concatenation — this level proves it never is.
  - Subjects: `Every SVG element is created via createElementNS with the SVG namespace, and every label is written via textContent — asserted by a recording stub that captures property writes, so 'no markup assignment' is EXECUTED rather than grepped`, `A class name and a slot name containing `<script>`, `&`, backticks and angle brackets come back character-for-character identical and create no element and no attribute`, `DOCS_DIAGRAM_SOURCE contains no innerHTML, outerHTML, insertAdjacentHTML or document.write — scanned with comments stripped first, because a source scan that reads prose has produced four false results in this repo already`, `The emitted shell still contains EXACTLY ONE `.innerHTML=` and it is still the guarded vendored parse, after a FOURTH source string joins the single nonce'd script`, `No attribute value is built from record text`
  - Fixtures: `A hostile record whose class and slot names carry XML-active and HTML-active characters`, `The recording-stub pattern S002 built, extended to record createElementNS calls and their namespace argument`
- **integration** — Prove the records reach the webview and the slot reaches the surface, by driving the SHIPPED bootstrap rather than a reconstruction of it — the harness S002 built for exactly this.
  - Subjects: `openDoc forwards erDefinition and companions by REFERENCE on the existing docs-content message, with absence staying an ABSENT KEY ('erDefinition' in payload === false)`, `openDoc's fail-closed arm posts blocked:true and carries NO records and NO companions`, `DOCS_DIAGRAM_SOURCE is inlined into the single nonce'd script, and the slot build runs AFTER stampSlugs for the same pointer-advance reason S002's placement does`, `A document with no companions and no record renders a body byte-identical to what S002 ships — the dominant path, proved as the main case`, `IDEMPOTENCE: two consecutive docs-content messages with the same record leave exactly ONE slot with the same content; a third carrying neither leaves none`, `A forced throw inside the slot build still renders the body, the chooser, the notice, the open questions and BOTH approval controls — all four surfaces, not two`, `The approval path, the COMMENTABLE_KINDS gate and the blocked banner behave identically to before this Story`, `An ofSectionId that resolves mounts the slot beside that heading; one that does not resolve mounts it at the default position rather than dropping it`
  - Fixtures: `The existing fakeChannel / fakeClient doubles and the runWebview harness, extended to deliver erDefinition and companions`, `A rendered-body stub whose innerHTML/textContent assignment REPLACES children, as S002 had to model for idempotence to mean anything`
- **smoke** — THE CHECK THIS STORY CANNOT SHIP WITHOUT. Every DOM stub is CSS-blind and geometry-blind: boxes overlapping, edges meeting the wrong box, labels clipped outside their box, arrows pointing nowhere — none of it is visible to an assertion, and all of it destroys the only thing the Story delivers. A green suite proves the elements exist, not that the picture is legible.
  - Subjects: `Render the real shell with a REAL ledger erDefinition, screenshot it headless, and READ the image: boxes do not overlap, every edge visibly connects the two boxes it names, no label is clipped or escapes its box, and the crow's-foot ends are distinguishable`, `The same for the 8-class record, which is the largest the ledger holds — density is where a hand-written layout fails first`, `The 'unshowable' state: the reason text is legible and the link-out is visibly reachable`, `The 'absent' state: nothing is drawn, and the body renders exactly as it does without the Story`, `A self-referencing and a cyclic model, read back as images — the shapes most likely to produce a nonsense drawing`
  - Fixtures: `The headless-Chrome screenshot route S002 established, with the three state images committed under S003/evidence/ as S002's were`
- **unit** — Verify by MUTATION that each claim can fail. Three vacuous tests shipped green in this repo inside one week, and in S002 I reintroduced one on the very check whose vacuity had just been flagged — so a falsifier is part of the deliverable, run at the task that owns it rather than deferred.
  - Subjects: `Delete the absent gate -> the ac2 zero-DOM-activity test must fail`, `Make the factory dispatch on the ref's kind instead of the record present -> the sequence-diagram unshowable test must fail`, `Drop the diagram-html branch -> the lc1 test must fail`, `Build the slot with innerHTML instead of createElementNS -> the no-markup and injection-count tests must fail`, `Treat a dangling range as fatal (daemon behaviour) -> the omit-one-edge test must fail`, `Drive the layout by edge traversal instead of the sorted class list -> the cyclic-model test must hang or fail`, `Drop linkOut from the 'unshowable' state -> the link-in-failure-state test must fail`, `Change one client derivation rule -> the PARITY test against erDefinitionToIr must fail`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit (gate table): ref present + record present -> 'rendered', asserted through the discriminator and the built body`, `unit (derivation): one box per class and one edge per class-ranged slot, with parity against erDefinitionToIr over shared fixtures`, `integration: an ofSectionId that resolves mounts the slot beside that heading; one that does not resolve mounts it at the default position rather than dropping the visual`, `integration: the records reach the webview by reference on the existing message and the slot reaches the surface through the shipped bootstrap`, `smoke (VISUAL): the drawn diagram is read back from a screenshot and confirmed legible — boxes not overlapping, edges connecting the boxes they name, labels not clipped. No assertion can prove this and it is the whole of ac1's value`, `RECORDED LIMITATION: 0 of 8 refs in the ledger carry ofSectionId, so ac1's 'positioned with the part of the document that references it' is exercised by a synthetic fixture only. The anchored path is implemented and tested; no real document reaches it today` |
| `ac2` | `unit (gate table): ref absent + record absent -> 'absent', with ZERO createElement calls — asserted as the absence of DOM activity, not merely the absence of a visible frame`, `unit: the 'absent' state carries no label, body or link, so nothing downstream can render a frame from it`, `unit: `classes: {}` is treated as absent, matching the undefined-or-empty convention the repo states twice`, `integration: a document with no companions and no record renders a body byte-identical to the S002 rendering — the dominant path, proved as the main case`, `mutation: deleting the absent gate must turn the zero-DOM-activity test red — without it, a test that passes by doing nothing proves nothing` |
| `ac3` | `unit (gate table): ref present + record absent -> 'unshowable' with a reason that NAMES what was referenced`, `unit: diagram-html routes to 'unshowable' per lc1 rather than falling through silently`, `unit: a malformed record with a ref present routes to 'unshowable', not to a broken picture`, `unit: linkOut is offered IN the unshowable state — the reviewer who cannot see the diagram is the one who most needs the authentic file`, `integration: a forced throw inside the slot build yields 'unshowable' and leaves the body, chooser, notice, open questions and both approval controls intact — the body remains fully readable, which is the second half of ac3`, `smoke: the unshowable state is read back from a screenshot and confirmed legible` |
| `ac4` | `unit: every SVG element created via createElementNS and every label via textContent, proved by a recording stub that captures property writes`, `unit: a hostile class/slot name containing `<script>`, `&` and angle brackets renders as text, creating no element and no attribute`, `unit (contract): DOCS_DIAGRAM_SOURCE contains no markup-assignment of any kind, scanned with comments stripped first`, `unit (contract): the emitted shell still has EXACTLY ONE `.innerHTML=` after a fourth source string joins the script, and it is still the guarded vendored parse`, `integration: the only input is a record that arrived on the existing docs-content message — no fetch, no companion-file read, no external call anywhere in the diff`, `mutation: building the slot with innerHTML must turn the no-markup and injection-count tests red` |

## 7. Migration

**State before:** sc1 already projects `erDefinition` and `companions` onto ArtifactReviewView (artifact-content.ts structuredRecords, verbatim and unvalidated), and `DocsContent` already mirrors both INDEXED off the daemon type (docs-review-client.ts:35-37). So both records reach the extension host on every open and are DROPPED there — openDoc forwards only markdown, openQuestions, blocked, commentable, sections, degradation and (since S002) functionalDefinition, and the docs-content variant in protocol.ts has no field for either. The webview carries three inlined source strings under one nonce'd strict CSP, with the emitted shell pinned by a sha256 + char + byte baseline. sc2's StructuredRenderer has exactly one implementation (S002's). sc3's createSectionResolver is shipped, correct and consumed by nobody — S002 used only deriveSectionIndex. Nothing in vscode-plugin renders a diagram: zero diagram libraries in source, one runtime dependency (marked@^4.3.0), and the only ER rendering path is daemon-side renderErCompanion → erDefinitionToIr → docgen assembleShell, which writes a ~3.3 MB standalone HTML file that a strict-CSP webview cannot use. A reviewer opening a document with an entity model today sees its prose and a markdown link to that file, and nothing else.

**State after:** The two records travel one hop further onto the existing docs-content message, and the pane draws the design. sc4 is published — CompanionVisualKind, the three-state CompanionSlotState, CompanionSlotFactory, CompanionLinkOut — with S003 shipping its first factory, so s4 inherits a frame that has been exercised. A document carrying an entity model shows it as a small SVG built element by element: one box per class with its attributes, one arrow per class-ranged slot, labels written with textContent, no markup anywhere and nothing fetched. A document that references a diagram the pane cannot draw states so by name and still offers the link to the authentic file. A document with neither shows NOTHING — no slot, no frame, no reserved space, zero DOM activity — which is the state of almost every document in the ledger. If the sc1 amendment is approved, sequence and component diagrams draw too and the unshowable state retreats to genuinely absent records; if it is declined, they stay on the unshowable path with a reason naming the kind. No generation-side contract changes either way.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Land the ADOPTED sc1 amendment: add ONE optional field, `sequenceDefinition`, to the daemon projection in `structuredRecords` and mirror it on DocsContent indexed off the daemon type — the same shape the existing four were added in, additive and absent-safe. `componentDependencyDefinition` is explicitly OUT of scope (0 producers in the ledger) and is a purely additive field to add when one first appears. Everything after this step is scope-identical; only which records the factory can dispatch on changes. — ↩ rollbackable
2. Add the optional record fields to the docs-content variant of HostToWebview, typed by indexing off DocsContent so protocol, client and daemon stay one declaration deep. A type addition only — nothing reads or writes them yet and no existing consumer is affected, since every field is optional. — ↩ rollbackable
3. Forward the records in openDoc by conditional spread, so an absent record stays an ABSENT KEY across the postMessage boundary. The webview ignores fields it has no code for, so behaviour is unchanged after this step and the data is in place. Assert that the emitted shell is still byte-identical to the pinned baseline here — this step must not move it. — ↩ rollbackable
4. Publish sc4's types. Type-only, consumed by nothing yet, and deliberately separated from the renderer so the contract s4 depends on lands before and independently of any diagram-specific decision. — ↩ rollbackable
5. Add the fourth webview source string holding the ER derivation, the SVG renderer and the slot factory, and inline it into the single nonce'd script after its three siblings. INERT: it defines functions and nothing calls them, so the surface is unchanged and the injection-site count is verifiably still one before any behaviour flips. The shell baseline moves here and must be updated in the same commit, with the delta stated. — ↩ rollbackable
6. Call the factory from renderContent, after stampSlugs and before the chooser and the notice, wrapped in the backstop catch, and mount the returned slot — anchored when the ref's ofSectionId resolves, at the default position otherwise. THIS is the step that changes what a reviewer sees, and it is deliberately last and single-call: reverting it restores the shipped surface while leaving the types, the data path and the renderer in place. — ↩ rollbackable
7. Verify the drawing VISUALLY, not just greenly: render the real shell with both real ledger entity models, screenshot headless, read the images back, and commit them as evidence. Boxes not overlapping, every edge connecting the two boxes it names, no clipped labels, and the unshowable and absent states legible. No DOM-stub assertion can see any of this, and it is the only check that detects the failure this Story exists to prevent. — ↩ rollbackable
8. Rebuild and reinstall the VS Code extension (esbuild bundle + VSIX) and REPORT the size delta. A daemon rebuild IS required, because the adopted amendment changes `src/workflow/artifact-content.ts` — the extension alone is not enough. Stating this explicitly is part of this step, because shipping the wrong artefact makes the change appear not to work. — ↩ rollbackable

**Backward compat:** No public API changes on the client: the docs-content additions are optional fields on an internal host→webview message that exists only inside this extension, so there is no external consumer and no versioning concern. Across the IPC boundary the compatibility that matters was established by sc1 and is merely extended on the same terms — every projected field is optional, absence is an absent key, and an older client reading a newer daemon response ignores fields it does not know. Concretely: an extension built before this Story works against a daemon carrying the amendment (it ignores the two new fields), and this extension works against a daemon WITHOUT the amendment (the fields never arrive, the records read as absent, and sequence/component refs land on the unshowable path exactly as the declined-amendment variant intends). That symmetry is why the amendment can be approved or declined without a coordinated release. The JetBrains review panel reads the same daemon IPC and is unaffected, since nothing existing changes meaning — k7's unchanged-existing-consumers obligation holds. No generation-side contract is touched: ErDefinition, CompanionArtifactRef, the companion renderers and the daemon's own validation are all exactly as they were, and a document generated before this Story renders correctly with no migration and no retrofit.

## 8. Alternatives considered

### 8.1 a1: SVG renderer by DOM construction, ER-only, every other diagram kind declared unshowable

sc4's slot is filled by a small SVG box-and-arrow renderer built with createElementNS from erDefinition; a diagram ref with no projected record renders the unshowable state naming why.

sc4 is published as the HLD sketches it — CompanionVisualKind, the three-state CompanionSlotState, CompanionSlotFactory and CompanionLinkOut — and S003 provides the first factory, `kind: 'diagram'`. The host forwards `erDefinition` and `companions` onto the existing docs-content message exactly as S002 forwarded `functionalDefinition`: conditional spreads, absence stays an absent key, no new message type. A fourth webview source string holds the renderer. It walks erDefinition ONCE, re-deriving the node/edge split by the SAME rules erDefinitionToIr uses — a slot whose `range` names a defined class is an edge, anything else folds into the node's attribute list — and lays the result out with a deterministic algorithm chosen for predictability over beauty (classes in sorted order, a simple grid or layered placement, straight or orthogonal connectors). Everything is built with `document.createElementNS` for SVG elements and `textContent` for every label, so not one character of markup is injected and sc2 holds unchanged. Placement consumes sc3: `createSectionResolver` turns a ref's `ofSectionId` into a slug, the slot mounts beside that heading when it resolves, and falls back to a defined default position when it does not — which, given that 0 of 8 refs in the ledger carry the field, is the path every real document takes today. Scope is ER only: a `diagram-mermaid` ref whose document carries no `erDefinition` (a sequence or component diagram — the majority case) yields `{ state: 'unshowable', reason }` whose reason says which kind was referenced and that its source record is not available to this surface. `diagram-html` routes to the same state per lc1. The link-out to the authentic companion file is offered in every slot state that has a ref, so the reviewer can always reach the real thing.

**Rejected because:** a1 is the correct Story if the sc1 amendment is rejected, and it is deliberately recorded as the fallback rather than as a loser — every client-side decision in a2 is a1's decision unchanged, so the two differ only in whether the projection is widened. It scores clean on ac2, ac3, ac4 and all four contracts, needs no approval beyond this LLD, touches no daemon file and ships as a plugin-only change. It ranks second on exactly one criterion: ac1, where it is partial because the documents that most need a diagram shown are the ones it declares unshowable. Its other honest weakness is shared with a2 and worth naming once: it re-derives the node/edge rules that erDefinitionToIr already encodes, in a source string that cannot import the daemon module, which is the same single-source tension S002 resolved for section identity by consuming rather than duplicating. Here duplication is unavoidable — the derivation must run client-side and the daemon module cannot be imported into a webview — so the mitigation is a test that pins the two against the same fixtures, not a shared implementation.

### 8.2 a2: SVG renderer plus an additive sc1 amendment, so entity and sequence diagrams both render — **CHOSEN**

As a1, but proposes a `sharedContract.fieldAdd` on sc1 to project `sequenceDefinition`, so the majority of real diagram companions render instead of failing.

Identical to a1 in every client-side respect — same sc4 publication, same SVG-by-DOM-construction discipline, same sc3 placement, same link-out — with one upstream change: an HLD amendment of type `sharedContract.fieldAdd`, `breaking: false`, adding `sequenceDefinition?` to sc1's projection alongside the four fields already there (ADOPTED SCOPE: `componentDependencyDefinition?` was considered and DEFERRED — 0 producers in the ledger). The daemon change is one line per field in `structuredRecords`, exactly the shape sc1 was built in, and `DocsContent` mirrors them INDEXED off the daemon type as the existing four are. The renderer then dispatches on which record is present rather than assuming ER: an erDefinition draws entities and relations, a sequenceDefinition draws participants and ordered messages. Both are small labelled graphs over the same SVG primitives, so the layout work is shared and only the node/edge derivation differs per record; a componentDependencyDefinition would slot into the same dispatch unchanged when one first exists. The unshowable state still exists and still catches `diagram-html` and any ref whose source record is genuinely absent.

### 8.3 a3: Bundle a diagram library into the VSIX

Vendor mermaid (or a lighter graph library) into the webview and feed it a diagram specification, so layout quality matches the generated companion.

Add a diagram library to the plugin's bundle alongside MARKED_SRC and let it do layout. Because the library consumes a text specification rather than a record, the webview must FIRST re-derive that specification from the projected record — the client does not receive the mermaid source the daemon generated, only `erDefinition`, so the derivation work of a1 is still required and is then handed to the library instead of to an SVG writer. The slot, the three states, the sc3 placement and the link-out are as in a1. The library's own rendering would have to be reconciled with sc2: mermaid renders by producing markup, so either the no-raw-markup rule is relaxed for it (an HLD-level change) or its SVG output is sanitised and re-mounted, which reintroduces the injection surface the Epic exists to avoid.

**Rejected because:** a3 is eliminated on two hard scores and one fact, and the fact is the most damning because it is about the thing the alternative was supposed to buy. It VIOLATES ac4 and VIOLATES sc2: mermaid renders by injecting markup, and reconciling that means either sanitising foreign output — reintroducing exactly the surface this Epic exists to exclude — or relaxing a contract s1 owns, which no Story may do unilaterally. Independently, the VSIX cost is ~3 MB on a 241,713-byte extension, more than a tenfold increase, to render diagrams on two documents in the whole ledger. And the fact that settles it: THE LIBRARY DOES NOT REMOVE THE WORK IT WAS CHOSEN FOR. Its input is a diagram specification and the client never receives one — only the record — so the node/edge derivation a1 writes is still required and the library is added on top of it, not instead of it. It buys layout quality and nothing else, for two contract violations and a tenfold size increase.

### 8.4 a4: Structured entity view — no layout, no edges drawn

Render the erDefinition as a structured list of entities with their attributes, and relationships as typed rows, rather than as a drawn graph.

sc4 and its three states are published as in a1, and the slot is filled by a DOM-constructed structured view rather than a drawing: one block per class carrying its attribute list, and each class-ranged slot rendered as a labelled relationship row ('Order — placedBy → Customer', with the crow's-foot cardinality stated in words). No coordinates, no SVG, no layout algorithm, no connectors. Placement, the link-out, the unshowable state and the ER-only scope are identical to a1; the only difference is what fills a rendered slot.

**Rejected because:** a4 is the cheapest and lowest-risk option and scores satisfies on seven of eight constraints — and ranks third because the one it misses is the one the Story exists for. It is ranked above a3 rather than below because it breaks nothing: every contract holds, the accessibility story is the best of the four, and the DOM-stub tests could fully verify it where a drawn diagram cannot be verified without reading an image. But ac1's 'as a visual' and the user value's 'cannot picture' are not satisfied by relationship rows, and shipping it would be satisfying an acceptance criterion's letter while missing its intent — the exact failure mode this Epic corrected once already when the UX mock turned out to be rendering as a node graph instead of a UI. Worth keeping in view for one reason: if the drawn layout turns out badly on a dense model, a4's structured view is the right DEGRADATION to fall back to, not the right primary.

## 9. References

- **[[c1]]** `code` `src/workflow/artifacts/companion/er.ts:34-44,46-48,51-54` — "ErSlot, ErClass and ErDefinition — the record this Story draws"
- **[[c2]]** `code` `src/workflow/artifacts/companion/er.ts:273-324` — "erDefinitionToIr — the authoritative node/edge derivation this Story re-implements client-side"
- **[[c3]]** `code` `src/workflow/artifacts/companion/er.ts:102-160` — "validateErDefinition — ajv validation at ASSEMBLY time, not on the read path"
- **[[c4]]** `code` `src/workflow/artifacts/companion/types.ts:24,31-38` — "CompanionKind (closed three-member union) and CompanionArtifactRef with its optional ofSectionId"
- **[[c5]]** `code` `src/workflow/artifacts/companion/render.ts:104,205,243` — "THREE renderers emit kind diagram-mermaid — ER, sequence and component — so the kind does not identify the record"
- **[[c6]]** `code` `src/workflow/artifact-content.ts — structuredRecords` — "sc1 projects exactly four records, verbatim and unvalidated"
- **[[c7]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:35-37` — "DocsContent mirrors erDefinition and companions INDEXED off the daemon type"
- **[[c8]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts — the DOCS_*_SOURCE family and renderContent` — "Three inlined source strings in one nonce'd script; the pinned shell baseline; the pipeline this Story inserts into"
- **[[c9]]** `code` `vscode-plugin/src/chat/docs-sections.ts:136-149` — "createSectionResolver — sc3 consumed as shipped, returning undefined for an unknown id"
- **[[c10]]** `code` `vscode-plugin/package.json` — "One runtime dependency (marked@^4.3.0); no diagram library in plugin source"
- **[[c11]]** `prior-artifact` `.insrc/artifacts/LLD-bfe98ff7f97178cf-s2.json` — "A diagram-mermaid companion plus a sequenceDefinition and no erDefinition — the counterexample driving the amendment"
- **[[c12]]** `prior-artifact` `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S002/evidence/` — "S002's committed state screenshots — the visual-verification route this Story must extend"
- **[[c13]]** `analyze-bundle` `s1 data-model.trace over .insrc/artifacts/*.json` — "5 diagram-mermaid refs, 2 erDefinitions, 3 sequenceDefinitions, 0 of 8 refs carrying ofSectionId; erDefinitions of 3 and 8 classes"
- **[[c14]]** `analyze-bundle` `s1 capability.reuse-check over vscode-plugin/` — "Nothing vendored; VSIX 241,713 bytes; a mermaid bundle would be a >10x increase"

## 10. Open questions

- RESOLVED at the approval gate — the sc1 amendment is ADOPTED IN NARROWED FORM: a `sharedContract.fieldAdd` (breaking:false) adding `sequenceDefinition` ONLY to sc1's projection. WHY THE AMENDMENT: three daemon renderers emit `kind:'diagram-mermaid'` — ER (render.ts:104), sequence (:205), component (:243) — but sc1 projected only the ER source record, and the ledger holds 5 diagram-mermaid refs against 2 erDefinitions and 3 sequenceDefinitions, so without it this Story would tell a reviewer 'a diagram was referenced but could not be shown' on the MAJORITY of documents that carry a diagram — including this Epic's own LLD for s2, whose 'Sequence diagram' companion and whose sequenceDefinition sit in the same body, unprojected. WHY NARROWED: the review's independent recount found `componentDependencyDefinition` in ZERO artifact bodies, so projecting it would buy a third derivation, a third set of fixtures and a third visual check for a record no producer has ever emitted; it is DEFERRED until one does, and is purely additive whenever that happens. CONSEQUENCES: the daemon changes by one line in `structuredRecords` and MUST be rebuilt, and the Story carries TWO derivations (entity model + call sequence), not three. backwardCompat is unchanged and symmetric, so no coordinated release is required.
- CONFIRM THE ref-absent / record-present ROW. ac2 gates on the REF ('a document that references no design diagram companion' → no diagram area) while the HLD's sc4 sketch gates on the RECORD ('returns absent when the record is undefined'), and the two disagree in both directions. This LLD resolves all four combinations explicitly and makes the contested row RENDER: a document carrying an entity model whose companion generation simply did not run has the design, and the HLD's framework is render-from-the-record-never-from-the-companion-file, so making the ref the content gate would contradict the framework and hide a diagram we can draw. Nothing is fabricated and no space is reserved — the content genuinely exists. It is raised because it reads against ac2's literal wording, and because the opposite reading is defensible: if review prefers the ref to gate content, the row flips to 'absent' and nothing else in the LLD changes.
- CHECKLIST PROVENANCE, recorded so review judges rather than discovers (s8 graded cd1, cd2 and alt2 `partial`). (a) cd1: `DOCS_DIAGRAM_SOURCE` is a NEW name — unavoidable for a Story that adds code — anchored as the fourth member of the located DOCS_*_SOURCE family; the other eight api entries are shipped symbols or sc4's own members. (b) cd2: `CompanionSlotState.body` and the renderer's `el` are typed `unknown` because the code lives in an exported SOURCE STRING with no TypeScript boundary and is tested against DOM stubs that are deliberately not HTMLElements — matching sc2's shipped `StructuredRenderer<T>`, which already made this choice. (c) alt2: all four alternatives were scored against every acceptance criterion and all four shared contracts (32 scores), but Epic constraints k1-k7 were not re-scored as their own rows; they appear in the notes, and both eliminations rest on explicit scores — a3 on VIOLATES against ac4 and sc2, a4 on an ac1 partial.

## Resolved questions

- `q841c8f82` — RESOLVED at the approval gate — the sc1 amendment is ADOPTED IN NARROWED FORM: a `sharedContract.fieldAdd` (breaking:false) adding `sequenceDefinition` ONLY to sc1's projection. WHY THE AMENDMENT: three daemon renderers emit `kind:'diagram-mermaid'` — ER (render.ts:104), sequence (:205), component (:243) — but sc1 projected only the ER source record, and the ledger holds 5 diagram-mermaid refs against 2 erDefinitions and 3 sequenceDefinitions, so without it this Story would tell a reviewer 'a diagram was referenced but could not be shown' on the MAJORITY of documents that carry a diagram — including this Epic's own LLD for s2, whose 'Sequence diagram' companion and whose sequenceDefinition sit in the same body, unprojected. WHY NARROWED: the review's independent recount found `componentDependencyDefinition` in ZERO artifact bodies, so projecting it would buy a third derivation, a third set of fixtures and a third visual check for a record no producer has ever emitted; it is DEFERRED until one does, and is purely additive whenever that happens. CONSEQUENCES: the daemon changes by one line in `structuredRecords` and MUST be rebuilt, and the Story carries TWO derivations (entity model + call sequence), not three. backwardCompat is unchanged and symmetric, so no coordinated release is required.
  - **resolved**: Adopt as resolved: daemon line first, then two derivations — Already adjudicated by the user at the S003 approval gate (they chose option 1, the narrowed amendment) and filed as AMD-bfe98ff7f97178cf-1, approved 2026-10-01T16:16:27Z — so this is a settled decision being recorded, not reopened. Projection-first is also the correct order on the evidence: landing the one-line structuredRecords change first means both derivations are exercised against the documents the ledger actually holds (3 sequenceDefinition bodies, including this Epic's own S002 LLD) rather than only against hand-built fixtures. componentDependencyDefinition stays out of scope on 0 producers. _(2026-10-01T16:18:15.331Z)_
- `q7f574776` — CONFIRM THE ref-absent / record-present ROW. ac2 gates on the REF ('a document that references no design diagram companion' → no diagram area) while the HLD's sc4 sketch gates on the RECORD ('returns absent when the record is undefined'), and the two disagree in both directions. This LLD resolves all four combinations explicitly and makes the contested row RENDER: a document carrying an entity model whose companion generation simply did not run has the design, and the HLD's framework is render-from-the-record-never-from-the-companion-file, so making the ref the content gate would contradict the framework and hide a diagram we can draw. Nothing is fabricated and no space is reserved — the content genuinely exists. It is raised because it reads against ac2's literal wording, and because the opposite reading is defensible: if review prefers the ref to gate content, the row flips to 'absent' and nothing else in the LLD changes.
  - **resolved**: Record gates content (LLD as written) — This is the behaviour already stated in the LLD the user approved, so recording it keeps plan faithful to the approved artifact rather than changing it. It follows the HLD's framework rule — render from the record, never from the companion file — so making the ref the content gate would contradict the framework and hide a design the document genuinely carries; nothing is fabricated and no space is reserved. Deliberately NOT taking the 'amend ac2's wording' variant: that files an amendment against an ACCEPTANCE CRITERION, which changes what the Story is contracted to deliver, and that is the user's call rather than a plan-stage judgement. The paper conflict with ac2's literal wording stays recorded in the LLD's openQuestions and in this resolution, so a later review judges it rather than discovering it, and the wording amendment remains available if a reviewer prefers it. _(2026-10-01T16:18:54.322Z)_

## Citations

- **[[c1]]** `code` `src/workflow/artifacts/companion/er.ts:34-44,46-48,51-54` — "ErSlot, ErClass and ErDefinition — the record this Story draws"
- **[[c2]]** `code` `src/workflow/artifacts/companion/er.ts:273-324` — "erDefinitionToIr — the authoritative node/edge derivation this Story re-implements client-side"
- **[[c3]]** `code` `src/workflow/artifacts/companion/er.ts:102-160` — "validateErDefinition — ajv validation at ASSEMBLY time, not on the read path"
- **[[c4]]** `code` `src/workflow/artifacts/companion/types.ts:24,31-38` — "CompanionKind (closed three-member union) and CompanionArtifactRef with its optional ofSectionId"
- **[[c5]]** `code` `src/workflow/artifacts/companion/render.ts:104,205,243` — "THREE renderers emit kind diagram-mermaid — ER, sequence and component — so the kind does not identify the record"
- **[[c6]]** `code` `src/workflow/artifact-content.ts — structuredRecords` — "sc1 projects exactly four records, verbatim and unvalidated"
- **[[c7]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:35-37` — "DocsContent mirrors erDefinition and companions INDEXED off the daemon type"
- **[[c8]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts — the DOCS_*_SOURCE family and renderContent` — "Three inlined source strings in one nonce'd script; the pinned shell baseline; the pipeline this Story inserts into"
- **[[c9]]** `code` `vscode-plugin/src/chat/docs-sections.ts:136-149` — "createSectionResolver — sc3 consumed as shipped, returning undefined for an unknown id"
- **[[c10]]** `code` `vscode-plugin/package.json` — "One runtime dependency (marked@^4.3.0); no diagram library in plugin source"
- **[[c11]]** `prior-artifact` `.insrc/artifacts/LLD-bfe98ff7f97178cf-s2.json` — "A diagram-mermaid companion plus a sequenceDefinition and no erDefinition — the counterexample driving the amendment"
- **[[c12]]** `prior-artifact` `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S002/evidence/` — "S002's committed state screenshots — the visual-verification route this Story must extend"
- **[[c13]]** `analyze-bundle` `s1 data-model.trace over .insrc/artifacts/*.json` — "5 diagram-mermaid refs, 2 erDefinitions, 3 sequenceDefinitions, 0 of 8 refs carrying ofSectionId; erDefinitions of 3 and 8 classes"
- **[[c14]]** `analyze-bundle` `s1 capability.reuse-check over vscode-plugin/` — "Nothing vendored; VSIX 241,713 bytes; a mermaid bundle would be a >10x increase"
