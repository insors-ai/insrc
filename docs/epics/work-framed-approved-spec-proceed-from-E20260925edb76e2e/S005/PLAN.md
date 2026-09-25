<!-- insrc:artifact PLAN-edb76e2e4d41217d-s5 -->

# Plan: E20260925edb76e2e:S005

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790360632569-9okqd8`
**LLD effective hash:** `f394a9ecb688...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** sc4 store impl: optional maxSessions cap + title-from-prompt support | M | — | unit: save() with maxSessions=N keeps at most N sessions; oldest evicted (get->undefined, no orphaned session key); unit: eviction never removes the id being saved / active session even when oldest; unset maxSessions = unbounded; unit: a title updated to a first-prompt string round-trips through get()/list() (ChatSummary.title); list() still sorts updatedAt desc | [[c5]] [[c3]] |
| 2 | **`t2`** Webview shell: sc1 provider-selector + history-dropdown in the one nonce'd script | M | — | unit: renderShell renders a provider-selector with options == providers.available (attribute-escaped) + a history-dropdown, both sc1 surfaceClass; unit: shell keeps EXACTLY ONE <script nonce=...> + strict CSP, no remote origin/asWebviewUri, textContent (no innerHTML); empty available -> disabled selector | [[c1]] [[c2]] |
| 3 | **`t3`** Host wiring: post history-list, title-from-first-prompt, provider validation | M | `t1`, `t2` | integration: open() posts history-list (with theme + session-restored); history-list re-posted after new-chat/open-chat and after a turn's done; integration: new-chat{provider:'codex'} creates a fixed-provider session; a non-available provider is a no-op (active session unchanged); integration: after a turn, session.title is set from the first user prompt and reflected in a re-posted history-list | [[c2]] [[c4]] [[c6]] |
| 4 | **`t4`** Tests: store eviction/title + shell contract + history/resume integration | M | `t1`, `t2`, `t3` | integration: open-chat{chatId} restores a prior chat's transcript via session-restored; a missing/corrupt id is a no-op + re-posts history-list (dead row dropped); integration: ac3 native resume: turn 2's recorded TurnRequest carries resume={nativeSessionId} from turn 1's done.sessionId and replays NO prior transcript; integration: selecting a history entry / new provider WHILE a turn streams cancels the in-flight turn first (single-in-flight preserved) | [[c7]] [[c8]] |

### E20260925edb76e2e:S005:T001 — sc4 store impl: optional maxSessions cap + title-from-prompt support

In session-store.ts: add optional maxSessions?: number to MementoStoreDeps and, in save(), after appending the id, evict the oldest ids beyond the cap — removing each evicted id from the index AND its insrc.chat.session.<id> key — never evicting the id being saved. Keep create/get/list/append/save signatures byte-identical (interface-compatible; unset maxSessions = S003 unbounded behaviour). Title itself is set by the host (t3) via the existing save(); this task just ensures save() persists an updated title (it already does).

**Acceptance checks:**
- MementoStoreDeps gains optional maxSessions?: number; ChatSessionStore + create/get/list/append/save signatures unchanged
- save() with maxSessions=N keeps at most N sessions: creating N+2 leaves list().length===N, oldest evicted (get()->undefined) with no orphaned session key
- eviction never removes the id being saved / active session, even if oldest
- unset maxSessions preserves S003 unbounded behaviour; corruption tolerance preserved

### E20260925edb76e2e:S005:T002 — Webview shell: sc1 provider-selector + history-dropdown in the one nonce'd script

In chat-panel.ts renderShell: add an sc1-styled provider-selector whose <option>s are rendered (attribute-escaped) from deps.providers.available, and an (empty) history-dropdown, both inside the SAME nonce'd inline script. Wire provider-select change -> postMessage new-chat{provider}; history-select change -> open-chat{chatId}; add a 'history-list' message handler that (re)populates the history <option>s via textContent, keeping the active id selected. Empty providers.available -> disabled selector. Keep exactly one <script> + strict CSP.

**Acceptance checks:**
- renderShell output has a provider-selector with options == providers.available (attribute-escaped) + a history-dropdown, both with the sc1 surfaceClass
- the webview handles a history-list message and sets option labels via textContent (no innerHTML); provider/history change -> postMessage new-chat/open-chat
- shell still has EXACTLY ONE <script nonce=...> + strict CSP (script-src 'nonce-...'), no remote origin / asWebviewUri
- providers.available empty -> selector renders disabled/optionless

### E20260925edb76e2e:S005:T003 — Host wiring: post history-list, title-from-first-prompt, provider validation

In chat-panel.ts host: open() posts history-list (from deps.store.list()) after theme + session-restored; handleMessage re-posts history-list after new-chat/open-chat, and new-chat validates provider is a member of deps.providers.available before store.create (else no-op+warn); runTurn sets session.title from the first user prompt (trimmed/clipped; whitespace falls back to 'new chat') on the first turn via save(), and re-posts history-list after the terminal done. Preserve the cancelActive()+ ++generation single-in-flight guard and the existing native-resume wiring unchanged.

**Acceptance checks:**
- open() posts theme + session-restored + history-list; history-list re-posted after new-chat/open-chat and after a turn's done
- new-chat with a provider NOT in providers.available is a no-op (active session unchanged); valid provider creates a fixed-provider session
- runTurn sets title from the first user prompt (empty->'new chat'); native resume path + single-in-flight guard unchanged; no workflow/daemon call (k8/k3)

