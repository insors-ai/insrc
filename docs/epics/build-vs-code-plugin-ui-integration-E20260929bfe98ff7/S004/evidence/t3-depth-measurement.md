# S004/t3 — the depth measurement

Written down because t4 must cite evidence that exists rather than my recollection
of an image. Every number here was read off a render, and the render that produced
them is committed beside this file as `t3-depth-measured.png` — the measurements
are drawn INTO that screenshot, so the number and the thing it describes are the
same artefact.

## The metric

**ELEMENT NESTING** — what the renderer's recursive walk counts, and therefore what
the depth bound guards. Stated explicitly because the plan review found this
ambiguous: "depth" could equally mean rendered DOM depth, and the two differ.

## What the real records actually are

| record | element depth |
| :--- | ---: |
| `HLD-bfe98ff7f97178cf` (this Epic) | 2 |
| `LLD-bfe98ff7f97178cf-s2` (this Epic) | 4 |
| `LLD-85e6a58693579b6d-S001` | 3 |
| `LLD-7c219c7471d79496-S001` | 4 |

**Measured real maximum: element depth 4.**

The LLD and its resolved open question both say "the four real records reach depth
9". They do not, under any metric the renderer uses. Rendered DOM depth inside the
slot is 7 at most (per record 7, 6, 6, 4); 9 appears only when the daemon
standalone document's own `<html>`/`<body>`/`.ux-wrap` chrome is counted, and the
webview slot has none of that chrome. This is what the plan review raised as its
HIGH finding, and this file is the re-measurement it asked for.

## What nesting costs, at a narrow pane width

Measured in a **380px** pane (narrower than any real VS Code docs pane, chosen as
the hard case). Card inner width: **362px**.

| container depth | inner width |
| ---: | ---: |
| 4 | 336px |
| 7 | 314px |
| 10 | 292px |
| 13 | 270px |
| 16 | 248px |
| 19 | 226px |
| 22 | 204px |

**Cost per Container level: exactly 22px** — `1px border x 2 + 10px padding x 2`,
which matches the CSS arithmetic, so the measurement and the stylesheet agree.
`.ux-column` adds no horizontal cost of its own; a `.ux-columnset` adds a 12px gap
between siblings rather than per level of depth.

## What that means for the bound

- A worst-case all-`Container` nesting exhausts the readable width of a 380px pane
  at roughly **362 / 22 = 16 levels**. Past that there is no content width left.
- A synthetic card at **depth 9** renders legibly at 380px (deepest container
  270px).
- A synthetic card at **depth 14** also renders legibly (deepest container 204px).
  Layout degrades gradually and never clips, overlaps, or breaks out of the pane.

So the renderer does not fail at depth; it simply runs out of width, and it does so
gracefully. A depth bound is therefore a guard against malformed, cyclic or hostile
structure — NOT a presentation rule. That is the distinction alternative a4 was
rejected for blurring, and these numbers are what keep the chosen value on the
right side of it.

## Defect found and fixed here

The visual read found one, which no DOM assertion could have: an `Action.OpenUrl`
chip rendered `Open the source documenthttps://example.invalid/doc`. The title and
the url were two adjacent text nodes, and adjacent text nodes merge into ONE
anonymous flex item — so the chip's `gap` never applied between them. The url is
now its own `span.ux-btn__url`, dimmed and lighter so the chip still reads
title-first. `t3-url-defect-fixed.png` is the corrected render.

Catching it here cost one task. Had it waited for t7 it would have cost the mount
as well.

## Both themes

`t3-isolated-dark.png` and `t3-isolated-light.png` are the same four records in a
dark and a light theme. Both read correctly — nothing invisible, nothing
low-contrast. This is what the no-literal-colour rule bought: the light theme
needed no separate work because every colour resolves through `--it-*`.
