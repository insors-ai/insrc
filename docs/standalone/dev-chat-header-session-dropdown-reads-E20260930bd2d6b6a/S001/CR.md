<!-- insrc:artifact CR-bd2d6b6a98f48dc6-S001 -->

# Code review: bd2d6b6a98f48dc6:S001

⚠️ **WARN** — HIGH 0 · MED 1 · LOW 4 · model `client`

**Changed files:** 4

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:334 | The shipped rule carries two changes the approved ISSUE's fixIntent does not enumerate: the label cap widens from max-width:16ch to 18ch, and the glyph stroke moves from --muted #6b7688 to the label tone #c6cdd8. Both were present in the chip option the user selected from the rendered comparisons, so they are approved in substance — the user chose a picture, and this is that picture. But the written intent describes only 'a subtle border, a faint fill and a small corner radius ... with the icon repositioned', and explicitly frames tone-lifting as the thing the chip was chosen INSTEAD of ('rather than relying only on tightening the gap and lifting the icon's tone'). Recording the gap so the artifact is not read later as authorising less than what shipped. |

## conventions — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:336 | The glyph's stroke color remains a hardcoded hex inside the data-URI (now #c6cdd8, previously #6b7688), because a CSS custom property cannot cross into a data: URI. This is the same maintenance coupling the earlier review of the original glyph raised, relocated rather than removed: the icon must now be hand-updated if --fg changes, where before it tracked --muted. The adjacent comment documents the chip's intent but no longer states the token the hex mirrors, which is what made the previous coupling discoverable. The new chip fill rgba(255,255,255,.045) is likewise a raw literal rather than a palette token, though no existing token expresses it. |

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:334 | Pass-state is locally verified, not gate-attested, and the changed behaviour is genuinely exercised. Locally: `npx tsc --noEmit` clean and `npx tsx --test 'src/**/__tests__/*.test.ts'` in vscode-plugin at 612 tests / 608 pass / 0 fail / 4 skipped. Mutation check: moving the icon back to its pre-fix bare-edge position (left 6px -> left 2px) fails the updated glyph test with 'the icon clears the chip border (was left 2px)', proving the assertions reach the changed declaration rather than restating it. The rendering was additionally verified by eye — the real shell HTML was rendered in headless Chrome with a realistic session label and matched the treatment the user selected — which is the check whose absence let the original glyph ship unrenderable. |
| LOW | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1372 | Graph grounding is hollow again: all four changed entries carry testsReaching: [] and empty caller edges. Two of those four are not code at all — .insrc/artifacts/BUILD-095906bac5bbacaf-S001.json and docs/standalone/dev-chat-session-dropdown-history-clock-E20260930095906ba/S001/BUILD.md are the PREVIOUS story's ledger records, which entered this diff only because approving that story stamped approvedAt into them. They are not part of this Story's change and carry no reviewable behaviour. Coverage was therefore judged by execution, mutation and visual inspection, not by the empty edge set. |

## quality — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/__tests__/chat-panel.test.ts:1384 | The test reads as if it derives its bound from the declared padding, but does not. It captures the padding via /padding:[^;]*?(\d+)px;/ into padLeft, asserts only that the capture is non-null, and then checks the icon fits using a hardcoded literal: Number(iconLeft[1]) + 12 <= 22. padLeft is never used in that comparison. If the chip's left padding is later changed to, say, 18px, the icon-fits assertion keeps measuring against 22 and silently stops testing the real relationship — an assertion that looks computed but is constant is worse than an openly literal one, because a reader trusts it to track the rule. The separate exact-match on /padding:3px 16px 3px 22px/ would catch that particular edit, but the derived check is still misleading and should either use padLeft or be dropped. |

