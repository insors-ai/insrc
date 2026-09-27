# Workflow artifact document template review

Inspected 27 September 2026. Backend: `/Users/subhagho/work/projects/insors/insrc`, HEAD `3dfd0112f424680ba5318bf8b8ddd91181f93540`, package `@insrc/backend` 0.2.1. Scope: the markdown documents the workflow chain writes under `docs/epics/` and `docs/standalone/` — DEF (Epic), HLD, LLD, PLAN, BUILD, CR, ISSUE, SPEC, EXT, TRACKER, STUB.

**Recommendation:** the generated documents are functional ledger entries, not presentable design documents. Fix it in three separable pieces, in this order: **(A)** a shared document envelope (frontmatter, status/metadata header, TOC, chain navigation, one badge vocabulary, revision log) applied to all eleven renderers; **(B)** externalize the per-type section skeletons into overridable template files on the existing three-tier cascade; **(C)** graph-derived diagrams for the structural sections, plus an optional offline HTML render of a whole work-item folder. Piece A is mechanical, needs no LLM involvement, and delivers most of the perceived quality gain.

This is a source inspection of the renderers plus the documents they have already produced in this working tree. No files were changed, no builds or tests were run.

## 1. Current state — there is no template layer

Every artifact type has a hand-rolled renderer that pushes literal heading strings onto a `lines[]` array and joins them. There is no template engine, no shared skeleton, and no declared section schema.

