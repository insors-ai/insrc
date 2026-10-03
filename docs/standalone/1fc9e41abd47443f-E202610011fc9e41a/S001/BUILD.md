# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-01T08:19:31.101Z  ·  **Updated:** 2026-10-01T09:06:07.797Z

## Scope

Fix ISSUE-1fc9e41abd47443f — an HLD never links its UX-mock companion. Give HLD_FORMAT (src/workflow/artifacts/format/formats.ts) the UX extension section its LLD sibling already declares, and bind that slot in src/workflow/artifacts/hld.ts to the existing uxCompanionBodyLines from format/bindings.ts, mirroring lld.ts:461-462. Today HLD_FORMAT declares only the 'diagrams' extension section, bound at hld.ts:220 to companionBodyLines, which filters to kind 'diagram-mermaid' | 'diagram-html' (bindings.ts:41) and therefore drops every 'ux-mock' ref silently. MUST be additive and absent-safe: reuse the existing `const l = ...; return l.length > 0 ? { lines: l } : { omit: true };` binding convention so an HLD carrying no ux-mock companion omits the section and renders byte-identically to today. Do NOT add a new helper, type or contract; do NOT touch CompanionArtifactRef, HldBody.companions, the artifact JSON, the generation side, or the already-correct LLD path. Add a test mirroring the LLD's UX-slot coverage: an HLD body with a ux-mock companion renders a link to it, and an HLD body without one renders no UX section at all. Run the workflow test subset and tsc.

## Triage rationale

bugfix / small. A defect against already-approved behaviour: the companion flow is supposed to render, attach AND link every companion, and does so correctly for an LLD; only the HLD path drops ux-mock refs. The correction mirrors an existing, working, already-tested sibling path — no new function, type, contract, storage or schema change. Additive and absent-safe by construction, so every HLD without a UX mock renders byte-identically.

## Tasks validated

- ✗ `S001`

## Changes

- `src/assets/artifacts/formats/hld.md` — **insrc-build** (2026-10-01T09:06:07.797Z)
- `src/workflow/artifacts/companion/__tests__/ux-integration.test.ts` — **insrc-build** (2026-10-01T09:06:07.797Z)
- `src/workflow/artifacts/format/formats.ts` — **insrc-build** (2026-10-01T09:06:07.797Z)
- `src/workflow/artifacts/hld.ts` — **insrc-build** (2026-10-01T09:06:07.797Z)
