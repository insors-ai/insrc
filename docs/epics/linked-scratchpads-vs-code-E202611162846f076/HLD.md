<!-- insrc:artifact HLD-2846f076fd5f785f -->

# HLD: linked-scratchpads-vs-code

## Summary

**Tracker:** [insors-ai/insrc#185](https://github.com/insors-ai/insrc/issues/185)

Scratchpads use one Milkdown + Crepe editor pane with rich Markdown editing, insrc-owned lock controls and a selection Send button. The actual .md file remains a VS Code TextDocument, so standard save/conflict and backup behavior apply. The daemon index, shared contracts and story dependencies remain unchanged. This draft replaces the built-in-editor-only choice and requires aligned DEF and S001 LLD approval before build.

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

> See **DEF-2846f076fd5f785f** § 1. Problem

## 2. Framework summary

The daemon-owned private repository-keyed index remains authoritative for link resolution, backlinks and the title/preview list read-model. Client-side scratchpad editing now uses Milkdown + Crepe inside a VS Code CustomTextEditorProvider on the existing .md TextDocument, replacing the host's built-in vscode.markdown.editor. Insrc owns its selection toolbar and lock state without a native-editor extension API dependency. [[c40]] [[c41]] [[c42]]

## 3. Architecture shape

The existing three layers remain: client editor/host boundary owns document interactions and sc1; daemon index owns sc2; daemon list read-model owns sc3. The Milkdown model drives presentation while the VS Code TextDocument is canonical. Versioned transactions pass through the host bridge; host-origin edits, undo/redo and external changes synchronize back without echo or a second independent undo history. The exact transaction/patch policy is an S001 LLD requirement. This is explicit user-directed backflow; old DEF k3 is not claimed satisfied. [[c40]] [[c42]]

Selection -> display an accessible Send popup is local UI only. Click -> capture selected text and document identity/version -> validate/bound it in the host -> reveal chat and insert without submission. No clipboard, two-view split or automatic agent context. Read-only is insrc-owned; Send remains usable while locked. [[c40]] [[c41]]

Relationships: one URI has one TextDocument per window and may have multiple views. Each view owns transient selection/lock state and subscribes to that document; explicit selection snapshots feed the existing chat route. Daemon graph/index relationships and sc1/sc2/sc3 ownership are unchanged. Prose documents these cardinalities; a sequence companion documents changed interaction order. [[c42]]

## 4. Diagrams

- [Sequence diagram](./sequence-diagram.html)
- [Component dependencies](./component-dependency.html)

## 5. Shared contracts

### 5.1 sc1: ScratchpadRef

**Owner Story:** `s1`
**Consumed by:** `s2`, `s5`, `s7`, `s8`, `s9`

**Purpose:** The one cross-cutting note-identity primitive every link-, lifecycle-, and citation-facing story needs: a stable reference to a scratchpad that survives rename/move/archive/restore. Owned at s1 (the Epic's root) because s2 — which depends only on s1, not on s7 where identity is semantically 'about' — also needs it for the k2 tie-break.

**Interface sketch (type-level):**

```
interface ScratchpadRef {
  readonly repo: string;     // absolute registered repo path, or the well-known home-dir scope
  readonly stableId: string; // survives rename/move/archive/restore (s7)
}
```

**Assumptions cited:** [[c4]] [[c16]]

### 5.2 sc2: LinkResolutionAndBacklinks

**Owner Story:** `s5`
**Consumed by:** `s6`

**Purpose:** The daemon-backed, private, repository-keyed index k4 requires: qualified link-target identity across note/file/symbol/artifact, its resolution state (resolved/ambiguous/missing/unavailable), and the backlink query s6 reads. Owned by s5 (the authoring story), consumed by s6 (its direct dependent).

**Interface sketch (type-level):**

```
type LinkTargetKind = 'note' | 'file' | 'symbol' | 'artifact';

interface QualifiedLinkTarget {
  readonly kind: LinkTargetKind;
  readonly repo: string;
  readonly ref: string;       // stableId | path#qualifiedName | path | canonicalArtifactId
  readonly version?: string;  // qualified-target syntax version marker
}

type LinkResolutionState =
  | { readonly status: 'resolved'; readonly target: QualifiedLinkTarget }
  | { readonly status: 'ambiguous'; readonly candidates: readonly QualifiedLinkTarget[] }
  | { readonly status: 'missing' }
  | { readonly status: 'unavailable'; readonly reason: string };

interface BacklinkEntry {
  readonly source: ScratchpadRef;
  readonly target: QualifiedLinkTarget;
}

interface BacklinkQuery {
  readonly target: QualifiedLinkTarget;
}

interface BacklinkQueryResult {
  readonly entries: readonly BacklinkEntry[];
}
```

**Assumptions cited:** [[c4]] [[c14]]

### 5.3 sc3: ScratchpadListReadModel

**Owner Story:** `s2`
**Consumed by:** `s10`

**Purpose:** The daemon-served list/preview/title source s2 needs (closing the gap: listScratches() does no content reads today), extended by s10 with a tags field.

**Interface sketch (type-level):**

```
interface ScratchpadListEntry {
  readonly ref: ScratchpadRef;
  readonly title: string;                     // non-lossy, distinct from the id slug
  readonly previewLines: readonly string[];   // first 3 body lines, k2
  readonly mtime: number;
  readonly tags?: readonly string[];          // s10 extension point
}

interface ScratchpadListQuery {
  readonly limit: number;   // 10 (chat menu) or 20 (list panel), k2
  readonly search?: string; // list-panel relevance query, k1
}
```

**Assumptions cited:** [[c1]] [[c16]]

## 6. Story boundaries

### 6.1 Story STORY-2846f076fd5f785f-s1

**Owns:** `sc1`

Milkdown + Crepe hosted in one VS Code CustomTextEditorProvider pane is private to s1. It owns rendering/editing, per-pane lock/pencil controls, explicit selection Send popup, versioned transaction/document synchronization, local asset packaging and TextDocument lifecycle integration. It preserves the .md file and sc1 identity, replaces the old textarea/save protocol atomically and retains browse/new/delete/send/list-refresh behavior. Locked mode keeps selection and Send available; a custom tooltip may be needed because default formatting toolbars can hide when read-only. No s8 attachments, s7 metadata persistence, backlinks or search ranking are implemented here.

### 6.2 Story STORY-2846f076fd5f785f-s2

**Owns:** `sc3`
**Depends on:** `sc1`

The chat-menu cap-10 rendering, the list panel's cap-20/3-line-preview/delete UI, and the relevance-ranking algorithm itself (title-first, tie-break via sc1's stableId) are private to s2; sc3 exposes only the read-model shape (title/preview/mtime), not the ranking logic.

### 6.3 Story STORY-2846f076fd5f785f-s3


Find-in-note's match highlighting, wraparound navigation, and collapsed-section reveal operate entirely on the open editor's live text buffer — no cross-story data or contract is produced or consumed.

### 6.4 Story STORY-2846f076fd5f785f-s4


The entry-boundary/timestamp Markdown convention, day-grouping, and the Undated bucket are private to how one note's content renders; no story downstream of s4 in the Epic's dependency graph consumes dated-entry structure, so it is not exposed as a shared contract.

### 6.5 Story STORY-2846f076fd5f785f-s5

**Owns:** `sc2`
**Depends on:** `sc1`

The link-target picker UI and the qualified-target Markdown syntax (percent-encoded target segments, versioned, per the HLD's resolved open question) are private to s5; sc2 exposes only the resolved-reference and backlink-query shape s6 consumes, not the authoring UI or syntax.

### 6.6 Story STORY-2846f076fd5f785f-s6

**Depends on:** `sc2`

The backlink view's grouping-by-source-note rendering, on the pad and on file/symbol surfaces, is private UI; no story is downstream of s6 in the Epic's graph, so it exposes no further contract.

### 6.7 Story STORY-2846f076fd5f785f-s7

**Depends on:** `sc1`

The archive/restore state machine, the permanent-delete confirmation flow, and the decision of where stable ID/repo-association/archive-state are actually persisted are private to s7; it extends sc1's bare ScratchpadRef with lifecycle state but does not re-expose that lifecycle representation as a further contract, since s8/s9/s10 only need sc1's identity.

### 6.8 Story STORY-2846f076fd5f785f-s8

**Depends on:** `sc1`

The attach-to-turn picker UI, the removable-preview rendering, and revision-pinning for a queued turn are private to s8; it consumes sc1 to cite the note and exposes no further contract, since only s9 depends on s8 and s9's own need (provenance link) is satisfied by sc1 directly.

### 6.9 Story STORY-2846f076fd5f785f-s9

**Depends on:** `sc1`

The promote-to-draft action's brainstorm/ISSUE routing and idempotent-retry handling are private to s9; no story is downstream of s9 in the Epic's graph.

### 6.10 Story STORY-2846f076fd5f785f-s10

**Depends on:** `sc3`

The tag-filter UI and starter-template catalog are private to s10; it extends sc3's list read-model with the tags field but no story is downstream of s10 in the Epic's graph.

## 7. Non-functional targets

- **Performance:** The list panel (s2) must not re-parse every on-disk pad file per render; sc3's read-model is served from the daemon's index instead. Backlink-query latency targets and the note-size cap for sc2's new daemon IPC are explicitly an open PRD decision (DEF §8) to resolve before s2/s5/s6 build. Avoid full reparses/echo loops on selection updates; set a supported note-size/performance budget in S001 LLD.
- **Security:** The home-dir scratchpad store stays outside repo enrollment per k4; the daemon's new index only joins validated target identity (sc1/sc2), never widening default document search or repo registration to the store itself. Bundle editor assets locally under CSP. Validate bridge actions, target URI and version; no arbitrary file paths, command dispatch or cloud calls from document content. Library AI features remain disabled. Native I/O follows accepted VS Code behavior; guarded store operations remain distinct.
- **Observability:** Log identity/version and operation failures without note text. Surface unsupported syntax and synchronization errors while preserving original content/drafts. Distinguish fake tests from live host evidence.
- **Durability:** sc1's stableId must survive rename/move/archive/restore (s7); the daemon index's reconciliation strategy against the home-dir store's actual file state (so it never serves a stale binding indefinitely) is a design.story decision. Never write/normalize merely by opening a file. Unknown syntax, custom links and diagram fences must round-trip or unsafe edits must be refused with the original preserved. Never silently overwrite newer revisions. Validate cross-window conflict, undo/redo, reload and recovery against normal VS Code behavior.

## 8. Rollout

**Phase A — Milkdown editor foundation**

**Stories:** `s1`
**Flag:** `insrc.scratchpad.richEditor`

S001 establishes sc1 and the one-pane Milkdown/Crepe CustomTextEditorProvider. Before building, align and reapprove the DEF built-in-editor-only clauses and revised S001 LLD. Qualification of transaction sync, undo, locks, selection Send, assets and Markdown fidelity belongs to this phase.

**Backward compat:** Retain .md files and IDs, existing browse/new/delete and bounded explicit Send insertion. Replace the old document textarea/save channel atomically. Use normal VS Code save/conflict lifecycle. A disabled new rich-editor path opens the file as text with an explicit notice; never silently no-op or preserve the legacy custom document editor.

**Phase B1 — Link authoring + daemon backlink index**

**Stories:** `s5`
**Flag:** `insrc.scratchpad.backlinks`

Isolated from the rest of the P0 slice because s5 alone owns sc2, the Epic’s first new daemon-side persisted index and IPC contract; gating it separately lets the risky code ship behind insrc.scratchpad.backlinks without blocking s2/s3/s4/s7, which carry no daemon-index risk.

**Phase B2 — List, find, dated entries, lifecycle**

**Stories:** `s2`, `s3`, `s4`, `s7`

These four depend only on s1 (not on each other) and can land in parallel once Phase A ships; together with Phase B1's s5, they deliver sc3 (owned by s2) — one of the two contracts Phase C's consumers need. sc2 (owned by s5) ships separately in Phase B1. Split from s5 because none of these four stories touch the new daemon index's risk surface, so they should not sit behind its flag.

**Backward compat:** s2 changes existing, relied-upon behavior: the chat menu cap moves from 5 to 10 and the list panel moves from an unbounded table to a 20-item cap with previews — users with more than 20 existing pads must still be able to reach older ones via search. s7's identity work must not orphan pads created before stable IDs existed.

**Phase C — Backlinks, cited context, and tags**

**Stories:** `s6`, `s8`, `s10`
**Flag:** `insrc.scratchpad.backlinks`

s6 consumes sc2 (owned by s5, Phase B1); s8 consumes sc1 as extended by s7's lifecycle (Phase B2) and needs s5's resolution (Phase B1); s10 consumes sc3 (owned by s2, Phase B2) and s7's lifecycle (Phase B2). All three become buildable together only once Phase B1 and Phase B2's contract owners have shipped.

**Phase D — Promote to workflow draft**

**Stories:** `s9`

s9 depends on s8 (Phase C) for the attach/preview mechanics its promotion flow builds on.

**Ordering rationale:** Phase order follows the Epic’s own dependsOn edges plus the HLD’s contract-ownership placement: s1 is the sole Phase A story because every other story depends on it (directly or transitively) and it owns sc1. Phase B1 isolates s5 (owner of sc2, the new daemon index/IPC) behind its own flag; Phase B2 groups the remaining stories whose only dependency is s1 and which carry no daemon-index risk (s2, owner of sc3; s3; s4; s7). Both B1 and B2 depend only on Phase A and can land in either order relative to each other, but both must precede Phase C. Phase C groups every story whose dependencies are fully satisfied once B1+B2 ship (s6→s5, s8→s5+s7, s10→s2+s7). Phase D is s9 alone, the only story depending on a Phase C story (s8). No phase contains a story whose dependency lands in a later phase.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Upstream requirement alignment | Current DEF k3 and S001 acceptance/local constraints explicitly require the built-in Markdown editor, conflicting with this user-selected replacement. | Carry the proposed replacement wording in this HLD; update/reapprove DEF, then regenerate/reapprove S001 LLD before PLAN/build. HLD approval alone does not silently rewrite those records. |
| Markdown preservation and synchronization | A rich editor serializer may normalize or discard unsupported Markdown; independent histories and stale patches can overwrite user edits. | Use TextDocument as authority, define versioned transactions/undo ownership in LLD, never save on open, and run lossless/unsupported-syntax, undo/redo, external-edit and multi-window conflict fixtures. Refuse unsafe edits and retain original/draft content. |
| Single-pane UX and packaged assets | Default formatting tooltip behavior may hide in read-only mode; image/file handling and CSP can break a library integration. | Provide an owned accessible Send tooltip usable when locked, capture selection only on click, package assets locally, retain native lifecycle behavior and verify actual host lock/send/image/recovery flows. |

## 9. Alternatives considered

### 9.1 a1: Daemon-owned index plus a Milkdown custom text editor backed by VS Code TextDocument — **CHOSEN**

Keep the established daemon framework; use a single library-backed editable scratchpad pane with VS Code as document authority.

Preserve the HLD's daemon-owned, private repository-keyed link/backlink and list read-model framework, sc1/sc2/sc3 ownership and every story dependency. Replace only S001's editor substrate with Milkdown + Crepe inside a CustomTextEditorProvider view of the existing Markdown file. VS Code TextDocument is canonical for dirty state, save/conflict and backups.

Insrc owns presentation, editable/locked state and a selection Send action in that same pane. The editor's transaction stream is version-synchronized to the TextDocument; host-origin changes are synchronized back without feedback loops or duplicate undo histories. No separate reader, clipboard workaround, local cloud client or patched built-in editor. All syntax fidelity and lifecycle claims require validation before shipping.

**Pros:**
- Direct control of the selection toolbar and lock state without a VS Code selection API dependency.
- Real .md file and standard VS Code document lifecycle are retained while existing daemon contracts remain unchanged.
- The user-selected component supplies rich editing rather than another bespoke textarea/save protocol.

**Cons:**
- Requires DEF native-editor-only clauses and S001 LLD to be amended and reapproved before build.
- Transaction mapping, undo coordination, external edits, unsupported syntax preservation, images and locked-mode selection require integration work and evidence; no lossless guarantee is assumed.

**Cost estimate:** L

### 9.2 a2: Daemon-owned index plus a Milkdown webview with store-owned document lifecycle

Use the same single-pane library but make insrc's guarded store own editing and save state.

Keep the same daemon index and shared contracts, embedding Milkdown in an editor-area webview with its own buffer and guarded ScratchStore persistence. Selection Send and locking are fully owned, and the existing store is the only publisher.

Insrc must additionally own dirty tracking, Save commands, backup recovery, external-file synchronization, conflicts and undo persistence for the custom document model. This avoids relying on native file I/O but moves responsibility away from the standard TextDocument flow the user accepted.

**Pros:**
- Selection and lock UI remain in one pane.
- Store-owned writes can retain the store's own existing guards.

**Cons:**
- Duplicates document lifecycle infrastructure and departs from the user-accepted normal VS Code save boundary.
- More application-owned failure/recovery behavior and maintenance than a CustomTextEditorProvider.

**Cost estimate:** L

**Rejected because:** Duplicates save/backup/conflict lifecycle and loses the selected normal VS Code document boundary.

## 10. UX

- [UX mock](./ux-mock.html)

## 11. References

- **[[c1]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html` — "Settled mock UI decisions: menu cap 10; list panel 20 pads newest-first, 3-line previews, per-row delete, in-panel relevance search; pad = built-in Markdown Editor locked with pencil inline-edit; sepa"
- **[[c4]]** `code` `src/db/doc-relations.ts` — "Daemon link extraction targets files only, strips fragments; no symbol/artifact resolution, no backlink projection."
- **[[c14]]** `code` `src/workflow/artifact-ids.ts` — "ArtifactIds is 'the one identity scheme for every artifact' — it already builds and parses every artifact id form (DEF-<h>, LLD-<h>-s1, TASK-<h>-s1-t3, AMD-<h>-2, ...) and RequirementIds does the same"
- **[[c16]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "ScratchEntry is {id, name, mtime, size} only; listScratches() is pure readdir+stat; it reads no file content. Neither a real title nor body preview text exists today for the list to show."
- **[[c20]]** `code` `vscode-plugin/src/chat/scratch-host.ts`
- **[[c21]]** `code` `vscode-plugin/src/panels/scratch-panels.ts`
- **[[c22]]** `code` `vscode-plugin/src/hosts/specs.ts`
- **[[c23]]** `code` `vscode-plugin/src/hosts/types.ts`
- **[[c24]]** `code` `vscode-plugin/src/extension.ts`
- **[[c25]]** `code` `src/db/entities.ts`
- **[[c26]]** `code` `src/db/relations.ts`
- **[[c27]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c40]]** `stakeholder` `User chat — Milkdown direction selected, 2026-11-27` — "User rejected clipboard/two views, requested embeddable JS Markdown libraries, checked Milkdown and said it looks good. Normal VS Code save behavior accepted; Send requires a click and only inserts in"
- **[[c41]]** `doc` `https://milkdown.dev/docs/api/crepe` — "Crepe has a configurable floating selection toolbar; library controls and plugins are owned by the embedding application. Source confirms editable control and customizable tooltip; no integration/roun"
- **[[c42]]** `doc` `https://code.visualstudio.com/api/extension-guides/custom-editors` — "CustomTextEditorProvider renders an owned webview over a VS Code TextDocument; changes must synchronize to that document."
- **[[c43]]** `analyze-bundle` `design.epic/context.assemble — scratchpad profile/import/convention and selection-reuse analysis` — "Existing scratchpad controller, store, scratch host, activation and tests provide integration seams. Graph coverage is incomplete and supplemented by direct reads."

## 12. Open questions

- BACKFLOW REQUIRED BEFORE BUILD — Current DEF k3, FR005, S001 FR001/lc1/lc2 and ac1/ac3 require the built-in editor. Proposed replacement: scratchpads open in one insrc-owned Milkdown + Crepe CustomTextEditorProvider pane on the real .md TextDocument; rich editing and insrc-owned lock/pencil/selection Send are in that pane; normal VS Code document save/conflict applies. Retire the old textarea/document-save protocol, not all webview rendering. Update/reapprove DEF and rebase/reapprove S001 LLD before PLAN/build; this HLD draft does not mutate or approve those upstream records.
- The user previously accepted remembered lock mode for the built-in editor because no lock API existed. Milkdown allows insrc-owned locking. Proposed UX restores locked-by-default per new pane with pencil/lock controls; confirm this in the revised S001 LLD rather than silently treating a mode preference as mandatory to preserve.
- S001 LLD must define concrete synchronization/undo ownership, version rejection, pending-edit drain, conflict recovery, text/image insertion and save notifications. Libraries are not proof of working VS Code integration.
- Qualify exact supported Markdown syntax and note-size budget against real files: zero writes on open, no silent loss of unknown content, custom links, front matter, HTML/comments and diagram fences. Unsupported edits preserve the original and report the limitation. No live qualification has been performed.
- Shared sc1/sc2/sc3 and all story dependencies remain unchanged. S007 owns persisted repo association and rename/move/archive identity; S008 owns cited attachments. No need for an ERD because this revision adds no new persistent entity relationship; component, sequence and illustrative one-pane UX definitions document the changed boundary.

## Resolved questions

- `q5818e4e2` — BACKFLOW REQUIRED BEFORE BUILD — Current DEF k3, FR005, S001 FR001/lc1/lc2 and ac1/ac3 require the built-in editor. Proposed replacement: scratchpads open in one insrc-owned Milkdown + Crepe CustomTextEditorProvider pane on the real .md TextDocument; rich editing and insrc-owned lock/pencil/selection Send are in that pane; normal VS Code document save/conflict applies. Retire the old textarea/document-save protocol, not all webview rendering. Update/reapprove DEF and rebase/reapprove S001 LLD before PLAN/build; this HLD draft does not mutate or approve those upstream records.
  - **resolved**: Full DEF/LLD rebase — DEF revision 7 and HLD revision 5 have both been explicitly presented and approved by the user. DEF now replaces k3, S001 native-only clauses and records explicit click-only Send (ac4), with sibling stories/IDs preserved. This run is the required regeneration of the S001 LLD; its separate approval remains required before PLAN/build. _(2026-11-27T18:31:41.505Z)_
- `qecf05066` — The user previously accepted remembered lock mode for the built-in editor because no lock API existed. Milkdown allows insrc-owned locking. Proposed UX restores locked-by-default per new pane with pencil/lock controls; confirm this in the revised S001 LLD rather than silently treating a mode preference as mandatory to preserve.
  - **resolved**: Keep remembered mode with insrc-owned pencil/lock controls — The user explicitly accepted remembered mode earlier; no later request explicitly reverses that behavior. Preserve it rather than silently imposing a fresh lock on every open. Use an insrc-owned preference for Milkdown, initially locked when no preference exists, with per-pane immediate lock/pencil controls and future-pane remembered mode. Do not read or mutate the bundled editor's private storage. Declare this behavior in the new LLD for review. _(2026-11-27T18:32:49.459Z)_
- `q414b9943` — S001 LLD must define concrete synchronization/undo ownership, version rejection, pending-edit drain, conflict recovery, text/image insertion and save notifications. Libraries are not proof of working VS Code integration.
  - **resolved**: VS Code TextDocument authority with a versioned extension-host bridge; no daemon document authority — Approved HLD revision 5 explicitly makes TextDocument canonical and keeps editor integration client-side. Reject generated choices that add daemon editing/CRDT ownership. The LLD will specify serialized per-document edits, version checks, one in-flight proposal per pane, pending-edit drain before Send/save/undo, host undo/redo authority, error/draft recovery and scoped save notifications; none are claimed implemented or tested. _(2026-11-27T18:33:34.001Z)_
- `q673cd46a` — Qualify exact supported Markdown syntax and note-size budget against real files: zero writes on open, no silent loss of unknown content, custom links, front matter, HTML/comments and diagram fences. Unsupported edits preserve the original and report the limitation. No live qualification has been performed.
  - **resolved**: Mandatory complete syntax/lifecycle qualification during implementation validation; explicit safe refusal in the LLD — Approved HLD requires qualification before shipping and says no live qualification is yet performed; it does not require an implementation to exist before designing it. The LLD will define zero writes on open, no unknown-content loss, supported-syntax admission/refusal, a bounded size budget and exhaustive real-corpus plus adversarial round-trip/host tests. No best-effort silent degradation or qualification waiver. Failed qualification blocks build validation/approval. _(2026-11-27T18:34:10.738Z)_

## Citations

- **[[c1]]** `doc` `docs/reqs/enhanced-scratchpad-prd.html` — "Settled mock UI decisions: menu cap 10; list panel 20 pads newest-first, 3-line previews, per-row delete, in-panel relevance search; pad = built-in Markdown Editor locked with pencil inline-edit; sepa"
- **[[c4]]** `code` `src/db/doc-relations.ts` — "Daemon link extraction targets files only, strips fragments; no symbol/artifact resolution, no backlink projection."
- **[[c14]]** `code` `src/workflow/artifact-ids.ts` — "ArtifactIds is 'the one identity scheme for every artifact' — it already builds and parses every artifact id form (DEF-<h>, LLD-<h>-s1, TASK-<h>-s1-t3, AMD-<h>-2, ...) and RequirementIds does the same"
- **[[c16]]** `code` `vscode-plugin/src/chat/scratch-store.ts` — "ScratchEntry is {id, name, mtime, size} only; listScratches() is pure readdir+stat; it reads no file content. Neither a real title nor body preview text exists today for the list to show."
- **[[c20]]** `code` `vscode-plugin/src/chat/scratch-host.ts`
- **[[c21]]** `code` `vscode-plugin/src/panels/scratch-panels.ts`
- **[[c22]]** `code` `vscode-plugin/src/hosts/specs.ts`
- **[[c23]]** `code` `vscode-plugin/src/hosts/types.ts`
- **[[c24]]** `code` `vscode-plugin/src/extension.ts`
- **[[c25]]** `code` `src/db/entities.ts`
- **[[c26]]** `code` `src/db/relations.ts`
- **[[c27]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c40]]** `stakeholder` `User chat — Milkdown direction selected, 2026-11-27` — "User rejected clipboard/two views, requested embeddable JS Markdown libraries, checked Milkdown and said it looks good. Normal VS Code save behavior accepted; Send requires a click and only inserts in"
- **[[c41]]** `doc` `https://milkdown.dev/docs/api/crepe` — "Crepe has a configurable floating selection toolbar; library controls and plugins are owned by the embedding application. Source confirms editable control and customizable tooltip; no integration/roun"
- **[[c42]]** `doc` `https://code.visualstudio.com/api/extension-guides/custom-editors` — "CustomTextEditorProvider renders an owned webview over a VS Code TextDocument; changes must synchronize to that document."
- **[[c43]]** `analyze-bundle` `design.epic/context.assemble — scratchpad profile/import/convention and selection-reuse analysis` — "Existing scratchpad controller, store, scratch host, activation and tests provide integration seams. Graph coverage is incomplete and supplemented by direct reads."
