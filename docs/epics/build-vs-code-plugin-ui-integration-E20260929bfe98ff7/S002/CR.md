<!-- insrc:artifact CR-bfe98ff7f97178cf-s2 -->

# Code review: bfe98ff7f97178cf:s2

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 11 · model `client`

**Changed files:** 3

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:255 | The LLD's chosen alternative a1 is implemented as designed. The record-built container replaces the generated bullet list beneath the document's own heading; the heading, its text and its stamped slug survive; the daemon's markdown is never altered. The three placement outcomes match the contract exactly, the absent gate precedes any createElement, and the build-before-mutate ordering is real rather than claimed — a construction throw leaves the body byte-for-byte the tree it was, proved by forcing one. Confirmed visually in all three states through the real shell, not just by a green suite. |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:216 | ONE DELIBERATE DIVERGENCE from the prose renderer, documented at the source and in the commit so a later reader does not mistake it for a bug: renderFunctionalRequirementsSection drops an entry whose `scope` is neither 'doc' nor 'item', while this renderer treats anything not 'item' as doc-level. The effect is to SHOW a commitment the prose form would hide, which is the right direction on a surface whose purpose is the approval gate — the same reasoning that keeps duplicate FrIds visible instead of collapsing them. |

## conventions — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:198 | The new webview functions (`frItem`, `frOk`, `frRequirementsOf`, `frAnchorSlug`, `frIsHeading`, `frHeadingIn`) and constants (`FR_HEADING`, `FR_PLACEMENT_NOTICE`) all land in the ONE shared script scope, because the source strings are concatenated into a single nonce'd script. That matches the existing convention exactly — guardMd, renderMarkdownBody, stampSlugs and jumpToSection are global the same way — and the `fr` prefix keeps them clearly separated. Recorded because s3 and s4 will add a fourth and fifth source string to this same scope, and the prefix discipline is what will keep that safe. |
| LOW | vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:1118 | The indexed-type convention is enforced by test, not just followed: protocol.ts types the new field as `DocsContent['functionalDefinition']` and the contract test rejects both an inline restated shape and a direct FunctionalDefinition import. One consequence worth recording for s3/s4, which will do the same for erDefinition and uxDefinition: protocol.ts now imports from docs-review-client.ts, which imports back from protocol.ts — a type-only cycle. It is erased at compile (`import type`, verbatimModuleSyntax), so there is no runtime cycle, protocol.ts stays type-only/vscode-free as its header claims, and tsc --noEmit is clean. |

## coverage — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:1899 | FIXED during this review. Two LLD edge cases had no test, and I had flagged both at the plan audit (cov1 graded `partial`) saying they should be folded into t2 when it was built — then did not fold them in. Both now land: ac3's cross-document guarantee (the same record rendered twice yields identical identifiers, asserted against this Epic's REAL record with both id forms, plus the purity that makes it hold and a negative control proving the equality is not trivially true), and the very-large-record case (500 requirements, every one rendered, no identifier dropped or collapsed). Mutations confirm both: re-minting ids turns 13 tests red, truncating to 50 turns 5 red. |
| LOW | vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:1690 | Recorded rather than left for a reader to trip over: the MIDDLE level of the notice-precedence chain (the body renderer's degradation, ahead of placement's) is UNREACHABLE given t4's invariant, because placement returns a degradation only when the body rendered fine. Removing that branch is a benign mutation no test catches. This was found by RUNNING the mutation rather than assumed; the explicit three-level form was kept because it is the literal encoding of the LLD's rule and stays correct if the invariant is relaxed, and the invariant itself is pinned by t4's no-stacked-notice check. |
| LOW | vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts:1033 | Coverage is proved by falsification, not by count. All seven of the LLD's named mutations were re-run against the finished code and each still turns tests red (4/12/6/6/14/4/6 failures respectively), plus four more added during this review. Every mutation was run at the task that owns it AND re-swept at t7 — the re-scoping the plan critique required, because a falsifier first run at the end means the earlier tasks closed on tests whose ability to fail was unverified. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:206 | FIXED during this review. The rule that defines 'absent' — the most load-bearing predicate in this Story, since absence is what 630 of 634 ledger artifacts take — was written out TWICE, once in the renderer and once in the placement gate. They agreed, and the t4 mutation caught deleting one; but a future change to either would have diverged silently and nothing would have caught THAT. Now one `frRequirementsOf(record)` shared by both, the same single-sourcing discipline this Story applied to section identity. A mutation weakening the shared guard turns 5 tests red — one place to get it wrong instead of two that can drift apart. |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:238 | An orphan per-item requirement renders the literal sentinel `(unassigned)` as its group label, visible to the reviewer with no explanation. This is DELIBERATE agreement with the prose renderer (functional-definition.ts:99) so the two renderings of one record cannot disagree about where an orphan belongs, and it is reachable only on a record that bypassed assembly-time validation — so the label appearing at all is itself a signal of a producer-side defect. Left as-is on purpose: changing it unilaterally would break the agreement the LLD chose. Worth revisiting only if the prose renderer changes too. |

## diagram — 0 finding(s)

_No findings._

## ux — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:199 | FIXED during this review, and it was the most consequential finding of the Story. The items were `div`s and `span`s with no list role, while the prose form they replace is a markdown `<ul>` — so assistive technology announced 'list, N items' before this change and nothing after it. The structured form would have looked better and NAVIGATED WORSE than the prose it replaced, on a Story whose user value names a non-technical reviewer explicitly and whose Epic FR001 is precisely about seeing commitments as discrete items. Now `ul`/`li`, with each per-story group an `li` carrying a label and a NESTED list, so the structure a screen reader reports matches the structure the record carries. Reverting to divs turns 5 tests red. The nested list reads better visually too — the re-shot in-section screenshot shows the s2 group indenting its own requirement. |
| LOW | vscode-plugin/src/chat/docs-review-panel.ts:287 | A known, visible state rather than a surprise: the prepended fallback shows the requirements TWICE — once in the constructed block and once in the untouched body prose — because the fallback cannot remove a section it could not locate. The notice explains why the block is where it is, but does not say the content below is the same commitments. Accepted as the honest cost of a safe no-match; the alternative is removing document content on a guess, which is the one thing this surface must not do. It fires only when a format override has renamed the heading or the body degraded, and it is captured in the committed t7-state-prepended.png so the state is on the record. |

