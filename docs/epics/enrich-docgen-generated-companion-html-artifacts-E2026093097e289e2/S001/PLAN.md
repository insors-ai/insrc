<!-- insrc:artifact PLAN-97e289e28841db07-S001 -->

# Plan: E2026093097e289e2:S001

## Summary

**Epic:** `enrich-docgen-generated-companion-html-artifacts`
**LLD run:** `wf-1790758777201-f7hi9w`
**LLD effective hash:** `97e289e28841...`

Building this Story is an additive render-layer change to the docgen companion pipeline. First a one-field type add (narrated.sourceLink), then the shell + fallback learn to render that link and the existing narrative band as an escaped, offline context region (guarded to stay byte-identical when there's no context). Then each of the four companion toIr mappers is taught to fill that band with a Purpose, per-element field explanations, and a legend, and the finalize helpers pass the sibling-.md back-link through. The load-bearing risk is regression, so the tests lean on byte-identity goldens and offline/no-injection assertions rather than new behaviour alone.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add additive optional narrated.sourceLink to DocumentIR | S | — | unit: a DocumentIR whose narrated omits sourceLink is still a valid NarratedContent (type/compile smoke) | [[c7]] |
| 2 | **`t2`** Render sourceLink in renderNarrative/buildHtml + forward it from assembleShell | S | `t1` | unit: buildHtml renders escaped <a> when sourceLink present; unit: buildHtml empty-sections+no-sourceLink byte-identical golden; unit: HTML-special chars escape with no injection; unit: assembleShell forwards ir.narrated.sourceLink to buildHtml | [[c1]] [[c2]] |
| 3 | **`t3`** Bring assembleFallbackShell to context-band parity | S | `t1`, `t2` | unit: assembleFallbackShell parity + empty-case byte-identical golden; unit: assembleFallbackShell output has no remote URL | [[c4]] |
| 4 | **`t4`** Populate narrated.sections in the 4 companion toIr mappers | M | — | unit: erDefinitionToIr sections; unit: uxDefinitionToIr sections; unit: sequenceDefinitionToIr sections; unit: componentDependencyDefinitionToIr sections; unit: empty-but-valid def -> Purpose+Legend, field section omitted; unit: read-only: input definition not mutated | [[c3]] |
| 5 | **`t5`** Thread the optional sourceLink through the 4 renderXCompanion opts | S | `t1` | unit: renderErCompanion with opts.sourceLink writes escaped link (+ 3 siblings); unit: renderErCompanion without sourceLink still writes HTML (backward-safe); unit: non-ok DocGenOutcome still throws DiagramGenerationError + no file | [[c5]] |
| 6 | **`t6`** Supply the sibling-.md source link from the orchestrator finalize helpers | S | `t5` | integration: renderErCompanionForBody/renderUxCompanionForBody/renderDiagramCompanionsForBody via finalizeArtifact: Purpose text + relative ./HLD.md (design.epic) / ./LLD.md (design.story + standalone-LLD) link + Legend present; integration: no remote URL; nothing inlined into the .md | [[c6]] |

### 1.1 E2026093097e289e2:S001:T001 — Add additive optional narrated.sourceLink to DocumentIR

In src/docgen/types.ts, add `readonly sourceLink?: { readonly label: string; readonly href: string } | undefined` to the NarratedContent interface. Additive-only; no field removed or renamed.

**Acceptance checks:**
- NarratedContent declares the optional sourceLink field with the {label, href} shape.
- tsc --noEmit passes with no changes required at any existing IR construction site (field is optional).

### 1.2 E2026093097e289e2:S001:T002 — Render sourceLink in renderNarrative/buildHtml + forward it from assembleShell

Extend renderNarrative + buildHtml (shell.ts) to render ir.narrated.sourceLink as an escaped <a> in the context band; add the appended optional sourceLink param to buildHtml and have assembleShell pass ir.narrated.sourceLink. Preserve empty-sections+no-sourceLink byte-identity.

**Acceptance checks:**
- buildHtml renders an escaped <a> (href + label escapeHtml'd) when sourceLink is present.
- With empty sections AND no sourceLink, buildHtml output is byte-identical to before the change.
- assembleShell forwards ir.narrated.sourceLink to buildHtml.

### 1.3 E2026093097e289e2:S001:T003 — Bring assembleFallbackShell to context-band parity

Extend assembleFallbackShell (fallback.ts) to render the same narrative sections + escaped source-link region as buildHtml (was svg-only), guarded so the empty-sections+no-sourceLink case stays byte-identical.

**Acceptance checks:**
- assembleFallbackShell renders narrated.sections + the escaped sourceLink <a> matching buildHtml's band.
- With empty sections and no sourceLink, assembleFallbackShell output is byte-identical to before.
- No remote URL appears in the fallback output.

### 1.4 E2026093097e289e2:S001:T004 — Populate narrated.sections in the 4 companion toIr mappers

In er.ts/ux.ts/sequence.ts/component.ts, have each xDefinitionToIr populate narrated.sections with a Purpose section + a per-element field-explanation section + a Legend section, derived read-only from the same definition parse. Implement er first as the reference, then mirror to ux/sequence/component (split a kind into a follow task only if its field-derivation proves non-trivial). Empty-but-valid def -> Purpose + Legend only. Do not mutate the input definition. Carries the invariant-change dataModel item (per-kind section population).

**Acceptance checks:**
- Each of the 4 mappers returns narrated.sections with Purpose + per-element field-explanation + Legend for a well-formed definition.
- An empty-but-valid definition yields Purpose + Legend with the field section omitted/empty and no throw.
- The input definition object is not mutated (derived nodes/edges + scopeDescription unchanged).

### 1.5 E2026093097e289e2:S001:T005 — Thread the optional sourceLink through the 4 renderXCompanion opts

Add `sourceLink?: { label: string; href: string }` to RenderErCompanionOpts (and the 3 sibling opts) in render.ts; when present, set it onto ir.narrated.sourceLink before assembleShell. repoPath/ofSectionId unchanged; non-ok outcome still throws DiagramGenerationError.

**Acceptance checks:**
- Each renderXCompanion accepts opts.sourceLink and sets ir.narrated.sourceLink before assembleShell.
- Without sourceLink the renderer still writes HTML (backward-safe) and returns the unchanged CompanionArtifactRef shape.
- A non-ok DocGenOutcome still throws DiagramGenerationError and writes no file.

### 1.6 E2026093097e289e2:S001:T006 — Supply the sibling-.md source link from the orchestrator finalize helpers

In renderErCompanionForBody / renderUxCompanionForBody / renderDiagramCompanionsForBody (orchestrator.ts), derive the sibling-.md relative link (./HLD.md at the design.epic site, ./LLD.md at the design.story + standalone-LLD sites) from the .md path already in scope and pass it as the sourceLink opt.

**Acceptance checks:**
- Each finalize helper passes { repoPath, sourceLink: { label, href: <relative sibling .md> } } to its renderer.
- The href resolves to ./HLD.md at the finalizeDesignEpic site and ./LLD.md at the design.story + standalone-LLD sites.
- The link is a relative path only (no absolute/remote URL).

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| erDefinitionToIr sections | `t4` |
| uxDefinitionToIr sections | `t4` |
| sequenceDefinitionToIr sections | `t4` |
| componentDependencyDefinitionToIr sections | `t4` |
| empty-but-valid def -> Purpose+Legend, field section omitted | `t4` |
| read-only: input definition not mutated | `t4` |
| buildHtml renders escaped <a> when sourceLink present | `t2` |
| buildHtml empty-sections+no-sourceLink byte-identical golden | `t2` |
| assembleFallbackShell parity + empty-case byte-identical golden | `t3` |
| HTML-special chars escape with no injection | `t2` |
| renderErCompanion with opts.sourceLink writes escaped link (+ 3 siblings) | `t5` |
| renderErCompanion without sourceLink still writes HTML (backward-safe) | `t5` |
| non-ok DocGenOutcome still throws DiagramGenerationError + no file | `t5` |
| renderErCompanionForBody/renderUxCompanionForBody/renderDiagramCompanionsForBody via finalizeArtifact: Purpose text + relative ./HLD.md (design.epic) / ./LLD.md (design.story + standalone-LLD) link + Legend present | `t6`, `t4` |
| no remote URL; nothing inlined into the .md | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 buildHtml/renderNarrative render (src/docgen/render/shell.ts:189)`
- **[[c2]]** `prior-artifact` `LLD S001 buildHtml offline HTML assembly (src/docgen/render/shell.ts:204)`
- **[[c3]]** `prior-artifact` `LLD S001 companion toIr section population (src/workflow/artifacts/companion/er.ts + siblings)`
- **[[c4]]** `prior-artifact` `LLD S001 assembleFallbackShell parity (src/docgen/render/fallback.ts:200)`
- **[[c5]]** `prior-artifact` `LLD S001 renderXCompanion sourceLink opt (src/workflow/artifacts/companion/render.ts:65)`
- **[[c6]]** `prior-artifact` `LLD S001 finalize helpers thread sibling-.md link (src/workflow/orchestrator.ts:1568)`
- **[[c7]]** `prior-artifact` `LLD S001 DocumentIR.narrated.sourceLink field-add (src/docgen/types.ts:76)`
