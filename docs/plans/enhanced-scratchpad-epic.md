# Plan: Linked Scratchpads Epic (enhanced-scratchpad-prd.html)

Breaks [`docs/reqs/enhanced-scratchpad-prd.html`](../reqs/enhanced-scratchpad-prd.html)
("Linked scratchpads in VS Code", draft 14 Nov 2026) into epic-scoped,
buildable stories. The PRD is the source of truth for requirements (SP-1
through SP-7) and the interactive mock; this plan sequences the work,
pins each story to real baseline files, and records the UI decisions the
mock iterations already settled so a builder doesn't re-litigate them.

This is a hand-authored plan in the `docs/plans/` convention (see
[`repo-registry-strict-contract.md`](repo-registry-strict-contract.md),
[`meta-workflow-framework.md`](meta-workflow-framework.md) for the same
shape). It is **not** a tracked insrc ledger artifact — when the user is
ready to build, each story below should go through the normal front door
(`insrc_triage` → `design.story` → `plan` → `build` → code review) rather
than being hand-implemented off-ledger.

## Why (one paragraph)

A scratchpad today is a flat, unlinked Markdown file: easy to find when
recent, impossible to rediscover from the code or design it concerns, and
read-only once opened (`ISSUE-01ac1e4b6a6c9c2f` shipped the save path but
not the richer editing surface this PRD now specifies). The PRD's P0 slice
— links, backlinks, find/search, dated entries, lifecycle — turns the
scratchpad corpus into a second, lighter-weight knowledge surface that sits
beside the indexed code graph and the tracked workflow ledger, without
promoting anything into either until the user explicitly asks (SP-6).

## Baseline (today, real code)

