# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** bfb78b1

Implements the approved S006 LLD + PLAN: post-write edit governance (inline diff + auto/review + revert) with a chat-vs-editor `insrc.chat.diffView` setting. The extension is a passthrough observer (k8) — it does NOT gate the CLI write before disk; it captures an exact pre-turn baseline, renders its own diff, and reverts on reject. Behind flag `insrc.chat.enabled`.

## Tasks validated

- ✓ `t1` — `chat/edit-governor.ts` (new, vscode-free): `createEditGovernor` (beginTurn/observe/resolveTurn/decide) over injected seams + `EditGovernorState` (in-memory, k3) + LCS `defaultComputeDiff`
- ✓ `t2` — `chat-panel.ts`: optional `editGovernance` deps + turn loop `beginTurn` (before `adapter.run`) / `observe` (per file-edit) / `resolveTurn` (terminal event); absent → today's marker-only behavior
- ✓ `t3` — `chat-panel.ts` `handleMessage`: `set-edit-mode` (validate + persist `session.editMode` via `store.save`) + `edit-decision` (→ `governor.decide`); malformed dropped
- ✓ `t4` — `chat-panel.ts` webview: edit-mode toggle + chat-view inline diff renderer inside the ONE nonce'd script (textContent/className only); controls gate on the host-authoritative `review` flag on the edit-prompt
- ✓ `t5` — `package.json`: `insrc.chat.diffView` (string enum `chat|editor`, default `chat`)
- ✓ `t6` — `extension.ts`: reads `insrc.chat.diffView` (full dotted key); injects the git `WorkspaceBaseline` (`chat/git-baseline.ts`), fs seam, and native `vscode.diff` editor seam + a read-only baseline content-provider; `vscode.d.ts` stub extended (Uri/EventEmitter/TextDocumentContentProvider/showWarningMessage/registerTextDocumentContentProvider)
- ✓ `t7` — tests: `edit-governor.test.ts` + `git-baseline.test.ts` (new) + `chat-panel.test.ts` / `extension-chat-wiring.test.ts` / `session-store.test.ts` extensions

## Validation

- `tsc --noEmit` clean.
- Full vscode-plugin sweep: **384 pass / 0 fail / 2 live-skip**.
- Design review (`insrc_review_step` on LLD): **PASS**, 0 HIGH / 0 MED / 7 LOW.
- Opposite-actor cold review: **3 HIGH / 1 MED / 1 LOW**, all HIGH+MED fixed here with regression tests:
  - **HIGH-1** — reject DELETED a pre-existing *untracked* file (data loss): `git stash create` ignores untracked, so its baseline was `undefined` → treated as new → removed. FIX: `git-baseline.ts` captures untracked-but-existing files' content at snapshot (`git ls-files --others --exclude-standard` + read) → reject restores; only a file absent from BOTH tree and the untracked snapshot is removed.
  - **HIGH-3** — `git show <ref>:<path>` resolves relative to the repo TOP-LEVEL, so a subdir workspace read failed → tracked files rendered as all-additions and reject deleted them. FIX: `./`-prefixed cwd-relative path (`<ref>:./<rel>`).
  - **HIGH-2** — webview edit-mode drift after a session switch (dead reject button / missing controls). FIX: the `edit-prompt` carries the host-authoritative `review` flag (additive optional sc3 field); `renderDiff` gates controls on it, never on the drifting webview-local toggle.
  - **MED** — cross-turn contamination: a late fire-and-forget `observe` from a superseded turn could render into the new turn. FIX: `observe`/`resolveTurn` capture the turn ref and bail if superseded.
  - **LOW** — editor-mode review opens a blocking modal per edit (multiple edits queue dialogs). Documented as a v1 UX limitation (not a correctness bug).
- Code review (CR-edb76e2e4d41217d-s6): **warn**, 0 HIGH / 0 MED (advisory LOW observations; diff-fallback grounding — the two new files are absent from the graph, so coverage was judged by the green suite).

## Notes

- No shared-contract SHAPE change beyond one additive optional field: `edit-prompt.review?` on sc3 (host-authoritative review gating; backward-compatible, mirrors the S008 additive-field pattern). sc2/sc4 unchanged; `editMode` already existed.
- The git/fs/editor seams live in `extension.ts` (the sole vscode importer); `edit-governor.ts` + `git-baseline.ts` are vscode-free and unit-tested with fakes.
- Non-git workspaces degrade to visualize-only (revert disabled, surfaced note).
