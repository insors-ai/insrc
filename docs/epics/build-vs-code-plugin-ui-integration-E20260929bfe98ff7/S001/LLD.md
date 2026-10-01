<!-- insrc:artifact LLD-bfe98ff7f97178cf-s1 -->

# LLD: E20261001bfe98ff7:S001

## Summary

**Epic:** `build-vs-code-plugin-ui-integration`
**HLD base run:** `wf-1790840477406-bic923`
**HLD effective hash:** `33e859ffd0be...`

This Story replaces the one line that flattens a generated document into plain text, and lays the three foundations the rest of the Epic reads. The document body now renders through the markdown bundle the plugin already ships, guarded by the same scrub-and-fall-back sequence the chat panel uses, so headings and lists arrive as real elements rather than a wall of text. Section identity is derived once as a plain host-side function and posted alongside the body, which both gives the reviewer a working jump-to-section and gives the later Stories a single importable way to place a companion beside the section it belongs to. The daemon side is one additive widening of the artifact-content response — four optional fields carried verbatim off the body — so nothing new is asked of the server and existing readers are unaffected.

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

**Rollout phase:** Phase A — projection, render discipline, section identity
**Owns:** `sc1` (ArtifactReviewView structured projection), `sc2` (Review-surface render discipline), `sc3` (Section anchor model)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Everything about how a functional requirement looks is private to s2: the per-requirement item layout, the visual separation from surrounding prose, the placement of the identifier relative to the statement, and the decision to render nothing at all when functionalDefinition is absent. s2 owns no contract because no other Story displays the functional record — s3 and s4 render visuals, not requirements. s2's one hard obligation comes from sc2: identifiers are written via textContent straight off the FunctionalRequirement record, never re-derived from rendered prose, which is what makes k5's character-for-character guarantee hold across upstream and downstream documents.
- `s3`: The diagram renderer itself is private to s3: which vendored diagram library is bundled, how an ErDefinition's classes and slots are walked into that library's input, the diagram's own sizing and theming within its slot, and how a render throw is caught and converted into sc4's 'unshowable' state. s3 publishes only the slot contract, not its diagram internals — so s4 reuses the frame without inheriting any diagram-specific decision. The VSIX size cost of the bundled renderer is s3's to carry and report. — owns `sc4`
- `s4`: The Adaptive Cards subset renderer is private to s4: which card element types are supported, how an unsupported element degrades, and the mock's internal layout and theming within its slot. Also private is the dual-presence arrangement — how a diagram slot and an experience slot sit together when a document carries both — which s4 decides because it is the only Story that can observe both at once; it does so using the labels sc4 already derives from each ref, so the structural-versus-experience distinction ac2 requires needs no new contract.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ArtifactReviewView`

```typescript
export interface ArtifactReviewView {
	readonly artifactId:       string;
	readonly kind:             string;
	readonly renderedMarkdown: string;
	readonly openQuestions:    readonly OpenQuestionRef[];
	readonly approvable:       boolean;
	readonly blockReason?:     string | null;
	readonly functionalDefinition?: FunctionalDefinition | undefined;
	readonly erDefinition?:         ErDefinition | undefined;
	readonly uxDefinition?:         UxDefinition | undefined;
	readonly companions?:           readonly CompanionArtifactRef[] | undefined;
}
```

**Returns:** `interface` — The artifact-content response shape. The six existing members keep their exact meaning; the four appended members are optional and carry the matching body record verbatim, absent when the body omits it.

**Preconditions:**
- The artifact JSON has already been parsed into its body by handleArtifactContent; no additional read is performed to populate the new fields.

**Postconditions:**
- An absent body field projects as an absent view field — never null, never an empty object — so a consumer's `=== undefined` check is the single absence test.
- No existing member is renamed, retyped or given a new meaning, so a consumer that deserializes only the original six is unaffected.
- A PLAN body carries functionalDefinition too, so the field is not gated on artifact kind.

### 2.2 `handleArtifactContent`

```typescript
export function handleArtifactContent(req: WorkflowArtifactContentRequest): ArtifactReviewView | ArtifactContentError
```

**Parameters:**
- `req: WorkflowArtifactContentRequest` — The existing { repo, mdPath } request; unchanged by this Story.

**Returns:** `ArtifactReviewView | ArtifactContentError` — The widened view on success, or the existing structured error arm unchanged.

**Errors:**
- `ArtifactContentError` when Unchanged from today — repo unresolved, unreadable store, or a path-guard refusal. The four new fields introduce no new failure mode because they are read off an already-parsed object.

**Preconditions:**
- Called only through the existing 'workflow.artifactContent' registration at src/daemon/index.ts:698-700; no new IPC method is added.

**Postconditions:**
- The four new fields are copied off the parsed body without validation beyond shape, so a malformed record travels to the client rather than failing the read — keeping ac3's 'never refuse to open' guarantee at the daemon boundary too.
- No file outside the artifact JSON is read, so the 3.37MB companion payload never enters the response.

### 2.3 `MarkdownBodyRenderer`

```typescript
export type MarkdownBodyRenderer = (markdown: string) => { readonly el: HTMLElement; readonly degradation: RenderDegradation }
```

**Parameters:**
- `markdown: string` — The document body, taken verbatim from ArtifactReviewView.renderedMarkdown.

**Returns:** `{ el: HTMLElement; degradation: RenderDegradation }` — The rendered body element plus whether the structured presentation succeeded. Widened from the HLD sketch's bare HTMLElement so ac3's notice is carried by the contract rather than inferred by each caller.

**Preconditions:**
- The vendored markdown bundle has been injected into the surface's single nonce'd script tag.

**Postconditions:**
- This is the ONLY place on the surface that assigns markup; it MUST run vendored-parse then the guard scrub, and MUST fall back to textContent when the parse throws.
- On the fallback path the full body text is still present in the returned element — degraded means 'shown as plain text', never 'shown partially' or 'not shown'.
- Heading elements carry the slugs deriveSectionIndex produced for the same markdown, so an anchor target always matches a posted anchor.

### 2.4 `RenderDegradation`

```typescript
export interface RenderDegradation {
	readonly degraded: boolean;
	readonly notice:   string;
}
```

**Returns:** `interface` — Whether the structured presentation was unavailable, and the reviewer-facing sentence saying so. One shape so ac3's notice is a contract rather than per-Story copy.

**Postconditions:**
- `degraded: false` pairs with an empty notice; a non-empty notice never accompanies a successful render.
- The notice is set by textContent, never as markup.

### 2.5 `StructuredRenderer`

```typescript
export type StructuredRenderer<TRecord> = (record: TRecord) => HTMLElement
```

