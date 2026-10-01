<!-- insrc:artifact ISSUE-1fc9e41abd47443f -->

# Link the UX-mock companion from a rendered HLD

## Reproduction

Author an HLD that carries a `uxDefinition`, so the framework generates a UX-mock companion for it.

Observed, on the real artifact HLD-bfe98ff7f97178cf (epic build-vs-code-plugin-ui-integration):
- `ux-mock.html` is written to disk beside the document (3,371,391 bytes) alongside `er-model.html` (3,370,374 bytes).
- The artifact JSON records BOTH refs in `body.companions`: one `{ kind: 'diagram-mermaid', relPath: '.../er-model.html', title: 'ER model' }` and one `{ kind: 'ux-mock', relPath: '.../ux-mock.html', title: 'UX mock' }`.
- The rendered `HLD.md` section `## 4. Diagrams` contains exactly one line, the link to `er-model.html`. Searching the whole document for `ux-mock.html` returns no link.

Expected: every companion the document carries is reachable from the document, as already happens for an LLD. Actual: the UX mock is generated, paid for in disk and generation time, recorded in the body, and then unreachable by the reviewer it was produced for — with no warning, no empty section and no error, so nothing signals that content is missing.

Contrast case that works: author an LLD carrying a `uxDefinition` and its UX mock renders under its own `## UX` section, because the LLD format declares that slot and the HLD format does not.

## Root cause

The HLD document format is missing the UX extension slot its LLD sibling has, so a `ux-mock` companion reference has nowhere to render.

`HLD_FORMAT` declares a single companion-bearing extension section, `{ id: 'diagrams', heading: 'Diagrams', source: 'extension' }`, and `hld.ts` binds that one slot to `companionBodyLines(body.companions)`. `companionBodyLines` filters its input to `c.kind === 'diagram-mermaid' || c.kind === 'diagram-html'` and returns `[]` when none match — so it is structurally incapable of emitting a link for a `ux-mock` ref. With no second slot to catch it, the ref is dropped silently.

`LLD_FORMAT` does not have this defect because it declares TWO extension sections, `{ id: 'diagramsEr', heading: 'Diagrams' }` and `{ id: 'ux', heading: 'UX' }`, and `lld.ts` binds them to `companionBodyLines` and `uxCompanionBodyLines` respectively. `uxCompanionBodyLines` is the exact counterpart that filters to `c.kind === 'ux-mock'`; it already exists, is already exercised through the LLD path, and its own doc comment states it 'Mirrors companionBodyLines but for the `ux-mock` kind so a document's ER diagram and UX mock render in their own slots'. The capability is present in the codebase; only the HLD format never wired it up.

The failure is silent rather than loud because both the binding convention and the helper degrade to nothing on empty input: `uxCompanionBodyLines` returns `[]` for no matches and the binding convention `l.length > 0 ? { lines: l } : { omit: true }` omits a section with no lines. That is correct behaviour for a document genuinely without a UX mock, but with no slot declared at all there is nothing to distinguish 'no mock' from 'mock dropped'.

## Fix intent

Make an HLD link its UX-mock companion the same way an LLD already does, so a companion that is generated and recorded is always reachable from the document that carries it.

The correction gives the HLD format the UX extension slot it lacks and binds that slot to the existing `ux-mock` line builder, mirroring the LLD wiring rather than introducing any new rendering logic. No new helper, type or contract is added; `CompanionArtifactRef`, `HldBody.companions` and the artifact JSON are all untouched, so this is a rendering-layer correction only.

The change must be absent-safe and forward-only: an HLD that carries no UX mock must continue to render byte-identically, with no empty or placeholder UX section — which the existing omit-on-empty binding convention already gives for free. Already-written HLDs are not retro-fitted; the fix governs documents rendered after it lands, and the one observed artifact can be regenerated from its canonical JSON if its link is wanted.

Not in scope: changing how companions are generated, what they contain, or their file size; altering the LLD path, which is already correct; and the separate question of whether multi-megabyte companion files should be committed at all.

## Citations

- **[[c1]]** `code` `src/workflow/artifacts/format/formats.ts — HLD_FORMAT sections list` — "S({ id: 'diagrams',    heading: 'Diagrams', source: 'extension', contentGuidance: 'NAMED extension point — S003 component diagram companion.' }),"
- **[[c2]]** `code` `src/workflow/artifacts/format/formats.ts — LLD_FORMAT declares the UX slot the HLD lacks` — "S({ id: 'ux',          heading: 'UX', source: 'extension', contentGuidance: 'NAMED extension point — S004 UX section/mock reference.' }),"
- **[[c3]]** `code` `src/workflow/artifacts/hld.ts:220 — the HLD's only companion binding` — "diagrams:       () => { const l = companionBodyLines(body.companions); return l.length > 0 ? { lines: l } : { omit: true }; },"
- **[[c4]]** `code` `src/workflow/artifacts/lld.ts:461-462 — the LLD binds BOTH companion kinds` — "diagramsEr:  () => { const l = companionBodyLines(body.companions); return l.length > 0 ? { lines: l } : { omit: true }; },
		ux:          () => { const l = uxCompanionBodyLines(body.companions); retu"
- **[[c5]]** `code` `src/workflow/artifacts/format/bindings.ts:39-47 — companionBodyLines excludes ux-mock by construction` — "const diagrams = companions.filter(c => c.kind === 'diagram-mermaid' || c.kind === 'diagram-html');
	if (diagrams.length === 0) return [];"
- **[[c6]]** `code` `src/workflow/artifacts/format/bindings.ts:57-65 — uxCompanionBodyLines already exists and handles the ux-mock kind` — "export function uxCompanionBodyLines(companions: readonly CompanionArtifactRef[] | undefined): string[] {
	if (companions === undefined || companions.length === 0) return [];
	const mocks = companions"
- **[[c7]]** `code` `src/workflow/artifacts/companion/types.ts:24 — the three companion kinds` — "export type CompanionKind = 'diagram-mermaid' | 'diagram-html' | 'ux-mock';"
- **[[c8]]** `prior-artifact` `.insrc/artifacts/HLD-bfe98ff7f97178cf.json — body.companions records both refs` — "[{"kind":"diagram-mermaid","relPath":"docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/er-model.html","title":"ER model"},{"kind":"ux-mock","relPath":"docs/epics/build-vs-code-plugin-u"
- **[[c9]]** `prior-artifact` `docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/HLD.md — section 4 links only the ER model` — "## 4. Diagrams

- [ER model](docs/epics/build-vs-code-plugin-ui-integration-E20260929bfe98ff7/er-model.html)"
