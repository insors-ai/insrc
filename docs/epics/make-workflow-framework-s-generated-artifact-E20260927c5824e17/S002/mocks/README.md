# S002 mock templates

Illustrative mock **format templates** for each generated document type, added as
design collateral for Story **S002** (make each document human-readable and
audience-aware, without repeated content). They make the LLD's abstract
`DocumentFormat` / `SectionSpec` / `ItemFormat` model concrete so a reviewer can
see the *shape* of every rendered document before it is built.

These mocks are **not** the shipped assets. At build time (S002 plan → build) the
real bundled templates land at `src/assets/artifacts/templates/<kind>.md` and are
resolved through the existing `loadTemplate` 3-tier cascade
(`<repo>/.insrc/artifacts/templates/<kind>` → `~/.insrc/artifacts/templates/<kind>`
→ bundled). These mocks are the reference the build renders against.

## How to read a mock

Each file interleaves three things:

| Marker | Meaning |
| :--- | :--- |
| `## Heading` | a `SectionSpec.heading` — rendered in the declared order |
| `<!-- @spec id=… source=… audience=… required=… -->` | the `SectionSpec` metadata (what the engine knows about the section) |
| `<!-- guidance: … -->` | `SectionSpec.contentGuidance` — what belongs in the section, at what altitude/audience |
| `{{ binding }}` | a body value the per-type renderer supplies from the structured artifact body |
| `{{# each item }} … {{/ each }}` | an `ItemFormat` — the repeatable per-story / per-task sub-template |
| `> See **DOC-id** § Heading` | a `SharedContextRef` reference line (the de-dup; never copied prose) |

`source` values: `body` (rendered from a binding), `shared-ref` (a reference line),
`fr` (S001's `renderFunctionalRequirementsSection`, consumed unchanged),
`extension` (a **named** slot S003/S004 fill later — declared here, not built).

## The four mocks

- [`define.mock.md`](define.mock.md) — DEF (Epic) format, business/product-first Summary
- [`hld.mock.md`](hld.mock.md) — HLD format, DEF referenced (not copied)
- [`lld.mock.md`](lld.mock.md) — LLD format, HLD context as a **reference line** (fixes defect #13)
- [`plan.mock.md`](plan.mock.md) — PLAN format, per-task sub-template

The envelope (short distinct H1, Summary/abstract, generated Contents/TOC,
consolidated References) is shared by all four via `renderFromFormat`; each mock
shows it filled for that type.

## Refinement applied after review (audience reach)

**Every document leads with a plain-language Summary, contextualized to the item
that document is about** — Epic-level for DEF/HLD, Story-level for LLD/PLAN. A
product/business reviewer opening *any* artifact must grasp *what this specific
piece delivers*, in outcome terms, from the Summary alone, before the technical
detail. This sharpens `sc3`'s Summary `SectionSpec.contentGuidance` and its
`audience` (now `product|technical` on HLD/LLD/PLAN, `business|product` on DEF) —
it adds no section and changes no contract. The build renders against these mocks,
so the Summary guidance here is authoritative for the format.

Intent: **clarity, not ceremony.** No conformance badges or heavyweight-standard
scaffolding — the audience-facing Summary + de-duplication are the load-bearing
readability features, because the audience reviews are the critical path.

## Section & nested numbering (engine-generated)

Markdown has **no native decimal section numbering** (ordered lists renumber, but
`1.1 / 6.2` outline numbers and numbered headings are not in CommonMark/GFM, and
GitHub will not add them). So `renderFromFormat` **emits the numbers as literal
text** — portable to GitHub, the IDE review panels, and any plain reader.

Scheme:

- **Envelope stays unnumbered.** The H1 title, the **Summary** (pre-TOC abstract),
  and **Contents** are not numbered — an abstract and its index aren't sections.
- **Body sections are numbered `1..N`** in the format's declared order (the first
  real section is `1`). `sectionSlug` still derives the anchor; the visible heading
  becomes `## 1. Problem`, `## 2. …`.
- **Per-item sub-templates get parent-relative nested numbers.** A numbered section
  driven by an `ItemFormat` numbers each item `N.M`: e.g. section `6. Stories` →
  `### 6.1 S001 — …`, `### 6.2 S002 — …`; `3. Contract details` → `3.1`, `3.2` per
  API function. The scheme is recursive (`N.M.K` where a sub-item is itself a
  heading), but **leaf lists stay bullets by choice** (acceptance criteria,
  parameters) — numbering aids navigation, it isn't applied for its own sake.
- **The Contents/TOC mirrors the numbers** and links to the numbered anchors.

Design impact: this extends `sc3`/`renderFromFormat` with a deterministic ordinal
pass over the ordered `SectionSpec[]` + `ItemFormat` items — no new section and no
contract change; the numbers are computed at render, never authored into the body.