**Parameters:**
- `record: TRecord` — One structured body record. s1 publishes the shape only; s2/s3/s4 supply the concrete renderers for functionalDefinition, erDefinition and uxDefinition respectively.

**Returns:** `HTMLElement` — A DOM subtree built by construction.

**Postconditions:**
- An implementation MUST build DOM and set textContent; it may not assign markup, which is what keeps the surface's single injection site single as later Stories land.

### 2.6 `SectionAnchor`

```typescript
export interface SectionAnchor {
	readonly slug:  string;
	readonly title: string;
	readonly level: number;
}
```

**Returns:** `interface` — One heading in the rendered body. `slug` is simultaneously the anchor target and the value an ofSectionId is matched against — one identity, two consumers.

**Postconditions:**
- `slug` is unique within a document: repeated identical headings are disambiguated by an appended ordinal, so a chooser entry can never be ambiguous.
- `title` is the heading's text verbatim, so the chooser shows what the document says.
- `level` is the ATX depth, 1-6.

### 2.7 `SectionIndex`

```typescript
export interface SectionIndex {
	readonly anchors: readonly SectionAnchor[];
}
```

**Returns:** `interface` — The document's headings in document order, derived once per opened document and posted alongside the body.

**Postconditions:**
- Order is document order, so a chooser rendered straight from the array needs no sorting.
- A document with no headings yields an empty anchors array, and the chooser is then omitted entirely rather than rendered empty.

### 2.8 `SectionResolver`

```typescript
export type SectionResolver = (ofSectionId: string | undefined) => string | undefined
```

**Parameters:**
- `ofSectionId: string | undefined` — A CompanionArtifactRef.ofSectionId value, or undefined when the ref targets no section.

**Returns:** `string | undefined` — The slug of the matching section in THIS document, or undefined when the id names no present section.

**Preconditions:**
- Built from a SectionIndex for the same document whose body is being rendered.

**Postconditions:**
- Returns undefined rather than throwing for an unknown id, so a stale companion reference degrades to unanchored rather than crashing the render — the mitigation the HLD's risky-bits prescribed.
- Published for s3 and s4 so companion placement resolves against the same identity the body navigation uses; neither Story re-derives it.

### 2.9 `deriveSectionIndex`

```typescript
export function deriveSectionIndex(markdown: string): SectionIndex
```

**Parameters:**
- `markdown: string` — The document body, the same string handed to MarkdownBodyRenderer.

**Returns:** `SectionIndex` — The anchors for this markdown. The single sc3 implementation: the body renderer's slugs and the companion placer's resolution both originate here.

**Preconditions:**
- Pure — no DOM, no vscode import, no IO — so it is unit-testable in node:test and importable by s3 and s4.

**Postconditions:**
- Headings inside fenced code blocks are NOT treated as headings, so a `#` in a code sample cannot produce a phantom chooser entry.
- Called once per opened document; the result is posted with the content rather than recomputed per interaction.
- Deterministic: the same markdown always yields the same slugs, which is what lets a companion's ofSectionId be resolved stably across renders.

### 2.10 `createDocsReviewHost`

```typescript
export function createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost
```

**Parameters:**
- `deps: DocsReviewHostDeps` — The existing injected seam (createPanel, client, renderStyle, theme, logger, genNonce); unchanged in shape by this Story.

**Returns:** `DocsReviewHost` — The existing { open, dispose } host. Its external shape does not change.

**Preconditions:**
- Constructed inside the insrc.chat.enabled gate as today.

**Postconditions:**
- The pending-list behaviour, the monotonic refresh guard, the stale-id checks, the COMMENTABLE_KINDS gate and the fail-closed approve suppression are all behaviourally unchanged — ac5 and lc1.
- openDoc now computes a SectionIndex and posts it with the content; nothing else about the message flow changes.
- The surface still emits exactly one script tag and keeps its CSP unwidened.

### 2.11 `DocsContent`

```typescript
export interface DocsContent {
	readonly markdown: string;
	readonly openQuestions: readonly string[];
	readonly blocked: boolean;
	readonly functionalDefinition?: FunctionalDefinition | undefined;
	readonly erDefinition?: ErDefinition | undefined;
	readonly uxDefinition?: UxDefinition | undefined;
	readonly companions?: readonly CompanionArtifactRef[] | undefined;
}
```

**Returns:** `interface` — The client-side adaptation of the widened view. s1 adds the four pass-through fields so s2/s3/s4 have them without re-touching the client; s1 itself consumes only `markdown`.

**Postconditions:**
- Mapping is pass-through: the client does not reshape, validate or default the four records, so a later Story reads exactly what the daemon projected.
- The existing three members keep their current meaning, so the existing client tests continue to pin them.

## 3. Data model changes

### 3.1 `ArtifactReviewView` — field-add

Four optional members appended — functionalDefinition, erDefinition, uxDefinition, companions — each carrying the matching body record verbatim. Additive only: the six existing members are untouched in name, type and meaning, so the JetBrains panel is unaffected. Verified not merely asserted: DaemonGateway.kt:1517 parseView builds ArtifactReviewViewDto by pulling six named keys field-by-field out of a Map<String, Any?>, with no reflective bind and no unknown-key rejection, so additional keys on the wire are ignored.

```
+ readonly functionalDefinition?: FunctionalDefinition | undefined;
+ readonly erDefinition?:         ErDefinition | undefined;
+ readonly uxDefinition?:         UxDefinition | undefined;
+ readonly companions?:           readonly CompanionArtifactRef[] | undefined;
```

**Call sites:**
- `src/workflow/artifact-content.ts`
- `src/daemon/index.ts`
- `vscode-plugin/src/chat/docs-review-client.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`

### 3.2 `DocsContent` — field-add

The client-side content shape gains the same four optional pass-through members plus nothing else. s1 consumes only `markdown`; the records are carried so s2/s3/s4 need no further client change, which is what keeps Phase B and C off this file.

```
+ readonly functionalDefinition?: FunctionalDefinition | undefined;
+ readonly erDefinition?:         ErDefinition | undefined;
+ readonly uxDefinition?:         UxDefinition | undefined;
+ readonly companions?:           readonly CompanionArtifactRef[] | undefined;
```

**Call sites:**
- `vscode-plugin/src/chat/docs-review-client.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`

### 3.3 `HostToWebview` — field-add

The existing docs-content message variant gains the posted section index and the degradation state. No new message TYPE is introduced — the index rides the message the pane already sends on open, so the webview's single message handler keeps its existing switch and the enveloped postMessage contract is unchanged.

