# S001 companion-HTML mocks — the enriched, self-contained layout

Visual spec for the enriched companion HTML produced by this Story's LLD. Each mock shows the
**new context band** (top, `#4051b5` accent — matching the docgen shell's narrative band) above the
existing diagram. The band carries, for every companion kind:

1. **Purpose** — what the diagram is for, in reader terms.
2. **Source-document link** — the `narrated.sourceLink` back-reference to the mapped `.md`
   (`./HLD.md` / `./LLD.md`), rendered as an escaped `<a>`.
3. **Fields / schema explanations** — per-element, drawn read-only from the same definition parse.
4. **Legend** — the symbol/element key for that diagram kind.

| Mock | Kind (`docType`) | Mapper it specs |
| --- | --- | --- |
| [er-model.html](er-model.html) | `er` | `erDefinitionToIr` |
| [ux-mock.html](ux-mock.html) | `ux` | `uxDefinitionToIr` |
| [sequence.html](sequence.html) | `sequence` | `sequenceDefinitionToIr` |
| [component.html](component.html) | `component` | `componentDependencyDefinitionToIr` |

Notes:
- The diagrams load mermaid from a CDN **only in these mocks**; the shipped companions inline
  mermaid + svg-pan-zoom (fully offline) — the mocks are for reviewing the **band layout**, which
  renders offline here regardless.
- Sample content is illustrative. In the build, the band content is derived per definition; a plain
  docgen document with no sections and no `sourceLink` renders byte-identically to today.
