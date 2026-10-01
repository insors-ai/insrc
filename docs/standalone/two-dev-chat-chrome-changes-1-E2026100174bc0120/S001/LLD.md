<!-- insrc:artifact LLD-74bc0120660d539a-S001 -->

# LLD: E2026100174bc0120:S001

## Summary

**Epic:** `two-dev-chat-chrome-changes-1`
**HLD base run:** `wf-1790835774744-vwuj01`
**HLD effective hash:** `74bc0120660d...`

Once a chat has something in it, its provider can no longer be changed. Picking a provider today quietly abandons the current conversation and opens a new one — easy to trigger by accident when you only meant to look. The control now stays available on a fresh, empty chat (where choosing a provider is exactly the right move) and locks as soon as that chat takes its first turn; to work with the other CLI you start a new chat from the session dropdown. If no CLI is installed at all the control stays disabled as before. Separately, the session dropdown is twice as wide so longer chat titles are readable.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Designed directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `renderShell`

```typescript
(): string
```

**Returns:** `string` — The complete webview HTML. Two changes: the `.chrome #insrc-history` rule's max-width doubles (18ch -> 36ch), and the nonce'd script gains the provider-lock state plus its single mutator. The provider select's SERVER-RENDERED markup is unchanged — `provDisabled` still interpolates ' disabled' when `deps.providers.available` is empty, and remains the only thing writing that attribute at render time.

**Preconditions:**
- The shell is rendered ONCE per webview open; the active session changes at runtime, so nothing session-dependent may be baked into the returned HTML.

**Postconditions:**
- The lock is CLOSED by default, so a webview that never receives a session message cannot leave the control usable.
- The capability gate and the per-session lock compose through ONE mutator; no other path writes the select's disabled property.
- The `.chrome #insrc-history` chip is otherwise byte-identical — border, fill, radius, padding and the icon's position inside the padding untouched.

### 2.2 `setRunning`

```typescript
(r: boolean) => void
```

**Parameters:**
- `r: boolean` — Whether a turn is in flight.

**Returns:** `void` — Unchanged. Listed as the in-file precedent the lock mutator mirrors: one module-local state var, one mutator owning every DOM consequence. The lock does NOT piggyback on it — a turn in flight and a session having context are different facts with different lifetimes.

**Postconditions:**
- Unchanged by this Story.

### 2.3 `doSubmit`

```typescript
() => void
```

**Returns:** `void` — Gains one call: after the existing non-empty guard passes and the turn is posted, the lock closes. This covers a fresh chat acquiring its first message, for which no session message is sent.

**Preconditions:**
- The existing empty-input guard runs FIRST — an empty submit is a no-op today and must not close the lock.

**Postconditions:**
- After a non-empty submit the provider select is locked for the rest of that session.
- An empty submit leaves the lock exactly as it was.

## 3. Data model changes

### 3.1 `ChatSession` — invariant-change

No field changes. Records and enforces an invariant the type already implies: `provider` is readonly and `nativeSessionId` holds a resume handle minted by one provider's CLI, so a session's provider is fixed at creation and cannot be re-pointed at another CLI. The UI previously offered an action that LOOKED like 'switch this session's provider' but actually abandoned the session; the lock makes the UI agree with the data model. Nothing persisted moves, so existing sessions read back byte-identically.

```
(none — no field added, removed or retyped)
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts:66`
- `vscode-plugin/src/chat/session-store.ts:68`
- `vscode-plugin/src/chat/session-store.ts:69`
- `vscode-plugin/src/chat/chat-panel.ts:438`

### 3.2 `ChatSummary` — invariant-change

No field changes — recorded as a NEGATIVE finding that constrains the design. The summaries shipped on `history-list` carry only id/provider/title/updatedAt and no transcript length, so the lock CANNOT be derived from the history list; it must come from the transcript the webview already holds from `session-restored`.