```
  | { readonly type: 'docs-content'; readonly artifactId: string; readonly markdown: string;
      readonly openQuestions: readonly string[]; readonly blocked: boolean; readonly commentable?: boolean;
+     readonly sections?: SectionIndex | undefined;
+     readonly degradation?: RenderDegradation | undefined; }
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`

### 3.4 `SectionAnchor` — new

New internal-shared record published by sc3: slug, title, level. Carries no persistence — derived per open and discarded with the panel, consistent with the pane persisting nothing.

```
+ export interface SectionAnchor { readonly slug: string; readonly title: string; readonly level: number; }
+ export interface SectionIndex  { readonly anchors: readonly SectionAnchor[]; }
```

**Call sites:**
- `vscode-plugin/src/chat/docs-review-panel.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 is the declared owner. Implemented as a pure widening of ArtifactReviewView in src/workflow/artifact-content.ts, populated inside the existing handleArtifactContent from the body it already parses, and surfaced through the already-registered 'workflow.artifactContent' handler at src/daemon/index.ts:698-700 — no new IPC method, no second read surface, no file read beyond the artifact JSON. All four members are optional and absent-preserving, which is how k2's extend-don't-replace rule and k7's unchanged-existing-consumers obligation are both discharged. The client half mirrors it as four pass-through members on DocsContent so s2, s3 and s4 consume the records without re-opening docs-review-client.ts. |
| `sc2` | implements | s1 is the declared owner. The body render becomes the surface's single markup-injection site, running the sanctioned sequence — vendored parse, guard scrub, textContent on throw — reusing the bundle the plugin already ships rather than adding a dependency; the vendored source prepends into the existing single nonce'd script tag exactly as the chat panel does, so the one-script invariant and the CSP both hold unchanged. MarkdownBodyRenderer is widened from the HLD's bare HTMLElement to return the RenderDegradation alongside it, so ac3's notice is carried by the contract instead of each caller inferring it — a strengthening within the contract's intent, not a change to its boundary. The deliberate contract-test change k1 requires follows the shipped precedent rather than the HLD's original count-based sketch: assert the GUARD IS PRESENT (as chat-panel.test.ts:1242 does) instead of asserting the primitive is absent, which cannot pass if the scrub is removed; the test is also renamed to describe what it actually checks, so it does not inherit the stale-name drift that precedent carries. |
| `sc3` | implements | s1 is the declared owner. Landed as the three published declarations plus one pure host-side function, deriveSectionIndex, which is the single origin of section identity: the body renderer stamps its slugs onto the rendered headings and the SectionResolver matches ofSectionId against the same anchors, so body navigation and companion placement cannot drift — the failure the HLD's risky-bits singled out as the Epic's quietest. Being pure and vscode-free it is unit-testable without a DOM and importable by s3 and s4, which is why identity is derived host-side rather than read back from the rendered DOM. It supplies anchor identity itself rather than inheriting it, because the shipped marked config sets headerIds:false. The resolver returns undefined for an unknown id rather than throwing, and the deriver skips fenced code blocks so a `#` in a code sample cannot become a phantom chooser entry. |

## 5. Error paths

**Error cases**

- **The markdown parse throws while rendering the document body — malformed content, or a pathological input the vendored parser rejects.** (recoverable)
  - Detection: The parse-and-assign is wrapped in try/catch at the single injection site, exactly as the shipped sequence does; the catch arm is what notices, not a pre-validation of the markdown.
  - Response: The catch arm sets the body element's textContent to the raw markdown, so the full document is still present as readable text, and returns RenderDegradation { degraded: true, notice } alongside it. The notice is rendered by textContent above the body.
  - User impact: The reviewer sees the whole document as plain text plus one sentence saying the structured presentation was unavailable — never a blank pane and never a refusal to open. They can still read and still approve.
- **The vendored markdown global is missing at render time — the bundle failed to inject, or the script was truncated.** (recoverable)
  - Detection: The render site tests for the global and its parse function before calling it (the `typeof marked !== 'undefined' && marked && marked.parse` form the shipped sequence already uses) rather than assuming presence and relying on a thrown TypeError.
  - Response: Falls through to the same textContent path as a parse throw, with the same degraded notice. No separate code path and no separate message, so the two failures cannot diverge in behaviour.
  - User impact: Identical to a parse failure — full text plus a notice. A packaging regression degrades reading rather than breaking the pane.
- **A companion reference names a section id that is not present in the document being rendered — a stale ofSectionId after the document was re-authored.** (recoverable)
  - Detection: SectionResolver looks the id up in the SectionIndex derived for THIS document and finds no match, returning undefined.
  - Response: Returns undefined rather than throwing. s1's own responsibility ends there; the contract documents that a consumer renders the companion unanchored rather than dropping it. s1 adds no placement behaviour of its own, since placement belongs to s3 and s4.
  - User impact: None for s1's acceptance criteria. For the later Stories a stale reference costs the companion its position beside a section, not its visibility — and never a crashed render.
- **The artifact body carries a structured record whose shape does not match its declared type — a hand-authored uxDefinition that breaks its schema, for instance.** (recoverable)
  - Detection: Not detected by s1, deliberately. handleArtifactContent copies the four records off the parsed body without validating beyond shape, and the client maps them pass-through.
  - Response: The malformed record travels to the client untouched. s1 renders only the markdown body, so nothing in this Story reads it; the Story that owns that record decides how to degrade. This is a conscious non-detection — validating here would duplicate the generation-side gate and could refuse to open a document the reviewer needs to read.
  - User impact: None in Phase A: the document opens and reads normally. The record's own renderer handles it when Phase B or C lands.
- **A content fetch fails while a document is being opened.** (recoverable)
  - Detection: Unchanged from today — the existing catch around client.content() in openDoc.
  - Response: Unchanged: posts the inline unavailable text with blocked:true so approve stays suppressed. s1 must not alter this arm; the degraded-render notice is a DIFFERENT state (body present but unstructured) and must not be conflated with it (body never arrived).
  - User impact: Unchanged from today. The distinction matters: a reviewer must be able to tell 'I am reading this document in a plainer form' from 'I never received this document'.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A document whose body contains no headings at all. | deriveSectionIndex returns an empty anchors array, and the section chooser is omitted entirely rather than rendered as an empty control. The body renders normally; ac2 has nothing to offer and says nothing. |
