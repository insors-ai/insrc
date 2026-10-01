# S003 / t7 — full-surface visual verification

Seven states rendered through the REAL emitted shell (the bootstrap lifted from
`renderShell`, not a reconstruction), screenshotted headless at 2x, and READ back
as images. Every DOM stub in the suite is CSS-blind and geometry-blind, so none of
what follows is observable by an assertion.

| Evidence | State | Verdict |
| --- | --- | --- |
| `t7-state-er-3class.png` | real 3-class `erDefinition` | boxes disjoint, both edges connect the boxes they name, rows inside their borders |
| `t7-state-er-8class.png` | real 8-class `erDefinition` — the densest the ledger holds | 8 boxes, no overlap, no clipped row |
| `t7-state-sequence.png` | real `sequenceDefinition` (7 participants, 10 messages) | declared order, numbered 1-10, returns dashed, notes legible |
| `t7-state-unshowable.png` | diagram ref, no projected record | NAMED reason, link-out reachable, body fully readable |
| `t7-state-absent.png` | neither ref nor record | nothing drawn, no frame, NO reserved space |
| `t7-state-cyclic-selfref.png` | 3-cycle + self-reference | terminates and draws |
| `t7-state-dual-ref.png` | diagram ref AND ux-mock ref | diagram slot only |

## The dual-ref result is exact, not approximate

`t7-state-dual-ref.png` and `t7-state-er-3class.png` are **sha256-identical**
(`168a2bd172f5…`) while their posted payloads genuinely differ — one carries the
ux-mock ref, the other does not. Adding a ux-mock companion therefore changes the
rendered surface by **zero pixels**, so S003 does not pre-empt how S004 arranges a
diagram and an experience mock when a document carries both.

## Two KNOWN LIMITATIONS, recorded rather than left to be discovered

1. **A cycle among same-row boxes draws collinear edges.** In
   `t7-state-cyclic-selfref.png` the `C → A` edge overlays the `A → B → C` run,
   because all three boxes share a grid row and the connectors are straight lines
   between box borders. The relationship is NOT lost — each box's own rows state
   it (`A: toB → B`, `B: toC → C`, `C: toA → A`) — but the line count is not
   readable from the canvas alone.
2. **A self-reference draws as a small bracket off the box's right edge.** Visible
   and attached, but it reads as a loop only once you know to look for one.

Both are consequences of deterministic straight-line routing. Fixing either needs
real edge routing, which is a layout engine — the cost on which alternative a3 was
rejected (~3 MB against a 241,713-byte extension). Neither hides content, so
neither is worth that price here. If a future record makes this genuinely
unreadable, alternative a4's structured view is the recorded degradation.
