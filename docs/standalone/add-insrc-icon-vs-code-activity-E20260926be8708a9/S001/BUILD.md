<!-- insrc:artifact BUILD-be8708a9cd20e286-S001 -->

# Build (plan-driven) — Story S001

**Standalone:** yes  ·  **Epic:** be8708a9cd20e286  ·  **Commit:** feba6f0

Implements the approved S001 LLD + PLAN: host the insrc dev-chat as an Activity Bar **sidebar webview view** (like the Claude/Codex/Copilot extensions), reusing the existing `createChatPanelHost` turn-loop verbatim via a `WebviewView`→`ChatPanelChannel` adapter. `insrc.chat.open` is repointed to focus the view. Everything behind `insrc.chat.enabled` (default off); the docs-review pane is untouched.

## Tasks validated

- ✓ `t1` — `media/insrc.svg` (new): themeable monochrome `currentColor` Activity Bar icon; not `.vscodeignore`'d.
- ✓ `t2` — `src/vscode.d.ts`: added `WebviewView`, `WebviewViewProvider`, `window.registerWebviewViewProvider`, and `Webview.options`.
- ✓ `t3` — `src/chat/chat-view-channel.ts` (new, vscode-free): `webviewViewToChannel(view): ChatPanelChannel` (maps all six methods; `dispose` no-op; fire-and-forget post) + `createChatSidebarViewProvider(deps): WebviewViewProvider` (enable-scripts→wrap→build→open; rebuilds host+channel on re-resolution, disposing the stale host).
- ✓ `t4` — `package.json`: `contributes.viewsContainers.activitybar` (insrc → `media/insrc.svg`) + `contributes.views.insrc` (`insrc.chatView`, `type:webview`, `when:insrc.chat.ready`). No new command id.
- ✓ `t5` — `src/extension.ts`: register the sidebar provider inside the `if (chatEnabled)` gate (reusing the same edit-governance/providers/store/cwd deps via `makeHost=(createPanel)=>createChatPanelHost({...chatHostDeps,createPanel})`), enable scripts on resolve, repoint `insrc.chat.open`→`executeCommand('insrc.chatView.focus')`, set the `insrc.chat.ready` context key. Docs-review host + command left intact.
- ✓ `t6` — tests: new `chat-view-channel.test.ts` (adapter mapping, post-dispose swallow, host-driven-by-view render, re-resolution rebuild, **H1 session-resume regression**, vscode-free) + extended `extension-chat-wiring.test.ts` (manifest shape, provider wiring, command repoint, H1/M1 wiring, docs-review-still-registered).

## Validation

- `tsc --noEmit` clean.
- Full vscode-plugin sweep: **417 pass / 0 fail / 2 live-skip**.
- Design review (`insrc_review_step` on LLD): **PASS**, 0 HIGH / 0 MED / 5 LOW.
- Opposite-actor cold review (Sonnet; author is Opus): **1 HIGH / 2 MED / 1 LOW**, all HIGH+MED fixed here with regression tests:
  - **H1** — a rebuilt host (view re-resolution on window reload / host restart / view move) silently created a NEW empty session, dropping the active conversation and accreting stray empty sessions. FIX: an additive optional `resumeSessionId?: () => string | undefined` dep on `createChatPanelHost` (resume-or-create in `open()`), plus the sidebar provider sniffs the host's `session-restored` posts and persists the active id (extension.ts → `context.globalState`), so a fresh host resumes the prior conversation with no stray session. (Regression test added.)
  - **M1** — toggling `insrc.chat.enabled` without a window reload surfaced the Activity Bar icon before its provider was registered (a broken pane), because the view's `when` was the live `config.insrc.chat.enabled`. FIX: gate the view on an activate-time context key `insrc.chat.ready`, set only inside the flag gate — so the icon appears only after a reload re-runs `activate` with the flag on (matches the documented "reload required").
  - **M2** — tests never exercised the H1 continuity surface. FIX: added the two-resolve session-resume regression test over a real host + shared store.
  - **LOW** (deferred) — `open()`'s `reveal()` fast-path is unreachable in the sidebar flow (each host opens once; the command focuses the view). Harmless; still correct for the editor-panel/docs-review paths.
- Code review (CR-be8708a9cd20e286-S001): **warn**, 0 HIGH / 0 MED (1 LOW observation; diff-fallback grounding — the new files are absent from the graph, so coverage was judged by the green suite).

## Notes

- `createChatPanelHost` gained ONE additive, backward-compatible optional dep (`resumeSessionId`); its turn-loop / session / cancellation logic is otherwise unchanged. The LLD's "host not modified" intent is preserved in spirit — the change is a minimal resume hook driven by the H1 fix, smaller than the rejected a2 (host channel-injection refactor).
- The sole vscode importer stays `extension.ts`; `chat-view-channel.ts` is runtime-vscode-free (type-only vscode import) and unit-tested with a fake `WebviewView`.
- The chat's new home is the sidebar: `insrc.chat.open` now focuses the view instead of opening an editor tab (the one intended user-visible behavior change). Command id/title/keybindings unchanged; existing sessions/history carry over.