| A document containing a fenced code block whose content includes a line starting with `#`. | deriveSectionIndex does NOT treat it as a heading, so it produces no chooser entry. This is the one real divergence risk between a host-side scan and the parser's own view, and skipping fenced regions is how the chosen alternative closes it. |
| Two headings with identical text at the same level. | Both appear in the chooser with distinct slugs, disambiguated by an appended ordinal, and each navigates to its own occurrence. No entry is dropped and no slug collides. |
| A heading whose text is entirely punctuation or non-alphanumeric, so the slug body would be empty. | A stable non-empty slug is still produced (ordinal-based), so the entry remains navigable; the chooser shows the heading's verbatim text as its label even though the slug bears no resemblance to it. |
| A very long document — hundreds of headings. | The index is derived once per open, not per interaction, and travels on the existing message; rendering stays one synchronous parse plus DOM construction. No pagination or virtualisation is introduced, as nothing in the Story's criteria asks for it. |
| A document that is approved or re-fetched while the reviewer is reading it, so a newer content response arrives. | The existing monotonic refresh guard drops the superseded response as it does today; a stale section index can never overwrite a newer one because it rides the same message the guard already protects. |
| A DEF artifact, which carries functionalDefinition but never companions. | Opens and renders identically. The absent records project as absent through sc1, and s1 reads only the markdown, so artifact kind changes nothing about this Story's behaviour. |
| A document whose markdown is an empty string. | An empty body element and an empty index; no degraded notice, because nothing failed. The pane still opens and the approval controls behave exactly as today. |

**Invariants to preserve**

- The surface emits exactly ONE inline script tag and keeps its single-nonce strict CSP unwidened. Injecting the vendored markdown bundle must prepend into that existing tag rather than adding a second one — the combination is already proven to hold, since chat-panel.ts:561 does exactly `<script nonce="${nonce}">${MARKED_SRC}\n;${bootstrap}</script>` and six separate chat-panel assertions of scripts.length===1 pass against it. [[c2]]
- Markup is assigned at exactly one place on this surface — the document body — and that place must run the full sanctioned sequence: vendored parse, then the guard scrub, then textContent on throw. The guard is the load-bearing half; the narrowed contract test asserts the guard is PRESENT rather than asserting the primitive is absent, following chat-panel.test.ts:1242, because that form cannot pass if the scrub is removed. [[c2]]
- The reviewer's existing ability to list pending documents and complete the read-and-approve path is behaviourally unchanged. Concretely: the monotonic guard at docs-review-panel.ts:66/:75 with its supersede-drops at :78/:83; COMMENTABLE_KINDS at :25 consumed at :97 and :124; and the fail-closed rule at :111 setting blocked:true at :117/:139/:155, which already has a dedicated regression test at docs-review-panel.test.ts:179 that must stay green. [[c1]]
- The artifact-content response is extended additively only. All four new members are optional and absent-preserving, no existing member changes name, type or meaning, and no new IPC method or parallel read surface appears — the pane keeps reading through workflow.pending and workflow.artifactContent over the shared client. [[c7]]
- Existing consumers of the response keep working untouched. Verified rather than assumed: DaemonGateway.kt:1517 parseView constructs ArtifactReviewViewDto by pulling six named keys field-by-field out of a Map<String, Any?> — artifactId, kind, renderedMarkdown, openQuestions, approvable, blockReason — with no reflective bind and no unknown-key rejection, so additional keys on the wire are ignored by the JetBrains panel. [[c7]]
- All rendering runs locally inside the editor from the vendored bundle; no document content is sent to any external service, and no remote resource is loaded. The chat panel pins the equivalent guarantee with an explicit no-remote-origin assertion, which this surface should match. [[c9]]
- The document body remains the authoritative content. s1 renders the body first and the section chooser is an adjunct to it; nothing s1 adds can displace or truncate the body, and on the degraded path the full text is still present. [[c3]]
- The pane persists nothing. The section index is derived per open and discarded with the panel, alongside the existing in-memory-only pending map, so a reload re-derives everything from the daemon and no migration is implied. [[c1]]

## 6. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — Prove deriveSectionIndex — the sc3 implementation s3 and s4 will import — without a DOM or a webview harness. This is the level the chosen alternative exists to make possible, and it is where the Epic's quietest coupling gets real coverage rather than a string assertion.
  - Subjects: `deriveSectionIndex returns anchors in document order with level set to the ATX depth`, `deriveSectionIndex gives two identically-titled headings DISTINCT slugs via an appended ordinal, and neither entry is dropped`, `deriveSectionIndex does NOT treat a `#`-prefixed line inside a fenced code block as a heading (the phantom-section guard)`, `deriveSectionIndex returns an empty anchors array for markdown with no headings`, `deriveSectionIndex returns an empty anchors array for an empty-string body`, `deriveSectionIndex produces a stable NON-EMPTY slug for a heading whose text is entirely punctuation`, `deriveSectionIndex is deterministic — the same markdown yields identical slugs across repeated calls`, `a SectionResolver built from an index resolves a known ofSectionId to that section's slug`, `a SectionResolver returns undefined (never throws) for an ofSectionId naming no present section`, `the slug deriveSectionIndex emits for a heading is the SAME string the resolver returns for it — one identity, asserted directly, so body navigation and companion placement cannot drift`
  - Fixtures: `A small markdown fixture with nested heading levels, a duplicate heading pair, a fenced code block containing a `#` line, and a punctuation-only heading — one fixture covering every unit subject above`
- **contract** — Pin the rendering discipline on the generated shell. This replaces the blanket no-innerHTML assertion with the stronger assert-the-guard form, and keeps the invariants that assertion was protecting.
  - Subjects: `the rendered shell still emits EXACTLY ONE inline script tag after the vendored bundle is injected (matched with `<script\b` so the word boundary holds)`, `the CSP still pins script-src to the one generated nonce and is not widened`, `the shell still renders the class="insrc-term-review" surface`, `the shell contains a guardMd call — asserting the scrub is PRESENT rather than asserting innerHTML is absent, so the test cannot pass if the guard is removed`, `no remote resource is referenced by the shell (no src/href http(s) origin), matching the equivalent chat-panel guarantee`, `the docs-review host and client modules remain vscode-free (the existing module-purity test, unchanged)`, `RENAMED: the narrowed test's name describes what it actually asserts, so it does not inherit the stale-name drift the chat-panel precedent carries`
  - Fixtures: `The existing fakeChannel + fakeClient doubles and the fixed genNonce already used by docs-review-panel.test.ts`
