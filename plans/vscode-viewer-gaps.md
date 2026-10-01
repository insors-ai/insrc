# Plan: VS Code artifact-review + code-edit viewer gaps

TODO backlog for the two tracks that close the VS Code-side gaps in the
artifact-review pane and the chat code-edit/diff path. VS Code only —
JetBrains parity is a deliberate later pass, tracked at the bottom.

Opened 2026-10-01 from an assessment of both IDE viewer surfaces
(`vscode-plugin/src/chat/docs-review-panel.ts` + the chat diff path) against
the daemon's comment/feedback IPC surface.

## Why (one paragraph)

The VS Code review surface is the human-in-the-loop gate the whole workflow
depends on, and it currently shows a reviewer less than the document actually
carries: the pane renders the artifact body as raw markdown text, never shows
the companion diagrams or experience mocks the document references, offers no
way to anchor a comment to a section, and dead-ends on a review-blocked
artifact. The chat half has the opposite problem — it renders code edits well
while a turn is live, then loses every diff on reload, because the persisted
transcript has no diff row. None of this needs new daemon capability: the
companion refs, the comment anchors and the code-anchored feedback target all
already exist server-side and are simply not consumed.

## Track A — Epic `bfe98ff7f97178cf` (`build-vs-code-plugin-ui-integration`)

Already framed and **approved 2026-09-29**, `insrc_review_step` verdict `pass`
(11 findings). DEF at `.insrc/artifacts/DEF-bfe98ff7f97178cf.json`; markdown
mirror regenerated 2026-10-01 at
`docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/DEF.md`
(it had been deleted) via the production writer — `renderDefineMarkdown` +
`defineArtifactPaths`, the same call `gates.ts:179` makes on approval.

Chain state: **DEF approved, no HLD.** Next stage is `design.epic`.

- [ ] `design.epic` → HLD, then review + approve
- [ ] S001 — read a generated document as structured and navigable
      (headings/lists/emphasis distinct, jump-to-section, readable-text
      fallback on malformed bodies, within the pane's existing CSP discipline)
- [ ] S002 — functional commitments as discrete identified items (identifier
      shown character-for-character, same id recognisable across upstream and
      downstream documents, no section at all when there are none)
- [ ] S003 — design diagram where the document references one
- [ ] S004 — experience mock where the document references one, each labelled
      when a document carries both
- [ ] per-story `plan` → `build` → `insrc_code_review_step` → BUILD approval

Enabling change, in scope and permitted by the DEF's non-goals: project
`body.companions` (and `body.functionalDefinition`) through the **existing**
`workflow.artifactContent` response. `CompanionArtifactRef` already exists
(`src/workflow/artifacts/companion/types.ts`) and the orchestrator already
attaches `body.companions` (`orchestrator.ts:1690`); `ArtifactReviewView`
(`src/workflow/artifact-content.ts:45`) just does not carry them. This is an
additive field on an existing method, **not** a new IPC method — the DEF's
non-goal forbids only the latter. It does mean a daemon rebuild + restart, and
the JetBrains pass will reuse the same field.

Reuse note: the plugin already ships a full GFM renderer — `marked` 4.3.0 is a
runtime dependency, vendored as `MARKED_SRC` in
`vscode-plugin/src/chat/webview-marked.ts` and used today by `chat-panel.ts`
for assistant markdown. S001 reuses it rather than building one. Watch the
pane's own contract test: `docs-review-panel.test.ts:243` asserts no
`innerHTML` on that surface, so richer rendering must either satisfy that
discipline as it stands or explicitly adopt a replacement.

## Track B — not yet framed

Four items, none of them in Track A. Needs its own `insrc_triage` pass; the
natural split is two epics, because the two halves share no code.

### B1 — docs-review reviewer controls

- [ ] Send real `CommentAnchor` values (`sectionPath` / `quote` /
      `openQuestionId`) on `workflow.resolveComment`. The client currently
      sends `anchor: {}` (`docs-review-client.ts:117`) while the daemon
      contract (`src/workflow/resolve-comment.ts:51`) accepts all three.
      **Must not be folded into Track A** — "adding annotation, inline
      commenting, or feedback capture to the VS Code review surface" is an
      explicit non-goal of `bfe98ff7`.
- [ ] Override-approve for a review-blocked artifact — pass `overrideReview`
      with a reason, matching the JetBrains "Approve anyway…" control
      (`ArtifactContentPane.kt`). Today a blocked artifact dead-ends in VS
      Code and the user has to leave the IDE. Not a non-goal of `bfe98ff7`,
      merely unframed, so it *could* ride Track A via `extend` — kept here so
      Track A ships against its reviewed DEF untouched.

Design question for this track: `workflow.resolveComment` anchors to document
sections, while `artifact.feedback.append` anchors to `ProvenanceTarget`
(`file` + `segment.{startLine,endLine}` — already code-capable, zero VS Code
callers). The design has to state which surface owns which anchor kind rather
than growing both.

### B2 — chat code-edit diff path

- [ ] Persist diffs: add a diff variant to the `TranscriptEntry` union
      (`session-store.ts:29`). Today a reload loses every diff and every
      undecided accept/reject, and the governor's revert state is per-turn
      in-memory so the ability to revert dies with it. The union carries a
      plain-serialisable round-trip invariant and `isSession` does no per-row
      check, so a new variant must restore absent-safe for pre-existing rows.
- [ ] Unify the diff renderers. `render-registry.ts:371` registers an
      `inline-diff` renderer that `toViewModel` never emits, while the live
      `edit-prompt` path renders through `chat-panel.ts:441`'s own
      `renderDiff`. Two renderers, one unreachable, already diverged (one
      coloured with accept/reject buttons, one a plain collapsed caption).
      Coupled to the item above: a persisted diff row has to restore through
      whichever renderer survives.

## Deferred — JetBrains parity

Explicitly out of scope for both tracks above, and a declared non-goal of
`bfe98ff7` ("bringing this rendering to the JetBrains plugin, or converging
the two IDE plugins on a single shared markdown renderer"). Revisit after
Track A ships. Known JetBrains-side gaps from the same assessment: the
bundled `markdown-renderer.js` handles no tables, images or nested lists, and
annotation is JCEF-only with a read-only native fallback.
