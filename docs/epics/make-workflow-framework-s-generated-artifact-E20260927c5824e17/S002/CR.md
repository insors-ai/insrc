<!-- insrc:artifact CR-c5824e17eccf0c14-s2 -->

# Code review: c5824e17eccf0c14:s2

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 4 · model `client`

**Changed files:** 14

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/artifacts/format/template-loader.ts:92 | The LLD's contract names reuse of the docgen loadTemplate (daemon/artifacts/template-loader.ts:156) and an async renderer. The build instead adds a PARALLEL, SYNChronous loadDocumentFormat: the docgen loader is keyed on the docgen ArtifactKind enum, resolves .html, and runs an HTML lint — none of which fit the workflow markdown FORMATS; and a sync loader keeps all 15 render call sites sync (no async ripple, which the LLD's own error.path flagged). Same 3-tier cascade + mtime cache + degrade-to-bundled semantics; honors a2's intent (editable per-repo/user-overridable per-type template files). A justified LLD refinement, documented in the module header. |
| LOW | src/workflow/artifacts/format/template-loader.ts:118 | The promised test names 'missing/corrupt template throws'. The build realizes this as: a corrupt/malformed OVERRIDE (repo/user tier) degrades to the next tier with a warn (mirroring the docgen loader's degrade-to-bundled — never a silent no-render), and only a TOTAL miss (no tier resolves) throws. This is a deliberate, safer semantics than throwing on any corrupt file; parseFormatTemplate itself throws on malformed input (tested), and the loader's total-miss throw exists. Behaviour differs from the literal promise but is the more robust realization. |

## conventions — 0 finding(s)

_No findings._

## coverage — 0 finding(s)

_No findings._

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/artifacts/format/template-loader.ts:98 | The 3-tier cascade + mtime-cache + tryRead structure duplicates the docgen HTML loader (loadTemplate). This is a deliberate parallel across two distinct domains (workflow doc FORMATS vs docgen HTML templates; different kind set, extension, and lint), not accidental copy-paste — a shared generic cascade helper would DRY it but would couple the two domains. Flagging the overlap so a future refactor can consider extracting a kind-agnostic cascade. |
| LOW | src/workflow/artifacts/format/template.ts:126 | parseFormatTemplate is a hand-rolled line walker. Its guidance-capture loop reads every line until the next `<!-- insrc:… -->` directive, so a guidance PROSE line that itself began with an insrc directive comment would be mis-detected as a section boundary. Guidance is author prose (extremely unlikely to embed a directive), the round-trip test guards the generated files, and a malformed parse degrades to bundled — so this is a low-risk taste/robustness note, not a correctness breach. |

