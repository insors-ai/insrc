# S004/t7 — full-surface visual verification

The whole-surface pass, CONFIRMING rather than discovering: t3 already read the
renderer in isolation and fixed the one layout defect it found. Every image here
was produced by driving the REAL emitted shell — the real bootstrap, the real
vendored markdown renderer, the real CSP — in headless Chrome, delivering a real
`docs-content` message. Nothing is a reconstruction.

The CSP is genuine and unmodified: the `acquireVsCodeApi` stub and the message
delivery both ride the SAME nonce, because a nonce-less shim is blocked. That is
the surface working as designed, and it was worth confirming rather than
working around.

## What each image shows

| file | state | read |
| :--- | :--- | :--- |
| `t7-state-real-hld.png` | this Epic's HLD record, mounted | renders as an interface |
| `t7-state-real-s002-lld.png` | this Epic's S002 LLD record | renders as an interface |
| `t7-state-real-uxfix-lld.png` | the ux-mock-fix LLD record | renders as an interface |
| `t7-state-real-fidelity-lld.png` | the terminal-fidelity LLD record | renders as an interface |
| `t7-state-dual-slot-dark.png` | BOTH refs, dark | two labelled peers |
| `t7-state-dual-slot-light.png` | BOTH refs, light | same, legible |
| `t7-state-unshowable-dark.png` | ref, no record, dark | reason + link-out |
| `t7-state-unshowable-light.png` | ref, no record, light | same, legible |
| `t7-state-real-record-light.png` | a real record, light | legible |
| `t7-state-absent.png` | neither ref nor record | NOTHING drawn |
| `t7-state-deep-narrow.png` | synthetic depth 9 at 400px | legible, bound did not fire |
| `t7-control-absent-at-400px.png` | the CONTROL for the clipping finding below | |

## The dual-slot arrangement (ac2)

Diagram FIRST, experience SECOND, as labelled peers in one companions region.
Each is labelled from its OWN ref — "Entity model" and "Experience mock" — and
each carries its own link-out to its own companion. Neither borrows the other's
label or path, which is what the picker partition buys and what ac2 is actually
about: a reviewer must be able to tell at a glance which is which.

The card itself reads as an interface and not as a list: a heading, two columns
genuinely side by side, an image placeholder showing its url, a bordered container
grouping its children, a labelled input field, a choice set, and two chips that are
tellable apart — a filled "Approve" that commits and an outlined "Open the source
document … ↗" that navigates, with its url dimmed beside the title.

## The absent state (ac3)

NOTHING is drawn. No frame, no heading, no reserved space — the document body
begins immediately. This is the dominant path: 4 of 645 ledger bodies carry a
uxDefinition at all.

## The unshowable state (ac4)

"This experience mock could not be shown here — its experience record is not
available to this surface", with "Full version: …/ux-mock.html" beneath it. Note
the NOUN: the frame says *experience mock*, not *diagram*. One frame serves both
peers, and reusing it without making the noun kind-aware would have told a
reviewer the wrong thing.

## Both themes

The light theme needed no separate work. Every colour resolves through an `--it-*`
token, so the surface simply inverts: white ground, dark text, blue accent, the
filled chip white-on-blue, the dimmed url still legible, every border visible. Had
the daemon's own palette been copied — `#6b7684`, a white card, a `#1f6feb` button
— the light theme would have needed its own pass and the dark one would have been
unreadable. That is what the critique's no-literal-colour rule bought.

One correction worth recording: the first light-theme attempt did not take. The
override was written as `:root{…}` while the shell defines its tokens on
`.insrc-term`. Custom properties inherit from the NEAREST defining ancestor, so a
`:root` override never reaches content inside `.insrc-term` regardless of source
order. The screenshot looked identical to the dark one, which is exactly how a
theme check can silently pass while testing nothing.

## Depth at a narrow pane

A SYNTHETIC depth-9 card (labelled synthetic — no real record reaches element
depth 9; the measured real maximum is 4) renders legibly at 400px. The nesting is
readable level by level and the depth bound did NOT fire, which is the outcome t4
chose 24 for.

## A clipping observation that is NOT this Story's

At 400px the surface clips horizontally — the document body text is cut at the
right edge. The control image `t7-control-absent-at-400px.png` shows the ABSENT
state, which contains no S004 content whatsoever, clipping identically. So the
clipping is a pre-existing property of the shell at that width and not something
the experience slot introduced. It is recorded rather than fixed because fixing it
means changing the shared surface, which is outside this Story. At 620px — closer
to the real docs-review pane, which is an editor panel rather than a narrow
sidebar — everything fits, as the dual-slot images show.