### E20260925edb76e2e:S005:T004 — Tests: store eviction/title + shell contract + history/resume integration

Extend session-store.test.ts (maxSessions eviction active-safe + no-orphan + unset=unbounded; title round-trip via list()) and chat-panel.test.ts (reuse FakePanel/fake-adapter/in-memory-store harness; extend the existing scriptedAdapter to RECORD the last TurnRequest): shell renders selector==available + history-dropdown + one nonce'd script/CSP; open() posts history-list; new-chat provider fixed + non-available rejected; open-chat restores + corrupt-id drop; title-from-first-prompt reflected in a re-posted history-list; two-turn native resume (turn 2 TurnRequest.resume carries turn 1's done.sessionId, no transcript replay); switch-mid-stream cancels in-flight. node:test + assert/strict.

**Acceptance checks:**
- session-store.test.ts covers maxSessions eviction (active-safe, no orphan), unset-unbounded, and title round-trip
- chat-panel.test.ts covers selector/dropdown shell contract + CSP, history-list on open + after turns, open-chat restore + corrupt drop, provider validation, two-turn resume req.resume, single-in-flight on switch
- full vscode-plugin sweep green under tsx --test
- ac1, ac2, ac3 each have >=1 passing proving test

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| save() with maxSessions=N keeps at most N sessions: after creating N+2, list() returns N and the OLDEST were evicted (their get() -> undefined, no orphaned session key) | `t1` |
| eviction never removes the id being saved / the active session even when it is the oldest | `t1` |
| unset maxSessions preserves the S003 unbounded behaviour (no eviction) | `t1` |
| a session whose title is updated to a first-prompt string round-trips through get()/list() (ChatSummary.title reflects it); list() still sorts updatedAt desc | `t1` |
| renderShell() output contains a provider-selector whose <option>s are exactly deps.providers.available (attribute-escaped), and an (empty) history-dropdown container, both with the sc1 surfaceClass (provider-dropdown/history-dropdown) | `t2` |
| the shell still has EXACTLY ONE <script nonce=...> + strict CSP (script-src 'nonce-...'); no remote origin / asWebviewUri; dynamic history labels are set via textContent (scan: no innerHTML) | `t2` |
| with providers.available empty, the selector renders disabled/optionless | `t2` |
| open() posts a history-list (from store.list()) in addition to theme + session-restored | `t3` |
| new-chat{provider:'codex'} creates a session whose provider is 'codex' (fixed), makes it active, and re-posts history-list including the new chat | `t3` |
| new-chat with a provider NOT in available is a no-op (no session created, active session unchanged) | `t3` |
| after a turn, session.title is set from the first user prompt and a fresh history-list is posted reflecting the new title/order | `t3` |
| open-chat{chatId} for a prior chat posts session-restored with that chat's transcript; open-chat for a missing/corrupt id is a no-op + re-posts history-list (dead row dropped) | `t4` |
| ac3 native resume: send turn 1 (adapter emits done{sessionId:'sess-1'}) then turn 2 -> the adapter's TurnRequest for turn 2 carries resume={provider, nativeSessionId:'sess-1'} and NO prior transcript turns are replayed to the adapter | `t4` |
| selecting a history entry / new provider WHILE a turn streams cancels the in-flight turn first (single-in-flight preserved) | `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails/renderShell (add sc1 provider-selector + history-dropdown in the one nonce'd script)` — "renderShell RESHAPED to add a provider-selector (options from deps.providers.available) + history-dropdown inside the SAME nonce'd script; CSP unchanged"
- **[[c2]]** `prior-artifact` `LLD s5 interactionWithShared/sc3 (rides existing history-list/new-chat/open-chat)` — "posts history-list (HostToWebview) + receives new-chat{provider}/open-chat{chatId}; no new sc3 message"
- **[[c3]]** `prior-artifact` `LLD s5 contractDetails/createMementoChatSessionStore (maxSessions eviction impl)` — "save() evicts the oldest non-active ids + their session keys beyond an optional maxSessions cap; signatures byte-identical"
- **[[c4]]** `prior-artifact` `LLD s5 contractDetails/runTurn + interactionWithShared/sc5 (title-from-first-prompt + native resume already wired)` — "runTurn sets title on the first turn + re-posts history-list; req.resume from nativeSessionId, capture done.sessionId (already implemented)"
- **[[c5]]** `prior-artifact` `LLD s5 dataModel (ChatSession.title field-modify + chat index cap invariant-change)` — "title populated from first prompt; insrc.chat.index bounded by maxSessions"
- **[[c6]]** `prior-artifact` `LLD s5 contractDetails/handleMessage + open (post history-list, validate provider in available)` — "open() posts history-list; new-chat validates provider in providers.available; re-post history-list after switches; single-in-flight preserved"
- **[[c7]]** `analyze-bundle` `s1: test homes chat-panel.test.ts + session-store.test.ts (FakePanel/fake-adapter/in-memory-store)` — "node:test + assert/strict; FakePanel + fake StreamAdapter + in-memory ChatSessionStore; extend the scriptedAdapter to record TurnRequests"
- **[[c8]]** `prior-artifact` `LLD s5 testStrategy + migration (acceptance mapping ac1/ac2/ac3; zero-downtime interface-compatible)` — "unit store cap/title + contract shell + integration history/resume; ac1/ac2/ac3 mapped; no shape change, no data rewrite"