- **integration** — Drive createDocsReviewHost over its injected seams to prove the end-to-end message flow: a content fetch produces a rendered body plus a posted section index, degradation is surfaced, and every pre-existing behaviour the Story must not disturb still holds.
  - Subjects: `opening a document posts a docs-content message carrying BOTH the markdown and a sections index derived from that same markdown`, `the posted index rides the EXISTING docs-content message — no new message type appears in the webview protocol`, `a document with no headings posts an empty anchors array and the shell renders no section chooser at all (not an empty control)`, `a body-render failure posts degradation { degraded: true, notice } with the full markdown still present — degraded means plainer, never partial`, `the degraded-render state is DISTINCT from the content-fetch-failure state: a render degradation does NOT set blocked, and a fetch failure does NOT claim a render degradation`, `the existing fail-closed rule still holds — a content-fetch failure posts blocked:true and approve stays suppressed (the existing docs-review-panel.test.ts:179 regression, kept green)`, `the monotonic refresh guard still drops a superseded response, so a slow open carrying a stale section index cannot overwrite a newer one`, `the COMMENTABLE_KINDS gate still restricts request-changes to DEF/HLD/LLD`, `approve and request-changes still call workflow.approve and workflow.resolveComment with unchanged parameters — ac5 asserted on the client calls, not just on the UI`, `the four structured records pass through DocsContent untouched — asserted by round-tripping a view carrying all four and reading them back unmodified, so s2/s3/s4 inherit a verified pass-through`
  - Fixtures: `An ArtifactReviewView fixture carrying all four structured records plus a multi-heading markdown body`, `A fakeClient variant whose content() rejects, for the fetch-failure arm`, `A markdown fixture that reliably fails the parse, for the degradation arm`
- **contract** — Pin the sc1 projection on the daemon side — that it is additive, absent-preserving, and introduces no new server capability.
  - Subjects: `handleArtifactContent projects functionalDefinition, erDefinition, uxDefinition and companions verbatim when the body carries them`, `an absent body field projects as an ABSENT view field — not null and not an empty object — so `=== undefined` is the single absence test`, `a DEF body (functionalDefinition only, never companions) projects exactly what it has and nothing more`, `a PLAN body's functionalDefinition projects too, so the field is not gated on artifact kind`, `the six pre-existing members keep their names, types and meanings — the existing artifact-content tests continue to pin them unchanged`, `no new IPC method is registered: 'workflow.artifactContent' remains the single read path and the daemon handler map gains nothing`, `a structured record whose shape is invalid still travels through rather than failing the read, so a malformed record cannot refuse to open a document`
  - Fixtures: `Artifact JSON fixtures per kind: a DEF (functionalDefinition only), an HLD carrying all four records, and one carrying a deliberately malformed uxDefinition`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: opening a document posts a docs-content message carrying both the markdown and a sections index derived from that same markdown`, `contract: the shell contains a guardMd call, proving the body goes through the vendored parse rather than being assigned as text`, `integration: the four structured records pass through DocsContent untouched (confirms the body is the only thing s1 itself renders)`, `manual: the rendered shell is screenshotted from the real generated html and read back, per this repo's practice of never signing off a pixel on a green suite — the only way to confirm headings, lists and emphasis actually read as visually distinct` |
| `ac2` | `unit: the slug deriveSectionIndex emits for a heading is the SAME string the resolver returns for it`, `unit: deriveSectionIndex returns anchors in document order with level set to the ATX depth`, `unit: two identically-titled headings get distinct slugs via an appended ordinal`, `integration: opening a document posts a sections index derived from that same markdown`, `integration: a document with no headings posts an empty anchors array and the shell renders no section chooser at all` |
| `ac3` | `integration: a body-render failure posts degradation { degraded: true, notice } with the full markdown still present`, `integration: the degraded-render state is distinct from the content-fetch-failure state`, `contract: handleArtifactContent lets a malformed structured record travel through rather than failing the read`, `unit: deriveSectionIndex returns an empty anchors array for an empty-string body (a degenerate document still opens)` |
| `ac4` | `contract: the rendered shell still emits exactly one inline script tag after the vendored bundle is injected`, `contract: the CSP still pins script-src to the one generated nonce and is not widened`, `contract: no remote resource is referenced by the shell`, `contract: no new IPC method is registered — 'workflow.artifactContent' remains the single read path`, `contract: the docs-review host and client modules remain vscode-free` |
| `ac5` | `integration: approve and request-changes still call workflow.approve and workflow.resolveComment with unchanged parameters`, `integration: the existing fail-closed rule still holds — a content-fetch failure posts blocked:true and approve stays suppressed`, `integration: the COMMENTABLE_KINDS gate still restricts request-changes to DEF/HLD/LLD`, `integration: the monotonic refresh guard still drops a superseded response`, `contract: the six pre-existing ArtifactReviewView members keep their names, types and meanings` |

## 7. Migration

**State before:** The artifact-content response carries six members only — artifactId, kind, renderedMarkdown, openQuestions, approvable, blockReason — and projects none of the four structured body records, even though the bodies already declare them (hld.ts:109/115/118/121, lld.ts:155/164/167/171, define.ts:85). Client-side, the docs-review pane assigns the body to the DOM as plain text with a single statement, `bodyEl.textContent=m.markdown||''` at docs-review-panel.ts:186, so headings, lists and emphasis are flattened; there is no section navigation and no markdown renderer on this surface. The pane's shell carries five element ids (#insrc-docs-list, #insrc-docs-body, #insrc-docs-oq, #insrc-docs-note, #insrc-docs-actions), emits exactly one inline script, and its contract test declared at docs-review-panel.test.ts:243 forbids the string `innerHTML` anywhere in the generated html via a blanket assert.doesNotMatch at :253. The vendored markdown bundle exists in the plugin but is consumed only by the chat panel (MARKED_SRC in webview-marked.ts, injected at chat-panel.ts:561, guarded by guardMd at render-registry.ts:321 with the parse+guard+fallback sequence at :332 — configured headerIds:false, so it emits no heading ids).

