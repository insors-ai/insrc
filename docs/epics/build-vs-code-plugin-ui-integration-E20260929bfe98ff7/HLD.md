<!-- insrc:artifact HLD-bfe98ff7f97178cf -->

# HLD: build-vs-code-plugin-ui-integration

## Summary

The review surface stops treating a generated document as a blob of text and starts rendering it from the structured records the document already carries. One additive change to the daemon's artifact-content response projects four body fields the response currently drops — the functional record, the data-model record, the experience record and the companion references — and the pane renders each from its own typed record rather than from markup. The body is rendered through the vendored markdown pattern this plugin already ships and tests; the visuals are built as DOM from JSON; and the multi-megabyte generated companion file is never embedded, only linked. Because an absent record projects as absent, a document with no diagram produces no diagram area at all, with no emptiness logic anywhere in the chain.

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
10. [UX](#10-ux)
11. [References](#11-references)
12. [Open questions](#12-open-questions)

## 1. Problem context

> See **DEF-bfe98ff7f97178cf** § 1. Problem

## 2. Framework summary

Chosen framework a1 — SOURCE-OF-TRUTH RENDERING. Every display concern in this Epic renders from the structured record the artifact body already carries, never from the generated companion file. The daemon side is one additive widening of ArtifactReviewView (sc1) that projects body.functionalDefinition, body.erDefinition, body.uxDefinition and body.companions through the existing workflow.artifactContent handler; no new IPC method, no second read surface, and no read of any file beyond the artifact JSON already fetched. The client side is governed by one rendering discipline (sc2) — vendored render, guardMd scrub, textContent fallback — applied to the body and extended by DOM-construction renderers for the structured records, which inject no markup at all. Two couplings are lifted to HLD level because no single Story can own them: the section-anchor model (sc3), because CompanionArtifactRef.ofSectionId can only position a visual beside a section if the body renderer and the companion placer agree on the same section identity; and the companion display slot (sc4), because S003 and S004 must render their different visuals into the same three states — present, absent, referenced-but-unshowable — so a reviewer reads them consistently. The generated companion file remains the authentic artifact and stays reachable by link, which preserves its value without letting 3.3 MB of foreign scripted HTML into a strict-CSP surface.

## 3. Architecture shape

Three layers, with the only new boundary being a widened projection.

(1) DAEMON PROJECTION. handleArtifactContent already parses the artifact JSON to assemble ArtifactReviewView; sc1 has it carry four more optional fields straight off the parsed body, verbatim and unvalidated-beyond-shape. This is a pure widening: absent fields stay absent, every existing field keeps its meaning, and the JetBrains panel — which deserializes only renderedMarkdown, openQuestions, approvable and blockReason — is unaffected by fields it does not read. Nothing on the generation side is touched; the four body fields are consumed exactly as hld.ts, lld.ts and define.ts already emit them. This discharges both halves of k7's explicit HLD-owned check.

(2) TRANSPORT. docs-review-client.ts maps the widened response into the pane's own DocsContent shape and the pane posts it to the webview through the existing single enveloped postMessage. No change to workflow.pending, workflow.approve or workflow.resolveComment. The pane's existing monotonic refresh guard and stale-id handling continue to own freshness; this Epic adds no new async surface.

(3) RENDER. The webview's one nonce'd script gains a render spine under sc2: the body renders through the vendored MARKED_SRC path with guardMd and a textContent fallback, while the functional record, the data-model record and the experience record each render by programmatic DOM construction from their JSON. The practical consequence is that the surface has exactly one markup-injection site — the body — and three injection-free ones. sc3 supplies the section identity both the body renderer (to emit anchor targets) and the companion placer (to resolve ofSectionId) read, so the two cannot drift. sc4 supplies the slot every visual renders into plus its absent and failure states, so S003's diagram and S004's mock are peers in one frame rather than two independently-invented layouts. The document body is rendered first and is never replaced by a visual, satisfying k4 structurally.

## 4. Diagrams

- [ER model](docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/er-model.html)

## 5. Shared contracts

### 5.1 sc1: ArtifactReviewView structured projection

**Owner Story:** `s1`
**Consumed by:** `s1`, `s2`, `s3`, `s4`

**Purpose:** The single additive widening of the daemon's artifact-content response that carries the four structured body records the pane needs. Owned at s1 because it is the one contract every other Story reads, and every other Story is already downstream of s1. Additive-only by construction: all four fields optional, absent stays absent, and no existing field changes meaning — which is how k2's extend-don't-replace rule and k7's unchanged-existing-consumers obligation are both met.

**Interface sketch (type-level):**

```
// src/workflow/artifact-content.ts — EXISTING fields unchanged, four appended
export interface ArtifactReviewView {
	readonly artifactId:       string;
	readonly kind:             string;
	readonly renderedMarkdown: string;
	readonly openQuestions:    readonly OpenQuestionRef[];
	readonly approvable:       boolean;
	readonly blockReason?:     string | null;

	// --- sc1 additive projection (absent when the body omits the field) ---
	/** body.functionalDefinition, verbatim. DEF/HLD/LLD/PLAN may carry it. */
	readonly functionalDefinition?: FunctionalDefinition | undefined;
	/** body.erDefinition, verbatim. HLD/LLD only. */
	readonly erDefinition?:         ErDefinition | undefined;
	/** body.uxDefinition, verbatim. HLD/LLD only. */
	readonly uxDefinition?:         UxDefinition | undefined;
	/** body.companions, verbatim. Used for link-out + ofSectionId placement. */
	readonly companions?:           readonly CompanionArtifactRef[] | undefined;
}
```

**Assumptions cited:** [[c6]] [[c7]]

### 5.2 sc2: Review-surface render discipline

**Owner Story:** `s1`
**Consumed by:** `s1`, `s2`, `s3`, `s4`

**Purpose:** The one sanctioned rendering route for this surface and the explicit, deliberate contract-test change k1 requires. Markup may be injected at exactly one site (the markdown body) via vendored render + guardMd + textContent fallback; every structured record renders by DOM construction and injects no markup. Owned at s1 because it governs every Story's rendering and s2/s3/s4 are all downstream of s1; without a single owner each Story would re-decide its own safety posture.

**Interface sketch (type-level):**

```
// vscode-plugin/src/chat/docs-review-panel.ts — webview render spine

/** The ONE permitted markup-injection site on this surface. Implementations
 *  MUST follow vendored-parse -> guardMd -> textContent-on-throw, the route
 *  k1 sanctions and render-registry.ts:321-332 already ships. */
export type MarkdownBodyRenderer = (markdown: string) => HTMLElement;

/** Every structured record renders through this shape: DOM construction only,
 *  no innerHTML, no markup string anywhere. */
export type StructuredRenderer<TRecord> = (record: TRecord) => HTMLElement;

/** Shown when MarkdownBodyRenderer falls back, so ac3's 'told the structured
 *  presentation was unavailable' is a contract, not per-Story copy. */
export interface RenderDegradation {
	readonly degraded: boolean;
	readonly notice:   string;
}

// CONTRACT-TEST CHANGE (deliberate, k1): docs-review-panel.test.ts's blanket
// no-innerHTML assertion is narrowed to permit exactly one guarded body-render
// call site and to continue forbidding innerHTML everywhere else on the surface.
```

**Assumptions cited:** [[c2]] [[c10]]

### 5.3 sc3: Section anchor model

**Owner Story:** `s1`
**Consumed by:** `s1`, `s3`, `s4`

**Purpose:** The shared notion of 'which section is this' that both the body renderer and the companion placer must agree on. s1 needs it to give ac2's jump-to-section real anchor targets; s3 and s4 need the identical identity to resolve CompanionArtifactRef.ofSectionId and position a visual beside the section it visualizes. Owned at s1 — the nearest common ancestor of every consumer — because if each Story derived its own section ids, a companion would silently fail to place. Note the shipped marked config sets headerIds:false, so this contract is what supplies anchor identity rather than inheriting it.

**Interface sketch (type-level):**

```
// vscode-plugin/src/chat/docs-review-panel.ts

/** One heading in the rendered body, in document order. `slug` is the anchor
 *  target AND the value an ofSectionId is matched against — one identity, two
 *  consumers, so body navigation and companion placement cannot drift. */
export interface SectionAnchor {
	readonly slug:  string;
	readonly title: string;
	readonly level: number;
}

/** Derived once per rendered document and posted alongside it, so the section
 *  chooser and any companion placer read the same ordered set. */
export interface SectionIndex {
	readonly anchors: readonly SectionAnchor[];
}

/** Resolve a companion's ofSectionId to a slug in THIS document, or undefined
 *  when it names no present section (the companion then renders unanchored
 *  rather than being dropped). */
export type SectionResolver = (ofSectionId: string | undefined) => string | undefined;
```

**Assumptions cited:** [[c2]]

### 5.4 sc4: Companion visual slot

**Owner Story:** `s3`
**Consumed by:** `s3`, `s4`

**Purpose:** The shared frame every visual companion renders into, plus its three mandated states — rendered, absent, referenced-but-unshowable. Owned at s3 because s4 dependsOn s3, making s3 the nearest common ancestor of both visual Stories; s1 and s2 render no visual and do not consume it. It exists so S003's diagram and S004's mock are labelled peers in one layout (S004 ac2) and share one failure presentation (S003 ac3 / S004 ac4), and so k3's never-reserve-space rule is expressed once: no ref, no slot, no fetch.

**Interface sketch (type-level):**

```
// vscode-plugin/src/chat/docs-review-panel.ts

/** Which visual a slot holds. COLLAPSES CompanionKind's three members onto two
 *  labels — both 'diagram-mermaid' and 'diagram-html' map to 'diagram', 'ux-mock'
 *  maps to 'experience' — so the label a reviewer reads is derived from the ref,
 *  never guessed (S004 ac2). */
export type CompanionVisualKind = 'diagram' | 'experience';

/** Exactly three states. 'absent' is NOT a state that renders an empty frame —
 *  it is the absence of a slot, which is how k3 is enforced structurally. */
export type CompanionSlotState =
	| { readonly state: 'rendered';     readonly kind: CompanionVisualKind; readonly label: string; readonly body: HTMLElement }
	| { readonly state: 'unshowable';   readonly kind: CompanionVisualKind; readonly label: string; readonly reason: string }
	| { readonly state: 'absent' };

/** Build a slot from a structured record. Returns 'absent' when the record is
 *  undefined, so a caller cannot accidentally reserve space for nothing. */
export interface CompanionSlotFactory<TRecord> {
	readonly kind:  CompanionVisualKind;
	build(record: TRecord | undefined, ref: CompanionArtifactRef | undefined, anchorSlug: string | undefined): CompanionSlotState;
}

/** The link-out to the authentic generated companion file. The pane NEVER
 *  embeds relPath's content; it only offers it (k1, k4). */
export interface CompanionLinkOut {
	readonly relPath: string;
	readonly title:   string;
}
```

**Assumptions cited:** [[c4]] [[c7]]

## 6. Story boundaries

### 6.1 Story E20261001bfe98ff7:S001

**Owns:** `sc1`, `sc2`, `sc3`

The pane shell and its existing behaviour stay private to s1: the pending-list rendering and row click handling, the monotonic refreshSeq guard that drops superseded responses, the stale-artifact-id checks on open and decide, the approve / request-changes control wiring and the COMMENTABLE_KINDS gate, the fail-closed rule that suppresses approve when a content load failed, and the panel lifecycle (create, reveal, dispose, in-memory-only pending map). The exact wording of the ac3 degradation notice and the visual styling of headings, lists and emphasis are s1's alone. s1 must leave the approval path byte-identical in behaviour (ac5), so none of this is exposed as a contract.

### 6.2 Story E20261001bfe98ff7:S002

**Depends on:** `sc1`, `sc2`

Everything about how a functional requirement looks is private to s2: the per-requirement item layout, the visual separation from surrounding prose, the placement of the identifier relative to the statement, and the decision to render nothing at all when functionalDefinition is absent. s2 owns no contract because no other Story displays the functional record — s3 and s4 render visuals, not requirements. s2's one hard obligation comes from sc2: identifiers are written via textContent straight off the FunctionalRequirement record, never re-derived from rendered prose, which is what makes k5's character-for-character guarantee hold across upstream and downstream documents.

### 6.3 Story E20261001bfe98ff7:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The diagram renderer itself is private to s3: which vendored diagram library is bundled, how an ErDefinition's classes and slots are walked into that library's input, the diagram's own sizing and theming within its slot, and how a render throw is caught and converted into sc4's 'unshowable' state. s3 publishes only the slot contract, not its diagram internals — so s4 reuses the frame without inheriting any diagram-specific decision. The VSIX size cost of the bundled renderer is s3's to carry and report.

### 6.4 Story E20261001bfe98ff7:S004

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

The Adaptive Cards subset renderer is private to s4: which card element types are supported, how an unsupported element degrades, and the mock's internal layout and theming within its slot. Also private is the dual-presence arrangement — how a diagram slot and an experience slot sit together when a document carries both — which s4 decides because it is the only Story that can observe both at once; it does so using the labels sc4 already derives from each ref, so the structural-versus-experience distinction ac2 requires needs no new contract.

## 7. Non-functional targets

- **Performance:** Document open must stay within one existing IPC round-trip: sc1 adds fields to a response already being fetched, so no additional request is made and no companion file is read. The four projected records are bounded by what the body already holds (a functional record is tens of requirements, an erDefinition tens of classes), so the response grows by kilobytes, not the 3,367,065 bytes a sampled companion file weighs — that payload is deliberately kept out of the pane and reachable only by link. Rendering is synchronous DOM construction in the webview plus one marked parse; the pane's existing monotonic refresh guard continues to drop superseded responses so a slow open cannot overwrite a newer one.
- **Security:** The surface keeps its single-nonce strict CSP unwidened. Markup is injected at exactly one site — the markdown body, via vendored parse then guardMd with a textContent fallback — and the three structured renderers inject none at all, building DOM and setting textContent. No companion file content is read by the daemon or passed to the webview, which avoids both the foreign-inline-script exposure and the path-traversal surface that reading an arbitrary body-supplied relPath would open. All rendering runs locally from vendored bundles; nothing leaves the editor (k6). The contract test's no-innerHTML assertion is narrowed deliberately to permit the one guarded body render and to keep forbidding innerHTML elsewhere — recorded here as an HLD decision so it can never read as an incidental relaxation.
- **Observability:** Every degradation is visible to the reviewer rather than silent, because a reviewer who cannot tell that content is missing may approve a document they have not actually seen. A body-render fallback shows the ac3 notice alongside the full text; a companion that is referenced but unshowable renders sc4's 'unshowable' state naming which visual failed, never an empty frame; and the pane's existing logger.warn path continues to carry the underlying cause for diagnosis. The distinction k3 draws is preserved in what is observable: absent means no slot at all, which is deliberately indistinguishable from a document that never had a companion.
- **Durability:** The pane persists nothing — its pending map is in-memory and discarded on dispose — and this Epic adds no persistence. The artifact JSON remains the single source of truth; the surface is a pure reader, so a restart or reload re-derives everything from the daemon. Because sc1 is additive and all four fields are optional, a document generated before this change projects exactly the fields it has and renders correctly with no migration and no retrofit, and an older client reading a newer response ignores the fields it does not know.

## 8. Rollout

**Phase A — projection, render discipline, section identity**

**Stories:** `s1`
**Flag:** `insrc.chat.enabled`

s1 lands alone because it owns all three foundational contracts every later Story reads. It carries the Epic's only daemon-side change (sc1's additive widening of ArtifactReviewView), the Epic's only deliberate contract-test change (sc2 narrowing the blanket no-innerHTML assertion to one guarded body-render site), and the section-anchor model (sc3) that both body navigation and later companion placement resolve against. Shipping it on its own means the k1 decision and the k7 additive-only check are reviewed as one focused change, and it is independently valuable: a reviewer gets a structured, navigable document immediately, with no visual work done yet.

**Backward compat:** Two surfaces must be provably unchanged. (1) The approval path: s1 ac5 requires approve / request-changes to behave exactly as before, including the COMMENTABLE_KINDS gate and the fail-closed suppression of approve after a content-load failure. (2) Existing consumers of workflow.artifactContent: the four new fields are optional, so the JetBrains ArtifactContentPane — which deserializes only renderedMarkdown, openQuestions, approvable and blockReason — must keep working untouched, and a document generated before this change must render correctly with no migration. The ac3 fallback also means a body that cannot be parsed still shows its full text, so no document becomes less readable than it is today.

**Phase B — functional record and design diagram (independent, parallelisable)**

**Stories:** `s2`, `s3`

Both consume Phase A's contracts and neither consumes anything the other produces, so they are genuinely independent and are grouped to say so. s2 renders functional requirements as discrete identified items off sc1's functionalDefinition; s3 renders a diagram off sc1's erDefinition and, in doing so, defines sc4 — the slot, its labelling, and its three states — which exists in this phase purely so s4 can reuse it rather than invent a second layout. They can be built and merged in either order or concurrently. s3 is the heavier half: it carries the Epic's first net-new vendored renderer and the VSIX size cost that comes with it.

**Backward compat:** Each Story must be invisible on documents that do not carry its record: no functional-requirements area when functionalDefinition is absent (s2 ac4) and no diagram area, placeholder or frame when no diagram companion is referenced (s3 ac2). Because a DEF carries functionalDefinition only and never companions, s2 must be correct on DEFs while s3 is a no-op there — a useful cross-check that absence is handled structurally and not by emptiness tests. Phase A's body rendering and the approval path stay unchanged.

**Phase C — experience mock**

**Stories:** `s4`

Last by agreement of the Epic graph (s4 dependsOn s3) and contract ownership (s4 consumes sc4, owned by s3). It adds the Adaptive Cards subset renderer and, uniquely, the dual-presence arrangement: it is the only Story that can observe a diagram and a mock on the same document, so it decides how the two slots sit together and relies on sc4's ref-derived labels to make the structural-versus-experience distinction s4 ac2 requires. Deferring it also means the slot contract has already been exercised once by a real renderer before a second one is layered onto it.

**Backward compat:** s4 must not alter how a diagram-only document renders — adding the experience slot cannot change s3's output when no uxDefinition is present — and must render no experience area at all when the document references no mock (s4 ac3). The slot contract sc4 must be consumed as published rather than widened; if s4 finds it needs a shape sc4 does not offer, that is an amendment to raise, not a local extension.

**Ordering rationale:** Three phases, forced almost entirely by contract ownership rather than by convenience. s1 owns sc1, sc2 and sc3 — the projection, the render discipline and the section identity — and every other Story consumes at least two of them, so s1 must land alone and first; nothing else can even compile against a projection that does not exist. After s1, the Epic genuinely forks: s2 consumes only sc1 and sc2, while s3 consumes sc1, sc2 and sc3 and owns sc4. They touch no common code — s2 renders requirement items, s3 renders a diagram into a slot it defines — so they could run concurrently, and Phase B groups them to make that explicit rather than serialising them for no reason. s4 is last by two independent forces that agree: the Epic graph has s4 dependsOn s3, and s4 consumes sc4 which s3 owns. The ordering also happens to put the only daemon change and the only contract-test change in Phase A, so the riskiest shared edits are reviewed once at the start rather than re-litigated in each later Story.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Narrowing the docs-review no-innerHTML contract test (sc2, Phase A) | The blanket assertion at docs-review-panel.test.ts:243 is the surface's only mechanical guarantee that nothing injects markup. Replacing it with a narrower rule is exactly the kind of change that silently becomes a general relaxation later — and k1 explicitly warns that adopting the guarded pattern here must never read as incidental. A sloppy narrowing (for example asserting 'at most one innerHTML' by count) would let a future edit move the injection somewhere unsafe while the test stayed green. | Narrow by call site, not by count: the replacement must pin innerHTML to the single named body-render path and keep failing for any other occurrence on this surface, with the guardMd call and the textContent fallback both asserted present. Record the change in the Story's own test as a deliberate k1 decision citing this HLD, so a reviewer encountering it later sees the authorisation rather than guessing. |
| Section identity shared by body navigation and companion placement (sc3, Phase A consumed in B and C) | sc3 is the Epic's quietest coupling and the one most likely to fail late. If the slug a heading renders as and the value an ofSectionId is matched against are derived differently — or if marked's headerIds:false is reinstated by someone reusing the chat panel's config verbatim — then s1 ac2's jump-to-section breaks, or worse, s3 and s4 companions silently render unanchored while every test still passes because each Story tested its own half. | Derive the slug exactly once in Phase A and expose it only through sc3's SectionIndex and SectionResolver, so neither later Story can compute its own. Phase A must include a test asserting that a heading's rendered anchor target and the resolver's output for the same section are the same string, and sc3's resolver returns undefined rather than throwing for an unknown ofSectionId so a stale reference degrades to unanchored rather than to a crash. |
| Two net-new vendored renderers and the VSIX size they add (s3 Phase B, s4 Phase C) | The diagram and Adaptive Cards renderers are the only genuinely net-new code in this Epic and the part with no existing precedent to copy, unlike the markdown path which reuses a shipped pattern. A general-purpose diagram library pulled in wholesale could add more to the VSIX than the entire existing bundle, and a renderer that assumes network access or document-level globals would break k6 or the strict CSP in ways that only surface at runtime in a real webview, not in a node test. | Treat the bundle choice as a reviewable decision in s3's LLD rather than an implementation detail: record the measured VSIX delta and confirm the library runs with no network access and no eval under a nonce-only CSP before adopting it. Keep each renderer behind sc4's slot so a failure converts to the 'unshowable' state with the body still readable, and verify both renderers in a real webview using the project's established screenshot-the-rendered-shell practice rather than trusting a string-asserting test. |

## 9. Alternatives considered

### 9.1 a1: Render from the structured body elements (source-of-truth rendering) — **CHOSEN**

Project the four structured body fields through ArtifactReviewView and render each one client-side from its own typed record; the companion file is only ever linked, never embedded.

ArtifactReviewView gains four optional fields that mirror what the artifact body already carries verbatim: functionalDefinition, erDefinition, uxDefinition and companions[]. handleArtifactContent reads them off the parsed artifact JSON and passes them through untouched; absent stays absent, so a DEF (which carries functionalDefinition only) and any pre-change document project exactly what they have and nothing more. No file outside the artifact JSON is read, and no new IPC method appears.

Client-side, each display concern renders from its own record through one shared discipline. The body goes through the already-vendored MARKED_SRC render plus the guardMd scrub with a textContent fallback, the same three-part route k1 sanctions and chat-panel already runs. Functional requirements render as programmatically-built DOM from FunctionalRequirement records, so each identifier is set by textContent and is incapable of being reformatted. erDefinition renders to a diagram client-side and uxDefinition renders as Adaptive Cards DOM, both from structured JSON rather than from markup. The companions[] refs are used for one thing only: an explicit affordance to open the full generated companion file in its own surface, which keeps the 3.3 MB artifact and its inline scripts entirely outside the review pane.

**Pros:**
- Keeps the review pane's injected markup to exactly one source — marked's own escaped output through guardMd — so k1 is satisfied by the pattern the plugin already ships and tests, with one deliberate contract-test update rather than a CSP relaxation.
- Reads zero files beyond the artifact JSON the pane already fetches, so k2's additive-field rule is met without a second read surface and the companion's 3,367,065-byte size never reaches the webview.
- Each requirement identifier is written via textContent from the FunctionalRequirement record, which makes k5's character-for-character guarantee structurally true rather than something a renderer must be careful about.
- Absent fields propagate as absent through the whole chain, so k3's no-placeholder rule needs no per-story emptiness logic.
- The four fields are independent, so S002 (functionalDefinition), S003 (erDefinition) and S004 (uxDefinition) can each build and ship without touching the others' render path.

**Cons:**
- What the reviewer sees is a second, independently-written rendering of the same structured record, so the pane's diagram can diverge in appearance from the generated companion file even though both derive from the same erDefinition.
- Needs a client-side diagram renderer and an Adaptive Cards renderer, neither of which exists in vscode-plugin today — the genuinely net-new work in this Epic, and the part most likely to need its own vendored bundle.
- S001 ac2's jump-to-section has no anchor targets under straight reuse, because the shipped marked config sets headerIds:false; this alternative has to add stable heading ids for this surface, which is a deliberate divergence from the chat panel's config.
- A bundled diagram renderer adds materially to the VSIX, on top of the 53 KB marked bundle already shipped.

**Cost estimate:** M

### 9.2 a2: Resolve and embed the generated companion file

Have the daemon read each referenced companion file and return its content, then display that content inside the review pane so the reviewer sees byte-for-byte what was generated.

ArtifactReviewView gains a companions[] field in which each entry carries not just the CompanionArtifactRef but the resolved content of the file at relPath, read daemon-side through the existing path-scheme resolver. The review pane then presents that content directly, so the diagram and the mock a reviewer approves against are literally the generated artifacts rather than a re-rendering of their source.

Because the companion is a complete offline HTML document with its own style and script blocks, displaying it means giving it an isolated document context — a sandboxed frame inside the pane, with the pane's own CSP extended to permit that frame. The structured records themselves are never consumed client-side; the pane's job reduces to fetching bytes and hosting them, and the only net-new client code is the frame host and its failure state.

**Pros:**
- The reviewer sees exactly the artifact that was generated, so there is no possibility of the pane's rendering diverging from the companion a downstream reader or the code-review dimension inspects.
- Requires no client-side diagram or Adaptive Cards renderer at all, and adds nothing to the VSIX, because every companion ships its own inlined runtime.
- Automatically covers all three CompanionKind values, including diagram-html, with one code path and no per-kind renderer.

**Cons:**
- Hosting a foreign HTML document with its own inline <script> blocks is precisely the ad-hoc injection k1 forbids, and would require widening the surface's single-nonce strict CSP rather than updating one contract-test assertion.
- The sampled companion is 3,367,065 bytes; passing that over the IPC socket and into a webview on every document open is three orders of magnitude more payload than the artifact JSON it accompanies.
- Makes the daemon read an arbitrary repo-relative relPath from the artifact body, which introduces a path-traversal surface the current artifactContent read does not have.
- k4 says the companion is an adjunct to an authoritative body, but a self-contained document sized at 100vh naturally dominates the pane, so honouring k4 means fighting the companion's own layout.
- Collapses S003 and S004 into one undifferentiated frame host, which leaves S004 ac2's requirement to label which visual is the structural diagram and which is the experience with nothing structural to label from.

**Cost estimate:** S

**Rejected because:** Violates k1 and k4 outright. Hosting a complete offline HTML document means executing foreign inline <style> and <script> blocks, which requires widening the surface's single-nonce strict CSP rather than making the one deliberate contract-test change k1 sanctions; and the sampled companion styles itself at 100vh, so embedded it dominates rather than accompanies the body k4 declares authoritative. It is also only partial on k2 (the daemon would read an arbitrary body-supplied relPath, a new read capability in substance plus a path-traversal surface), partial on k5 (it never consumes the structured records, leaving S002 effectively unaddressed), and partial on k7 (multi-megabyte payloads would travel to every existing consumer of workflow.artifactContent).

### 9.3 a3: Body-only pane with companion hand-off to a separate surface

Render the body and the functional record in the review pane, and send every visual companion to its own dedicated panel where a looser content policy is legitimate.

The review pane takes on only what it can render safely from text and structured records: the markdown body through the existing vendored render plus guardMd, and the functional requirements as DOM. ArtifactReviewView additively projects functionalDefinition and companions[], but not the visual records, because the pane never renders a visual.

Each companion reference becomes a labelled action. Choosing it opens the generated companion file in a surface of its own — a separate webview panel, or the editor's own handling of the file — where the document's inline runtime is the only thing in that context and no shared CSP is widened. The reviewer moves between the design and its visual as two adjacent surfaces rather than one composed view.

**Pros:**
- Leaves the review pane's rendering discipline almost untouched: one additional marked-plus-guardMd call and no visual renderer, so the k1 blast radius is the smallest of the three alternatives.
- Ships no new diagram or Adaptive Cards bundle, so the VSIX grows by nothing.
- Still shows the reviewer the authentic generated companion rather than a re-render, and does so without a 3.3 MB payload inside the review surface.
- S003 and S004 reduce to one shared hand-off mechanism plus per-kind labelling, which is the cheapest route to having both Stories done.

**Cons:**
- Directly contradicts S003 ac1, which requires the diagram be displayed as a visual WITHIN the surface positioned with the part of the document that references it; a hand-off to another panel is not that.
- Reinstates the exact flow-break the Epic's problem statement identifies as the thing to remove — the reviewer leaves the document to go look at its companion elsewhere.
- S004 ac2's side-by-side labelling of a structural diagram against an experience mock cannot hold when each opens in a separate surface.
- Because it under-delivers two Stories' acceptance criteria as written, adopting it would require amending the approved Epic rather than designing against it.

**Cost estimate:** S

**Rejected because:** Violates no constraint and has the smallest k1 blast radius of the three, but loses on grounds the constraints do not cover: it contradicts S003 ac1, which requires the diagram be displayed as a visual WITHIN the surface positioned with the part of the document that references it, and makes S004 ac2's side-by-side labelling of a structural diagram against an experience mock impossible. It also reinstates the leave-the-editor flow-break the Epic's problem statement exists to remove, and scores only partial on k4 because a companion relocated to another panel is not the adjacent adjunct that constraint describes. Adopting it would mean amending an already-approved Epic to match a cheaper design; it remains a legitimate fallback if a1's net-new renderers prove unviable.

## 10. UX

- [UX mock](docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/ux-mock.html)

## 11. References

- **[[c1]]** `analyze-bundle` `s1 bundle 1 — VS Code artifact-document surface` — "The entire artifact-document surface is one file, vscode-plugin/src/chat/docs-review-panel.ts, whose only real function is createDocsReviewHost(deps): DocsReviewHost at :49-279."
- **[[c2]]** `analyze-bundle` `s1 bundle 1 — the surface's rendering contract test` — "Rendering is a hand-built HTML shell whose contract test pins one nonce, strict CSP, a class="insrc-term-review" surface, and no innerHTML."
- **[[c3]]** `analyze-bundle` `s1 bundle 1 — docs-review-client.ts rides the shared IPC client` — "constructed inside the chat feature-flag gate with createDocsReviewClient(client) riding the shared daemon IPC client rather than adding a capability"
- **[[c4]]** `analyze-bundle` `s1 bundle 3 — marked is already vendored as MARKED_SRC` — "vscode-plugin/src/chat/webview-marked.ts vendors marked as the MARKED_SRC string (53KB)"
- **[[c5]]** `analyze-bundle` `s1 bundle 3 — the sanctioned render+guard+fallback sequence` — "render-registry.ts:321 defines guardMd(el) and :332 performs the full sanctioned sequence in one line — div.innerHTML = marked.parse(src, {gfm:true, breaks:false, headerIds:false, mangle:false}), then"
- **[[c6]]** `analyze-bundle` `s1 bundle 3 — headerIds:false defeats jump-to-section under straight reuse` — "the shipped config passes headerIds:false, so marked emits NO heading ids — S001 ac2 (jump directly to a chosen section) cannot be satisfied by reusing this config unchanged"
- **[[c7]]** `analyze-bundle` `s1 bundle 4 — ArtifactReviewView projects none of the four body fields` — "ArtifactReviewView (src/workflow/artifact-content.ts:45-52) currently projects none of these four body fields, which is the single additive change k2 permits."
- **[[c8]]** `analyze-bundle` `s1 bundle 4 — the body carries both the refs and the structured source` — "hld.ts declares functionalDefinition?(:109), erDefinition?(:115), companions?(:118) and uxDefinition?(:121), lld.ts the same at :155/:164/:167/:171, and define.ts carries functionalDefinition? only (:"
- **[[c9]]** `analyze-bundle` `s1 bundle 4 — CompanionArtifactRef shape and link-not-content rule` — "CompanionArtifactRef (companion/types.ts:28-36) carries kind ('diagram-mermaid' | 'diagram-html' | 'ux-mock'), relPath (repo-relative, a sibling of the artifact .md), title and optional ofSectionId; i"
- **[[c10]]** `analyze-bundle` `s1 bundle 4 — the companion file is a 3.3 MB self-contained scripted document` — "a real sample, docs/epics/complete-generated-artifact-companion-wiring-across-E20260929e2c6705f/er-model.html, is 3,367,065 bytes with 28 mermaid references and its own inline <style>/<script>"
- **[[c11]]** `analyze-bundle` `s1 bundle 2 — the functional-requirement spine` — "The FR spine is src/workflow/artifacts/functional-definition.ts, exporting FrId, FunctionalDefinition (:38-40), FunctionalRequirement (:26-35), renderFunctionalRequirementsSection and validateFunction"
- **[[c12]]** `step-output` `s3 winnerRationale — a1 chosen on constraint scores` — "a1 is the only alternative that scores `satisfies` on all seven constraints, and it is the only one that does so without needing the Epic amended."
- **[[c13]]** `step-output` `s6 audit — sbdry4 graded partial on sc4's CompanionLinkOut` — "No Story asks for a link-out affordance. It also appears redundant — CompanionArtifactRef's own doc comment states the core markdown already renders the ref AS A LINK"
- **[[c14]]** `prior-artifact` `DEF-bfe98ff7f97178cf — approved Epic, constraints k1-k7 and Stories s1-s4` — "The work is confined to the VS Code plugin and the daemon response it reads, and is enforced as an HLD-OWNED architectural boundary rather than by any single Story's acceptance criteria."

## 12. Open questions

- sc4 declares a `CompanionLinkOut` member (relPath + title) that no Story's acceptance criteria asks for, and it appears redundant: CompanionArtifactRef's own doc comment states the core markdown already renders the ref AS A LINK, so renderedMarkdown should already carry a route to the generated companion. The s6 audit graded sbdry4 `partial` on exactly this. Resolve before s3's LLD: either drop CompanionLinkOut from sc4 and let the body's existing link stand, or — if a distinct in-pane affordance is genuinely wanted — raise it as an Epic amendment rather than introducing it through a contract. Nothing else in the HLD depends on it; the k1/k4 argument for never embedding the companion holds either way.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**0 HIGH · 4 MED · 8 LOW** · model `client` · reviewed 2026-10-01T08:04:17.031Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| sc1 | citation | MED | auto | The artifact bodies already declare the four fields sc1 projects, at the exact lines cited: hld.ts functionalDefinition?(109) erDefinition?(115) companions?(118) uxDefinition?(121); lld.ts the same four at 155/164/167/171; and define.ts carries functionalDefinition? only, at 85. | All nine read anchors resolved to exactly the expected declarations: hld.ts:109/115/118/121 and lld.ts:155/164/167/171 carry functionalDefinition?/erDefinition?/companions?/uxDefinition?, and define.ts:85 carries functionalDefinition? only. The cited lines are correct. However the grep surfaced one member the HLD's prose omits: src/workflow/artifacts/plan.ts:91 ALSO declares `readonly functionalDefinition?: FunctionalDefinition \| undefined;`, so sc1's doc comment "DEF/HLD/LLD may carry it" understates the set — a PLAN carries it too. | Correct sc1's inline comment to include PLAN. The prescribed change is unaffected — sc1 projects whatever the parsed body holds, so a PLAN's functional record flows through without any code difference — but the comment should not mislead the Story that implements it into gating on kind. |
| sc4 | closed-union | MED | auto | CompanionKind in src/workflow/artifacts/companion/types.ts is exactly the three-member union 'diagram-mermaid' \| 'diagram-html' \| 'ux-mock', which is what sc4's two-member CompanionVisualKind ('diagram' \| 'experience') claims to mirror — so the mirroring is in fact lossy for diagram-html. | src/workflow/artifacts/companion/types.ts:24 reads exactly `export type CompanionKind = 'diagram-mermaid' \| 'diagram-html' \| 'ux-mock';` — a closed three-member union, confirmed by both greps returning that single source line. sc4 declares `CompanionVisualKind = 'diagram' \| 'experience'` and its comment says it "Mirrors CompanionKind". It does not mirror it: it is a two-member collapse in which diagram-mermaid and diagram-html both fold to 'diagram'. The collapse is benign for labelling (both are diagrams), but the word 'mirrors' is wrong and, left unqualified, invites an implementer to assume a 1:1 mapping and omit a case for diagram-html. | Reword sc4's comment to state the mapping explicitly as a collapse rather than a mirror, so the LLD must decide what a diagram-html companion renders as. This is naming precision, not a design change — both diagram kinds legitimately carry the 'diagram' label. |
| sc2 | citation | MED | assisted | The docs-review surface's contract test asserts no innerHTML on that surface, and the HLD's risky-bits table locates that assertion at vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:243 — the specific line sc2 commits to narrowing. | The read at vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:243 resolved to `test('rendered shell: one nonce, strict CSP, docs-review surface, no innerHTML', () => {` — the test DECLARATION, not the assertion. The no-innerHTML guarantee therefore lives in assertions inside that test body, below line 243. The grep for `innerHTML` hit the 50-match cap entirely in docs/, so it could not localise the assertion. The anchor points at the right concept (this is unambiguously the test that pins the discipline) but it is imprecise about what sits on that line. | Keep the anchor but describe it as the test rather than the assertion, so the Story implementing sc2 looks inside the test body rather than editing line 243. The prescribed change — narrow by call site, not by count — is unaffected. |
| k7 | cross-artifact | MED | manual | The JetBrains review panel consumes only renderedMarkdown, openQuestions, approvable and blockReason from the artifact-content response, so adding four optional fields to ArtifactReviewView leaves it working unchanged — the load-bearing basis for the HLD's claim to discharge k7's additive-only obligation. | UNVERIFIABLE from the evidence handed back. All four greps (ArtifactReviewViewDto, renderedMarkdown, approvable, blockReason) hit the 50-match cap with zero matches surfacing from jetbrains-plugin/src/, so the probe never reached the Kotlin DTO. The only read, ArtifactContentPane.kt:1, resolved to the package declaration and says nothing about which fields are deserialized. The premise may well be true but this evidence does not establish it — and it is load-bearing, because the HLD's claim to discharge k7's 'existing consumers keep working unchanged' obligation rests on the JetBrains panel ignoring the four new fields. | Re-probe with a jetbrains-plugin-scoped pattern (for example `data class ArtifactReviewViewDto` plus its property list) before the Phase A build asserts k7 is discharged. If the DTO turns out to deserialize strictly — rejecting unknown keys — the additive projection would break the JetBrains panel and Phase A's backward-compat claim would need to change. |
| sc1 | citation | LOW | manual | ArtifactReviewView in src/workflow/artifact-content.ts declares exactly six members — artifactId, kind, renderedMarkdown, openQuestions, approvable, blockReason — and carries NONE of functionalDefinition, erDefinition, uxDefinition or companions, so adding those four is a genuine widening rather than a restatement of fields already present. | All eight read anchors resolved. src/workflow/artifact-content.ts:45 is `export interface ArtifactReviewView {`, and :46-:51 are exactly artifactId, kind, renderedMarkdown, openQuestions, approvable, blockReason, with :52 the closing brace. The grep for `readonly (functionalDefinition\|erDefinition\|uxDefinition\|companions)\\?` returned 36 source matches but NONE in artifact-content.ts — they land in artifacts/define.ts:85, hld.ts:109/115/118/121, companion/assess.ts:38, companion/generate.ts:39-40 and elsewhere. The premise holds exactly: the four fields exist on bodies and are absent from the view, so sc1 is a genuine widening. | none — verified sound |
| sc2 | citation | LOW | manual | The three-part render route the HLD adopts already exists client-side: guardMd is defined in vscode-plugin/src/chat/render-registry.ts at line 321 and the parse-then-guard-then-textContent-fallback sequence is performed at line 332. | Both anchors resolved verbatim. render-registry.ts:321 reads "`function guardMd(el){try{` +" and :332 reads "`try{div.innerHTML=(typeof marked!=='undefined'&&marked&&marked.parse)?marked.parse(src,{gfm:true,breaks:false,headerIds:false,mangle:false}):src;guardMd(div);}catch(e){div.textContent=src;}` +" — the complete three-part route (vendored parse, guardMd scrub, textContent fallback) on one line. My third grep pattern matched 0 only because I wrote it without the trailing semicolon; the read shows the catch clause present. sc2's claim to reuse a shipped pattern rather than invent one is confirmed. | none — verified sound |
| sc3 | semantic | LOW | manual | The shipped marked invocation passes headerIds:false, so the existing render emits no heading ids and S001 ac2's jump-to-section has no anchor targets under straight reuse — which is the entire reason sc3 exists as a separate contract. | render-registry.ts:332 contains `headerIds:false` verbatim inside the marked.parse options. The grep for `headerIds:\\s*false` found exactly one source occurrence, at that line. This confirms the design tension sc3 exists to resolve: the shipped config emits no heading ids, so S001 ac2's jump-to-section has no anchor targets under straight reuse and sc3 must supply section identity itself. | none — verified sound |
| sc2 | citation | LOW | manual | The VS Code docs-review surface is the single factory createDocsReviewHost in vscode-plugin/src/chat/docs-review-panel.ts, spanning roughly lines 49-279, and it currently renders the body by assigning markdown to textContent rather than through any markdown renderer. | Both anchors resolved exactly. docs-review-panel.ts:49 is `export function createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost {` and :186 is "`function renderContent(m){bodyEl.textContent=m.markdown\|\|'';` +", the sole `bodyEl.textContent` occurrence in the repo. This confirms both halves of the premise: the surface is that one factory, and it currently renders the document body as raw text rather than through any markdown renderer — which is precisely the gap S001 closes. | none — verified sound |
| sc2 | semantic | LOW | manual | marked is already vendored inside the plugin as the MARKED_SRC string in vscode-plugin/src/chat/webview-marked.ts, so S001 reuses a shipped renderer and this Epic adds no markdown dependency. | webview-marked.ts:10 declares `export const MARKED_SRC: string = "/**\\n * marked v4.3.0 - a markdown parser ..."`, confirming both the vendoring and the exact version the HLD names. chat-panel.ts:18 imports it and :561 injects it into the nonce'd script tag, so the pattern is live in a shipping surface. S001's claim to reuse rather than add a markdown dependency is confirmed. | none — verified sound |
| a2 | citation | LOW | manual | A real generated companion file is 3,367,065 bytes of self-contained HTML with its own inline style and script blocks — the measured figure the HLD uses to reject alternative a2 on k1 and to justify never embedding a companion in the pane. | Corroborated, and more strongly than the premise claimed. The read confirms er-model.html:1 is `<!doctype html>`, a standalone document. The `docgen-diagram` grep returned the generator itself: src/docgen/render/fallback.ts:233 declares `#docgen-diagram { width: 100%; height: 100vh; }` and :240 emits `<div id="docgen-diagram">`, so the 100vh full-viewport layout the HLD cites as the k4 problem is confirmed in the generator source rather than inferred from one sample. The specific 3,367,065-byte figure was measured directly rather than re-derived by this probe, but the structural claim it supports — a self-contained document that dominates its container — is independently established. | none — verified sound |
| s1 | semantic | LOW | manual | The behaviours the HLD declares private to s1 and requires left unchanged genuinely exist in the pane today: a monotonic refresh guard that drops superseded responses, a COMMENTABLE_KINDS gate restricting request-changes to DEF/HLD/LLD, and a fail-closed rule that suppresses approve after a content-load failure. | Every behaviour the HLD declares private to s1 is confirmed in source. refreshSeq at docs-review-panel.ts:66/:75/:78/:83 with the comment 'superseded by a newer refresh — drop this response'; COMMENTABLE_KINDS at :25 as `new Set(['DEF','HLD','LLD'])`, consumed at :97 and :124; and the fail-closed rule at :111 ('so the review gate is not defeated') setting blocked:true at :117/:139/:155. There is even a dedicated regression test named 'HIGH-1: a content-fetch failure posts blocked:true so approve is suppressed (review not defeated)' at docs-review-panel.test.ts:179, which makes s1's ac5 obligation to leave the approval path unchanged mechanically checkable. | none — verified sound |
| sc1 | external-contract | LOW | manual | handleArtifactContent in src/workflow/artifact-content.ts already parses the artifact JSON into a typed body before assembling ArtifactReviewView, so projecting four more body fields requires no new read, no new parse and no new IPC method — the basis for the HLD's claim that sc1 costs one additive field and nothing else. | The full chain resolved. src/daemon/index.ts:698 registers `'workflow.artifactContent': async (params) => {`, :699 dynamically imports handleArtifactContent and :700 calls it — with the surrounding comment at :694 describing it as a 'pure read (handleArtifactContent) path-guarded under docs/'. src/workflow/artifact-content.ts:64 declares `interface ArtifactShape {`, the parse target, and :70 begins 'Assemble the sc2 ArtifactReviewView for a pending artifact'. The premise holds: the body is already parsed before the view is assembled, so projecting four more fields needs no new read, parse or IPC method. | none — verified sound |

#### Proposed fixes

- **sc1** (auto) — Evidence-derived: plan.ts:91 declares functionalDefinition? alongside define.ts:85, hld.ts:109 and lld.ts:155, so the enumerated kinds in sc1's comment are incomplete. Mechanical one-line correction with no design impact.
  - edit: `/** body.functionalDefinition, verbatim. DEF/HLD/LLD may carry it. */` → `/** body.functionalDefinition, verbatim. DEF/HLD/LLD/PLAN may carry it. */`

- **sc4** (auto) — companion/types.ts:24 proves CompanionKind has three members against CompanionVisualKind's two, so 'Mirrors' is factually wrong. Replacement states the real relation using only values the evidence confirms.
  - edit: `/** Which visual a slot holds. Mirrors CompanionKind so the label a reviewer  *  reads is derived from the ref, never guessed (S004 ac2). */` → `/** Which visual a slot holds. COLLAPSES CompanionKind's three members onto two  *  labels — both 'diagram-mermaid' and 'diagram-html' map to 'diagram', 'ux-mock'  *  maps to 'experience' — so the label a reviewer reads is derived from the ref,  *  never guessed (S004 ac2). */`

- **sc2** (assisted) — The read proves :243 is the test declaration line. Rewording avoids sending an implementer to the wrong line while preserving the citation's locating value.
  - edit: `The blanket assertion at docs-review-panel.test.ts:243 is the surface's only mechanical guarantee that nothing injects markup.` → `The blanket no-innerHTML test declared at docs-review-panel.test.ts:243 (its assertions sit inside that test body) is the surface's only mechanical guarantee that nothing injects markup.`
  - option: Reword the risky-bits cell to 'the no-innerHTML test at docs-review-panel.test.ts:243 (assertions inside its body)'
  - option: Leave as-is and let the Story's LLD resolve the exact assertion line when it narrows the test
