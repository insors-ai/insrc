<!-- insrc:artifact DEF-bfe98ff7f97178cf -->

# Epic: build-vs-code-plugin-ui-integration

## Summary

**Flavor:** enhancement

Reviewers in VS Code approve the documents that gate every workflow stage, but the in-editor surface shows them only as flat text. The functional outcomes a document commits to, its reader-oriented structure, and the diagrams and experience mocks it carries are all invisible there — so approvals are given without sight of the content most likely to change the decision. This Epic makes the VS Code review surface show a generated document as it was meant to be read: its functional commitments legible and traceable, its structure navigable, and its visual companions displayed alongside the design they belong to.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)

## 1. Problem

The workflow now ends every stage in a document that carries far more than prose: a structured record of the functional outcomes the work commits to, a body deliberately shaped for human reading, and — where the content warrants it — visual companions that show a data shape or the intended user-facing experience rather than describing it. A reviewer working in VS Code cannot see any of that. The one in-editor surface that lists and opens pending documents renders them as a plain textual shell, so the functional record arrives as undifferentiated text a reviewer cannot scan, check off, or trace from one stage to the next; the body's deliberate structure is flattened back into the wall of text it was reshaped to avoid; and the visual companions — the very parts produced precisely because a picture carries what prose cannot — are not shown at all, leaving a reviewer to approve a design while unable to see the data shape or the experience it commits to. The gap falls exactly at the human-in-the-loop gate the workflow most depends on: the reviewer is asked for an approval that unlocks the next stage, on the strength of a document whose most decision-relevant content is invisible to them where they work. The alternative is to leave the editor and open the files by hand, which is the flow-break the in-editor surface existed to remove, so in practice the review is skimmed or the richer content is simply never consulted. The cost concentrates on VS Code users and on the newest, most decision-bearing parts of every document, and it grows with each document the workflow generates.

## 2. Functional requirements