**State after:** The response carries ten members: the same six, unchanged in name, type and meaning, plus four optional structured records projected verbatim off the already-parsed body and absent whenever the body omits them. The pane renders the document body through the vendored bundle with the guard scrub and a textContent fallback, so structural elements read distinctly; a section index derived once per open rides the existing docs-content message and drives a chooser that scrolls directly to a chosen section; and a render failure surfaces a degraded notice with the full text still present. The contract test no longer forbids the primitive — it asserts the guard is present, keeps the one-script and CSP assertions, and is renamed to match what it checks. Section identity lives in one pure, importable host-side function so s3 and s4 resolve a companion's ofSectionId against the same slugs the body navigation uses. Nothing on the generation side changes, no IPC method is added, and the approval path behaves exactly as before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Append the four optional members to the artifact-content response type and populate them in the existing handler from the body it already parses. Absent stays absent — no null, no empty-object default, no backfill. Because every member is optional, a response produced before this step and a response produced after are both valid against the widened type, so the daemon and the clients can be at different versions during rollout. — ↩ rollbackable
2. Mirror the same four optional members on the client-side content shape as pure pass-through. The client does not reshape, validate or default them; s1 consumes none of them. This step exists so Phase B and Phase C never have to reopen the client file. — ↩ rollbackable
3. Add the section-anchor declarations and the one pure derivation function alongside them, with its unit coverage. Nothing consumes it yet, so this step is inert — landing it before the render change means the derivation is already proven when the renderer starts depending on it. — ↩ rollbackable
4. Replace the single plain-text body assignment with the guarded render: inject the vendored bundle into the existing script tag (prepended, not a second tag), run parse then the guard scrub, fall back to textContent on throw, and stamp the derived slugs onto the rendered headings. This is the step that changes what a reviewer sees and the only step that alters the markup-injection posture of the surface. — ↩ rollbackable _(needs: `insrc.chat.enabled`)_
5. Narrow the shell contract test in the SAME change as step 4, never as a follow-up: drop the blanket forbid-the-primitive assertion, add an assert-the-guard-is-present assertion, keep the one-script and CSP and surface-class assertions, add a no-remote-origin assertion, and rename the test to describe what it now checks. Landing it separately would leave a window in which the surface's only mechanical guard is either failing or absent. — ↩ rollbackable
6. Post the derived index on the existing docs-content message and render the section chooser from it, omitting the chooser entirely when the index is empty. Add the degradation state to the same message so the ac3 notice is driven by the contract rather than inferred in the webview. — ↩ rollbackable _(needs: `insrc.chat.enabled`)_
7. Verify the untouched behaviours still hold rather than assuming they do: run the existing docs-review suite including the fail-closed regression at docs-review-panel.test.ts:179, and confirm the JetBrains panel is unaffected by the widened response. The latter is already established by reading DaemonGateway.kt:1517 — parseView pulls six named keys field-by-field out of a map with no unknown-key rejection — so this is a confirmation step, not an integration risk. — ↩ rollbackable
8. Rebuild and restart the installed daemon so the widened projection is live. Until this happens the plugin compiles against the new shape but receives the old six-member response, which is harmless precisely because every new member is optional — the pane renders the body and shows no structured content, exactly as before. — ↩ rollbackable

**Backward compat:** Required, because the artifact-content response is read by a second client. Three guarantees hold. (1) The response change is additive only: all four new members are optional, no existing member is renamed, retyped or given a new meaning, and no new IPC method or parallel read surface appears. (2) The JetBrains review panel keeps working untouched — verified rather than assumed: DaemonGateway.kt:1517 parseView constructs its DTO by pulling six named keys field-by-field out of a Map<String, Any?> with no reflective bind and no unknown-key rejection, so extra keys on the wire are ignored. (3) Version skew is safe in both directions: an old client reading a new response ignores members it does not know, and a new client reading an old response sees them as absent, which is exactly the state it already handles for a document that genuinely carries no structured records. Separately on the client side, the pane's external host shape ({ open, dispose }) and all five existing element ids are preserved, and the approval path — approve, request-changes, the COMMENTABLE_KINDS gate and the fail-closed suppression — is behaviourally unchanged, which ac5 and lc1 require and the existing regression test continues to pin. The one deliberate break is in the test suite, not the product: the blanket no-innerHTML assertion is replaced, which is the explicit HLD-authorised change k1 demands be made consciously rather than incidentally.

## 8. Alternatives considered

### 8.1 a1: Host-derived section index from the markdown source — **CHOSEN**

The vscode-free host parses headings out of renderedMarkdown, builds the SectionIndex as a pure function, and posts it alongside the body; the webview renders ids that match it and scrolls by slug.

sc3 lands as three exported declarations in docs-review-panel.ts exactly as the HLD sketches them — SectionAnchor, SectionIndex and SectionResolver — backed by one pure host-side function that scans renderedMarkdown for ATX headings and emits anchors in document order, with a slug derivation that de-duplicates repeated headings by ordinal. The index is computed once per opened document and travels to the webview on the SAME existing enveloped postMessage that already carries docs-content, so no new message type and no new IPC call appear; the markdown it derives from is a field the response already returns.

Inside the webview, the body render goes through the sanctioned route — vendored MARKED_SRC parse, then guardMd, then textContent on throw — and the rendered heading elements are given the same slugs the host computed, so the anchor target and the index agree by construction rather than by coincidence. The section chooser is a DOM control built from the posted index; choosing an entry scrolls that slug into view. Because slug derivation is a host-side pure function rather than webview script, s3 and s4 later resolve CompanionArtifactRef.ofSectionId against the identical function instead of re-deriving it in eval'd source.

### 8.2 a2: Webview-derived index from marked's own heading ids

Flip headerIds:true for this surface, let marked generate the ids, then walk the rendered DOM in the webview to build the index and drive the chooser — the host never sees section identity.

The body render reuses the shipped sequence but overrides the one option that defeats it, passing headerIds:true instead of false so marked emits an id on every heading. Immediately after guardMd, the bootstrap queries the rendered container for heading elements and builds the anchor list from what marked actually produced, which makes the index true to the render by definition — there is no second parser to disagree with.

The chooser and the scroll both live in the webview, reading that locally-built list. Nothing about section identity crosses to the host, so no message shape changes and the host's responsibilities are unchanged. For s3 and s4 later, ofSectionId resolution would likewise happen in webview script against the same DOM-derived list.

**Rejected because:** Rejected on sc3 and on testability, not on safety — it breaches no Epic constraint and in fact delivers ac2's behaviour with the strongest possible index fidelity. But sc3 publishes SectionAnchor / SectionIndex / SectionResolver as exported TypeScript declarations with s3 and s4 named as consumers, and a webview-local DOM list provides nothing importable, so either the contract bends or s3 and s4 re-derive ofSectionId resolution in eval'd script — spreading one shared identity across three call sites, which is the drift the HLD's risky-bits singled out. It also scores partial on ac3: the index is built by querying the rendered container AFTER guardMd, so on the degraded path (body present as textContent, no heading elements) the chooser silently becomes empty with nothing stating why. And it makes the contract's behaviour depend on marked's upstream id generation, pinned only by a vendored copy.

### 8.3 a3: Host-derived index with the rendered DOM as the reconciling authority

Derive the index host-side as in a1, but have the webview reconcile it against the actual rendered headings after guardMd and report any mismatch through the existing degradation notice.

Everything in a1 holds — the same pure host-side function, the same exported sc3 declarations, the same posted index — with one addition: after the body renders and guardMd runs, the bootstrap compares the heading elements it actually produced against the posted anchors. Entries that match get their slug applied and become navigable; a posted anchor with no corresponding rendered heading is dropped from the chooser rather than offered as a dead target.

