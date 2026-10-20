# SPEC: Comment Focus for VS Code

Date: 2026-10-17  
Status: UX decisions confirmed in conversation; implementation not started.  
Target: insrc VS Code plugin/editor integration.  
Interactive mocks: [Comment Focus](../mocks/comment-focus.html).

## Problem and outcome

Ordinary source comments compete with code for attention during reading and review. Users need access to their explanations without keeping all comment text in the main reading flow.

Comment Focus is an opt-in, workspace-wide viewing mode. It collapses ordinary comments and replaces the editor minimap with a dedicated comment strip. Icons in that strip reveal comments on demand. Method and class documentation remains visible as written.

This specification records the UX agreed during brainstorming. It does not establish that the stock VS Code extension API supports every required rendering behavior; implementation feasibility must be resolved during design.

## Agreed scope

| Area | Required behavior |
| --- | --- |
| Activation | One opt-in **Comment Focus** toggle applies across the workspace, rather than independently to tabs. |
| Deactivation | Restore ordinary comment presentation and the user's previous minimap preference. |
| Eligibility | All ordinary comments, including trailing comments, standalone comments, ordinary block comments, and TODO-style annotations. |
| Documentation | Preserve method/class documentation comments in their original form and position. |
| Layout | Collapse comment-only lines; hide trailing comment text without hiding the code on that line. |
| Placement | Show comment icons in a dedicated strip replacing the minimap. No comment icons within the code or editor gutter. |
| Markers | Comments containing recognized markers such as TODO use a distinct icon in the strip, so their purpose is visible before opening the overlay. |
| Alignment | Align icons with currently visible code lines as the user scrolls. This is not a compressed whole-file overview. |
| Preview | Hover over an icon to preview its comment in an overlay. |
| Keep open | Click the icon to keep the overlay open after the pointer leaves it. |
| Dismiss | Escape dismisses the overlay. |
| Edit | A **pen icon only** in the overlay reveals the original comment in the editor and places the cursor there. |
| Finish editing | Collapse the comment when the cursor moves outside it, or when Escape is pressed. |
| Diff views | Expand added, modified, and deleted comments by default; keep unchanged ordinary comments collapsed. |

## Reading view and comment strip

The strip occupies the minimap location on the right of the editor. Use small, muted icons so the strip provides access without creating a competing stream of attention. Icons become more prominent on interaction.

Trailing comments anchor to their existing code line. A collapsed standalone comment or block anchors to the following code line. Source line numbers retain their original meaning; gaps are expected when comment-only lines collapse. The strip must follow the displayed code positions after collapsing lines, scrolling, and layout changes.

Collapsing is a presentation operation. It must not delete comments, rewrite source, create file changes, or alter program behavior. Method/class documentation stays visible in both ordinary and focused views.

Adjacent comment-only lines may form one comment block rather than one icon per line. Exact grouping, collisions between anchors, and end-of-file anchoring remain design details listed below.

### Marker-aware icons

Marked comments remain collapsed and keep the same preview, keep-open, and editing interactions. Their icon shape differs from an ordinary comment; color alone must not carry the distinction. Icons remain small and visually quiet.

The mock demonstrates this initial mapping:

| Comment content | Strip icon |
| --- | --- |
| No recognized marker | Speech bubble |
| TODO | Task list |
| FIXME | Warning triangle |

Include the marker name and source line in the icon's accessible label and tooltip. Preserve the original marker in the overlay content. Recompute the icon after editing: adding a marker changes its icon, and removing the last recognized marker restores the ordinary comment icon. Documentation comments remain visible even if they contain markers.

For the mock, matching is case-insensitive on whole words, and FIXME takes precedence if both FIXME and TODO occur in a block. This mapping and precedence are proposed defaults; the complete marker vocabulary and parsing rules are to be settled during implementation design.

## Overlay interaction

The overlay opens beside the icon and extends left into the editor. It displays the original comment content, preserving meaningful line breaks, rather than an AI summary or rewritten explanation.

| Current state | Action | Result |
| --- | --- | --- |
| Collapsed | Hover icon | Temporary comment preview. |
| Preview | Move into overlay | Keep preview available so its pen action can be reached. |
| Preview | Leave icon and overlay | Dismiss the temporary preview. |
| Collapsed or preview | Click icon | Keep the overlay open after pointer movement. |
| Kept open | Move over code | Overlay remains available. |
| Preview or kept open | Escape | Dismiss overlay. |
| Preview or kept open | Activate pen | Reveal original source comment and move cursor into it. |
| Editing | Move cursor outside comment | Collapse the comment again. |
| Editing | Escape | Collapse the comment and return focus to its icon. |

The pen action has no visible “Edit” text. Give it an accessible name such as “Edit comment” and a hover tooltip. Icons and overlay actions must be keyboard operable. Exact commands and shortcuts beyond Escape are to be specified during design.

