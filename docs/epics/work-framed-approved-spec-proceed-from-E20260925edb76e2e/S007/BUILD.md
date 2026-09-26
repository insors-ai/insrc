<!-- insrc:artifact BUILD-edb76e2e4d41217d-s7 -->
# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Epic:** edb76e2e4d41217d  ·  **Commit:** 748d7e8

Implements the approved S007 LLD + PLAN: a docs-review pane that lists the daemon's pending tracked-workflow artifacts (Epic/DEF/HLD/LLD/PLAN awaiting approval), opens one, and drives approve / request-changes — all over the EXISTING daemon review IPCs (`workflow.pending`/`artifactContent`/`approve`/`resolveComment`, built by the JetBrains ide-artifact-review-panel epic). A thin passthrough observer (k8): no new daemon capability, acts only on daemon-tracked pending artifacts (k5), no cloud REST (k2), persists nothing extension-side (k3). Behind flag `insrc.chat.enabled`.

## Tasks validated

- ✓ `t1` — `chat/protocol.ts`: additive sc3 messages — `docs-content` (`{artifactId, markdown, openQuestions, blocked, commentable?}`), `open-doc` (`{artifactId}`), and optional `note` on `docs-decision`; `*_TYPES` arrays extended. Non-breaking (existing switches ignore unknown types).
- ✓ `t2` — `chat/docs-review-client.ts` (new, vscode-free): `createDocsReviewClient(client)` over the shared IPC client — `pending`/`content`/`approve`/`comment` mapping the daemon shapes onto the sc3 types, resolving the `id→mdPath` the summary drops, normalizing every `{error}` arm into a throw.
- ✓ `t3` — `chat/docs-review-panel.ts` (new, vscode-free): `createDocsReviewHost(deps)` — the webview host (S003 shell invariants: one nonce'd CSP script, textContent/className only); lists pending, opens one, approves / requests-changes, surfaces a daemon block-verdict non-lossily, re-fetches after each decision (sequence-guarded).
- ✓ `t4` — `package.json`: `insrc.chat.docsReview` command.
- ✓ `t5` — `extension.ts`: constructs the docs-review host + `createDocsReviewClient(client)` inside the `insrc.chat.enabled` gate over the shared daemon client; registers `insrc.chat.docsReview`.
- ✓ `t6` — tests: `docs-review-client.test.ts` + `docs-review-panel.test.ts` (new) + `extension-chat-wiring.test.ts` / `packaging.test.ts` / `truthful-sync.test.ts` (manifest exact-set) extensions.

## Validation

- `tsc --noEmit` clean.
- Full vscode-plugin sweep: **407 pass / 0 fail / 2 live-skip**.
- Opposite-actor cold review (Sonnet, author is Opus): **1 HIGH / 3 MED / 2 LOW**, all HIGH+MED fixed here with regression tests:
  - **HIGH-1** — a content-fetch failure left the *approve* button live → a reviewer could approve an artifact whose body they never saw (approve-without-review). FIX: `openDoc`'s error path posts `blocked:true`, so the webview suppresses approve until the body actually loads; request-changes stays available.
  - **MED-2** — the daemon's `deriveMdPath` "unresolvable" sentinel (`mdPath === ''`) defeated the client's raw-id `??` fallback (`'' ?? id` → `''`), sending an empty path the daemon rejects. FIX: skip caching an empty `mdPath` so `.get()` returns `undefined` and the fallback fires.
  - **MED-3** — `open()` + the webview boot-ping both call `refreshPending` concurrently; under real IPC latency a slow older response could overwrite a newer one. FIX: a monotonic `refreshSeq` guard drops any superseded response.
  - **MED-4** — request-changes was offered for kinds the daemon's `resolveComment` locator (`parseArtifactId`) rejects (only DEF/HLD/LLD; SPEC/PLAN/ISSUE/CR fail server-side). FIX: `docs-content` carries a `commentable` flag derived from the artifact kind; the webview hides the control when `commentable === false`.
  - **LOW** (deferred): stale content view remains after a successful approve (cosmetic; the id has left the pending map so a stray click is no-op'd); theoretical `c-${Date.now()}` comment-id collision (unreachable — one comment per decision).
- Code review (CR-edb76e2e4d41217d-s7): **warn**, 0 HIGH / 0 MED (advisory LOW observations; diff-fallback grounding — the new files are absent from the graph, so coverage was judged by the green suite).

## Notes

- No shared-contract SHAPE change beyond additive sc3 members: the new `docs-content`/`open-doc` messages and one optional field each on `docs-decision` (`note?`) and `docs-content` (`commentable?`). Backward-compatible; existing handlers ignore unknown/absent members.
- The sole vscode importer stays `extension.ts`; `docs-review-client.ts` + `docs-review-panel.ts` are vscode-free and unit-tested with a fake IPC client + FakePanel.
- Reuses the S003 `ChatPanelChannel` seam and the `docs-review` design-tokens surface (both defined-but-unwired since S003) — no new webview infrastructure.
- **This is the epic's final story (8/8): the VS Code dev-chat epic is now feature-complete.**