- **E20260929bfe98ff7:FR001** — A reviewer opening a generated workflow document in VS Code sees its functional requirements as discrete, individually identified outcomes rather than undifferentiated prose. _(The functional record is the part a non-implementer reviewer is least able to reconstruct from flat text, and it is the thread the workflow later checks completion against.)_
- **E20260929bfe98ff7:FR002** — A reviewer can navigate a generated document by its structure rather than scrolling its full length. _(The documents were deliberately reshaped for human reading; a flat rendering discards that work and returns the reviewer to the original problem.)_
- **E20260929bfe98ff7:FR003** — When a document carries a visual companion, the reviewer sees that visual alongside the part of the design it depicts, without leaving the editor. _(A companion exists only because the content was judged clearer shown than described; not showing it withholds exactly the content that was meant to carry the decision.)_
- **E20260929bfe98ff7:FR004** — When a document carries no visual companion, the reviewer's surface shows no empty or placeholder visual area. _(Companions are content-gated by design; manufacturing a slot for an absent visual would reintroduce the noise the gating exists to prevent.)_
- **E20260929bfe98ff7:FR005** — A reviewer can tell, from the surface itself, when a document's companion cannot be shown, instead of silently seeing nothing. _(A silent omission is indistinguishable from a document that legitimately has no companion, which would let a reviewer approve believing they saw everything.)_
- **E20260929bfe98ff7:FR006** — The reviewer can still complete the existing read-and-approve path for a document whose richer content is present. _(The surface's existing purpose is the approval gate; richer rendering must extend that path rather than displace it.)_

**s1:**

- **E20260929bfe98ff7:S001:FR001** — A reviewer viewing a generated document sees its structural elements presented distinctly rather than as uniform plain text. _(The body was deliberately reshaped for human reading; showing it flat discards that work.)_
- **E20260929bfe98ff7:S001:FR002** — A reviewer can move directly to a chosen section of a document without scrolling through the sections before it. _(Navigability is what makes a long review document usable at the gate.)_
- **E20260929bfe98ff7:S001:FR003** — A document whose content cannot be presented as structured is still shown in full as readable text rather than failing to open. _(A reviewer must never be blocked from reading a pending document by a presentation problem.)_

**s2:**

- **E20260929bfe98ff7:S002:FR001** — A reviewer sees each of a document's functional requirements as a separate, individually readable item. _(A reviewer cannot check off or object to a specific commitment that is buried inside a paragraph.)_
- **E20260929bfe98ff7:S002:FR002** — Each displayed functional requirement shows the identifier the document assigns it, unchanged. _(The identifier is what lets the same commitment be recognised across stages and checked at completion.)_
- **E20260929bfe98ff7:S002:FR003** — A document that carries no functional requirements shows no functional-requirements area at all. _(An empty section implies something is missing rather than that none were applicable.)_

**s3:**

- **E20260929bfe98ff7:S003:FR001** — A reviewer viewing a document that carries a design diagram sees that diagram rendered as a visual, next to the part of the document it depicts. _(The diagram exists only because the content was judged clearer shown than described.)_
- **E20260929bfe98ff7:S003:FR002** — A reviewer viewing a document that carries no design diagram sees no diagram area. _(Diagrams are content-gated; a reserved slot would reintroduce the noise the gating prevents.)_
- **E20260929bfe98ff7:S003:FR003** — A reviewer is told when a document's diagram exists but cannot be displayed. _(A silent omission is indistinguishable from a document that legitimately has no diagram.)_
- **E20260929bfe98ff7:S003:FR004** — The document body remains fully readable whether or not a diagram is shown. _(The body is the authoritative content; the diagram is an adjunct to it.)_

**s4:**

- **E20260929bfe98ff7:S004:FR001** — A reviewer viewing a document that carries an experience mock sees that mock displayed as a visual representation of the intended user-facing experience. _(The reviewer is being asked to approve a design against an agreed experience; they must be able to see it.)_
- **E20260929bfe98ff7:S004:FR002** — A reviewer can tell the experience mock apart from a design diagram when a document carries both. _(The two answer different questions and conflating them would mislead the reviewer about what they are approving.)_
- **E20260929bfe98ff7:S004:FR003** — A reviewer viewing a document with no experience mock sees no experience area. _(Only work with a user-facing surface carries a mock; a reserved slot would imply one is missing.)_
- **E20260929bfe98ff7:S004:FR004** — A reviewer is told when an experience mock exists but cannot be displayed. _(Silently showing nothing would let a reviewer approve believing no experience was specified.)_

## 3. Non-goals

- **Changing how documents or their companions are generated, or what any of them contain.** — Generation was settled by the producing Epic and is already complete; this Epic is purely about what a reviewer is shown. Altering generation here would fork a shipped contract [[c3]].
- **Introducing a new daemon IPC method or a second, parallel artifact read surface for the review pane.** — The pane already reads through workflow.pending / workflow.artifactContent [[c6]] and must keep doing so. This rules out a NEW method or a parallel path; it does NOT rule out extending the existing ArtifactReviewView response with additive optional fields, which S003 and S004 require because that response carries no companion references today - and which serves the JetBrains review panel by the same change.
- **Bringing this rendering to the JetBrains plugin, or converging the two IDE plugins on a single shared markdown renderer.** — The JetBrains review panel already has its own hand-rolled renderer at jetbrains-plugin/src/main/resources/insrc-review/markdown-renderer.js. Converging the two IDEs on one renderer is worthwhile but is separate follow-up work carrying its own no-regression risk; folding it in would make this Epic two features rather than one release. This Epic reuses what the VS Code plugin already bundles and touches no other client.
- **Adding annotation, inline commenting, or feedback capture to the VS Code review surface.** — Those are distinct reviewer capabilities with their own record-keeping semantics, already framed elsewhere; folding them in would make this Epic two features rather than one release.
- **Making a visual companion a required element of the review surface.** — Companion inclusion is content-gated by explicit stakeholder decision [[c4]]; a surface that demanded one would contradict the rule that produced them.
- **Retrofitting the display for documents generated before this change.** — The producing Epic is forward-only by stakeholder decision [[c3]]; older documents do not carry the structured content this surface would render, so there is nothing to display for them.

## 4. Assumptions

- `high` The structured functional record and both companion kinds already exist as concrete, typed content on generated documents, so this work consumes a settled shape rather than negotiating a new one. [[c5]]
- `high` The review pane's existing read path is workflow.pending plus workflow.artifactContent, returning an ArtifactReviewView carrying artifactId, kind, renderedMarkdown, openQuestions and approvable. It carries the document body as a verbatim markdown string but NO companion references and no structured body - sufficient for S001/S002, insufficient for S003/S004. This Epic therefore EXTENDS that existing response ADDITIVELY with the companion references already on disk; it introduces no new IPC method and no second read surface. [[c6]]
- `high` A generated document names its companions through an explicit reference record rather than embedding them: CompanionArtifactRef, carrying kind, relPath, title and an optional ofSectionId, where relPath points at a companion FILE that is a sibling of the artifact .md. CompanionKind is a closed three-member union - diagram-mermaid, diagram-html and ux-mock - of which only diagram-mermaid and ux-mock are produced today; diagram-html is declared but reserved/deferred. [[c11]]
- `high` The VS Code review surface already lists pending documents and carries the read-and-approve path, so this work extends a shipped surface rather than introducing one. [[c1]]
- `high` The surface's rendering discipline is fixed and enforced by its own contract test (docs-review-panel.test.ts:243 asserts no innerHTML on that surface). Richer rendering must either satisfy that discipline as it stands, or adopt the marked+guardMd pattern already sanctioned on the chat surface — in which case the contract test must be updated deliberately, as part of the same change, per k1. The discipline is never relaxed incidentally. [[c2]]
- `high` The VS Code plugin ALREADY ships a full GFM markdown renderer: marked v4.3.0 is a runtime dependency (vscode-plugin/package.json), vendored as the MARKED_SRC string in vscode-plugin/src/chat/webview-marked.ts so the CSP-locked webview needs no network fetch, and used by the chat surface at vscode-plugin/src/chat/render-registry.ts:228 via marked.parse(...) plus the guardMd sanitiser (:217-220), with a textContent fallback on throw. S001 REUSES that existing renderer rather than building or extracting one. The JetBrains hand-rolled markdown-renderer.js is explicitly NOT the reuse target - render-registry.ts:210-211 records that marked replaced this plugin's own incomplete hand-rolled parser, so adopting a conservative-subset parser would regress it. Diagram and UX-mock rendering remain net-new here. [[c10]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | invariant | Rendered content must stay within the surface's existing single-nonce, strict-CSP discipline. Ad-hoc unsanitised HTML injection is forbidden; the sanctioned route is the pattern already shipped in this plugin - a vendored library render followed by the guardMd scrub and a textContent fallback on failure (vscode-plugin/src/chat/render-registry.ts:217-229). The docs-review surface's own contract test currently asserts no innerHTML at all, so adopting that pattern on that surface is an explicit, deliberate HLD decision that must update the contract test - never an incidental relaxation. | [[c2]] |
| `k2` | contract | The review surface must obtain documents and companions through the existing workflow.pending / workflow.artifactContent read path over the shared client. That response may be EXTENDED ADDITIVELY, by adding optional fields to ArtifactReviewView, to carry companion references; no new IPC method or parallel read surface may be introduced, and existing consumers must keep working unchanged. | [[c7]] |
| `k3` | stakeholder | A visual companion is displayed only when the document actually carries one; the surface must never fabricate, request, or reserve space for an absent companion. | [[c4]] |
| `k4` | stakeholder | The document body remains the authoritative content and a companion is always shown as a referenced adjunct to it, never as a replacement for the body. | [[c3]] |
| `k5` | invariant | The functional record as displayed must preserve each requirement's identity exactly as the document carries it, so the displayed outcome can be traced to the same requirement at every other stage. | [[c8]] |
| `k6` | convention | All rendering runs locally within the editor; no document or companion content may be sent to an external service to be rendered. | [[c9]] |
| `k7` | contract | The work is confined to the VS Code plugin and the daemon response it reads, and is enforced as an HLD-OWNED architectural boundary rather than by any single Story's acceptance criteria. The HLD must carry an explicit check for both obligations: (1) no generation-side document or companion contract is altered; (2) the ArtifactReviewView change is additive only, so existing consumers - including the JetBrains review panel - keep working unchanged. | [[c5]] |

## 6. Stories

### 6.1 E20260929bfe98ff7:S001 — Read a generated document in the editor as a structured, navigable document

**User value:** `size: M`

A reviewer opens a pending document in VS Code and reads it the way it was written to be read — headings, sections and emphasis intact, with a way to jump to the part they care about — instead of scrolling a wall of flat text.

**Extends:** [[c1]] [[c2]] [[c7]] [[c10]]

**Acceptance criteria:**

- **ac1:** Given a pending generated document whose body carries structural elements such as headings, lists and emphasis, when a reviewer opens it in the editor's review surface, then those elements are presented visually distinctly from one another, so the document reads as a structured document rather than as uniform plain text. _(operationalizes `k1`, `k4`)_
- **ac2:** Given an opened document containing multiple sections, when the reviewer chooses one of its sections from the surface, then the view moves directly to that section without the reviewer scrolling through the intervening content. _(operationalizes `k1`)_
- **ac3:** Given a document whose content is malformed or cannot be presented as a structured document, when the reviewer opens it, then the full content is still shown as readable text and the reviewer is told the structured presentation was unavailable, rather than the surface showing nothing or refusing to open. _(operationalizes `k4`)_
- **ac4:** Given any document opened through this surface, when its content is presented, then the content is constructed within the surface's existing content-security discipline and is obtained through the already-available artifact read path, with no new server-side capability introduced. _(operationalizes `k1`, `k2`, `k6`)_
- **ac5:** Given a reviewer reading an opened document, when they act to approve it, then the existing approval path completes exactly as it did before this Story. _(operationalizes `k2`)_

**Local constraints:**

- `lc1` (contract) The reviewer's existing ability to list pending documents and complete the read-and-approve path must remain available and unchanged in behaviour throughout this Story. [[c1]]

### 6.2 E20260929bfe98ff7:S002 — See a document's functional commitments as discrete, identified, traceable outcomes

**User value:** `size: M`

A reviewer — including a non-technical one — can see exactly which outcomes the work commits to, read them one at a time with their identifiers, and recognise the same outcome when it reappears in a later document.

**Depends on:** `s1`

**Extends:** [[c8]]

**Acceptance criteria:**

- **ac1:** Given a document carrying a set of functional requirements, when a reviewer opens it, then each requirement is presented as its own discrete item, visually separated from the others and from the surrounding prose. _(operationalizes `k5`)_
- **ac2:** Given a displayed functional requirement, when the reviewer reads it, then the identifier the document assigns that requirement is shown alongside it, character-for-character as the document carries it. _(operationalizes `k5`)_
- **ac3:** Given an upstream and a downstream document that both carry the same functional requirement, when the reviewer opens each in turn, then the requirement appears under the same identifier in both, so the reviewer can recognise it as the same commitment. _(operationalizes `k5`)_
- **ac4:** Given a document that carries no functional requirements, when the reviewer opens it, then no functional-requirements area is shown at all, rather than an empty or placeholder one. _(operationalizes `k3`)_

### 6.3 E20260929bfe98ff7:S003 — See a document's design diagram where the document carries one

**User value:** `size: L`

When a design's data shape or structure was judged clearer shown than described, the reviewer sees that diagram while reading the design it belongs to, instead of approving a structure they cannot picture.

**Depends on:** `s1`

**Extends:** [[c5]] [[c11]]

**Acceptance criteria:**

- **ac1:** Given a document that references a design diagram companion, when a reviewer opens the document, then the diagram is resolved from that reference and displayed as a visual within the surface, positioned with the part of the document that references it. _(operationalizes `k2`, `k4`)_
- **ac2:** Given a document that references no design diagram companion, when the reviewer opens it, then no diagram area, placeholder or empty frame is shown, and no attempt is made to obtain a diagram. _(operationalizes `k3`)_
- **ac3:** Given a document that references a design diagram whose companion is missing, unreadable, or fails to render, when the reviewer opens it, then the surface states that a diagram was referenced but could not be shown, and the document body remains fully readable. _(operationalizes `k4`)_
- **ac4:** Given a diagram being displayed, when it is produced for display, then it is rendered entirely within the editor from content obtained through the existing artifact read path, with no content sent to any external service and no raw markup injected. _(operationalizes `k1`, `k2`, `k6`)_

**Local constraints:**

- `lc1` (contract) CompanionKind is a closed three-member union - diagram-mermaid, diagram-html and ux-mock. This Story renders diagram-mermaid; the declared-but-unproduced diagram-html must route to this Story's referenced-but-could-not-be-shown path (ac3) rather than falling through silently, so no companion kind can ever render as nothing. [[c11]]

### 6.4 E20260929bfe98ff7:S004 — See the intended user experience where a document carries an experience mock

**User value:** `size: L`

When a piece of work has a user-facing surface, the reviewer can see the experience it is meant to deliver while reading the design that must honour it, rather than approving a design against an experience they have never seen.

**Depends on:** `s3`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac1:** Given a document that references an experience mock companion, when a reviewer opens the document, then the mock is resolved from that reference and displayed as a visual representation of the intended experience, alongside the design that must honour it. _(operationalizes `k2`, `k4`)_
- **ac2:** Given a document that carries both a design diagram and an experience mock, when the reviewer opens it, then both are shown and each is labelled so the reviewer can tell which is the structural diagram and which is the intended experience. _(operationalizes `k4`)_
- **ac3:** Given a document that references no experience mock, when the reviewer opens it, then no experience area, placeholder or empty frame is shown, and no attempt is made to obtain a mock. _(operationalizes `k3`)_
- **ac4:** Given a document that references an experience mock whose companion is missing, unreadable, or fails to render, when the reviewer opens it, then the surface states that an experience mock was referenced but could not be shown, and the document body remains fully readable. _(operationalizes `k4`)_
- **ac5:** Given an experience mock being displayed, when it is produced for display, then it is rendered entirely within the editor from content obtained through the existing artifact read path, within the surface's content-security discipline and with no content sent to any external service. _(operationalizes `k1`, `k2`, `k6`)_

## 7. References

- **[[c1]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts:49` — "createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost — the single injectable host factory (lines 49-279); the plugin's entire artifact-document surface, 13262 bytes, 3 exports."
- **[[c2]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:243` — "rendered shell: one nonce, strict CSP, docs-review surface, no innerHTML"
- **[[c3]]** `prior-artifact` `docs/epics/make-workflow-framework-s-generated-artifact-E20260927c5824e17/DEF.md (k1, k6)` — "The core document body of every artifact type must remain well-structured markdown; any visual (UML/Mermaid or UX/HTML) is a separate companion artifact referenced from the markdown, never inlined int"
- **[[c4]]** `prior-artifact` `docs/epics/make-workflow-framework-s-generated-artifact-E20260927c5824e17/DEF.md (k3)` — "Diagram inclusion is content-gated — the document flow must assess per-document whether a diagram is genuinely useful and only then generate one; diagrams are never mandatory."
- **[[c5]]** `code` `src/workflow/artifacts/companion/ux.ts:119 + src/workflow/artifacts/companion/er.ts:51` — "UxDefinition (interface, ux.ts:119-123) and ErDefinition (interface, er.ts:51-54) — the two companion types generated documents carry."
- **[[c6]]** `code` `src/daemon/index.ts - workflow.artifactContent (ArtifactReviewView at src/workflow/artifact-content.ts:45) + workflow.pending` — "ArtifactReviewView carries artifactId, kind, renderedMarkdown, openQuestions, approvable and an optional blockReason - the review pane's actual read surface, reached as workflow.artifactContent with a"
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts:110` — "the client is built over the shared daemon IPC client (no new capability, k5)"
- **[[c8]]** `code` `src/workflow/artifacts/functional-definition.ts:26` — "FunctionalRequirement (interface, lines 26-35) and FunctionalDefinition (interface, lines 38-40), with FrId and validateFunctionalDefinition — the structured functional record carried on generated doc"
- **[[c9]]** `convention` `CLAUDE.md — project principles` — "No direct cloud REST calls from our process. Cloud LLM access happens through the locally-installed claude and codex CLI binaries (via CliProvider)."
- **[[c10]]** `code` `vscode-plugin/src/chat/render-registry.ts:228 + vscode-plugin/src/chat/webview-marked.ts + vscode-plugin/package.json` — "div.innerHTML=(typeof marked!=='undefined'&&marked&&marked.parse)?marked.parse(src,...):src;guardMd(div); - the chat surface's shipped render path. marked v4.3.0 is a runtime dependency, vendored as M"
- **[[c11]]** `code` `src/workflow/artifacts/companion/types.ts` — "CompanionArtifactRef — the markdown-to-companion reference record a client resolves to locate a companion."