A mismatch is surfaced rather than swallowed, reusing the RenderDegradation channel sc2 already defines for the ac3 fallback, so a divergence between the two readings of the document becomes visible to the reviewer and to the log instead of silently listing a phantom section.

**Rejected because:** Scores identically to a1 on all eight constraints — it IS a1 plus a reconciliation pass — so it loses on scope discipline rather than on any constraint. It adds a dropped-anchor rule and a mismatch notice that no acceptance criterion asks for, to close a gap a1 can handle more cheaply inside its scanner by skipping fenced regions. It also risks over-reporting: a heading legitimately absent from the render would surface as a degradation notice, reading to a reviewer as a document problem rather than a chooser detail. Retained as the fallback if host/parser heading disagreement turns out to be real in practice.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 bundle 1 — the VS Code artifact-document surface s1 modifies` — "The entire surface is one file, vscode-plugin/src/chat/docs-review-panel.ts, whose only real function is createDocsReviewHost(deps): DocsReviewHost at :49-279."
- **[[c2]]** `analyze-bundle` `s1 bundle 3 — the blanket assertion sc2's narrowing must replace` — "the last one is `assert.doesNotMatch(html, /innerHTML/, 'no innerHTML in the webview script')` — a BLANKET substring match over the ENTIRE rendered html, not a scoped one."
- **[[c3]]** `analyze-bundle` `s1 bundle 4 — the shipped precedent: assert the guard is present, not that the primitive is absent` — "its body does NOT assert innerHTML is absent — it asserts the GUARD IS PRESENT: `assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render')`"
- **[[c4]]** `analyze-bundle` `s1 bundle 4 — injecting the vendored bundle keeps the one-script invariant` — "chat-panel.ts:561 does exactly `<script nonce="${nonce}">${MARKED_SRC}\n;${bootstrap}</script>` and five separate chat-panel assertions of scripts.length===1 pass; and webview-marked.ts contains ZERO "
- **[[c5]]** `analyze-bundle` `s1 bundle 5 — the sanctioned sequence and the headerIds:false gap sc3 exists to fill` — "`try{div.innerHTML=(typeof marked!=='undefined'&&marked&&marked.parse)?marked.parse(src,{gfm:true,breaks:false,headerIds:false,mangle:false}):src;guardMd(div);}catch(e){div.textContent=src;}`"
- **[[c6]]** `analyze-bundle` `s1 bundle 5 — why reusing the shipped config defeats ac2` — "reusing this config verbatim emits no heading ids, so ac2's jump-to-section would have no anchor targets"
- **[[c7]]** `analyze-bundle` `s1 bundle 6 — the single line s1 replaces, and the behaviours lc1/ac5 pin` — "#insrc-docs-body (currently `bodyEl.textContent=m.markdown||''` at :186 — the single line s1 replaces)"
- **[[c8]]** `analyze-bundle` `s1 bundle 6 — the existing fail-closed regression that must stay green` — "docs-review-panel.test.ts:179, 'HIGH-1: a content-fetch failure posts blocked:true so approve is suppressed (review not defeated)'"
- **[[c9]]** `analyze-bundle` `s1 bundle 2 — the four structured records sc1 projects, rendered by s2/s3/s4 not s1` — "These are the four shapes sc1 passes through verbatim; s1 only projects them, since rendering each one belongs to s2/s3/s4."
- **[[c10]]** `step-output` `s3 winnerRationale — a1 chosen on sc3 and testability` — "a1 wins on sc3, which is the only constraint the three alternatives genuinely split on."
- **[[c11]]** `prior-artifact` `HLD-bfe98ff7f97178cf — the three contracts s1 owns and the risky-bits sc3 mitigates` — "sc3 is the Epic's quietest coupling and the one most likely to fail late."
- **[[c12]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1517 — parseView, the basis for the additive-only guarantee` — "private fun parseView(data: Map<String, Any?>): ArtifactReviewViewDto {"

## 10. Open questions

- RATIFY A SIGNATURE WIDENING (s8 graded sbdry3 `partial`). sc2's published interfaceSketch declares `MarkdownBodyRenderer = (markdown: string) => HTMLElement`; this LLD returns `{ el, degradation }` instead, so ac3's 'the reviewer is told the structured presentation was unavailable' is carried by the contract rather than inferred by each caller. It is a strengthening within the contract's intent and it is declared rather than silent, but it IS a change to a published signature that s2, s3 and s4 also consume. Review should either ratify it as written or require it as a `sharedContract.fieldAdd` amendment to the HLD before the build starts. Nothing else in the LLD depends on which way this goes.
- CITATION PROVENANCE IS ONE HOP LOOSE (s8 graded dm1 `partial`, cd1 `partial`, alt2 `partial`). Three process gaps, none of them a correctness risk, recorded so review can judge rather than discover them. (a) Four dataModel callSites — src/workflow/artifact-content.ts, src/daemon/index.ts, vscode-plugin/src/chat/protocol.ts and DaemonGateway.kt — are real and were verified by direct source read, but were grounded in the HLD's citations and post-review verification rather than carried into this LLD's own s1 analyze bundles. (b) `deriveSectionIndex` is a net-new name chosen by this LLD; sc3 publishes only the types it must satisfy, so the name has no upstream provenance even though the capability is unambiguously s1-owned. (c) The three alternatives were scored against every Story acceptance criterion and every shared contract they touch, but Epic constraints k1-k7 were not re-scored at Story level — they were scored per-alternative in the HLD's own judge step, and all three alternatives sit inside the already-chosen framework.

## Resolved questions

- `q7e2b3922` — RATIFY A SIGNATURE WIDENING (s8 graded sbdry3 `partial`). sc2's published interfaceSketch declares `MarkdownBodyRenderer = (markdown: string) => HTMLElement`; this LLD returns `{ el, degradation }` instead, so ac3's 'the reviewer is told the structured presentation was unavailable' is carried by the contract rather than inferred by each caller. It is a strengthening within the contract's intent and it is declared rather than silent, but it IS a change to a published signature that s2, s3 and s4 also consume. Review should either ratify it as written or require it as a `sharedContract.fieldAdd` amendment to the HLD before the build starts. Nothing else in the LLD depends on which way this goes.
  - **resolved**: Ratify as written in the LLD review — The user ratified the widening explicitly in chat, after being shown both this option and the amendment option, and after being told in the same message that sc2's published interfaceSketch would stay stale and that s2/s3/s4 read the HLD as authoritative. So this is a decision taken with the trade-off in hand, not by default, and it is recorded on LLD-bfe98ff7f97178cf-s1 meta.review via the approval override. RESIDUAL RISK ACCEPTED AND RECORDED, because this option's own detail names it: the HLD's sc2 interfaceSketch still reads `(markdown: string) => HTMLElement` while the authority is now this LLD's `{ el, degradation }`. The concrete consequence is that when design.story runs for s2, s3 or s4 it will be handed sc2 from the HLD and will see the narrower form. Mitigation, carried deliberately rather than left implicit: each later Story's LLD must take the widened signature from LLD-...-s1 rather than from the HLD sketch, and the s1 BUILD will produce the real exported type, so by the time Phase B starts the compiler is the authority and a narrower assumption fails to typecheck rather than shipping. If that proves awkward when s2 starts, the sharedContract.fieldAdd amendment remains available then at the same one-turn cost — nothing about taking it later is harder than taking it now. _(2026-10-01T09:44:00.223Z)_
- `q9e55de84` — CITATION PROVENANCE IS ONE HOP LOOSE (s8 graded dm1 `partial`, cd1 `partial`, alt2 `partial`). Three process gaps, none of them a correctness risk, recorded so review can judge rather than discover them. (a) Four dataModel callSites — src/workflow/artifact-content.ts, src/daemon/index.ts, vscode-plugin/src/chat/protocol.ts and DaemonGateway.kt — are real and were verified by direct source read, but were grounded in the HLD's citations and post-review verification rather than carried into this LLD's own s1 analyze bundles. (b) `deriveSectionIndex` is a net-new name chosen by this LLD; sc3 publishes only the types it must satisfy, so the name has no upstream provenance even though the capability is unambiguously s1-owned. (c) The three alternatives were scored against every Story acceptance criterion and every shared contract they touch, but Epic constraints k1-k7 were not re-scored at Story level — they were scored per-alternative in the HLD's own judge step, and all three alternatives sit inside the already-chosen framework.
  - **resolved**: Ratify as written — record all three gaps as accepted process notes — Taking option 1 over the recommended option 2, because gap (a) has ALREADY been discharged by stronger evidence than a back-filled analyze bundle would provide — and re-running the pass would re-verify what is already verified on this same artifact. The insrc_review_step run over this LLD re-derived the callSites deterministically, with real ripgrep probes and path:line reads, and stamped the results on meta.review: finding n1 resolved src/workflow/artifact-content.ts:45-52 and confirmed the four structured fields appear nowhere in it; n2 resolved src/daemon/index.ts:698 ('workflow.artifactContent' registration), :699 (the dynamic import) and :700 (the delegation); n11 resolved DaemonGateway.kt:1517 (parseView), :1522 (the DTO construction) and :73 (the DTO declaration), including :1525's field-by-field `str(data[\"renderedMarkdown\"])`; n13 resolved docs-review-client.ts:24-28 and in the same grep surfaced protocol.ts:61 `readonly blocked: boolean`, covering the fourth path. A deterministic probe quoting the actual line is better provenance than an analyze-bundle prose summary, and it lives on the same artifact, so the citation chain is self-contained in substance even though it runs through meta.review rather than body citations. Gaps (b) and (c) are accepted as the option describes and as the recommendation itself concedes: deriveSectionIndex is a naming choice this LLD is entitled to make under its own s1-owned sc3 contract — and the review's n14 finding independently confirmed the name collides with nothing, returning zero source matches for it, SectionAnchor and SectionResolver; while k1-k7 were scored per-alternative in the HLD's own judge step and all three alternatives sit inside the already-chosen framework a1, so re-scoring at Story level would restate the HLD rather than test anything. No amendment and no re-run on the critical path. _(2026-10-01T09:44:45.504Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle 1 — the VS Code artifact-document surface s1 modifies` — "The entire surface is one file, vscode-plugin/src/chat/docs-review-panel.ts, whose only real function is createDocsReviewHost(deps): DocsReviewHost at :49-279."
- **[[c2]]** `analyze-bundle` `s1 bundle 3 — the blanket assertion sc2's narrowing must replace` — "the last one is `assert.doesNotMatch(html, /innerHTML/, 'no innerHTML in the webview script')` — a BLANKET substring match over the ENTIRE rendered html, not a scoped one."
- **[[c3]]** `analyze-bundle` `s1 bundle 4 — the shipped precedent: assert the guard is present, not that the primitive is absent` — "its body does NOT assert innerHTML is absent — it asserts the GUARD IS PRESENT: `assert.match(html, /guardMd\(/, 'assistant markdown is sanitized via guardMd after the marked render')`"
- **[[c4]]** `analyze-bundle` `s1 bundle 4 — injecting the vendored bundle keeps the one-script invariant` — "chat-panel.ts:561 does exactly `<script nonce="${nonce}">${MARKED_SRC}\n;${bootstrap}</script>` and five separate chat-panel assertions of scripts.length===1 pass; and webview-marked.ts contains ZERO "
- **[[c5]]** `analyze-bundle` `s1 bundle 5 — the sanctioned sequence and the headerIds:false gap sc3 exists to fill` — "`try{div.innerHTML=(typeof marked!=='undefined'&&marked&&marked.parse)?marked.parse(src,{gfm:true,breaks:false,headerIds:false,mangle:false}):src;guardMd(div);}catch(e){div.textContent=src;}`"
- **[[c6]]** `analyze-bundle` `s1 bundle 5 — why reusing the shipped config defeats ac2` — "reusing this config verbatim emits no heading ids, so ac2's jump-to-section would have no anchor targets"
- **[[c7]]** `analyze-bundle` `s1 bundle 6 — the single line s1 replaces, and the behaviours lc1/ac5 pin` — "#insrc-docs-body (currently `bodyEl.textContent=m.markdown||''` at :186 — the single line s1 replaces)"
- **[[c8]]** `analyze-bundle` `s1 bundle 6 — the existing fail-closed regression that must stay green` — "docs-review-panel.test.ts:179, 'HIGH-1: a content-fetch failure posts blocked:true so approve is suppressed (review not defeated)'"
- **[[c9]]** `analyze-bundle` `s1 bundle 2 — the four structured records sc1 projects, rendered by s2/s3/s4 not s1` — "These are the four shapes sc1 passes through verbatim; s1 only projects them, since rendering each one belongs to s2/s3/s4."
- **[[c10]]** `step-output` `s3 winnerRationale — a1 chosen on sc3 and testability` — "a1 wins on sc3, which is the only constraint the three alternatives genuinely split on."
- **[[c11]]** `prior-artifact` `HLD-bfe98ff7f97178cf — the three contracts s1 owns and the risky-bits sc3 mitigates` — "sc3 is the Epic's quietest coupling and the one most likely to fail late."
- **[[c12]]** `code` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt:1517 — parseView, the basis for the additive-only guarantee` — "private fun parseView(data: Map<String, Any?>): ArtifactReviewViewDto {"