| Artifact | Renderer | Sections emitted |
|---|---|---|
| DEF (Epic) | [`renderDefineMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/define.ts:86) | Problem, Non-goals, Assumptions, Constraints (table), Stories (`### <sid> — title` + AC bullets), Open questions |
| HLD | [`renderHldMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/hld.ts:105) | Framework summary, Architecture shape, Shared contracts, Story boundaries, Non-functional targets, Rollout (+ Risky bits table), Alternatives considered, Open questions |
| LLD | [`renderLldMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/lld.ts:282) | HLD context, Contract details, Data model changes, Interaction with shared contracts, Error paths, Test strategy, Migration, Alternatives considered, Open questions |
| PLAN | [`renderPlanMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/plan.ts:97) | Tasks (table + per-task detail), Test-strategy coverage |
| SPEC | [`renderSpecMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/spec.ts:74) | Intent, Scope boundary, Non-goals, Decisions, Open items |
| ISSUE | [`renderIssueMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/issue.ts:59) | Reproduction, Root cause, Fix intent |
| EXT | [`renderExtendMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/extend.ts:67) | Added Story, Building on, Next |
| TRACKER | [`renderTrackerMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/tracker.ts:90) | ad-hoc |
| STUB | [`renderStubMarkdown`](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/stub.ts:82) | ad-hoc |
| BUILD | [`renderPlanBuildRecordMd`](/Users/subhagho/work/projects/insors/insrc/src/workflow/runners/build/standalone-record.ts:116) — **outside `artifacts/`** | Tasks validated |
| CR | [`renderCodeReviewMd`](/Users/subhagho/work/projects/insors/insrc/src/workflow/code-review/runner.ts:303) — **outside `artifacts/`, private** | verdict line + one section per dimension |

Only two elements are shared across all of them:

- [`renderCitationBlock()`](/Users/subhagho/work/projects/insors/insrc/src/workflow/synthesizer.ts:212) — the `## Citations` footer, appended by the orchestrator at eight call sites.
- [`artifactIdMarker()`](/Users/subhagho/work/projects/insors/insrc/src/workflow/storage.ts:263) — the `<!-- insrc:artifact <ID> -->` HTML comment that lets a slug-named `.md` resolve back to its hash-named `.json`.

The code states the design intent explicitly: *"The `.json` is load-bearing; this `.md` is for humans"* ([code-review/runner.ts:302](/Users/subhagho/work/projects/insors/insrc/src/workflow/code-review/runner.ts:302)). The markdown has been treated as a by-product throughout, and it reads like one.

## 2. Defects — why the output reads bland

| # | Defect | Evidence |
|---|---|---|
| 1 | **No frontmatter.** The only machine-readable header is an HTML comment. No `title`, `status`, `id`, `epic`, `story`, `owner`, `created`/`updated`, `version`. Nothing downstream (MkDocs, Docusaurus, Obsidian, GitHub Pages, a docs portal) can index, sort, or filter these documents. | [storage.ts:263](/Users/subhagho/work/projects/insors/insrc/src/workflow/storage.ts:263) |
| 2 | **Lifecycle state is invisible in the document.** `meta.approvedAt`, `meta.review` (verdict + findings), the code-review verdict, and amendments live only in the `.json`. Opening `HLD.md` tells a reader nothing about whether it is draft, review-blocked, approved, or amended. | [issue.ts:23](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/issue.ts:23) is the only place `approvedAt` is even mentioned in a renderer, as a comment |
| 3 | **Header blocks are inconsistent per type.** LLD prints three or four bold lines; HLD prints nothing but its title; DEF prints one `**Flavor:**` line; BUILD prints a `·`-joined line. No type renders a metadata table. | [lld.ts:293](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/lld.ts:293), [hld.ts:112](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/hld.ts:112), [define.ts:95](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/define.ts:95), [standalone-record.ts:120](/Users/subhagho/work/projects/insors/insrc/src/workflow/runners/build/standalone-record.ts:120) |
| 4 | **The H1 duplicates the first body paragraph.** `# HLD: ${firstLine(body.frameworkSummary)}` — in the live sample the H1 is a 40-word sentence that then repeats verbatim as the first line of `## Framework summary`. DEF (`firstSentence(problem)`) and SPEC (`firstSentence(intent)`) have the same shape. | [hld.ts:112](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/hld.ts:112), [define.ts:93](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/define.ts:93), [spec.ts:82](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/spec.ts:82) |
| 5 | **No table of contents and no heading anchors**, on documents that run 200–600 lines. | — |
| 6 | **No cross-document navigation and no index.** The chain DEF → HLD → `S00n/{LLD,PLAN,BUILD,CR}` is encoded in the folder tree, but no document links to its parent, siblings, or children, and no work-item folder contains a landing page: `find docs/epics docs/standalone -maxdepth 2 -iname index.md -o -iname README.md` returns zero. | — |
| 7 | **No diagrams**, despite the repo shipping a full diagram stack the workflow artifacts never touch: [`src/docgen/`](/Users/subhagho/work/projects/insors/insrc/src/docgen), bundled `src/assets/docgen/mermaid.min.js`, and HTML templates for `sequence`, `er`, `flow`, `callflow`, `deployment`, `wireframe` under `src/assets/artifacts/templates/`. HLD's `architectureShape` is a prose wall where a component diagram belongs; LLD's `migrationSteps` is a numbered list where a sequence diagram belongs. | — |
| 8 | **Three incompatible status vocabularies.** CR uses ⛔/⚠️/✅, BUILD uses ✓/✗/·, LLD migration uses ↩/✕. No other document carries any visual status signal. | [runner.ts:306](/Users/subhagho/work/projects/insors/insrc/src/workflow/code-review/runner.ts:306), [standalone-record.ts:130](/Users/subhagho/work/projects/insors/insrc/src/workflow/runners/build/standalone-record.ts:130), [lld.ts:471](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/lld.ts:471) |
| 9 | **Two table conventions** — `\| :--- \|` in DEF/HLD/LLD/PLAN, `\| --- \|` in CR. | [define.ts:134](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/define.ts:134) vs [runner.ts:323](/Users/subhagho/work/projects/insors/insrc/src/workflow/code-review/runner.ts:323) |
| 10 | **No revision history.** Artifacts carry `updatedAt`, `DEFINE_SCHEMA_VERSION`, and a working amendment system, yet an amended HLD renders in the same shape as a fresh one — there is no amendment log or revision table section. | [define.ts:80](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/define.ts:80) |
| 11 | **Citations render as raw refs** (`- **[[c1]]** \`file\` \`path\``) — never as clickable relative links, never grouped by kind. | [synthesizer.ts:219](/Users/subhagho/work/projects/insors/insrc/src/workflow/synthesizer.ts:219) |
| 12 | **Copy-pasted helpers.** `escapePipes` exists four times (define/hld/lld/plan); `firstSentence`/`firstLine` five times across `artifacts/`, `tracker-auto.ts`, and `runners/tracker/context.ts`. | [define.ts:198](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/define.ts:198), [hld.ts:239](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/hld.ts:239), [lld.ts:510](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/lld.ts:510), [plan.ts:151](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/plan.ts:151), [spec.ts:130](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/spec.ts:130), [tracker-auto.ts:367](/Users/subhagho/work/projects/insors/insrc/src/workflow/tracker-auto.ts:367), [runners/tracker/context.ts:219](/Users/subhagho/work/projects/insors/insrc/src/workflow/runners/tracker/context.ts:219) |

### Observed sample

From the current working tree, `docs/epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/`:

- `S004/BUILD.md` is six lines long: a title, one metadata line, `## Tasks validated`, and a single `- ✗ \`t8\`` bullet.
- `S004/CR.md` is a verdict line plus four `## <dimension> — 0 finding(s)` sections each reading `_No findings._`.
- `HLD.md` opens with a 40-word H1 that the next paragraph repeats, then proceeds through eight prose-heavy sections with no TOC, no status, and no links out.

## 3. Reuse seams that already exist

The upgrade is smaller than it looks, because three of the four pieces it needs are already built for other purposes.

| Need | Existing seam | Notes |
|---|---|---|
| Per-repo / per-user template overrides | [`src/daemon/artifacts/template-loader.ts`](/Users/subhagho/work/projects/insors/insrc/src/daemon/artifacts/template-loader.ts:1) | Already resolves `<repo>/.insrc/artifacts/templates/<kind>.html` → `~/.insrc/artifacts/templates/<kind>.html` → bundled default, with an mtime-checked cache and a load-time security lint. A markdown sibling is a near-copy, not a new subsystem. |
| Enumerating the doc tree for nav / index | [`src/workflow/path-scheme.ts`](/Users/subhagho/work/projects/insors/insrc/src/workflow/path-scheme.ts:119) | `resolveArtifactMdPath()`, `listWorkItems()`, `listArtifactMdPaths()` already give everything generated navigation and a work-item index need. No new traversal code. |
| Content for a work-item landing page | [`src/workflow/chain.ts`](/Users/subhagho/work/projects/insors/insrc/src/workflow/chain.ts:1) | Already computes chain status and renders `## Define / ## HLD / ## Amendments / ## Tracker / ## Next action`. Currently CLI-only; writing it to `docs/.../index.md` is plumbing. |
| Diagrams from the graph | [`src/docgen/registry.ts`](/Users/subhagho/work/projects/insors/insrc/src/docgen/registry.ts:1) + `src/assets/docgen/mermaid.min.js` | `type-structure`, `component-dependency`, `call-sequence` doc types are graph-derived, so an embedded figure carries no hallucinated paths. |
| A shared document envelope precedent | [`renderCitationBlock()`](/Users/subhagho/work/projects/insors/insrc/src/workflow/synthesizer.ts:212) | The one function every artifact's rendered output already passes through. The envelope work extends this pattern rather than inventing one. |

## 4. Proposed work, in three separable pieces

### A. Shared document envelope (recommended first)

One module called by all eleven renderers, replacing the duplicated helpers:

- **YAML frontmatter** — `id`, `kind`, `title`, `status`, `epic`, `story`, `created`, `updated`, `version`, `tracker`, `review`.
- **Status / metadata header table**, identical in shape across every artifact type, derived from `meta` (approval stamp, design-review verdict, code-review verdict, tracker refs, seeded-from-spec provenance).
- **Auto-generated TOC** for documents above a heading threshold.
- **Chain navigation** — parent / sibling / child links, built from `path-scheme.ts`.
- **One badge vocabulary**, replacing the three current emoji conventions.
- **Revision / amendment log** section fed by `updatedAt` plus the amendment records.
- **A distinct, short H1** rather than the first sentence of the body.
- **Citations as relative links**, grouped by kind.

Mechanical, deterministic, no LLM involvement, and directly testable against the existing `src/workflow/__tests__/*-artifact.test.ts` suites.

### B. Externalize the section skeletons

Move the per-type section structure out of TypeScript `lines.push` calls into overridable template files on the cascade already implemented in `template-loader.ts`, so structure and branding can change without touching TypeScript. This needs a data-binding contract and a revisit of the boundary regexes (see the gotchas below), so it is the riskier piece.

### C. Diagrams and optional HTML

Graph-derived figures for the inherently structural sections (HLD architecture shape and shared contracts; LLD data-model changes and migration steps) via the docgen registry, plus optionally a self-contained offline HTML render of a whole work-item folder reusing docgen's shell.

## 5. Implementation gotchas

1. **The `insrc:artifact` marker is read from a head slice.** 4096 characters in [gates.ts:807](/Users/subhagho/work/projects/insors/insrc/src/workflow/gates.ts:807) and [migrate-docs-tree.ts:112](/Users/subhagho/work/projects/insors/insrc/src/workflow/migrate-docs-tree.ts:112), but only **200 characters** in [plan-artifact.test.ts:190](/Users/subhagho/work/projects/insors/insrc/src/workflow/__tests__/plan-artifact.test.ts:190). Frontmatter prepended above the marker must stay inside the tightest window, or that window has to move deliberately.
2. **Scope-boundary validators are regexes over rendered markdown**, not over the artifact body: no code fences in a DEF, no task lists in an HLD ([synthesizer.ts:151](/Users/subhagho/work/projects/insors/insrc/src/workflow/synthesizer.ts:151)). New template constructs can trip them — a checkbox-style rollout list in an HLD would fail today.
3. **Some renderers are deliberately byte-compatible.** The LLD adjacent-scope block renders only when non-empty *"so single-story / standalone LLDs stay byte-compatible"* ([lld.ts:317](/Users/subhagho/work/projects/insors/insrc/src/workflow/artifacts/lld.ts:317)), and the trivial standalone BUILD path is documented as staying byte-identical ([standalone-record.ts:148](/Users/subhagho/work/projects/insors/insrc/src/workflow/runners/build/standalone-record.ts:148)). Envelope changes will move these bytes; the intent behind each compatibility note needs checking before it is broken.
4. **Tests assert exact heading literals** across `define-artifact`, `hld-artifact`, `lld-artifact`, `plan-artifact`, `issue-artifact`, `spec-artifact`, and `chain` suites. Renaming or reordering a section is a test-visible change by design — useful as a guardrail, but it means the section inventory in §1 is the contract to migrate, not a suggestion.
5. **BUILD and CR renderers live outside `src/workflow/artifacts/`**, and the CR renderer is private with parallel logic in [`src/mcp/code-review-step/handler.ts:476`](/Users/subhagho/work/projects/insors/insrc/src/mcp/code-review-step/handler.ts:476). Any envelope work has to reach these two or they will visibly drift from the other nine.

## 6. Process note

This is a feature, so per [CLAUDE.md](/Users/subhagho/work/projects/insors/insrc/CLAUDE.md)'s front-door rule it belongs on the ledger via `insrc_triage` rather than being patched directly. The A / B / C split above is itself a scoping fork, which makes the `brainstorm` stage the right entry point if all three pieces are in play; if the decision is to ship piece A alone, triage it directly as a scoped feature.
