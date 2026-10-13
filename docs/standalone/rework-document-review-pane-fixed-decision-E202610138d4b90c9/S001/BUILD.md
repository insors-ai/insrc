<!-- insrc:artifact BUILD-8d4b90c9ab301e66-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-13T12:12:45.679Z  ·  **Updated:** 2026-10-13T13:26:57.647Z

**Commit:** eae93703

## Summary

New vscode-plugin/src/chat/docs-review-comments.ts exports DOCS_COMMENTS_SOURCE, a sixth source string inlined into the pane's single script (docs-review-panel.ts) after the five existing ones. It holds the text model (a block is a p, li, td, th, heading, blockquote, pre, dd or dt; a passage is a block and two offsets into its own text nodes, so inline markup inside a block does not matter), rvPassage (the passage of a selection and its anchor, or null), rvFind (finding an anchor again: in its section with prefix and suffix, then in its section, then anywhere when it occurs once; never in the Feedback section), rvWrap/rvUnwrap (marks, one per text piece) and the drafts with their thread cards. Behaviour: a selection inside one block of the markdown document shows the round comment button (#insrc-rv-pop); pressing it marks the passage (mark.rv-anno.rv-draft) and opens a thread card under the block with the quote, a field and round add and close buttons; an added comment is a row with the reviewer's name, the tag 'draft, not sent' and a remove control; closing a thread with no comment, or removing its last draft, takes the mark away. No button is offered for a selection across blocks, in the document's own Feedback section, touching a marked passage, blank, longer than 500 characters, or while an HTML tab is on show. The anchor is { quote, sectionSlug, prefix, suffix } with at most 40 characters on each side. A decision posts every draft (in the order made, each with its anchor and the content version) and then the whole-document comment; feedback with neither posts nothing; a marked passage with no comment is not a comment. On a result that is ok with recorded equal to the number sent the drafts, their marks and cards and the field are cleared, in the page and in the saved state; otherwise all are kept. Drafts and the field are kept per artifact through the webview's getState/setState, restored when another run of the shell is given the document, re-placed when the same document is rendered again (an open thread is reopened), and a draft whose quote is no longer in the document is kept, counted as such in the line above the field, and still sent. Everything is built with createElement and textContent; no markup is assigned. Test harness: it now offers document listeners, createTextNode, a settable selection, a saved-state store shared between runs, and an option that gives each rendered block its text as a text node (the stub's innerHTML makes elements without text nodes, unlike a real page). What the stub cannot prove (the real Selection and Range objects, and the button's position) I ran in headless Chrome over the real shell and the Story's LLD: selecting text shows the button, pressing it marks the passage and opens the thread, a cross-block selection shows none, and reject posts one docs-decision with the draft's quote, section slug, prefix and suffix followed by the whole-document comment (/tmp/t9/shell-dark-inline.png and the JSON the run printed). Four mutations each fail the matching named test. SHELL_BASELINE moved by +17462 chars and its history says why. Not in this task: saved comments shown on their passages, margin markers and the whole-document strip (t12). Plugin suite without forced exit: 1235 tests, 1225 pass, 8 skipped, 2 fail (src/config/__tests__/manifest-catalog.test.ts, failing before this Story).

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`
- ✓ `t10`
- ✓ `t11`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/index.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/__tests__/artifact-content.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/__tests__/feedback-carry-finalize.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/__tests__/review-decision.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/companion/__tests__/header.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/companion/header.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/format/bindings.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/provenance/__tests__/review-fields.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/provenance/schema.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/provenance/tool.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/provenance/types.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/artifacts/provenance/writer.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/orchestrator.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `src/workflow/review-decision.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/docs-review-client.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/docs-review-comments.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/docs-review-panel.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-13T13:26:57.647Z)