| Area | File | Current behavior |
|---|---|---|
| Chat recent menu | `vscode-plugin/src/chat/scratch-host.ts` (`SCRATCH_MENU_LIMIT`) | Top 5 by mtime, New + Browse all actions |
| Browse-all list | `vscode-plugin/src/panels/scratch-panels.ts` (`browseHtml`) | Unbounded table: Name, Modified, open + delete icon buttons — no preview text, no search |
| Document view | `vscode-plugin/src/panels/scratch-panels.ts` (`documentBodyHtml`, `documentBootstrap`) | Custom webview `<textarea>`, save via `scratch-save`/`scratch-saved` document-channel intents, gen-guarded |
| Store | `vscode-plugin/src/chat/scratch-store.ts` | Flat `~/.insrc/scratches/*.md`, basename IDs, exclusive create, guarded read/write (hardened through `ISSUE-01ac1e4b6a6c9c2f`'s r29–r34 code-review rounds, pushed @749f2806f) |
| Daemon / graph | `src/indexer`, `src/db/graph`, `src/db/doc-relations.ts` | Watches registered roots only; home-dir store is outside that boundary; Markdown link extraction targets files, strips fragments; no scratchpad/symbol/workflow-ID resolution contract |

## Goals

1. **Ship SP-1–SP-4 together** (per the PRD's own acceptance ordering) as
   one coherent P0 slice: links + backlinks only pay off once find/search
   and lifecycle exist alongside them.
2. **Reuse, don't rebuild, VS Code's own editing surface.** The pad editor
   is VS Code's built-in `vscode.markdown.editor` custom editor
   (`markdown-language-features`, bundled — no new dependency) opened on
   the scratchpad's real file, not a bespoke rich-text webview. This
   retires the custom-webview document pane and its `scratch-save` /
   `scratch-saved` protocol in favor of VS Code's own save/undo/conflict
   handling on the real file.
3. **Two distinct search surfaces, not one.** Cross-note search lives as a
   textbox at the top of the "insrc scratchpads" list panel (filtering the
   recency-ordered, 20-pad, 3-line-preview list by relevance); find-in-note
   stays a separate, in-pad Ctrl/Cmd+F action. Neither subsumes the other.
4. **Daemon-backed backlinks without widening daemon scope.** A private,
   repository-keyed scratchpad index joins by validated target identity
   (file/symbol/workflow-artifact); the home-dir store itself stays outside
   repo enrollment and default document search.
5. **No implicit agent context.** SP-5/SP-6 only carry note evidence into a
   turn or workflow draft on an explicit user selection, never by default.

## Non-goals (mirrors the PRD's §scope "Out of scope")

Vault import/sync, shared/collaborative note editing, a general-purpose
canvas or graph browser, unlinked-mention suggestions, arbitrary
transclusion, automatic project-memory ingestion, and new client surfaces
for the CLI or JetBrains plugin. Semantic (embedding-based) scratchpad
search and ephemeral analyzer-output links are explicitly deferred to
later work, not this epic.

## UI decisions already settled by the mock (do not re-derive)

These were worked through iteratively against the PRD's interactive mock
and should be treated as fixed inputs to design, not open questions:

- **Recent menu**: chat status-bar button stays a capped dropdown, raised
  from 5 to **10** pads by mtime, alongside the existing New/Browse all
  actions.
- **List panel** ("insrc scratchpads", opened by the same button's Browse
  all / list action): up to **20** pads, newest-first, each card showing
  **first 3 lines** of body text and a per-row **delete** button (same
  icon affordance as today's Browse-all table).
- **Search box lives in the list panel**, above the pad cards — not in a
  separate nav-panel view, and not inside the open pad (an in-pane search
  section wastes space once several panels are open). Typing filters the
  existing recency list by relevance (title hits rank ahead of body-only
  hits; ties break by mtime then stable id); clearing restores the
  unfiltered recency list. Any card, filtered or not, opens the pad.
- **Pad editor = VS Code's built-in Markdown Editor** (`vscode.markdown.editor`),
  opened via `vscode.openWith` on the scratchpad's real file. It renders
  Markdown in place, opens **locked** (read-only rendered view), and a
  floating pencil toggles inline click-to-edit; a lock button returns it
  to the rendered view. Image paste/drop, URL-to-link paste, and
  insert-link/insert-image-from-workspace are native to that editor —
  no custom implementation needed for those affordances.
- **Find-in-note stays separate** from the list-panel search: Ctrl/Cmd+F
  inside the open pad, operating on live (including unsaved) text,
  independent of the editor's locked/editing state.

## Stories

Sequenced so each story is independently reviewable; S1 is the foundation
every other P0 story's editor surface depends on.

| # | Story | Covers | Depends on | Notes |
|---|---|---|---|---|
| S1 | Native Markdown Editor pad surface | SP-4 editing substrate | — | Replace `documentBodyHtml`/`documentBootstrap`'s custom webview + `scratch-save`/`scratch-saved` protocol with `vscode.openWith(uri, 'vscode.markdown.editor')` on the real file. Retire the gen-guarded document-channel save path; VS Code's own text-document model owns conflict/undo/dirty state. Keeps `scratch-store.ts`'s file contract unchanged — only the host-side opener changes. |
| S2 | List panel: recency cap, preview, delete, relevance search | SP-3 "Search all notes" | S1 (for the open-on-click target) | Cap the "insrc scratchpads" panel at 20 entries, render each pad's first 3 Markdown body lines, keep the existing per-row delete, add the search textbox + relevance filter (title-first ranking, mtime/id tiebreak) described above. Raise `SCRATCH_MENU_LIMIT` in `scratch-host.ts` from 5 to 10 for the chat dropdown. |
| S3 | Find in note | SP-3 "Find in note" | S1 | Ctrl/Cmd+F inside the open Markdown Editor pad; highlight, N-of-M count, prev/next with wraparound, Escape to close without editing, zero-match empty state. Independent of S1's lock/edit toggle. |
| S4 | Dated entries | SP-4 "Dated entries" | S1 | Entry-boundary + creation-timestamp encoding (an open decision in the PRD — resolve the Markdown convention first); day-grouped, newest-first, independently collapsible sections with keyboard-operable toggles and per-day counts; Undated bucket for legacy content. |
| S5 | Link authoring + resolution | SP-1 | S1, needs daemon-side target resolution (symbol/workflow-ID) from the Indexing/graph baseline gap | `[[…]]` typed links + target picker (notes, files, symbols, SPEC/ISSUE/HLD/LLD/TASK); qualified-target commit so duplicate titles/symbols resolve unambiguously; ambiguous/missing/unavailable states are distinguishable and repairable; links inside code spans/blocks stay literal. |
| S6 | Backlinks | SP-2 | S5 (shares the directed-reference store) | Outgoing + incoming links in the note view; "Show scratchpad backlinks" on a file/symbol; matching section on the workflow artifact detail surface; grouped by source note. |
| S7 | Scratchpad identity + lifecycle | SP-4 (identity/lifecycle, not dated entries) | S1 | Stable note ID surviving rename/move/archive/restore; explicit repo association for legacy notes; reversible archive (hidden from default search/backlinks, direct link still opens); explicit permanent-delete with surviving-link "missing" rendering. |
| S8 | Cited agent context | SP-5 | S5, S7 (needs stable id + revision) | Distinct "attach to turn" action beside existing Send to chat; removable preview with source/revision/selected excerpts; bounded payload adapted to controller/daemon routes; queued-turn revision pinning. |
| S9 | Promote to workflow draft | SP-6 | S8 | Seed a SPEC (via brainstorm) or ISSUE from a saved selection through the existing approval chain; provenance link back on the note; idempotent retry after a lost response. |
| S10 | Tags + templates | SP-7 | S2, S7 | Optional tags + Browse-all filter; starter templates for investigations/decision candidates. Independent — can ship once the metadata contract (S7) exists, per the PRD's own rollout note. |

## Rollout order (mirrors the PRD's §acceptance)

1. **S1** first — every other story's UI sits on top of the native editor.
2. **S2 + S3 + S4** next, in parallel once S1 lands — these complete the
   P0 "search + find + dated entries" slice without touching the graph.
3. **S5 + S6** together — "a new link works through both the note and its
   target surface" per the PRD; S6 cannot ship meaningfully without S5.
4. **S7** can land alongside S5/S6 (it's substrate, not surface) but must
   be done before S8/S9, which need stable identity + revision.
5. **S8 → S9** after S5–S7 pass VS Code integration checks (PRD's own
   gate).
6. **S10** independently, any time after S2 + S7.

## Open decisions to resolve before design (from the PRD's §decisions)

- Markdown syntax for qualified link targets, versioning, and alias
  escaping (blocks S5).
- Entry-boundary / timestamp / stable-anchor encoding and where scratchpad
  metadata lives (blocks S4, S7).
- Private backlink projection + lexical index choice, note-size cap,
  latency targets, minimum daemon/extension version negotiation for the
  new IPC (blocks S2, S5, S6).
- First controller/daemon context routes, evidence budgets, and preview
  behavior for a target that changes mid-queue (blocks S8).

## Status

**Planned — not yet triaged or built.** `ISSUE-01ac1e4b6a6c9c2f` (the
save-path dependency this PRD originally cited) is complete and pushed;
this plan supersedes its "custom webview, read-write" editing-surface
assumption with the native-editor decision in S1. No story below has an
Epic/HLD/LLD on the insrc ledger yet — run `insrc_triage` against this
plan when the user is ready to start building, rather than implementing
directly from this document.
