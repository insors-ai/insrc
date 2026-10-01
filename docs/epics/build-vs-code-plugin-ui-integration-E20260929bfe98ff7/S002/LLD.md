<!-- insrc:artifact LLD-bfe98ff7f97178cf-s2 -->

# LLD: E20261001bfe98ff7:S002

## Summary

**Epic:** `build-vs-code-plugin-ui-integration`
**HLD base run:** `wf-1790840477406-bic923`
**HLD effective hash:** `33e859ffd0be...`

A document's functional requirements already reach the review pane twice over: once as the structured record the artifact body carries, and once as the markdown prose that record was generated into. This Story makes the pane show the record instead of the prose, in the place the document puts it. The host forwards the record on the message it already posts when a document opens, and the webview — after rendering the body as it does today — replaces the generated bullet list beneath the document's own `Functional requirements` heading with one constructed element per requirement, each identifier written straight off the record by textContent so it can never be reformatted on the way to the screen. Nothing is added when a document carries no requirements, which is almost every document; and when the body cannot be rendered structurally, or the heading cannot be found, the requirements are shown above the body instead with the reviewer told why, because a plain-text body is exactly where a record-built rendering is the only legible access to them.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [UX](#10-ux)
11. [References](#11-references)
12. [Open questions](#12-open-questions)

## 1. HLD context

> See **HLD-bfe98ff7f97178cf** § 2. Framework summary

**Rollout phase:** Phase B — functional record and design diagram (independent, parallelisable)
**Consumes:** `sc1` (ArtifactReviewView structured projection), `sc2` (Review-surface render discipline)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The pane shell and its existing behaviour stay private to s1: the pending-list rendering and row click handling, the monotonic refreshSeq guard that drops superseded responses, the stale-artifact-id checks on open and decide, the approve / request-changes control wiring and the COMMENTABLE_KINDS gate, the fail-closed rule that suppresses approve when a content load failed, and the panel lifecycle (create, reveal, dispose, in-memory-only pending map). The exact wording of the ac3 degradation notice and the visual styling of headings, lists and emphasis are s1's alone. s1 must leave the approval path byte-identical in behaviour (ac5), so none of this is exposed as a contract. — owns `sc1`, `sc2`, `sc3`
- `s3`: The diagram renderer itself is private to s3: which vendored diagram library is bundled, how an ErDefinition's classes and slots are walked into that library's input, the diagram's own sizing and theming within its slot, and how a render throw is caught and converted into sc4's 'unshowable' state. s3 publishes only the slot contract, not its diagram internals — so s4 reuses the frame without inheriting any diagram-specific decision. The VSIX size cost of the bundled renderer is s3's to carry and report. — owns `sc4`
- `s4`: The Adaptive Cards subset renderer is private to s4: which card element types are supported, how an unsupported element degrades, and the mock's internal layout and theming within its slot. Also private is the dual-presence arrangement — how a diagram slot and an experience slot sit together when a document carries both — which s4 decides because it is the only Story that can observe both at once; it does so using the labels sc4 already derives from each ref, so the structural-versus-experience distinction ac2 requires needs no new contract.

## 2. Contract details

**Surface level:** internal

### 2.1 `openDoc`

```typescript
async function openDoc(artifactId: string): Promise<void>
```

**Parameters:**
- `artifactId: string` — The pending artifact to fetch and post; unchanged from s1.

**Returns:** `Promise<void>` — Resolves once a docs-content message has been posted — either the content message or, on a fetch failure, the fail-closed `blocked:true` one. The return value is unchanged by this Story.

**Errors:**
- `none-added` when This Story adds no new throw and no new catch. The existing try/catch around `deps.client.content` is untouched, and reading an optional field off the resolved content cannot throw.

**Preconditions:**
- `pending` contains `artifactId` (enforced by handleMessage before openDoc is called) — unchanged.
- `deps.client.content` resolves a `DocsContent` whose `functionalDefinition` is either an absent key or the record projected verbatim by sc1, with NO validation applied on the read path.

**Postconditions:**
- The posted docs-content message carries `functionalDefinition` when, and only when, `content.functionalDefinition !== undefined` — spread conditionally, exactly as `degradation` already is, so an absent record stays an ABSENT KEY rather than a key holding undefined and `=== undefined` means the same thing on both sides of the postMessage boundary.
- The record is forwarded by REFERENCE with no reshaping, no defaulting and no validation, preserving sc1's verbatim-projection rule end to end.
- `markdown`, `sections` and `degradation` continue to ride the SAME message, so the record, the body it belongs to and the index derived from that body can never be paired across two different documents.
- The failure arm is unchanged: a content-fetch throw still posts `blocked:true` with no record, so a reviewer who never saw the body cannot be shown requirements from it.

### 2.2 `DOCS_FR_SOURCE`

```typescript
export const DOCS_FR_SOURCE: string
```

**Returns:** `string` — The webview-side functional-requirements renderer and its placement logic, carried as SOURCE so the shell inlines it into its single nonce'd script AND the tests `new Function`-evaluate it against a DOM stub. The third member of the family DOCS_BODY_RENDERER_SOURCE (docs-review-panel.ts:76) and DOCS_SECTIONS_SOURCE (:111) established.

**Errors:**
- `none` when A string constant; evaluating it defines functions and runs nothing.

**Preconditions:**
- Concatenated into the shell's single `<script nonce>` after DOCS_BODY_RENDERER_SOURCE and DOCS_SECTIONS_SOURCE, since its placement step runs after both.

**Postconditions:**
- Defines exactly three functions — `frAnchorSlug`, `renderFunctionalRequirements`, `placeFunctionalRequirements` — and declares one notice constant. It contains no `innerHTML`, no `insertAdjacentHTML`, no `outerHTML` and no `document.write`, so the shell's pinned injection-site count stays at exactly one (the body's `el.innerHTML=marked.parse`).
- Written in the same ES5-compatible style as its two siblings (var, function expressions, no template literals), because it is evaluated as a plain script in the webview and by `new Function` in tests.

### 2.3 `renderFunctionalRequirements`

```typescript
StructuredRenderer<FunctionalDefinition> = (record) => { readonly el: unknown; readonly degradation?: { degraded: boolean; notice?: string } | undefined }
```

**Parameters:**
- `record: FunctionalDefinition` — The projected record — `{ requirements: readonly FunctionalRequirement[] }` — forwarded verbatim from the artifact body. Treated as untrusted shape: sc1 projects it without validation and validateFunctionalDefinition runs only at assembly time.

**Returns:** `{ el: unknown; degradation?: { degraded: boolean; notice?: string } }` — `el` is a constructed container element holding one child per requirement; `degradation` is left ABSENT by this function — placement, not rendering, is what can degrade, so the notice is decided by `placeFunctionalRequirements`. Returning the sc2 shape rather than a bare element is the ratified widening carried by LLD-bfe98ff7f97178cf-s1; the HLD's sc2 interfaceSketch still reads `=> HTMLElement` and is stale.

**Errors:**
- `none-thrown` when The renderer never throws. A malformed record degrades to fewer items or to an empty container, which the caller treats as 'nothing to place'. Throwing would take the whole document down with it, and this surface's rule is that degraded means plainer, never blank.

**Preconditions:**
- `record.requirements` is a non-empty array — the caller applies the absent-safe gate (`undefined` or `length === 0` is absent) before calling, mirroring the rule functional-definition.ts states at :58 and :88.
- A `document` global with `createElement` is available (the webview, or the test's DOM stub).

**Postconditions:**
- EVERY string the function puts on screen is written with `textContent`. No value is interpolated into markup and no attribute is built from record data, so an identifier reaches the reviewer character-for-character as the record carries it (ac2) and a hostile statement cannot become markup.
- One discrete child element per requirement, each carrying its identifier and its statement, and its rationale when the record has one — so the rendering is lossless against the markdown form it replaces, which renders exactly those three fields.
- The record's doc/item structure is PRESERVED, not flattened: doc-level requirements are rendered first, then per-item requirements grouped under their `itemRef`, matching the order and grouping renderFunctionalRequirementsSection already produces (functional-definition.ts:92-107). A flat list would silently drop which story a requirement belongs to — information the prose rendering carries today.
- The function is a pure function of the record plus `document.createElement`: the same record always yields the same element tree, which is what makes ac3 hold — two documents carrying the same FrId display the same string.
- No ordering is imposed beyond the record's own: requirements are not sorted, deduplicated or renumbered, so what the reviewer reads is the document's own sequence.

### 2.4 `frAnchorSlug`

```typescript
function frAnchorSlug(sections: SectionIndex | undefined): string | undefined
```

**Parameters:**
- `sections: SectionIndex | undefined` — The index posted on the same docs-content message, derived by sc3's deriveSectionIndex from THIS document's markdown.

**Returns:** `string | undefined` — The slug of the document's functional-requirements section, or `undefined` when the document has no such section.

**Errors:**
- `none-thrown` when A missing or malformed index yields `undefined`, never a throw.

**Preconditions:**
- None. A `undefined` index, an index with no anchors, or an index whose anchors lack titles are all accepted and answered with `undefined`.

**Postconditions:**
- Matches an anchor whose TITLE ends with the format spine's heading text, case-insensitively and ignoring surrounding whitespace — tail-matching rather than equality because the engine prefixes a document-position-dependent number (`## 2. Functional requirements` on a DEF, per formats.ts:36 and bindings.ts:24, which strips the renderer's own hard-coded heading precisely so the engine can supply the numbered one).
- Returns the FIRST such anchor in document order, so a document that somehow carried two never produces an ambiguous target.
- Consumes sc3's identity rather than re-deriving it: the returned value is a slug the index already minted and that stampSlugs has already written onto a heading element. This function mints no identity of its own.
- Returns `undefined` for a renamed or absent heading. That is a SAFE no-match: the caller then takes the fallback placement rather than substituting in the wrong place.

### 2.5 `placeFunctionalRequirements`

```typescript
function placeFunctionalRequirements(bodyEl: unknown, record: unknown, sections: unknown, bodyDegraded: boolean): { placed: 'in-section' | 'prepended' | 'none'; degradation?: { degraded: boolean; notice: string } }
```

**Parameters:**
- `bodyEl: HTMLElement` — The body container (#insrc-docs-body) as already rendered by renderMarkdownBody and stamped by stampSlugs.
- `record: FunctionalDefinition | undefined` — The posted record, or undefined when the document carries none.
- `sections: SectionIndex | undefined` — The index posted on the same message, used only to find the section's slug.
- `bodyDegraded: boolean` — Whether renderMarkdownBody fell back to plain text — taken from its returned degradation, not re-inferred.

**Returns:** `{ placed: 'in-section' | 'prepended' | 'none'; degradation?: RenderDegradation }` — Which of the three outcomes occurred, and a notice when the reviewer needs to be told the requirements are not where the document puts them. `placed` is returned so the behaviour is directly assertable in a test rather than inferred from the resulting DOM.

**Errors:**
- `none-thrown` when Every failure resolves to `placed:'none'` or to the prepended fallback. Nothing this function does may prevent the document from being read.

**Preconditions:**
- Called from renderContent AFTER renderMarkdownBody and AFTER stampSlugs — the order matters and is a correctness constraint, not a style one: stampSlugs pairs rendered headings to posted anchors BY TITLE advancing a pointer through the index (docs-review-panel.ts:111-125), so running the substitution first would remove content the stamper walks and could mis-pair every heading after it.

**Postconditions:**
- ABSENT (ac4): when `record` is undefined or `record.requirements` is empty, the function returns `{ placed:'none' }` having created NO element, removed nothing and reserved no space — the body is byte-identical to what s1 renders. This is the dominant path: 4 of 634 ledger artifacts carry the record.
- IN-SECTION (ac1, the normal present case): when the body rendered structurally and `frAnchorSlug` resolves to a slug that `bodyEl` actually has a heading for, the heading's following siblings are removed UP TO BUT NOT INCLUDING the next heading of equal-or-shallower level, and the rendered container is inserted in their place. The heading element, its text, its number and its stamped slug are left untouched, so the section chooser, the anchor target and any future `ofSectionId` resolution keep working with no change to sc3 at all.
- The removal is BOUNDED by that next-heading rule and by the end of the container. A document whose functional-requirements section is followed by further sections keeps every one of them — this is the single destructive operation on the surface and the bound is the thing a test must prove, not assume.
- PREPENDED (the fallback): when a record is present but the substitution cannot be performed — the body degraded to plain text and so has no heading elements, or the anchor does not resolve, or no heading element carries the slug — the rendered container is inserted as the FIRST child of the body instead, so the requirements remain legible. This is what makes the degraded path an improvement rather than a gap: there the body is raw markdown source, and the constructed rendering is the reviewer's only readable access to the commitments.
- The prepended case returns a degradation ONLY when the body itself rendered fine — i.e. the document has requirements whose section could not be located, which is an otherwise-silent anomaly the reviewer should know about. When the body was already degraded, s1's DEGRADE_NOTICE is showing and covers it, so no second notice is produced and the notice area never stacks.
- Idempotent per render: renderContent rebuilds the body from scratch on every docs-content message, so placement never sees a previously placed container.

### 2.6 `renderContent`

```typescript
function renderContent(m: { markdown?: string; sections?: SectionIndex; degradation?: RenderDegradation; functionalDefinition?: FunctionalDefinition; openQuestions?: readonly string[]; blocked?: boolean; commentable?: boolean; artifactId?: string }): void
```

**Parameters:**
- `m: the docs-content message payload` — Unchanged apart from the one additive field this Story forwards.

**Returns:** `void` — Renders the whole surface for one opened document.

**Errors:**
- `none-added` when The placement call cannot throw, so no new guard is introduced around it.

**Preconditions:**
- Invoked only from the existing window message listener on a `docs-content` message — unchanged.

**Postconditions:**
- The call order becomes: renderMarkdownBody → stampSlugs → placeFunctionalRequirements → renderSectionChooser → renderDegradationNotice → open questions → controls. Placement sits after stamping (so slugs are on the headings it looks for and the stamper is not walking a mutated tree) and before the chooser and the notice (so the chooser is gated on the stamped count, which placement does not change, and the notice can carry a placement degradation).
- The chooser's gate is unaffected: placement never adds or removes a heading element, so `stamped` means exactly what it meant in s1.
- Notice precedence is a strict extension of s1's rule, not a replacement: a host-posted degradation wins, then the body renderer's own, then — only if neither declared one — a placement degradation. A reviewer is therefore never shown two notices and never shown none when something went wrong.
- Everything else on the surface — open questions, the blocked banner, approve, request-changes, the COMMENTABLE_KINDS gate — is untouched, preserving s1's obligation that the approval path behave identically.

## 3. Data model changes

### 3.1 `HostToWebview (the `docs-content` variant)` — field-add

One optional field, `functionalDefinition`, appended to the existing docs-content variant — no new message type, exactly as S001/t5 appended `sections` and `degradation` to this same variant rather than minting a second message. Its type is INDEXED off the client type (`DocsContent['functionalDefinition']`), which is itself indexed off the daemon's `ArtifactReviewView['functionalDefinition']`, so the record's shape is declared once in src/workflow/artifacts/functional-definition.ts and the three layers physically cannot drift. Optional with `| undefined` per the repo's exactOptionalPropertyTypes setting, and populated by a conditional spread so absence is an absent key.

```
// vscode-plugin/src/chat/protocol.ts — docs-content variant, existing fields unchanged
  | {
      readonly type: 'docs-content';
      readonly artifactId: string;
      readonly markdown: string;
      readonly openQuestions: readonly string[];
      readonly blocked: boolean;
      readonly commentable?: boolean;
      readonly sections?: SectionIndex | undefined;
      readonly degradation?: RenderDegradation | undefined;
+     // S002 (additive, SAME message). The artifact's functional record, forwarded
+     // verbatim from DocsContent. Indexed off the client type so this declaration
+     // cannot drift from the daemon's projection. Absent key when the document
+     // carries none — which is the common case.
+     readonly functionalDefinition?: DocsContent['functionalDefinition'];
    }
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts:70-86 — the variant being extended`
- `vscode-plugin/src/chat/docs-review-panel.ts:246-259 — openDoc's post, the only producer`
- `vscode-plugin/src/chat/docs-review-panel.ts:354 — renderContent, the only consumer`
- `vscode-plugin/src/chat/docs-review-client.ts:24-37 — DocsContent, the type source being indexed`

### 3.2 `FunctionalDefinition / FunctionalRequirement` — invariant-change

NO change to the type and no change to any producer — the Epic's generation-side non-goal rules that out. What changes is where the record's invariants are relied upon. validateFunctionalDefinition (functional-definition.ts:54-78) enforces well-formed ids, unique ids and resolvable itemRefs at ASSEMBLY time, inside the daemon, before an artifact is persisted; it is not on the read path, and sc1 projects the body verbatim with no validation. This Story therefore treats the record as STRUCTURALLY UNTRUSTED on arrival: a missing statement, a non-string id, a duplicate id, a per-item requirement with no itemRef and a requirements array that is not an array are all shapes the renderer must survive. That is a change in what the read side may assume, recorded here because it is the assumption most likely to be made silently and wrongly. Equally recorded: the absent-safe convention the record's own module states twice (:58, :88) — `undefined` OR an empty requirements array is ABSENT — is adopted unchanged as this Story's ac4 gate, so client and daemon agree on what 'has no functional requirements' means.

**Call sites:**
- `src/workflow/artifacts/functional-definition.ts:26-40 — the record types`
- `src/workflow/artifacts/functional-definition.ts:54-78 — assembly-time validation, NOT on the read path`
- `src/workflow/artifact-content.ts:184 — structuredRecords, the verbatim unvalidated projection`
- `src/workflow/artifacts/functional-definition.ts:87-110 — the prose rendering this Story replaces on screen`

## 4. Diagrams

- [Sequence diagram](docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consumed exactly as s1 shipped it, with no widening. The host reads `content.functionalDefinition` off the DocsContent the existing `workflow.artifactContent` call already returns — no new IPC method, no second read surface, no extra round trip, and no read of any file beyond the artifact JSON the daemon already opens (k2, k7). The record is forwarded by reference without reshaping, defaulting or validation, which is what sc1's verbatim-projection rule requires and is also what makes the character-for-character guarantee survivable: anything this Story did to the record on the way through would be a place for an identifier to change. The absent-key convention sc1 established is carried one hop further, from the IPC boundary across the postMessage boundary, so `=== undefined` is the single absence test at every layer. Nothing on the daemon side changes in this Story — sc1's implementation is untouched. |
| `sc2` | consumes | This Story is the FIRST implementer of sc2's published `StructuredRenderer<T>`, which s1 exported and deliberately left unimplemented. `renderFunctionalRequirements` is written as `StructuredRenderer<FunctionalDefinition>` and takes its signature from the ratified form in LLD-bfe98ff7f97178cf-s1 — `(record) => { el, degradation? }` — NOT from the HLD's sc2 interfaceSketch, which still reads `=> HTMLElement` and is stale. sc2's hard rule is honoured literally: the renderer builds DOM and sets textContent, assigns no markup anywhere, and the body's single `el.innerHTML=marked.parse` remains the one injection site on the surface — the pinned count of one is unchanged, and the ban on insertAdjacentHTML / outerHTML / document.write is unchanged. The webview code is carried as a third exported source string inlined into the same single nonce'd script, so the CSP is not widened by one character and the behaviour is proved by `new Function` evaluation against a DOM stub rather than by grepping the shell — the discipline s1 adopted after this repo shipped a webview contract that string assertions pronounced green while the behaviour was wrong. ONE DELIBERATE CONTRACT-TEST CHANGE is required and is in scope: the s1 test asserting that no file declares `: StructuredRenderer<` was written to hold only until the first implementer arrived, and this Story is that implementer, so it becomes an assertion that the type is exported AND implemented here — the same kind of explicit, recorded narrowing k1 required for the body renderer, never an incidental relaxation. Note on what is NOT consumed: sc2's placement is s2-private, so the in-section substitution, the prepended fallback and the placement notice are this Story's own decisions, taken inside the boundary that grants s2 'the visual separation from surrounding prose' and 'the decision to render nothing at all when functionalDefinition is absent'. |

## 6. Error paths

**Error cases**

- **The body could not be rendered structurally — the vendored `marked` global is missing or its parse threw — so the body container holds the raw markdown source as a single text node and contains no heading elements at all. There is nothing to substitute under.** (recoverable)
  - Detection: Not re-inferred: `renderMarkdownBody` already returns `{ el, degradation }` and renderContent already holds that result, so the degraded flag is passed into `placeFunctionalRequirements` as `bodyDegraded`. The placement code never re-tests for the vendored global or re-parses anything; one path decides degradation and one value carries it.
  - Response: Take the prepended fallback: insert the constructed container as the body's FIRST child, ahead of the plain-text node. Return `placed:'prepended'` with NO degradation of its own, because s1's DEGRADE_NOTICE is already being shown for this document and a second notice would stack two messages about one failure.
  - User impact: A clear improvement over s1 on this path rather than a gap. The body is unreadable markdown source here — requirements appear as literal `- **E2026…:FR001** — …` noise — so the constructed block is the reviewer's only legible access to the commitments, and it carries the identifiers exactly. The reviewer is still told, by the existing notice, that the structured view of the document was unavailable.
- **The document carries a functional record but no section can be identified for it — a per-repo or per-user format override renamed the `Functional requirements` heading, or the section is genuinely absent from the body even though the record is present.** (recoverable)
  - Detection: `frAnchorSlug(sections)` returns `undefined` after scanning every posted anchor for a title whose tail matches the format spine's heading text. The scan is over the posted SectionIndex, not over the DOM, so it is decided before anything is touched.
  - Response: Prepend the constructed container and return a placement degradation — `{ degraded:true, notice:<placement notice> }` — which renderContent shows because neither the host nor the body renderer declared one. Nothing is removed from the body.
  - User impact: The reviewer sees every requirement, legibly and with exact identifiers, above the document, and is told they are not in their document position. This is the one case where silence would be genuinely misleading: the body rendered perfectly, so without a notice the reviewer would have no way to tell the block was displaced rather than designed that way.
- **The anchor resolves to a slug, but no heading element in the rendered body carries it — `stampSlugs` left that heading unstamped because the rendered heading text did not match the indexed anchor title (it pairs by title, advancing a pointer, and deliberately leaves an unmatched heading unstamped rather than mis-stamping it).** (recoverable)
  - Detection: A lookup for the slug SCOPED TO THE BODY CONTAINER returns nothing. Scoped deliberately rather than via a document-wide id lookup, so an element elsewhere on the surface that happened to share the id could never be mistaken for the section heading and then have its siblings deleted.
  - Response: Identical to the previous case: prepend, notice, remove nothing.
  - User impact: Same as above — requirements shown, displaced, and the displacement declared.
- **The record survives the read path structurally malformed — `requirements` is not an array (an object, a string, or null). This is reachable, not hypothetical: `validateFunctionalDefinition` runs at ASSEMBLY time inside the daemon and sc1 projects `body.functionalDefinition` verbatim with no validation on the read path, so whatever the body holds arrives here.** (recoverable)
  - Detection: An `Array.isArray(record.requirements)` test in the absent-safe gate, before any iteration. This repo has already shipped exactly this bug once — an unguarded `childrenOf` in the UX companion threw on a malformed `items` and took the whole generated document down — so the guard is specified here rather than discovered later.
  - Response: Treat the record as ABSENT: return `placed:'none'`, construct nothing, remove nothing, show no notice. A record that is not a record is indistinguishable from no record, and the surface's rule for no record is to show no area.
  - User impact: The document reads exactly as it does today. No crash, no empty frame, no partial list. The malformed record is a producer-side defect that this read-only surface should survive silently rather than editorialise about.
- **An individual requirement entry is malformed — not an object, or missing a string `id` or a string `statement` — while its siblings are well formed.** (recoverable)
  - Detection: Per-entry `typeof` checks while building the container: an entry is rendered only if it is a non-null object whose `id` and `statement` are both strings. The check is per entry, not a whole-record precondition, so one bad entry cannot disqualify the rest.
  - Response: Skip that entry and render the others. If NO entry survives, the container is empty and placement treats it exactly as absent — `placed:'none'`, nothing inserted — rather than inserting an empty box.
  - User impact: The reviewer sees every requirement the document actually carries. A dropped entry is invisible on this surface, which is the correct trade: fabricating a placeholder for an entry with no statement would show the reviewer a commitment that does not exist, and this Story's whole premise is that what the reviewer reads is what the document carries.
- **An unanticipated throw inside placement — a DOM method the webview host does not provide, an element shape the code did not expect — after the body has already been rendered.** (recoverable)
  - Detection: Two layers. Structurally, the code is ORDERED so that nothing is removed until everything is built: the sibling range is computed and the full container is constructed BEFORE the first removal, so a construction throw happens while the document is still intact. Behaviourally, renderContent wraps the single placement call in a try/catch.
  - Response: On a throw, leave the body exactly as `renderMarkdownBody` and `stampSlugs` produced it and continue to the chooser, the notice, the open questions and the controls. The catch is a backstop for the one destructive operation on this surface, not a substitute for the ordering that makes it almost unreachable.
  - User impact: The reviewer reads the document in its s1 form — full prose, full navigation, approval path intact. The worst outcome of this Story's failure is the behaviour that shipped last week, never a half-removed section or a blank pane.
- **The content fetch failed, so the host took the fail-closed arm and posted `blocked:true` with a placeholder body.** (recoverable)
  - Detection: No detection is needed in the placement code, and that is the point: the failure arm posts no `functionalDefinition` at all, so the absent-safe gate stops at its first test.
  - Response: `placed:'none'`. No requirements are shown.
  - User impact: A reviewer who never saw the body is never shown requirements extracted from it. Showing a tidy, authoritative-looking list of commitments beside a 'unavailable' body would be the most dangerous thing this Story could do — it would make an unreadable document look reviewable, and approve is already suppressed precisely so it is not approved.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A document whose body carries NO functionalDefinition at all — every HLD, LLD, PLAN, BUILD, CR, ISSUE, SPEC, AMD and EXT in the ledger, and 27 of 31 DEFs. | Nothing happens. No element is created, no DOM is read beyond the single absent-safe test, no space is reserved, no heading, no border, no notice — the rendered surface is byte-identical to what s1 produces. This is ac4 and it is the DOMINANT path, not an edge: 4 of 634 ledger artifacts carry the record, so the absent case is what a reviewer sees on essentially every open and the test suite must treat it as the main case. |
| A record present but with `requirements: []`. | Identical to absent. The record's own module states this convention twice — `undefined` OR an empty array is absent (functional-definition.ts:58 and :88) — and this Story adopts it unchanged so the client and the daemon cannot disagree about what 'carries no functional requirements' means. |
| The functional-requirements section is followed by further sections — the normal DEF shape, where it sits between `Problem` and `Non-goals`. | The removal is bounded to the siblings between the section heading and THE NEXT HEADING ELEMENT OF ANY LEVEL, and that next heading and everything after it survive untouched. This TIGHTENS the rule sketched in the contract step, which said equal-or-shallower: any-level is chosen deliberately because it guarantees that no heading element is ever removed, and therefore that the section chooser can never be left offering an entry whose target no longer exists. The generated FR section contains no sub-headings — it groups per-item requirements under bold `**<itemRef>:**` lines, not headings — so the tighter rule removes exactly the same content on every real document while being safe on documents it was not designed for. |
| The functional-requirements section is the LAST section in the document. | Removal runs to the end of the body container and stops. No off-the-end read, no throw. |
| A record of only doc-scope requirements (no `scope:'item'` entries) — or conversely, only item-scope entries. | Only the groups that have content are rendered. No empty doc-level area when every requirement is per-item, and no group headers when every requirement is doc-level. An empty group is the same defect as an empty section, one level down. |
| A requirement with `scope:'item'` whose `itemRef` is missing or empty — which `validateFunctionalDefinition` would have rejected at assembly, and which therefore reaches the read path only on a record that was persisted before that check or by a producer that bypassed it. | Grouped under a single unassigned bucket, matching exactly what renderFunctionalRequirementsSection already does with the same input (functional-definition.ts:99 keys it to `(unassigned)`). The two renderings of the same record must not disagree about where an orphan requirement belongs — agreeing with the existing behaviour is cheaper and more honest than inventing a second convention. |
| A record containing two requirements with the SAME FrId — another assembly-time rejection that the unvalidated read path can still deliver. | BOTH are rendered, in record order, neither dropped and neither merged. The surface's job is to show what the document carries; silently collapsing a duplicate would hide a genuine producer-side defect from the one person positioned to catch it — the reviewer at the approval gate. |
| An identifier containing markdown-active characters — `*`, `_`, backtick, `[` — or a statement containing `<script>alert(1)</script>` or an HTML entity. | Rendered character-for-character via textContent, with no parsing and no escaping artefacts, and nothing becomes markup or an attribute. This is the ac2 PROOF case and the whole reason the Story exists: the same id routed through the markdown path (prose generation, then marked's inline parser, then the guardMd scrub) can be silently reformatted, and the current FrId grammar being free of those characters is a property of today's minter, not a guarantee the display layer is entitled to rely on. |
| A document whose markdown contains the text `## Functional requirements` INSIDE a fenced code block — for instance an LLD quoting the format spine. | No phantom section. `deriveSectionIndex` already skips fenced regions with CommonMark-correct fence matching, so the posted index carries no anchor for it and `frAnchorSlug` finds nothing. This Story adds no second scanner of its own precisely so this behaviour cannot drift — it consumes sc3's index as the single source of section identity. |
| A document with two headings whose titles both end in `Functional requirements` (a format override that repeats the section, or an authored heading that collides). | The FIRST in document order is used. `deriveSectionIndex` already disambiguates identical slugs with an ordinal suffix and drops neither, so both remain navigable; placement simply never has an ambiguous target. |
| An upstream DEF and a downstream document that both carry the requirement `E20260929bfe98ff7:S002:FR001`. | The same identifier string is displayed in both, because the rendering is a pure function of the record and the id is copied, never derived, formatted or re-minted. This is ac3, and it holds for the same reason ac2 does. |
| A very large record — well beyond the 20 requirements this Epic's own DEF carries. | Synchronous construction of one element per requirement, with no pagination, no virtualisation and no truncation. The record is bounded by what an artifact body holds and the pane already parses the entire markdown of the same document synchronously; truncating would hide commitments from the reviewer, which is the one thing this surface must not do. |

**Invariants to preserve**

- The pane shows the document AS WRITTEN. `renderedMarkdown` is the artifact's own .md read verbatim (artifact-content.ts:52, :138-140) and nothing on the read path edits it — this Story does not trim the markdown, does not re-render it on the daemon side, and changes nothing a producer emits. The substitution operates on the RENDERED DOM and swaps one generated projection of the record for another projection of the SAME record, carrying id, statement, rationale and the doc/item grouping across losslessly, so no content a human authored is hidden. A reviewer approving a document has still been shown that document. [[c3]]
- Each requirement's identity is preserved exactly as the document carries it. The identifier is copied from `FunctionalRequirement.id` and written with textContent, never re-derived from rendered prose, never re-minted, never reformatted — which is what makes the same commitment recognisable in the upstream and the downstream document, and traceable to the completion check that reads the same record. [[c8]]
- The surface fabricates nothing for an absent record. No heading, no frame, no placeholder, no reserved space — the absent case is literally the untouched s1 code path. This matters disproportionately because absence is what nearly every document shows: 4 of 634 ledger artifacts carry a functional record. [[c4]]
- Markup is injected at exactly ONE site on this surface — the body's `el.innerHTML=marked.parse`, guarded by guardMd with a textContent fallback. Everything this Story adds is DOM construction with textContent; it assigns no markup, builds no attribute from record data, and uses no insertAdjacentHTML, outerHTML or document.write. The single-nonce strict CSP is not widened by one character, and the test that counts injection sites must still count one. [[c2]]
- The read path stays additive. The record arrives on the response `workflow.artifactContent` already returns and travels on the docs-content message the host already posts — no new IPC method, no parallel read surface, no second round trip, no file read beyond the artifact JSON. Absence stays an ABSENT KEY at every layer, so `=== undefined` is the one absence test from the daemon projection to the webview. [[c7]]
- The approval path behaves identically. Approve, request-changes, the COMMENTABLE_KINDS gate, the blocked banner and the fail-closed suppression after a content-load failure are untouched by this Story, and the fail-closed arm in particular posts no record — so a reviewer who could not read the body is never shown a tidy list of commitments extracted from it. [[c5]]
- The markdown, the section index derived from it and now the functional record all ride ONE message, so they can never be paired across two different documents. This Story adds its field to that same message rather than minting a second one, inheriting the property instead of re-establishing it. (It inherits the known limitation too: `openDoc` still takes no sequence number, so a slow first open can display the wrong document — a pre-existing gap tracked as its own bugfix, deliberately not fixed here.) [[c7]]
- Section identity has exactly one source. Slugs come from `deriveSectionIndex`, are stamped onto headings by `stampSlugs`, and are what an `ofSectionId` resolves against. This Story READS that identity to locate the section and mints none of its own; it never adds, removes or re-stamps a heading element, so the chooser's stamped-count gate means exactly what it meant in s1 and no chooser entry can be left pointing at a target that no longer exists. [[c2]]

## 7. Test strategy

**Test framework:** `node:test via `npx tsx --test`, run from vscode-plugin/ — the framework every suite in src/chat/__tests__/ uses (docs-review-panel.test.ts 788 lines, docs-sections.test.ts 202, docs-review-client.test.ts 223). Webview code is proved by `new Function` evaluation against a hand-built DOM stub, never by asserting on the emitted HTML string; the fast loop is `npx tsx --test 'src/chat/__tests__/docs-review-panel.test.ts'`.`

**Test levels**

- **unit** — Execute the webview renderer and its placement logic directly, against a DOM stub, so every branch is RUN rather than grepped for. This is the level that carries the Story: this repo shipped a webview contract that string assertions pronounced green while the behaviour was wrong, and S001 answered that by evaluating DOCS_BODY_RENDERER_SOURCE and DOCS_SECTIONS_SOURCE with `new Function`. The same harness extends to DOCS_FR_SOURCE — a `loadFr()` beside the existing `loadRenderer()` and `loadSections()`.
  - Subjects: `renderFunctionalRequirements — one discrete element per requirement; every string written via textContent and NO property assignment that could carry markup; id, statement and rationale all present; doc-level items first, then per-item requirements grouped under their itemRef`, `renderFunctionalRequirements on hostile content — an id containing `*`, `_`, backtick and `[`, and a statement containing `<script>alert(1)</script>`, asserted to come back out of the stub character-for-character identical to the input string`, `renderFunctionalRequirements on a malformed record — `requirements` not an array, an entry that is not an object, an entry with a non-string id or statement, a `scope:'item'` entry with no itemRef, and two entries sharing one FrId`, `frAnchorSlug — matches an anchor whose title ends with the heading text under the engine's numeric prefix (`2. Functional requirements`), ignores case and surrounding whitespace, returns the first of two matches in document order, and returns undefined for an undefined index, an empty index and a renamed heading`, `placeFunctionalRequirements — all three outcomes (`in-section`, `prepended`, `none`) asserted through the returned discriminator AND through the resulting stub tree, including the degradation it does and does not return`
  - Fixtures: `An extension of the existing `node()` stub builder that models a parent with ordered children plus `insertBefore` / `removeChild` / `firstChild`, and a heading child carrying an `id` — enough for the sibling walk and the bounded removal, and no more`, `A record fixture taken from this Epic's OWN DEF (DEF-bfe98ff7f97178cf, 20 requirements: 6 doc-level plus per-item groups under s1..s4) rather than a hand-invented one, so the shape under test is a shape the ledger actually contains`, `A deliberately hostile record whose ids and statements carry markdown-active and HTML-active characters — the ac2 proof fixture`, `A malformed-record fixture set, written as a table so each malformation is one row`
- **integration** — Prove the record actually travels from the daemon response to the webview on the existing message, and that the whole render pipeline composes in the required order. The unit level proves the renderer is correct; this level proves it is reached, and reached with the right thing.
  - Subjects: `openDoc — a client whose content() returns a record posts docs-content carrying `functionalDefinition` with the SAME reference and no reshaping, asserted through the existing `openAndGetContent` helper`, `openDoc absence — a client returning no record posts a message with NO `functionalDefinition` KEY at all (`'functionalDefinition' in payload === false`), not a key holding undefined; the absent-key convention is the one sc1 established and it must survive the postMessage hop`, `openDoc fail-closed — a client whose content() rejects posts `blocked:true` and carries no record`, `The shell's bootstrap — DOCS_FR_SOURCE is inlined into the single nonce'd script, and the placement call sits AFTER stampSlugs and BEFORE renderSectionChooser / renderDegradationNotice`, `Notice precedence — a host-posted degradation wins over a body degradation wins over a placement degradation, and exactly one notice is ever rendered`
  - Fixtures: `The existing fakeChannel / fakeClient doubles and the `openAndGetContent(markdown)` helper, extended to let the fake client return a functionalDefinition`
- **contract** — Hold the surface-wide invariants that this Story is most likely to erode, and record the one contract-test change it deliberately makes. These are the assertions that catch a future change, not this one.
  - Subjects: `The emitted shell still contains EXACTLY ONE `.innerHTML=` and it is still `el.innerHTML=marked.parse`; still no insertAdjacentHTML, outerHTML or document.write anywhere — the existing assertion, re-run against a shell that now carries a third source string`, `DOCS_FR_SOURCE itself contains no markup-assignment of any kind — asserted on the constant, with comments stripped first, because a source scan that reads prose has produced three false results in this repo already`, `THE DELIBERATE CHANGE: S001's assertion that no file declares `: StructuredRenderer<` is rewritten, not deleted. It becomes: the type is still exported, and it is implemented in exactly one place — the functional-requirements renderer — with the other listed files still declaring none. The test was written to hold only until the first implementer arrived; this Story is that implementer, and the replacement must keep failing if a renderer appears somewhere unsanctioned`, `The protocol's docs-content variant types `functionalDefinition` by INDEXING off DocsContent (which indexes off ArtifactReviewView), so the three layers cannot drift — asserted as a type-level compile check plus a source assertion that the annotation is the indexed form rather than a restated shape`, `docs-sections.ts is unchanged and still has zero imports — this Story consumes section identity and mints none`
- **unit** — Prove the one destructive operation is bounded. Separated from the renderer level because this is where a defect would be worst and least visible: a removal that runs too far deletes document content the reviewer is about to approve.
  - Subjects: `Bounded removal — a body whose FR section is followed by two further sections keeps BOTH, with every sibling after the next heading untouched and the heading elements themselves never removed at any level`, `Removal to end — an FR section that is the last section removes to the end of the container without an off-the-end read or a throw`, `Heading preservation — the section's own heading element, its text and its stamped id are identical before and after, so the chooser entry and the anchor target still resolve`, `Ordering — placement runs after stampSlugs: a test that stamps, places, then re-reads every heading id proves no slug was disturbed`, `Build-before-mutate — a record that makes construction throw leaves the body COMPLETELY unmodified (nothing removed), proving the ordering rather than relying on the catch`, `The renderContent try/catch backstop — a forced throw inside placement still renders the chooser, the notice, the open questions and the approve / request-changes controls`
  - Fixtures: `A body-stub fixture whose children are a realistic rendered DEF: h1, p, h2(problem), p, h2(functional-requirements), ul, h2(non-goals), ul, h2(stories), h3, p — so 'the next heading of any level' is exercised by an h3 as well as an h2`
- **unit** — Verify by MUTATION that each new test can actually fail. Every claim below is only worth what its falsifier proves, and three vacuous tests have shipped green in this repo inside one week — one asserting an item was done when it was never implemented, and a sibling asserting the opposite of its own story's behaviour.
  - Subjects: `Delete the absent-safe gate -> the ac4 test must fail (it currently passes trivially, which is exactly the shape a vacuous test takes)`, `Replace textContent with a string-concatenation assignment -> the hostile-id test must fail`, `Flatten the doc/item grouping -> the grouping test must fail`, `Change the removal bound from 'next heading of any level' to 'end of container' -> the bounded-removal test must fail`, `Move the placement call before stampSlugs -> the ordering test must fail`, `Make frAnchorSlug match on exact equality instead of the title tail -> the numbered-heading test must fail`, `Return a degradation from the prepended-after-body-degraded path -> the no-stacked-notice test must fail`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: renderFunctionalRequirements builds ONE discrete element per requirement — asserted as a count against the record's length and as distinct sibling nodes, not as a substring of the rendered text`, `unit: doc-level requirements render first and per-item requirements are grouped under their itemRef, matching the grouping the record carries — falsified by flattening`, `unit: the constructed items carry their own class so they are styled distinctly from body prose, asserted on the elements rather than on the whole document (a whole-document assertion is unsound here — the stylesheet and the surrounding prose legitimately contain the same words)`, `unit (bounded removal): after an in-section placement, the body contains the constructed container and NOT the prose list that was there, so the items are separated from the surrounding prose by the prose being gone rather than merely by styling`, `integration: the shell wires the placement into renderContent so the substitution actually happens on an opened document` |
| `ac2` | `unit: an id containing `*`, `_`, backtick and `[` comes out of the stub byte-identical to the record's value — the central falsifiable claim of this Story, and the one that fails the moment a string concatenation or a parse is introduced`, `unit: every string the renderer writes goes through textContent; the test inspects the stub's recorded property writes and asserts no markup-bearing property was ever assigned`, `unit: a statement containing `<script>alert(1)</script>` is rendered as text and creates no child element`, `contract: DOCS_FR_SOURCE contains no markup assignment (comments stripped before scanning), and the shell's injection-site count is still exactly one`, `mutation: replacing textContent with a concatenated-markup assignment must turn the hostile-id test red` |
| `ac3` | `unit: rendering the SAME requirement record twice — standing in for an upstream and a downstream document — yields the identical id string in both, asserted by equality against the record's own value, since the rendering is a pure function of the record`, `unit: a record fixture taken from this Epic's real DEF renders `E20260929bfe98ff7:S002:FR001` exactly, with no prefix stripped, no ordinal renumbered and no segment reformatted`, `unit: the renderer sorts, deduplicates and renumbers nothing — output order equals record order, so the same commitment occupies a recognisable place in both documents`, `integration: the record forwarded on docs-content is the same reference the client returned, so nothing between the daemon projection and the renderer can alter an identifier` |
| `ac4` | `unit: an undefined record yields `placed:'none'`, zero createElement calls on the stub and zero mutations of the body — asserted as the absence of any DOM activity, not merely as the absence of a visible section`, `unit: a record with `requirements: []` behaves identically to undefined, pinning the absent-safe convention the record's own module states`, `unit: a malformed record (`requirements` not an array) is also treated as absent — no empty frame, no partial list`, `unit: a record whose every entry is malformed produces an empty container which placement treats as absent, so nothing is inserted`, `integration: opening a document with no record produces a shell whose body is byte-identical to the s1 rendering of the same markdown — the strongest available statement of 'no area at all', and the dominant path (4 of 634 ledger artifacts carry the record)`, `integration: the posted message has no `functionalDefinition` KEY, so absence is absent rather than undefined-valued`, `mutation: deleting the absent-safe gate must turn the ac4 test red — without this, a test that passes by doing nothing proves nothing` |

## 8. Migration

**State before:** The daemon side is already done and shipped: `ArtifactReviewView` carries `functionalDefinition` projected verbatim from the artifact body by `structuredRecords` (src/workflow/artifact-content.ts:184), with no validation and with absence expressed as an absent key; `DocsContent` mirrors it indexed off the daemon type and `content()` forwards it with the same conditional spread (vscode-plugin/src/chat/docs-review-client.ts:24-37, :96-114). The record therefore reaches the extension host on every open and is DROPPED there — `openDoc` (docs-review-panel.ts:241-274) posts only `{ artifactId, markdown, openQuestions, blocked, commentable, sections, degradation? }`, and the docs-content variant in protocol.ts:70-86 has no field to carry it. What the reviewer sees instead is the record's PROSE projection: `renderFunctionalRequirementsSection` (functional-definition.ts:87-110) generates one markdown bullet per requirement in the form `- **<id>** — <statement> _(<rationale>)_`, the format engine supplies the numbered heading via `frBodyLines` (format/bindings.ts:24) and the `fr` section spec (format/formats.ts:36), and `renderedMarkdown` is that .md read verbatim (artifact-content.ts:52, :138-140). So requirements are already visible and already identified — but by a string that has passed through prose generation, marked's inline parser and the guardMd scrub, and on the degraded path by raw markdown source. `StructuredRenderer<T>` is exported at docs-review-panel.ts:155-161 and implemented nowhere, pinned by a test asserting exactly that (docs-review-panel.test.ts:427-439).

**State after:** The record travels one hop further — onto the existing docs-content message — and the webview renders it where the document puts it. On a document carrying requirements, the generated bullet list beneath the document's own `Functional requirements` heading is replaced by one constructed element per requirement, each identifier written with textContent straight off `FunctionalRequirement.id`, with the record's doc-level / per-item grouping preserved and the heading, its number and its stamped slug untouched. On a document carrying none — the state of 630 of the 634 ledger artifacts — absolutely nothing changes: no element is created and the body is byte-identical to the s1 rendering. When the body degraded to plain text, or the section cannot be located, the block is prepended to the body instead so the requirements stay legible, and the reviewer is told why in the second case. `StructuredRenderer<T>` has its first implementation and its pinning test is rewritten to say so. No daemon code, no generation-side code and no persisted artifact changes at all.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional `functionalDefinition` field to the docs-content variant of `HostToWebview`, typed by INDEXING off `DocsContent['functionalDefinition']` rather than restating the record shape, so protocol → client → daemon stay one declaration deep. Purely a type addition — nothing reads or writes it yet, and no existing consumer is affected because the field is optional. — ↩ rollbackable
2. Forward the record in `openDoc`: spread `functionalDefinition` onto the posted message only when `content.functionalDefinition !== undefined`, exactly as `degradation` is already spread, so an absent record stays an ABSENT KEY across the postMessage boundary. The webview ignores a field it has no code for, so after this step behaviour is unchanged and the data is in place. — ↩ rollbackable
3. Add the new webview source string holding the renderer, the anchor lookup and the placement logic, and inline it into the shell's single nonce'd script after the two existing source strings. Still inert — it defines functions and nothing calls them — so the surface is unchanged and the injection-site count is verifiably still one before any behaviour flips. — ↩ rollbackable
4. Call placement from `renderContent`, positioned after `stampSlugs` and before the chooser and the notice, wrapped in the backstop catch. This is the step that changes what a reviewer sees, and it is deliberately last and single-line: reverting this one call restores the shipped behaviour exactly while leaving the data path, the types and the renderer in place. — ↩ rollbackable
5. Rewrite the S001 contract test that asserts no file declares `: StructuredRenderer<`. It becomes: the type is still exported, it is implemented in exactly one place — the functional-requirements renderer — and the other listed files still declare none. Recorded as a deliberate, scoped narrowing rather than a deletion, mirroring how the no-innerHTML assertion was narrowed for the body renderer; it must still fail if a renderer appears somewhere unsanctioned. — ↩ rollbackable
6. Rebuild and reinstall the VS Code extension (esbuild bundle + VSIX). There is NO daemon rebuild in this Story — nothing under src/ changes — which is a smaller deployment than S001 required and worth stating plainly so the wrong artefact is not shipped. — ↩ rollbackable

**Backward compat:** No public API changes and nothing to migrate. The one type change is an optional field on an internal host→webview message that exists only inside this extension, so there is no external consumer and no versioning concern; the JetBrains review panel reads the daemon IPC, which this Story does not touch at all. Across the IPC boundary the compatibility that matters was already established by sc1 and is merely consumed here: all four projected fields are optional, absence is an absent key, and an older client reading a newer daemon response ignores fields it does not know — so an extension built before this Story and one built after both work against the same daemon, and this extension works against a daemon older than sc1 (it simply never receives a record and renders exactly as S001 does). Forward compatibility is deliberate too: a producer that starts emitting `functionalDefinition` on an HLD, LLD or PLAN — which the format spine already declares an `fr` section for, though no such artifact exists today — needs no change here, because the renderer keys off the record's presence and never off the artifact kind.

## 9. Alternatives considered

### 9.1 a1: In-place DOM substitution under the document's own Functional requirements heading — **CHOSEN**

The body renders as today, then the record-built items REPLACE the prose nodes beneath the document's own `Functional requirements` heading — one rendering, in the place the document put it.

The docs-content message gains one additive field, `functionalDefinition`, posted from `content.functionalDefinition` exactly as t5 added `sections` and `degradation` to the same message — no new message type, absent stays an absent key. In the webview, renderContent keeps its existing order: renderMarkdownBody writes the body, stampSlugs stamps the heading ids. A new webview function then walks the rendered body for the heading element whose stamped slug matches the FR section (identified from the posted `sections` index by the anchor whose title ends with `Functional requirements`, since the engine prefixes a position-dependent number), removes that heading's following siblings up to the next heading of equal-or-shallower level, and appends in their place a DOM-constructed list built from the record: one item per requirement, each carrying its `id` set by textContent and its `statement`, with per-item requirements grouped under their `itemRef`. The document's heading, its number and its anchor are left untouched, so the section chooser keeps working with no change at all. The renderer is written against the shipped `StructuredRenderer<FunctionalDefinition>` shape, returning `{ el, degradation }`, and carried as a third exported source string beside DOCS_BODY_RENDERER_SOURCE / DOCS_SECTIONS_SOURCE so it is inlined into the one nonce'd script and `new Function`-evaluated by tests. When the record is absent, or when the heading cannot be located, nothing is removed and nothing is constructed — the body stands exactly as s1 renders it.

### 9.2 a2: Split render — the body is rendered in two passes around a record-built block

The markdown is split at the FR section boundary and rendered as two body fragments, with the DOM-constructed requirements block mounted between them, so nothing is ever rendered and then removed.

Same additive `functionalDefinition` field on docs-content. In the webview, renderContent splits the markdown string at the FR section's line boundaries — everything before the heading, and everything from the next equal-or-shallower heading onward — then calls the EXISTING renderMarkdownBody twice, into two sibling containers inside #insrc-docs-body, and mounts the DOM-constructed requirements block (heading included, built by textContent from the document's own heading text) between them. The split is computed from the raw markdown with the same ATX scanning discipline docs-sections.ts already uses, including its fenced-code guard, so a `#` inside a code sample cannot cause a false split. stampSlugs runs across the composed container so every heading in both fragments still receives its slug, and the constructed heading is stamped with the slug the index already assigned the FR section. Because the injection site is a single call site in the source (renderMarkdownBody's one `el.innerHTML=marked.parse`), calling it twice leaves the pinned exactly-one-injection-site count untouched.

**Rejected because:** a2 reaches the same reviewer-visible outcome as a1 and avoids the render-then-remove flash, which is a genuine advantage. It loses on two specifics rather than on taste. First, the sc2 score: it duplicates boundary-scanning logic that s1 deliberately made single-sourced, in a context (the ES5 webview source string) that structurally cannot import the single source — so the duplication is permanent, not a refactor away. Second, its own fourth con is self-defeating: because the FR heading is excised with the section, a2 must RECONSTRUCT that heading from the posted index, which means s2 re-deriving the document's heading text and its position-dependent number. The boundary's one hard obligation is that s2 reproduce identity from the record rather than re-derive it from rendered prose; a2 honours that for the id and then breaks it for the heading. a1 simply leaves the real heading element in place.

### 9.3 a3: Host-side excision plus a dedicated structured region

The host strips the FR section from the markdown whenever it also posts a non-empty record, and the webview renders the record into its own fixed region above the body.

Same additive `functionalDefinition` field, but the host does more: in openDoc, when the content carries a non-empty record, it removes the FR section's lines from the markdown before posting and derives the section index from the TRIMMED markdown, so index and body still travel together and still agree. The webview gains one fixed host div (`#insrc-docs-fr`) in the shell, filled by a DOM-constructing renderer written against `StructuredRenderer<FunctionalDefinition>`; the div stays completely empty — no heading, no border, no reserved space — when no record is posted. Everything about the region's layout and the per-requirement item shape is s2-private, as the boundary allows.

**Rejected because:** a3 scores clean on all four acceptance criteria and still ranks last, which is the clearest signal in this comparison that acceptance criteria are not the only constraints in play. It is eliminated on the sc1 violation, not on preference: having the host rewrite renderedMarkdown breaks the verbatim-source-of-truth property sc1 is built on and k4 states outright, and it does so invisibly — the reviewer cannot tell the body has been edited. The sc2 partial compounds it: the section index derived from the trimmed text loses the FR anchor, so navigation silently stops offering a real section, and the only repair available to s2 would be to mint section identity that sc3 owns. Every benefit a3 offers — one rendering, in a clean independent region, with simple webview logic — is available from a1 at the cost of DOM surgery and from a2 at the cost of a second scanner, neither of which requires editing the document.

### 9.4 a4: Pure supplement — a structured region alongside an untouched body

The record is rendered into its own region and the document body is left exactly as s1 renders it, accepting that each requirement is shown twice.

The minimal shape. The additive `functionalDefinition` field is posted on docs-content; the shell gains one empty host div; a DOM-constructing renderer written against `StructuredRenderer<FunctionalDefinition>` fills it from the record, with one item per requirement, the id set by textContent, and per-item requirements grouped under their itemRef. The body, the section index, the chooser, the degradation notice and the approval controls are untouched. When the record is absent the div stays empty and nothing is constructed.

**Rejected because:** a4 is the smallest, safest diff and scores clean on ac3, ac4, sc1 and sc2 — it is a defensible choice and would ship without incident. It is ranked third on the two acceptance criteria the Story actually exists for. ac1 and ac2 both score partial for the same underlying reason: a4 adds a correct rendering without removing the incorrect-by-this-Story's-standard one, so the surface ends up carrying two renderings of the same commitments and the character-for-character guarantee covers only one of them. Given that the feature fires on roughly four documents in the entire ledger, doubling the requirement text on exactly those four is a conspicuous cost for a Story whose whole purpose is to make commitments easier to read. Its one real advantage is worth preserving in whatever wins: on the degraded path, where the body is raw markdown source, a record-built rendering is the only legible form of the requirements.

## 10. UX

- [UX mock](docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/S002/ux-mock.html)

## 11. References

- **[[c1]]** `code` `src/workflow/artifacts/functional-definition.ts:23-40` — "FunctionalRequirement { id, statement, rationale?, scope, itemRef? } and FunctionalDefinition { requirements }"
- **[[c2]]** `code` `src/workflow/artifacts/functional-definition.ts:54-78` — "validateFunctionalDefinition runs at assembly time, not on the read path"
- **[[c3]]** `code` `src/workflow/artifacts/functional-definition.ts:87-110` — "renderFunctionalRequirementsSection generates the markdown bullet list this Story replaces on screen"
- **[[c4]]** `code` `src/workflow/artifacts/format/bindings.ts:14-29` — "frBodyLines strips the hard-coded heading so the engine can supply a numbered one"
- **[[c5]]** `code` `src/workflow/artifacts/format/formats.ts:36` — "S({ id: 'fr', heading: 'Functional requirements', source: 'fr' })"
- **[[c6]]** `code` `src/workflow/artifact-content.ts:49-62,138-140,184` — "renderedMarkdown is the .md read verbatim; structuredRecords projects the body records without validation"
- **[[c7]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:24-37,96-114` — "DocsContent indexes its four records off ArtifactReviewView and forwards them with an absent-key spread"
- **[[c8]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:241-274` — "openDoc posts docs-content and currently drops the record"
- **[[c9]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:76-108,111-145,155-161` — "DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE and the published StructuredRenderer<T>"
- **[[c10]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:354-374` — "renderContent, the webview render pipeline this Story inserts one call into"
- **[[c11]]** `code` `vscode-plugin/src/chat/docs-sections.ts:32-39,86-125,136-149` — "deriveSectionIndex / createSectionResolver — the single source of section identity, zero imports"
- **[[c12]]** `code` `vscode-plugin/src/chat/protocol.ts:70-86` — "the docs-content variant, extended additively by S001/t5 with sections and degradation"
- **[[c13]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:318-342,427-439,575-589,698-703` — "the eval-against-a-DOM-stub harness, the StructuredRenderer pinning test and the single-injection-site count"
- **[[c14]]** `prior-artifact` `LLD-bfe98ff7f97178cf-s1` — "the ratified widening of the renderer return to { el, degradation }, superseding the HLD sc2 sketch"
- **[[c15]]** `prior-artifact` `DEF-bfe98ff7f97178cf` — "20 functional requirements — 6 doc-level plus per-item groups under s1..s4 — the real record fixture this Story renders"
- **[[c16]]** `analyze-bundle` `s1 data-model.trace over .insrc/artifacts/*.json` — "4 of 31 DEFs carry a functionalDefinition; HLD 0/30, LLD 0/190, PLAN 0/155 — absence is the dominant path"
- **[[c17]]** `prior-artifact` `ISSUE-605c70574633ed67` — "openDoc has no supersede guard — pre-existing, tracked separately, deliberately not fixed here"

## 12. Open questions

- RATIFY REPLACING THE BODY'S GENERATED FR PROSE (s8 graded sbdry3 `passed` with a recorded caveat — this is the LLD's load-bearing decision, not a detail). The chosen alternative a1 replaces, in the rendered DOM, the markdown bullet list beneath the document's own `Functional requirements` heading with a record-built rendering of the SAME requirements. The argument for it: that prose is itself GENERATED from the record (renderFunctionalRequirementsSection; the producing Epic's k2 forbids hand-authoring it), all four fields plus the doc/item grouping carry across losslessly, the markdown the daemon sends is not altered, and k4 ('the document body remains the authoritative content and a companion is always shown as a referenced adjunct') is about COMPANIONS, which this Story renders none of. The argument against it: a reviewer reads a body that is not a one-to-one rendering of the markdown, and a broader reading of k4 would forbid that. Review should either ratify a1 as written, or require the pure-supplement shape a4 (ranked third, scores recorded) — the whole LLD below the choice is unaffected except that the in-section placement and its bounded removal would drop out.
- CHECKLIST PROVENANCE AND SCORING GAPS, recorded so review judges them rather than discovering them (s8 graded cd1, cd2 and alt2 `partial`). (a) cd1: three of the six api names — `DOCS_FR_SOURCE`, `frAnchorSlug`, `placeFunctionalRequirements` — are NEW, since a Story that adds code must add names; each is anchored to a located symbol (the DOCS_*_SOURCE family at docs-review-panel.ts:76/:111, sc3's SectionIndex at docs-sections.ts:32-39, the body container rendered by DOCS_BODY_RENDERER_SOURCE), and `renderFunctionalRequirements` is sc2's published `StructuredRenderer<T>` applied to `FunctionalDefinition`. (b) cd2: `placeFunctionalRequirements`'s type-level signature declares `unknown` for its DOM and record parameters and `renderFunctionalRequirements` returns `el: unknown`, because this code lives in an exported SOURCE STRING with no TypeScript boundary of its own and is tested against a DOM stub that is deliberately not an HTMLElement — sc2's own published type already makes this choice. Concrete types are given per parameter. (c) alt2: all four alternatives were scored against every Story acceptance criterion and both shared contracts (24 scores), but Epic constraints k1-k7 were not re-scored as their own rows; they appear inside the notes and rationales, and the decisive eliminations are explicit — a3 on an sc1 violation, a4 on ac1/ac2 partials.

## Resolved questions

- `q365d9f24` — RATIFY REPLACING THE BODY'S GENERATED FR PROSE (s8 graded sbdry3 `passed` with a recorded caveat — this is the LLD's load-bearing decision, not a detail). The chosen alternative a1 replaces, in the rendered DOM, the markdown bullet list beneath the document's own `Functional requirements` heading with a record-built rendering of the SAME requirements. The argument for it: that prose is itself GENERATED from the record (renderFunctionalRequirementsSection; the producing Epic's k2 forbids hand-authoring it), all four fields plus the doc/item grouping carry across losslessly, the markdown the daemon sends is not altered, and k4 ('the document body remains the authoritative content and a companion is always shown as a referenced adjunct') is about COMPANIONS, which this Story renders none of. The argument against it: a reviewer reads a body that is not a one-to-one rendering of the markdown, and a broader reading of k4 would forbid that. Review should either ratify a1 as written, or require the pure-supplement shape a4 (ranked third, scores recorded) — the whole LLD below the choice is unaffected except that the in-section placement and its bounded removal would drop out.
  - **resolved**: Ratify a1 as written (in-section replacement) — Ratified in-chat after the choice was presented explicitly at the approval gate. The replaced prose is itself generated from the record by one deterministic function that the producing Epic forbids hand-authoring, so the carry-across is lossless by construction and nothing a human wrote is hidden; the daemon's markdown is unaltered; and k4's clause binds companions, which this Story renders none of. The parity-gate variant was considered and rejected on its own terms: enforcing parity at render time means PARSING the rendered bullet list to compare it against the record, which is precisely the second prose-derived scanner that alternative a2 was eliminated for, and it would insure a premise the single generator already guarantees. The disclosure variant adds scope for a reader the default path already serves. _(2026-10-01T13:53:04.075Z)_

## Citations

- **[[c1]]** `code` `src/workflow/artifacts/functional-definition.ts:23-40` — "FunctionalRequirement { id, statement, rationale?, scope, itemRef? } and FunctionalDefinition { requirements }"
- **[[c2]]** `code` `src/workflow/artifacts/functional-definition.ts:54-78` — "validateFunctionalDefinition runs at assembly time, not on the read path"
- **[[c3]]** `code` `src/workflow/artifacts/functional-definition.ts:87-110` — "renderFunctionalRequirementsSection generates the markdown bullet list this Story replaces on screen"
- **[[c4]]** `code` `src/workflow/artifacts/format/bindings.ts:14-29` — "frBodyLines strips the hard-coded heading so the engine can supply a numbered one"
- **[[c5]]** `code` `src/workflow/artifacts/format/formats.ts:36` — "S({ id: 'fr', heading: 'Functional requirements', source: 'fr' })"
- **[[c6]]** `code` `src/workflow/artifact-content.ts:49-62,138-140,184` — "renderedMarkdown is the .md read verbatim; structuredRecords projects the body records without validation"
- **[[c7]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:24-37,96-114` — "DocsContent indexes its four records off ArtifactReviewView and forwards them with an absent-key spread"
- **[[c8]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:241-274` — "openDoc posts docs-content and currently drops the record"
- **[[c9]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:76-108,111-145,155-161` — "DOCS_BODY_RENDERER_SOURCE, DOCS_SECTIONS_SOURCE and the published StructuredRenderer<T>"
- **[[c10]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:354-374` — "renderContent, the webview render pipeline this Story inserts one call into"
- **[[c11]]** `code` `vscode-plugin/src/chat/docs-sections.ts:32-39,86-125,136-149` — "deriveSectionIndex / createSectionResolver — the single source of section identity, zero imports"
- **[[c12]]** `code` `vscode-plugin/src/chat/protocol.ts:70-86` — "the docs-content variant, extended additively by S001/t5 with sections and degradation"
- **[[c13]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:318-342,427-439,575-589,698-703` — "the eval-against-a-DOM-stub harness, the StructuredRenderer pinning test and the single-injection-site count"
- **[[c14]]** `prior-artifact` `LLD-bfe98ff7f97178cf-s1` — "the ratified widening of the renderer return to { el, degradation }, superseding the HLD sc2 sketch"
- **[[c15]]** `prior-artifact` `DEF-bfe98ff7f97178cf` — "20 functional requirements — 6 doc-level plus per-item groups under s1..s4 — the real record fixture this Story renders"
- **[[c16]]** `analyze-bundle` `s1 data-model.trace over .insrc/artifacts/*.json` — "4 of 31 DEFs carry a functionalDefinition; HLD 0/30, LLD 0/190, PLAN 0/155 — absence is the dominant path"
- **[[c17]]** `prior-artifact` `ISSUE-605c70574633ed67` — "openDoc has no supersede guard — pre-existing, tracked separately, deliberately not fixed here"