## Editing behavior

Editing happens in the normal source editor, not inside a popup text field. Temporarily restore the complete comment being edited, including all its lines and delimiters. Preserve the editor's usual typing, selection, undo/redo, and save behavior.

The comment remains expanded while the cursor is inside it, including while moving between its lines. Moving outside it or pressing Escape returns to the collapsed view. Escape ends the temporary presentation; it does not undo edits or implicitly save the file. An overlay's edit action must operate on that exact comment.

## Review behavior

Changed comment content must be readable without revealing icons:

- Added comments expand on the new side of a side-by-side diff, or as added lines in a unified diff.
- Modified comments show the old and new text in the appropriate diff locations.
- Deleted comments expand on the original side, or as removed lines in a unified diff.
- Unchanged ordinary comments remain collapsed while Comment Focus is enabled.
- Method/class documentation remains visible regardless of change status.

Read-only original/deleted content must not offer an action that implies it can be edited in place. Diff alignment must remain intelligible when unchanged comments collapse.

## Mock reference

Open [mocks/comment-focus.html](../mocks/comment-focus.html) in a browser. The four scenarios demonstrate:

1. **Reading:** collapsed comment-only lines, preserved documentation, and right-side icons.
2. **Overlay:** a comment kept open, with the pen-only editing action.
3. **Editing:** the original comment temporarily revealed in the code area.
4. **Review:** removed and added comment lines expanded in a unified diff.

The workspace toggle also provides a comparison with ordinary comment presentation. The mock uses illustrative code and a simplified minimap. Its text area simulates the source editor; it is not a proposal for a separate comment editor. It demonstrates fixed example lines, not real scrolling, language parsing, source mapping, or VS Code integration. Strip width, spacing, icon style, and overlay timing are illustrative rather than approved implementation constants. The exported preview may need internet access for its icon runtime.

## Acceptance criteria

1. Enabling the mode applies to eligible editors across the workspace; disabling it restores normal comments and the previous minimap preference.
2. All ordinary comment forms are eligible, while method/class documentation remains unchanged.
3. Standalone comment lines consume no reading-view height when collapsed; code on a trailing-comment line remains visible.
4. The right-side icons stay aligned with the associated displayed code as the user scrolls and resizes the editor.
5. Hover previews, click keeps open, and Escape dismisses without changing source text.
6. The overlay provides a pen-only action with an accessible name; activating it reveals and focuses the matching source comment.
7. Multiline editing stays expanded while the cursor remains inside the comment; cursor exit or Escape collapses it without discarding edits.
8. Diff views visibly expose added, modified, and deleted comments by default while collapsing unchanged ordinary comments.
9. Viewing, previewing, and toggling the feature never creates source-file changes. Actual edits retain normal editor undo/save semantics.
10. Keyboard users can access comment content and invoke the pen action without relying on hover.
11. A comment containing a recognized marker such as TODO has a distinct icon shape in the right-side strip, with an accessible marker label. Editing the marker updates the icon without changing the comment's collapse or overlay behavior.

## Non-goals

- Changing method/class documentation presentation.
- Hiding only selected markers or only standalone comments.
- Placing comment icons in the gutter, inside expressions, or at the ends of code lines.
- A compressed whole-file comment overview.
- Per-tab activation in the first version.
- Editing comment text directly inside the overlay.
- AI classification of comment value, rewriting, summarization, or deleting comments.
- Implementing the feature as part of this documentation deliverable.

## Questions for implementation design

These details were not settled by the UX discussion and should not be inferred from the mock:

- **Integration feasibility:** identify which behaviors can be implemented in the plugin and which, if any, require changes in the IDE fork/editor. Do not silently substitute gutter icons or leave blank comment-only lines.
- **Language coverage:** define initial languages and reliable rules for distinguishing ordinary comments from method/class documentation, including docstrings and nonstandard documentation styles. Ambiguous classification needs an explicit fallback.
- **Anchoring:** define grouping for adjacent comments, multiple comments on one code line, comments inside expressions, and comments at end of file or in comment-only files.
- **Editor interactions:** define behavior for selections crossing hidden text, copying, search results, go-to-line, folding, word wrap, multiple cursors, and diagnostics. Hidden content must remain discoverable and editable without misleading source coordinates.
- **Overlay lifecycle:** define hover delay, long comment handling, whether multiple overlays can stay open, and what happens when an anchor scrolls out of view or its file closes.
- **Workspace settings:** choose the command/settings entry point, persistence behavior, multi-root handling, and how changes to minimap preferences while the mode is enabled are respected.
- **Diff integration:** verify both unified and side-by-side presentation, read-only actions, and alignment after collapsing unchanged comments.

These are follow-up design tasks, not changes to the agreed core interaction.
