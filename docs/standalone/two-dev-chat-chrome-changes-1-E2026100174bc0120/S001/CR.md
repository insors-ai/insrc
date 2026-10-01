<!-- insrc:artifact CR-74bc0120660d539a-S001 -->

# Code review: 74bc0120660d539a:S001

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 8 · model `client`

**Changed files:** 2

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:493 | The LLD specified the history-list transition as re-settling the lock 'for the active session' but did not say from WHAT, because it had also established that ChatSummary carries no transcript or row count. The implementation resolves that by deriving context from PRESENCE in the persisted history: `if(_ac)setProvLock(true)`. This is sound and rests on a store property the LLD itself cited — session-store's draft() 'enters the store (index + history) only on the first save (i.e. once it has a message)' — so appearing in the list IS proof of context. Recorded because the derivation was chosen at build time rather than specified at design time; the LLD's text left it open. |

## conventions — 0 finding(s)

_No findings._

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:431 | Pass-state is locally verified, not gate-attested, and every changed behaviour is exercised. Locally: `npx tsc --noEmit` clean and the full plugin sweep at 619 tests / 615 pass / 0 fail / 4 skipped (up from 615/611 — four new tests). SIX independent mutation checks were run, one per shipped change, and each turned a test red: reverting the 36ch cap; flipping `provLocked` to start open; dropping the `provGate\|\|` term from the sole writer; removing the session-restored transition; removing the history-list transition; and removing the doSubmit relock. That is the strongest evidence this harness allows for a runtime lock it cannot execute. The daemon validate gate returned passed:false solely because its sandbox refuses every executing command (tsx, npm, tsc, node), while confirming the contract by inspection with scopeRespected:true. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1104 | Graph grounding is hollow again: both changed files are whole-file diff entities with testsReaching: []. The behaviour under review lives inside the string returned by renderShell and is eval'd by the harness, so it is not symbol-indexed and no test edge can exist for it. Treating the empty set as a coverage gap would manufacture a finding against the file that contains the new assertions. Coverage was judged by execution, by the six mutation checks, and by a headless render. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1118 | One LLD test subject is asserted more weakly than written. The strategy asked that `history-list` settles the lock 'with the existing provider re-sync still present and unaltered'; the suite asserts both facts separately (the `if(_ac)setProvLock(true)` call, and that `if(_ac&&_ac.provider){ps.value=_ac.provider;}` survives) but cannot assert their ORDER or that they execute in the same branch, because the harness never runs the handler. The doSubmit ordering requirement IS asserted positionally (guard index < lock index) since both sit in one window of emitted source. Noted so the asymmetry is visible rather than assumed. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:431 | `provGate` is captured once at startup from the element's rendered disabled state rather than from a second copy of `providers.available`, which is what makes the capability gate structurally safe: the sole writer ORs it in, so no present or future lock transition can enable a control the gate closed. The trade-off worth naming is that this reads the DOM as the source of truth for a server-rendered decision — if the shell ever stopped rendering the attribute and moved the gate elsewhere, `provGate` would silently become false. Pinned by the existing unmodified no-CLI test plus the new single-writer assertion, so it would not pass unnoticed. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1130 | The doSubmit assertion windows the emitted source by a fixed 260-character slice rather than by brace matching. Deliberate and documented in the test — the body contains braces inside its postMessage literal, so a brace regex truncates before the tail, which is exactly how the first version of this test failed. The window is ~70 characters longer than the function, so it cannot bleed into a neighbouring statement containing `setProvLock`. Taste-level fragility: an edit growing doSubmit past 260 characters makes the test fail loudly rather than silently — the right failure direction. |

## diagram — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:493 | The LLD's sequence companion drifted from what shipped on one message. It renders the history-list step as 're-sync value + re-settle lock for active session' without naming the derivation, because at authoring time the LLD had not chosen one — the code now derives context from PRESENCE in the persisted history (`if(_ac)setProvLock(true)`), which is a substantive fact the diagram does not convey. The other eight messages are accurate: the session-restored derivation from the replayed transcript, the submit-then-relock ordering, and the change path still posting new-chat all match the implementation. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:431 | Scope note rather than a defect: the companion diagrams only the happy-path transitions and deliberately omits the capability gate and the three error cases (no session message, rejected submit, missing element). For a four-participant control-state flow that is the right altitude — adding the gate as a participant would obscure the three transitions the diagram exists to show — and the omitted paths are covered in prose in the LLD's error-paths section. Recorded so a reader does not take the diagram as the complete behaviour. |

