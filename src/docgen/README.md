# docgen — self-contained HTML docs from the code graph

Epic `870ed3dd` (`documentation-generation-framework-docgen-produces-self`).
Story **s1** (walking skeleton) is implemented here; s2–s7 build on the four
shared contracts this Story owns.

## Contracts (owned by s1 — `types.ts`)

- **`DocumentIR`** — provenance is **structural, not a flag**: content is split
  into `derived: { nodes, edges }` (graph-read only) and `narrated: { sections }`
  (LLM prose). It is a *type error* to put narrated content in diagram
  structure, so k8 (diagrams graph-derived) is checker-enforced.
- **`DocGenOutcome<T>`** (`outcome.ts`) — the one result/failure envelope:
  `ok | empty-scope | not-found | truncated | fallback-unavailable |
  source-not-ready`. Handle variants only through `map` / `flatMap`; non-ok
  short-circuits with its payload untouched.
- **`RenderedDocumentShell`** — the single offline HTML shape (`backend`,
  `html`, `inlinedRuntimeVersion`, `diagramFormat:'svg'`, `supportsZoomPan`).
  Extends `loadMermaidCdnMeta` + `RenderedArtifactHtml` in place.
- **`DocTypeRegistration` / `DocTypeRegistry`** — one registration per doc type
  with a **bound `extract()`**; every surface (tool / IPC / MCP) enumerates the
  same registry, so capability listings cannot drift (k4).

## BACK-FLOW NOTE to s2–s7 (t10) — breaking shape changes vs the HLD sketch

s1 refined two published shapes; downstream stories consume the **final** ones:

1. **`DocumentIR` is partitioned**, not flat-with-a-`provenance`-flag. Your
   extractor emits `{ derived: { nodes, edges }, narrated: { sections } }` —
   there is no per-item `provenance` field. (s4's narrative annotator attaches
   `IrSection`s under `narrated`; s2/s3 emit `derived` only.)
2. **`DocGenOutcome` is generic and its `ok` arm carries `value`, not `shell`.**
   The extractor returns `DocGenOutcome<DocumentIR>`; the boundary returns
   `DocGenOutcome<RenderedDocumentShell>`.

## Design finding — composition edges (affects s1/ac1 + s2)

The code graph carries `INHERITS` / `IMPLEMENTS` but **no composition /
field-type relation** (`RelationKind` = DEFINES | IMPORTS | CALLS | INHERITS |
IMPLEMENTS | DEPENDS_ON | EXPORTS | REFERENCES). The type-structure extractor
therefore emits inheritance/implementation faithfully; ac1's "composition"
needs a graph-model addition (a field→type edge, e.g. via DEFINES + field-type
resolution) and is a tracked follow-up, **not fabricated**.

## Surfaces

- Daemon tool: `docgen_generate` (`tool.ts`), input `{ docType, repo, path? }`.
- IPC: `docgen.generate` / `docgen.list` (`daemon/index.ts`).
- MCP output schema: `schema.ts` (hand-mirrored `DocGenOutcome<T>`; full MCP
  tool registration is s6 surface-parity work).

## Offline runtime

`assets/docgen/{mermaid.min.js, svg-pan-zoom.min.js, runtime.json}` are vendored
and shipped by `copy-assets.mjs`; the shell inlines them so a generated document
renders with **no view-time network access**.
