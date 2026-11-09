<!-- insrc:artifact ISSUE-36cbeeac485c0af7 -->

# LLDs pass every gate while thin, so document quality depends on which model authored them

## Reproduction

Compare two recent LLDs, both rendered through the same format:
- docs/standalone/show-provider-icons-chat-dropdowns-relabel-E20261107546198e1/S001/LLD.md, authored by deepseek-v4-pro through Claude Code.
- docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md, authored through Codex.

Observed in the first document:
- Alternatives considered shows only a one-line summary for each option, with no approach text. The authoring model had written approach, pros, cons and a cost estimate at the alternatives step, then left them out of the final artifact.
- All 6 references are prose, for example `read:chrome-markup: the two chrome dropdowns ...`, instead of file paths.
- The title is only an id: `# LLD: STORY-546198e11c24c1e3-s1`.
- The artifact records `runner: cli-claude, model: client`, so the record does not say DeepSeek wrote it.

Expected: an LLD that omits this content is rejected or completed by the framework, whichever model authored it; the title carries the Story title; the artifact names the model that authored it.

The format itself was applied: re-rendering the first artifact's stored JSON reproduces its LLD.md apart from one trailing newline. Stored artifacts show the alternatives gap is not limited to one model run: 84 of 433 LLDs have an alternative missing at least one of these fields.

## Root cause

Each symptom passes because nothing enforces it. Strict checks did hold the same model to account: the same run was rejected for an invalid UX definition and for a wrong Story id, and only corrected output was stored.

(1) Alternatives are re-typed by the model. The alternatives step requires approach, pros, cons and costEstimate (src/workflow/runners/design-story/schemas.ts:57), but the final artifact is assembled by the model. The synthesis prompt marks other sections 'verbatim' and asks only that every alternative be included, with losers carrying reasonRejected (src/workflow/orchestrator.ts:2022).

(2) The final schema and validator do not check the items. The LLD synthesis schema declares the list only as an array of at least 2 (src/workflow/orchestrator.ts:2085), and isLldBody checks only that it is an array (src/workflow/artifacts/lld.ts:492). The HLD validator checks every alternative (src/workflow/artifacts/hld.ts:267).

(3) The file-reference check skips these citations. checkPathForms only examines citations of kind `code` and `doc` (src/workflow/synthesizer.ts:280), so `analyze-bundle` references may hold any text.

(4) The title is never passed. The format asks for `<story id — title>` (src/assets/artifacts/formats/lld.md:3), but renderLldMarkdown builds the H1 from the id alone (src/workflow/artifacts/lld.ts:328). This affects every LLD.

(5) The authoring model is not known. On the client-driven path, finalizeArtifact defaults its model label to `client` (src/workflow/orchestrator.ts:402) and singleModelAttribution builds the record from that label (src/workflow/attribution.ts:63).

## Fix intent

(a) An LLD's alternatives keep the full content written at the alternatives step, independent of what the authoring model re-types.
(b) A newly written LLD with incomplete alternatives does not pass finalization, matching the HLD's standard.
(c) File references in an LLD's citations meet the documented one-form rule regardless of how the author labels the citation.
(d) An LLD's title shows the Story id and title, as the format defines.
(e) A client-authored artifact records which model authored it, or states plainly that the model is unknown.
(f) Existing stored artifacts keep reading and re-rendering; none are rewritten or rejected.

## Citations

- **[[c1]]** `code` `src/workflow/runners/design-story/schemas.ts:57` — "required: ['id', 'name', 'oneLineSummary', 'approach', 'pros', 'cons', 'costEstimate']"
- **[[c2]]** `code` `src/workflow/orchestrator.ts:2022` — "`body.alternativesConsidered` MUST include every alternative from s2 with losers carrying `reasonRejected` pulled from s3."
- **[[c3]]** `code` `src/workflow/orchestrator.ts:2085` — "alternativesConsidered: { type: 'array', minItems: 2 }"
- **[[c4]]** `code` `src/workflow/artifacts/lld.ts:492` — "if (!Array.isArray(r['alternativesConsidered'])) return false;"
- **[[c5]]** `code` `src/workflow/artifacts/hld.ts:267` — "if (!(r['alternativesConsidered'] as unknown[]).every(isAlternative)) return false;"
- **[[c6]]** `code` `src/workflow/synthesizer.ts:280` — "if (c.kind !== 'code' && c.kind !== 'doc') continue;"
- **[[c7]]** `code` `src/assets/artifacts/formats/lld.md:3` — "# LLD: <story id — title>"
- **[[c8]]** `code` `src/workflow/artifacts/lld.ts:328` — "const h1 = `LLD: ${lldSid ?? meta.storyId}`;"
- **[[c9]]** `code` `src/workflow/orchestrator.ts:402` — "model:        string = 'client',"
- **[[c10]]** `code` `src/workflow/attribution.ts:63` — "singleModelAttribution(label: string): ArtifactModelAttribution"
- **[[c11]]** `prior-artifact` `docs/standalone/show-provider-icons-chat-dropdowns-relabel-E20261107546198e1/S001/LLD.md`
- **[[c12]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/LLD.md`
