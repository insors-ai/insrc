<!-- insrc:artifact HLD-2846f076fd5f785f -->

# HLD: linked-scratchpads-vs-code

## Summary

**Tracker:** [insors-ai/insrc#185](https://github.com/insors-ai/insrc/issues/185)

The Epic builds the scratchpad into a daemon-backed knowledge surface: a new, private per-repository link index lets notes point at other notes, code, and tracked workflow artifacts, with backlinks visible from any of those targets. The scratchpad list becomes fast and searchable by relevance, and the pad itself opens in VS Code's own native Markdown editor instead of a bespoke webview.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. Problem context

> See **DEF-2846f076fd5f785f** § 1. Problem

## 2. Framework summary

The Epic adopts the daemon-owned link/backlink index (winning alternative a1): a new, private, repository-keyed scratchpad index lives in src/db alongside doc-relations.ts, built on the existing graph (entities.ts, relations.ts) and ArtifactIds, and becomes the single source of truth for link resolution, backlinks, and the list's title/preview read-model. vscode-plugin's chat/ and panels/ modules stay thin UI clients over daemon IPC for everything except the native editor's own file-opening mechanics, which remain entirely client-side.

## 3. Architecture shape

Three layers: (1) the native-editor substrate (s1; host-capability probe via hosts/specs.ts's getExtension; openWith on the real file) stays wholly client-side and establishes the Epic's one cross-cutting identity primitive, ScratchpadRef (sc1); (2) a new daemon-side scratchpad-link module, extending src/db alongside doc-relations.ts and reusing entities.ts/relations.ts/ArtifactIds, owns link-target resolution and the private repository-keyed backlink index (sc2, owned by s5, per k4's invariant); (3) a daemon-served list read-model (sc3, owned by s2) gives the list panel real title/preview/mtime data without per-render re-parsing, closing the content/title-source gap found when scratch-store.ts's listScratches() was shown to do no content reads. Every story's new command/menu/openWith registration lands through the same vscode-plugin/src/extension.ts activation wiring already dominant in both chat/ and panels/ import graphs.

## 4. Shared contracts

### 4.1 sc1: ScratchpadRef

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

### 4.2 sc2: LinkResolutionAndBacklinks

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

### 4.3 sc3: ScratchpadListReadModel

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

## 5. Story boundaries

### 5.1 Story STORY-2846f076fd5f785f-s1

**Owns:** `sc1`

The vscode.markdown.editor openWith integration, the host-capability probe (reusing hosts/specs.ts's getExtension) and its default-editor fallback UX, and the lock/pencil toggle UI are private to s1 — no other story needs the mechanics of how the editor opens, only the stable ScratchpadRef identity (sc1) it establishes for every pad.

### 5.2 Story STORY-2846f076fd5f785f-s2

**Owns:** `sc3`
**Depends on:** `sc1`

The chat-menu cap-10 rendering, the list panel's cap-20/3-line-preview/delete UI, and the relevance-ranking algorithm itself (title-first, tie-break via sc1's stableId) are private to s2; sc3 exposes only the read-model shape (title/preview/mtime), not the ranking logic.

### 5.3 Story STORY-2846f076fd5f785f-s3


Find-in-note's match highlighting, wraparound navigation, and collapsed-section reveal operate entirely on the open editor's live text buffer — no cross-story data or contract is produced or consumed.

### 5.4 Story STORY-2846f076fd5f785f-s4


The entry-boundary/timestamp Markdown convention, day-grouping, and the Undated bucket are private to how one note's content renders; no story downstream of s4 in the Epic's dependency graph consumes dated-entry structure, so it is not exposed as a shared contract.

### 5.5 Story STORY-2846f076fd5f785f-s5

**Owns:** `sc2`
**Depends on:** `sc1`

The link-target picker UI and the qualified-target Markdown syntax (percent-encoded target segments, versioned, per the HLD's resolved open question) are private to s5; sc2 exposes only the resolved-reference and backlink-query shape s6 consumes, not the authoring UI or syntax.

### 5.6 Story STORY-2846f076fd5f785f-s6

**Depends on:** `sc2`

The backlink view's grouping-by-source-note rendering, on the pad and on file/symbol surfaces, is private UI; no story is downstream of s6 in the Epic's graph, so it exposes no further contract.

### 5.7 Story STORY-2846f076fd5f785f-s7

**Depends on:** `sc1`

The archive/restore state machine, the permanent-delete confirmation flow, and the decision of where stable ID/repo-association/archive-state are actually persisted are private to s7; it extends sc1's bare ScratchpadRef with lifecycle state but does not re-expose that lifecycle representation as a further contract, since s8/s9/s10 only need sc1's identity.

### 5.8 Story STORY-2846f076fd5f785f-s8

**Depends on:** `sc1`

The attach-to-turn picker UI, the removable-preview rendering, and revision-pinning for a queued turn are private to s8; it consumes sc1 to cite the note and exposes no further contract, since only s9 depends on s8 and s9's own need (provenance link) is satisfied by sc1 directly.

### 5.9 Story STORY-2846f076fd5f785f-s9

**Depends on:** `sc1`

The promote-to-draft action's brainstorm/ISSUE routing and idempotent-retry handling are private to s9; no story is downstream of s9 in the Epic's graph.

### 5.10 Story STORY-2846f076fd5f785f-s10

**Depends on:** `sc3`

The tag-filter UI and starter-template catalog are private to s10; it extends sc3's list read-model with the tags field but no story is downstream of s10 in the Epic's graph.

## 6. Non-functional targets

- **Performance:** The list panel (s2) must not re-parse every on-disk pad file per render; sc3's read-model is served from the daemon's index instead. Backlink-query latency targets and the note-size cap for sc2's new daemon IPC are explicitly an open PRD decision (DEF §8) to resolve before s2/s5/s6 build.
- **Security:** The home-dir scratchpad store stays outside repo enrollment per k4; the daemon's new index only joins validated target identity (sc1/sc2), never widening default document search or repo registration to the store itself.
- **Observability:** Not specified by the Epic; left to design.story.
- **Durability:** sc1's stableId must survive rename/move/archive/restore (s7); the daemon index's reconciliation strategy against the home-dir store's actual file state (so it never serves a stale binding indefinitely) is a design.story decision.

## 7. Rollout

**Phase A — Native editor foundation**

**Stories:** `s1`
**Flag:** `insrc.scratchpad.nativeEditor`

Establishes sc1 (ScratchpadRef) and retires the custom webview; every other story depends only on s1 in the Epic's graph and needs this surface + identity primitive before building on it.

**Backward compat:** Retires the custom scratchpad document webview and its scratch-save/scratch-saved protocol; the on-disk file contract in scratch-store.ts must stay byte-compatible so every existing pad opens correctly in the native editor with no migration step.

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
| New daemon IPC surface (sc2, the backlink index) | s5/s6 introduce the Epic's first new daemon-side persisted index and IPC contract; the note-size cap, latency targets, and minimum daemon/extension version negotiation are still an open PRD decision (DEF §8), not yet resolved. | Resolve the note-size/latency/version-negotiation decision during s5's design.story before any daemon code is written; s5 ships in its own Phase B1 behind the insrc.scratchpad.backlinks flag (not mixed with the unrelated B2 stories), and Phase C's consumers stay behind the same flag until that decision is validated against real note counts. |
| Host-capability fallback for s1's native editor | vscode.markdown.editor may not be registered on every host the plugin supports (vscode-plugin/src/hosts/specs.ts already treats Cursor as a distinct host); getting the fallback UX wrong blocks every downstream story, since s2 through s10 all depend on s1. | Resolve the getExtension probe and its default-editor fallback in s1's own design.story first, per the DEF's open question, and verify it on at least one non-standard host before approving s1's BUILD — nothing in Phase B1, B2, or later should start first. |
| sc1 owned at s1 rather than s7 | Stable identity is semantically s7's topic but sc1 is owned at s1 to satisfy s2's position in the dependency graph (the nearest-common-ancestor rule); a reviewer unfamiliar with that rule could try to move sc1 to s7, which would break s2's and s5's dependency chain to it. | This HLD's storyBoundaries documents the nearest-common-ancestor rationale explicitly; s1's and s7's design.story stages should cite this section rather than re-deciding contract ownership. |

## 8. Alternatives considered

### 8.1 a1: Daemon-owned link/backlink index, client-only UI — **CHOSEN**

A new daemon-side scratchpad index (alongside doc-relations.ts) owns link resolution, backlinks, and validated target identity; vscode-plugin is a thin UI client over daemon IPC for everything beyond the native editor itself.

Extend src/db with a scratchpad-link module that joins the home-dir store's typed links (note/file/symbol/artifact) against the existing graph (entities.ts, relations.ts) and ArtifactIds, producing a private, repository-keyed index per k4's invariant. The daemon becomes the single source of truth for resolution state and for backlink aggregation on files, symbols, and (once available) workflow artifacts; vscode-plugin only renders what the daemon returns and calls back on authoring actions.

Metadata that must be queryable cross-repo (stable ID, archive state, link graph) lives in this daemon index rather than only in the markdown files, directly addressing the s2 content/title-source gap by giving the list a durable, daemon-served source instead of a client-side interim parse.

**Pros:**
- Reuses the daemon's existing graph machinery (entities.ts, relations.ts, ArtifactIds) instead of building a second, client-side index from scratch.
- One source of truth for resolution state means s2's list, s5's link authoring, and s6's backlinks all read the same daemon answer — no drift between surfaces.
- Matches k4's invariant directly: a private, repository-keyed index is the daemon's natural shape, not a bolt-on.

**Cons:**
- Adds a new daemon IPC surface and a new persisted index the daemon must version/migrate going forward.
- Every scratchpad read now has a round-trip dependency on the daemon being up; today's scratch-store.ts is pure client-side fs.
- Backlink aggregation at daemon scale needs its own latency/size-cap decisions (already flagged as open) before this can ship.

**Cost estimate:** L

### 8.2 a2: Client-owned metadata, daemon-assisted resolution

vscode-plugin extends scratch-store.ts with a metadata envelope (stable ID, archive state, tags, entry boundaries) per pad; the daemon is called only for the heavier cross-repo lookups (symbol/artifact target resolution), not for backlink storage.

scratch-store.ts grows a small metadata layer — frontmatter or a sidecar record — that carries the stable ID, archive/lifecycle state, tags, and dated-entry boundaries, read directly without a daemon round-trip. Link authoring still calls the daemon to resolve a symbol or workflow-artifact target, but the resulting resolved reference and backlink relationship are cached/stored client-side.

This keeps the home-dir store close to self-contained: listing/preview/lifecycle work without the daemon running, only losing live link-target validation and cross-note backlink views when it's down.

**Pros:**
- Scratchpad listing/preview/lifecycle keeps working with the daemon offline.
- Smaller new daemon surface — the daemon answers resolution queries it's already positioned to answer.
- Resolves the s2 content/title-source gap with a local, synchronous fix rather than a network round-trip.

**Cons:**
- Backlinks become a client-side aggregation, duplicating indexing logic the daemon already has for the main corpus.
- Two sources of truth for the link graph can drift when a target is renamed/moved outside the scratchpad flow.
- A sidecar/frontmatter schema change touches every existing scratchpad file or needs a lazy-migration path.

**Cost estimate:** M

**Rejected because:** Only partially satisfies k4: target resolution goes through the daemon with validated identity, but the backlink graph itself is cached/stored client-side rather than daemon-backed through a private, repository-keyed index as k4 specifies — a real gap against an invariant, not a stylistic one.

### 8.3 a3: Fully client-local, no new daemon surface

vscode-plugin parses and indexes scratchpad links/backlinks/metadata entirely itself, in-memory or in a local cache file; the daemon is not extended at all.

All ten stories are delivered inside vscode-plugin: a client module re-parses scratch files to resolve links against a client-maintained map of known files/symbols and workflow-artifact ids (via read-only daemon queries). Backlinks, tags, and lifecycle state are computed and cached client-side; doc-relations.ts and the daemon's graph are left untouched.

Cheapest and fastest to build, adding no daemon migration risk or new IPC contract — but it re-implements, in miniature, indexing/relationship-tracking logic the daemon's src/db module already has for the main corpus.

**Pros:**
- No new daemon IPC surface, no daemon-side migration risk, no dependency on the daemon being up.
- Fastest to ship — smallest blast radius, easiest to roll back.
- Keeps k4's invariant trivially true for the store itself: nothing moves daemon-side.

**Cons:**
- Duplicates indexing/relationship logic the daemon's db module already solves for the main corpus.
- Client-side re-parsing of all scratch files to keep links/backlinks current does not scale as note count grows.
- No natural place for cross-session/cross-window consistency if the client cache goes stale.

**Cost estimate:** S

**Rejected because:** Violates k4 outright: there is no daemon-backed, private, repository-keyed index for backlinks to join through, just client-side computation. Also only partially meets k2 at scale, since list rendering requires re-parsing every file.

## 9. References

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

## 10. Open questions

- Item f2 (partial): architectureShape names entities.ts and relations.ts (present in s1's structural-map bundle's own summary/structure text for src/db, just not duplicated into that bundle's pathsCited array) and ArtifactIds (src/workflow/artifact-ids.ts, grounded only via the approved DEF's citation c14 and this controller's earlier direct repo verification, not via an insrc_analyze_step pass run during this HLD's own context.assemble). Nothing is fabricated, but design.story for s5/s6 should re-verify ArtifactIds' exact exported surface before building sc2 against it.
- Item nf1 (partial): none of the four nonFunctional properties carries a quantified target (a latency figure, a size cap, an SLA) — performance explicitly defers the real numbers to the DEF's own unresolved open question (note-size cap, latency targets, minimum daemon/extension IPC version). design.story for s5/s6 must resolve concrete numbers before sc2's daemon IPC is built, not just before Phase C's rollout.
- This HLD contradicts its own resolved design.epic open question: at the open-questions gate, the choice recorded for s2's content/title-source gap was 'Sequence s2 after s7' (make s2 depend on s7's durable metadata). What was actually built here is the opposite: sc3 (ScratchpadListReadModel) is owned by s2 alone, with no dependency on anything s7 owns, and Phase B places s2 and s7 in parallel, not sequenced. This is not an oversight in the architecture — the Epic's own dependsOn graph has s2.dependsOn = [s1] only, never s7, and framework.write cannot invent a new Epic dependency edge; 'Sequence s2 after s7' was not actually buildable under that graph, and what got built (sc3 self-contained at s2) was the only graph-consistent option, equivalent to the 'Interim file parsing' choice that was not selected at the gate. The resolve-question record itself was not corrected when this was discovered. design.story for s2 and s7 should treat this HLD, not that resolution record, as authoritative, and should not expect to depend on s7 for list/title data.
- Self-correction during HLD self-review: the first fix for the sc2-risk mitigation moved insrc.scratchpad.backlinks onto the whole of the original Phase B, which would have gated s2/s3/s4/s7 (none of which touch the new daemon index) behind a flag meant only for s5. Phase B is now split into B1 (s5 alone, flagged) and B2 (s2/s3/s4/s7, unflagged) to fix this.

## Resolved questions

- `q76fbf6b1` — Item f2 (partial): architectureShape names entities.ts and relations.ts (present in s1's structural-map bundle's own summary/structure text for src/db, just not duplicated into that bundle's pathsCited array) and ArtifactIds (src/workflow/artifact-ids.ts, grounded only via the approved DEF's citation c14 and this controller's earlier direct repo verification, not via an insrc_analyze_step pass run during this HLD's own context.assemble). Nothing is fabricated, but design.story for s5/s6 should re-verify ArtifactIds' exact exported surface before building sc2 against it.
  - **resolved**: Re-verify before sc2 — Not s1's concern; defers ArtifactIds' exact exported-surface re-verification to s5/s6's own design.story, where sc2 is actually built. _(2026-11-16T11:12:43.451Z)_
- `q6240d0f2` — Item nf1 (partial): none of the four nonFunctional properties carries a quantified target (a latency figure, a size cap, an SLA) — performance explicitly defers the real numbers to the DEF's own unresolved open question (note-size cap, latency targets, minimum daemon/extension IPC version). design.story for s5/s6 must resolve concrete numbers before sc2's daemon IPC is built, not just before Phase C's rollout.
  - **resolved**: Set all targets in s5/s6 — Not s1's concern; the note-size cap, latency targets, and IPC version negotiation belong to sc2 (owned by s5), to be set concretely before s5/s6 build. _(2026-11-16T11:13:32.952Z)_

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