```
(none)
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts:82`
- `vscode-plugin/src/chat/chat-panel.ts:484`

## 4. Diagrams

- [Sequence diagram](docs/standalone/two-dev-chat-chrome-changes-1-E2026100174bc0120/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The webview opens and no session message ever arrives, leaving the lock's input undefined.** (recoverable)
  - Detection: Not detected after the fact — made unrepresentable by initialising the lock CLOSED at script start, before any handler can run. There is no 'unknown' state to notice: the only way to open the lock is a message that positively says the active session has no rows.
  - Response: The select stays disabled. Opening or starting a chat produces a session message that settles the lock correctly.
  - User impact: A control is unavailable until chat state is known — fails toward 'cannot accidentally abandon a conversation', the direction this Story protects.
- **A submit is posted but the host rejects or drops it, yet the webview already closed the lock.** (recoverable)
  - Detection: The webview CANNOT detect this: `submit-turn` is fire-and-forget and the host's no-op path returns silently. This is the accepted cost of the optimistic transition recorded against ac3.
  - Response: Accept the stale lock rather than add a failure channel. It self-heals — the next `session-restored` or `history-list` re-derives the lock from the real transcript.
  - User impact: Rarely, the select is locked on a chat with no messages until the user switches session or reopens the panel. Never blocking: starting a new chat is unaffected.
- **The provider select element is absent from the DOM (a future chrome edit moves or removes it).** (recoverable)
  - Detection: The mutator looks the element up once at startup, as the existing `ps`/`hs`/`sendBtn` lookups do, and guards its writes on presence — the shipped `if(sendBtn)` / `if(pm)` shape.
  - Response: The mutator becomes a no-op; the state var still tracks, nothing throws.
  - User impact: None — a missing control cannot be locked.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A brand-new chat with an empty transcript (the store's `draft`). | Lock OPENS — the one moment choosing a provider is meaningful; a change still means 'start a new chat with this provider'. |
| That fresh chat's first non-empty submit. | Lock CLOSES immediately, before any response arrives. |
| An empty/whitespace-only submit (the existing trim guard fires). | Lock stays OPEN — the guard runs first, so a non-submission cannot lock the control. |
| Switching between two non-empty chats. | Lock stays CLOSED, re-derived from the newly replayed transcript rather than carried over. |
| Switching from a chat with history BACK to an empty chat. | Lock RE-OPENS — the derivation is per-session and must not latch once closed. |
| No CLI installed, then a session message for an empty chat. | Select stays disabled — the capability gate wins; the mutator refuses to enable past the element's initial disabled state. |
| A session title longer than the new 36ch cap. | Truncates at 36ch as it did at 18ch; only the cap moves. |
| A session reopened after a reload, replaying a persisted transcript. | Lock closes from the replayed rows alone — no new persisted field is read, because none was added. |

**Invariants to preserve**

- The provider select is disabled whenever no CLI is installed — a capability gate, not a preference. The new lock must compose with it, never re-enabling what the gate closed, and the existing 'selector disabled when no CLI installed' test must stay green UNMODIFIED. [[c1]]
- On an empty chat, changing the provider still means 'start a new chat with this provider'. The Story locks the control; it does not redefine what the control does when usable. [[c5]]
- A session's provider is fixed at creation (`provider` readonly, `nativeSessionId` provider-specific). Nothing here may introduce a path that re-points an existing session at another CLI. [[c2]]
- The lock is view state and is never persisted. No field is added to ChatSession or ChatSummary; existing sessions need no migration. [[c8]]
- `session-restored` and `history-list` keep their existing effects — transcript replay with resetKeys(), and the re-sync of the select's value. The lock is additive at both seams; neither handler's effects may be altered or reordered. [[c6]]
- The empty-submit no-op is preserved: `doSubmit` returns early on blank input, before any lock transition. [[c3]]
- The `.chrome #insrc-history` chip is unchanged apart from its max-width. [[c4]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict under tsx (`npx tsx --test 'src/**/__tests__/*.test.ts'` from vscode-plugin). House pattern: build the shell through a fake channel and assert against `fc.html()` — the eval'd *WebviewSource string. The suite never executes the script against a DOM.`

**Test levels**

- **unit** — Pin the server-rendered facts the suite CAN observe directly.
  - Subjects: ``.chrome #insrc-history` declares max-width:36ch — asserted by PARSING the rule body and comparing the extracted cap, not by matching a literal.`, `The rest of the chip is unchanged (border, fill, radius, four-value padding, icon position).`, `EXISTING, UNMODIFIED: with zero providers the select is still rendered `disabled`. If this test needs editing, the composition rule is wrong.`, `With providers available the select is still rendered WITHOUT `disabled` — the lock has not leaked into render time.`
  - Fixtures: `The existing fakeChannel + createChatPanelHost harness.`, `A registry with zero available providers.`, `A registry with at least one available provider.`
- **unit** — Pin the lock's WIRING in the emitted script — the weaker evidence this harness permits, so each assertion must fail if the lock is REMOVED, not merely renamed.
  - Subjects: `The lock state is declared CLOSED at startup.`, ``session-restored` settles the lock from the replayed transcript's row count.`, ``history-list` settles the lock for the active session, with the existing provider re-sync still present and unaltered.`, ``doSubmit` closes the lock AFTER its empty-input guard — assert the guard precedes the lock call in the emitted source.`, `Exactly ONE construct writes the select's disabled property.`, `The mutator refuses to enable past the element's initial disabled state.`
  - Fixtures: `The rendered shell string from the existing harness.`
- **integration** — Prove the surrounding behaviour is unchanged, so the lock is additive rather than a reordering.
  - Subjects: `A provider change still posts `new-chat` with the chosen provider.`, ``session-restored` still clears, resetKeys() and replays in order; `history-list` still rebuilds options and keeps the active session selected.`, `An empty submit is still a no-op end to end.`
  - Fixtures: `The existing fakeChannel message-capture harness.`
- **smoke** — Look at it. Three defects in this module this week shipped green because an assertion could not fail.
  - Subjects: `Render the shell headless with a long session title; confirm the dropdown is visibly wider and the title reads further.`, `Confirm the chip is otherwise unchanged at the new width.`
  - Fixtures: `Headless Chrome against the dumped shell HTML.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | ``session-restored` settles the lock CLOSED for a session with rows`, `MUTATION: removing that call fails this test` |
| `ac2` | ``session-restored` with an empty transcript leaves the lock OPEN`, `Switching from a chat with history back to an empty chat re-opens it — the state does not latch` |
| `ac3` | ``doSubmit` closes the lock after a non-empty submit`, `The empty-input guard precedes the lock call in the emitted source`, `MUTATION: removing the doSubmit call fails the first of these` |
| `ac4` | `EXISTING, unmodified: zero providers -> select rendered `disabled``, `Exactly one construct writes the disabled property`, `The mutator will not enable past the initial disabled state`, `MUTATION: making the mutator enable unconditionally fails the composition assertion` |
| `ac5` | `The parsed `.chrome #insrc-history` max-width equals 36ch`, `The rest of the chip rule is unchanged`, `MUTATION: reverting the cap to 18ch fails the parsed-cap assertion`, `Headless render with a long session title shows the wider dropdown` |

## 7. Migration

**State before:** The provider select is live for every session; its only disable is the render-time capability gate (`provDisabled` when `available.length === 0`). A change posts `new-chat`, abandoning the current conversation — consistent with the data model (readonly provider, provider-specific nativeSessionId) but not with what the control looks like it does, so an accidental pick silently discards context. The session dropdown caps its label at 18ch. No webview-local provider state exists.

**State after:** The select is locked whenever the active session has context, and open only on a fresh/empty chat where a change still means 'start a new chat with this provider'. The lock is webview-local view state — one var, one mutator that is the sole writer of the disabled property — settled at three existing transitions and initialised CLOSED so an unmessaged webview fails safe. The capability gate is unchanged and still wins. No message type, protocol field or persisted shape changes. The dropdown cap doubles to 36ch.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Widen the label cap in the existing `.chrome #insrc-history` rule from 18ch to 36ch, changing nothing else. — ↩ rollbackable
2. Declare the lock state in the webview script, initialised LOCKED, beside the existing module-local state vars. — ↩ rollbackable
3. Add the single mutator owning the disabled property, capturing the element's initial disabled state at startup so the capability gate can never be re-enabled, and guarding writes on element presence. — ↩ rollbackable
4. Call the mutator from `session-restored`, deriving the lock from whether the replayed transcript has rows. Append to the handler's existing work — do not reorder clear/resetKeys/replay. — ↩ rollbackable
5. Call the mutator from `history-list` for the active session, leaving the existing provider re-sync unaltered. — ↩ rollbackable
6. Call the mutator from `doSubmit` to close the lock, AFTER the existing empty-input guard. — ↩ rollbackable
7. Extend coverage per the test strategy; leave the no-CLI capability-gate test UNMODIFIED. Mutation-check every new assertion. — ↩ rollbackable
8. Render the shell headless with a long session title and inspect it. — ↩ rollbackable

**Backward compat:** No compatibility surface moves. renderShell's signature is unchanged; the host/webview message contract gains and loses nothing; ChatSession and ChatSummary are untouched, so persisted sessions read back byte-identically and none needs migrating. The one observable behaviour change is deliberate and IS the Story: on a session with messages the provider select no longer responds. The action it used to offer there — abandoning the conversation for a new one — remains available explicitly via the session dropdown, so nothing previously possible becomes impossible. On an empty chat, and with no CLI installed, behaviour is exactly as before.

## 8. Alternatives considered

### 8.1 a1: Webview-local lock, derived from the transcript the webview already holds — **CHOSEN**

One state var plus one mutator in the nonce'd script, set at the three transitions the webview already observes; no host or protocol change.

Mirror the shipped `running`/`setRunning` shape. A single webview-local boolean for whether the active session has context, and a single mutator that owns the provider select's disabled state. That mutator is the ONLY writer of the property, so the composition rule lives in one place: it never enables past the element's initial disabled state, which it captures at startup rather than keeping a second copy of `providers.available`. Three transitions drive it, all already handled: `session-restored` (lock follows the replayed transcript's row count), `history-list` (re-settled alongside the existing provider re-sync), and submit (a fresh chat acquiring its first message). Nothing is persisted and nothing new crosses the host boundary.

### 8.2 a2: Host-authoritative lock, carried on the existing session-restored message

The host decides whether the active session has context and ships a flag on the message it already sends; the webview just applies it.

Keep the decision where the session data lives. The host already builds `session-restored` with the session id and full transcript, and already distinguishes a persisted session from an unsaved draft. Add one boolean to that existing message meaning 'this session has context', computed host-side, and have the webview apply it to the select on receipt. The webview holds no derivation logic — it reflects what the host said. The capability gate stays server-rendered and is composed by the webview refusing to enable when the control was rendered disabled.

### 8.3 a3: Re-render the shell's provider select per session

Extend the existing server-rendered disabled attribute to cover the per-session case and re-render the control when the session changes.

Treat the lock as part of the same server-rendered decision that already produces the capability gate, so there is exactly ONE disable mechanism. The disabled attribute would be computed from both provider availability and the active session's context, and the control (or the shell) re-rendered when the active session changes so the attribute reflects the new session.

## 9. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:398` — "const provDisabled = available.length === 0 ? ' disabled' : '';"
- **[[c2]]** `code` `vscode-plugin/src/chat/session-store.ts:68` — "readonly provider: ProviderId;"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:490` — "`function doSubmit(){if(!box.value.trim())return;vs.postMessage({v:1,payload:{type:'submit-turn',text:box.value}});box.value='';setRunning(true);setProgress('working…');}` +"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:334` — "`.chrome #insrc-history{max-width:18ch;padding:3px 16px 3px 22px;` +"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts:438` — "`ps.addEventListener('change',function(){if(ps.value){vs.postMessage({v:1,payload:{type:'new-chat',provider:ps.value}});}});` +"
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:480` — "`else if(m.type==='session-restored'){cur=m.sessionId||'';t.textContent='';reg.resetKeys();(m.transcript||[]).forEach(function(x,i){reg.appendKeyed(reg.toViewModel(x),'r'+i);});hs.value=cur;setRunning"
- **[[c7]]** `code` `vscode-plugin/src/chat/chat-panel.ts:484` — "`else if(m.type==='history-list'){ … var _ac=(m.chats||[]).filter(function(c){return c.id===cur;})[0];if(_ac&&_ac.provider){ps.value=_ac.provider;}}});` +"
- **[[c8]]** `code` `vscode-plugin/src/chat/session-store.ts:69` — "nativeSessionId?: string;"
- **[[c9]]** `code` `vscode-plugin/src/chat/session-store.ts:82` — "export interface ChatSummary {"
- **[[c10]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:505` — "assert.match(fc.html(), /<select id="insrc-provider"[^>]*disabled/, 'selector disabled when no CLI installed');"
- **[[c11]]** `code` `vscode-plugin/src/chat/chat-panel.ts:543` — "`<span class="seg"><select id="insrc-provider" class="segsel ${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select></span>` +"
- **[[c12]]** `stakeholder` `User request, 2026-10-01` — "for an active session (session that already has context) changing the provider should be disabled. … Make the session dropdown a little wider (2x)"

## 10. Open questions

- Switching an EXISTING session's provider while keeping its context is not merely out of scope — it is unsupported by the data model (`ChatSession.provider` is readonly; `nativeSessionId` is a provider-specific resume handle). If that capability is ever wanted it needs its own story with a cross-provider context transfer; this Story deliberately does not open that door.
- The first-turn transition is optimistic (closes on send, not on host confirmation), so a host-rejected submit leaves a stale lock until the next session message re-derives it. Accepted as bounded and self-healing. If it proves annoying in use, the host's existing `user-row` echo is available as a confirmed trigger with no new protocol.
- The Story arrived with an empty `acceptanceCriteria` array; ac1-ac5 used throughout are my decomposition of its userValue (lock-when-context, unlock-on-empty, relock-on-first-turn, capability-gate-still-wins, widen-dropdown), not criteria the requester wrote.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 16 LOW** · model `client` · reviewed 2026-10-01T06:35:52.547Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c1 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts:398 declares `const provDisabled = available.length === 0 ? ' disabled' : '';` — the capability gate the LLD says is the only render-time writer of the select's disabled attribute. | CONFIRMED verbatim. The read anchor resolved: chat-panel.ts:398 is `const provDisabled = available.length === 0 ? ' disabled' : '';`, exactly as the LLD's c1 quotes it. The capability gate is real and is where the LLD says it is. | None. Citation c1 is accurate. |
| 2.1 | closed-union | LOW | auto | `provDisabled` is the ONLY construct that writes a disabled attribute onto the provider select in the current source — i.e. exactly one occurrence of the identifier interpolated into the element, and no other `disabled` write targeting #insrc-provider. | CONFIRMED. chat-panel.ts:543 resolves to the provider select with `${provDisabled}` interpolated, and no other construct in the shell writes a disabled attribute onto that element. The LLD's postcondition that the gate and the lock must compose through ONE mutator therefore starts from a true premise — today there is exactly one writer, and the design's job is to keep it that way. | None. The single-writer premise holds against the current source. |
| c11 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts:543 emits the provider select with provDisabled interpolated: `<select id="insrc-provider" class="segsel ${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select>`. | CONFIRMED verbatim. chat-panel.ts:543 reads `<span class="seg"><select id="insrc-provider" class="segsel ${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select></span>`, matching the LLD's c11 quote. | None. Citation c11 is accurate. |
| c5 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts:438 wires the provider select's change event to post a `new-chat` message carrying the chosen provider — i.e. a change today starts a NEW chat rather than switching the current session's provider. | CONFIRMED. chat-panel.ts:438 is the change listener posting `new-chat` with `provider: ps.value`. This is load-bearing for the whole Story: it proves the control does NOT switch a session's provider today but abandons the chat, which is the behaviour the lock gates. The LLD's c5 quote matches. | None. Citation c5 is accurate and the Story's premise is sound. |
| c4 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts:334 opens the `.chrome #insrc-history` rule with `max-width:18ch;padding:3px 16px 3px 22px;` — the current cap the Story doubles to 36ch, and the chip padding it must leave untouched. | CONFIRMED verbatim. chat-panel.ts:334 is `` `.chrome #insrc-history{max-width:18ch;padding:3px 16px 3px 22px;` + ``. Both the 18ch cap the Story doubles and the four-value chip padding it must preserve are exactly as cited in c4. | None. Citation c4 is accurate. |
| c6 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts:480 is the `session-restored` handler, which sets `cur` from the message's sessionId, clears the transcript, calls reg.resetKeys() and replays `m.transcript` row by row — so the webview holds the active session's row count at that point. | CONFIRMED. chat-panel.ts:480 is the `session-restored` handler: it sets `cur` from the message, clears the transcript, calls `reg.resetKeys()` and replays `m.transcript`. The LLD's claim that the webview holds the active session's row count at this point is true, so deriving the lock here needs no new data. | None. Citation c6 is accurate. |
| c7 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts:484 is the `history-list` handler, which repopulates the dropdown and re-syncs the provider select's value from the active chat's provider via `if(_ac&&_ac.provider){ps.value=_ac.provider;}`. | CONFIRMED. chat-panel.ts:484 is the `history-list` handler and contains the provider re-sync `if(_ac&&_ac.provider){ps.value=_ac.provider;}`. The LLD's choice of this seam as the second lock transition is grounded. | None. Citation c7 is accurate. |
| c3 | citation | LOW | auto | vscode-plugin/src/chat/chat-panel.ts:490 defines `doSubmit` with an empty-input guard FIRST (`if(!box.value.trim())return;`) before posting submit-turn — the ordering the LLD requires the lock transition to sit behind. | CONFIRMED verbatim. chat-panel.ts:490 is `function doSubmit(){if(!box.value.trim())return;...}` — the empty-input guard is genuinely FIRST in the function, so the LLD's ordering precondition (lock transition must sit behind the guard) is implementable exactly as written. | None. Citation c3 is accurate. |
| c2 | semantic | LOW | auto | ChatSession declares `readonly provider: ProviderId;` at vscode-plugin/src/chat/session-store.ts:68 — the readonly modifier is what makes re-pointing an existing session at another CLI unsupported, which is the LLD's core justification for locking rather than switching. | CONFIRMED. session-store.ts:66 opens `export interface ChatSession {` and :68 is `readonly provider: ProviderId;`. The readonly modifier is real, which is the LLD's central justification for locking rather than offering a switch. | None. Citation c2 is accurate. |
| c8 | semantic | LOW | auto | ChatSession carries `nativeSessionId?: string;` at vscode-plugin/src/chat/session-store.ts:69 — the provider-specific resume handle the LLD cites as reinforcing that a mid-session provider switch cannot carry context. | CONFIRMED verbatim. session-store.ts:69 is `nativeSessionId?: string;`, matching c8. | None. Citation c8 is accurate. |
| 3.2 | inventory | LOW | auto | ChatSummary (vscode-plugin/src/chat/session-store.ts:82) has exactly four fields — id, provider, title, updatedAt — and carries NO transcript or row count, which is the LLD's stated reason the lock cannot be derived from the history list. | CONFIRMED. session-store.ts:82 opens `export interface ChatSummary {`. The LLD's NEGATIVE finding — that the summary carries no transcript or row count, so the lock cannot be derived from the history list — holds, and it is what forces the design to read the replayed transcript instead. | None. Citation c9 is accurate and the constraint it establishes is real. |
| c10 | citation | LOW | auto | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:505 already asserts the provider select is rendered disabled when no CLI is installed — the existing test the LLD requires to stay green UNMODIFIED. | CONFIRMED verbatim. chat-panel.test.ts:505 is the existing `selector disabled when no CLI installed` assertion. The LLD's requirement that this test stay green UNMODIFIED is checkable and is the sharpest available signal that the composition rule was implemented correctly. | None. Citation c10 is accurate. |
| 2.2 | semantic | LOW | manual | The webview script already holds module-local state vars with single mutators that own their DOM consequences — `var running=false;` with `setRunning` updating the send control's textContent, className and aria-label — the in-file precedent the LLD says the lock mirrors. | PARTIALLY CONFIRMED — the substance holds, one of my own anchors was imprecise. `var running=false;` is at :422 as claimed, but I also anchored :420, which is a comment line, and the mutator itself is at :424 (`function setRunning(r){running=r;if(sendBtn){...}}`), not :422. The precedent the LLD relies on — one module-local state var plus one mutator owning every DOM consequence — is real and verified at :422/:424. | No artifact change. The LLD does not cite these lines; the imprecision is in my review claim's anchors only. Recorded so the next reader of this review does not treat :420/:422 as the mutator's location. |
| 5 | semantic | LOW | manual | The script's element lookups are guarded before use — `if(sendBtn)` inside setRunning and `if(pm)` on the mode control — the existing shape the LLD's missing-element error case says the lock mutator will follow. | MY ANCHOR WAS WRONG, the premise is still true. I anchored `if(sendBtn)` at :422, but :422 is `var running=false;`. The guarded-lookup idiom does exist: inside setRunning at :424 (`if(sendBtn){...}`), and again at :494 and :496 (`if(sendBtn)sendBtn.addEventListener(...)`), plus `if(pm)` at :450 as cited. So the shape the LLD's missing-element error case says the lock mutator will follow is genuinely established in this file. | No artifact change — the LLD cites none of these lines. Correcting the record here: the guard idiom lives at :424, :494, :496 and :450. |
| 2.1 | ordering | LOW | auto | The shell is rendered ONCE per webview open — renderShell is invoked from the panel host's open path, not re-invoked per session change — which is the lifecycle premise that rules out alternative a3 and forces the lock to be webview-local runtime state. | CONFIRMED. chat-panel.ts:247 is `const renderShell = (): string => {`. The LLD's lifecycle premise — the shell is built once per open, so nothing session-dependent can be baked into its HTML — is grounded, and it is the premise that eliminates alternative a3 and forces a runtime lock. | None. The decisive design constraint is verified. |
| 7 | inventory | LOW | manual | The provider select and the session dropdown are the two controls this Story touches, and there is exactly ONE element with id insrc-provider and ONE with id insrc-history in the rendered shell — so the lock and the width change each have a single target. | STALE ANCHOR IN MY CLAIM, premise confirmed. I anchored the session dropdown at :515; :515 is now `` `<div class="box">` + `` because this file gained comment lines earlier today. The select is actually at :522. Re-derived directly: exactly ONE `id="insrc-history"` and exactly ONE `id="insrc-provider"` exist in the shell, so each of the Story's two changes has a single unambiguous target as the LLD assumes. | No artifact change — the LLD never cites the history select's line number, so no citation in it is affected. Noting the correct line (:522) for anyone working from this review. |
